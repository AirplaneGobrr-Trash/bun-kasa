import { randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  getDeviceClassFromFamily,
  getDeviceClassFromSysInfo,
  getProtocol,
} from "./connect.ts";
import { type Credentials, createCredentials } from "./core/credentials.ts";
import type { Device } from "./core/device.ts";
import {
  DeviceConfig,
  DeviceConnectionParameters,
  DeviceEncryptionType,
} from "./core/deviceconfig.ts";
import {
  KasaException,
  KasaTimeoutError,
  UnsupportedDeviceError,
} from "./core/exceptions.ts";
import { extractIotSysInfo } from "./iot/index.ts";
import {
  AesEncryptionSession,
  KeyPair,
  xorDecryptPayload,
  xorEncryptPayload,
} from "./transports/index.ts";

export const DISCOVERY_PORT = 9999;
export const DISCOVERY_PORT_2 = 20002;
export const DISCOVERY_PORT_3 = 20004;

const DISCOVERY_QUERY = JSON.stringify({ system: { get_sysinfo: {} } });

export type DeviceDict = Record<string, Device>;

export interface DiscoveredMeta {
  ip: string;
  port: number;
}

export interface DiscoveredRaw {
  meta: DiscoveredMeta;
  discoveryResponse: Record<string, unknown>;
}

export type OnDiscoveredCallable = (device: Device) => void | Promise<void>;
export type OnDiscoveredRawCallable = (info: DiscoveredRaw) => void;
export type OnUnsupportedCallable = (ex: UnsupportedDeviceError) => void | Promise<void>;

/** Discovery result reported by newer devices on ports 20002/20004 (fields are snake_case, matching the wire format). */
export interface DiscoveryResult {
  device_type: string;
  device_model: string;
  device_id: string;
  ip: string;
  mac: string;
  mgt_encrypt_schm?: {
    is_support_https: boolean;
    encrypt_type?: string;
    http_port?: number;
    lv?: number;
  };
  device_name?: string;
  encrypt_info?: {
    sym_schm: string;
    key: string;
    data: string;
  };
  encrypt_type?: string[];
  decrypted_data?: Record<string, unknown>;
  [key: string]: unknown;
}

let discoveryKeypair: KeyPair | undefined;

/** Build the AES discovery probe (`_AesDiscoveryQuery` in python-kasa), sent to ports 20002/20004. */
function generateAesDiscoveryQuery(): Buffer {
  if (!discoveryKeypair) discoveryKeypair = KeyPair.createKeyPair(2048);

  const keyPayload = { params: { rsa_key: discoveryKeypair.getPublicPem() } };
  const keyPayloadBytes = Buffer.from(JSON.stringify(keyPayload), "utf-8");

  const version = 2;
  const msgType = 0;
  const opCode = 1; // probe
  const msgSize = keyPayloadBytes.length;
  const flags = 17;
  const paddingByte = 0;
  const deviceSerial = randomBytes(4).readUInt32BE(0);
  const initialCrc = 0x5a6b7c8d;

  const header = Buffer.alloc(16);
  header.writeUInt8(version, 0);
  header.writeUInt8(msgType, 1);
  header.writeUInt16BE(opCode, 2);
  header.writeUInt16BE(msgSize, 4);
  header.writeUInt8(flags, 6);
  header.writeUInt8(paddingByte, 7);
  header.writeUInt32BE(deviceSerial, 8);
  header.writeUInt32BE(initialCrc, 12);

  const query = Buffer.concat([header, keyPayloadBytes]);
  const crc = Bun.hash.crc32(query);
  query.writeUInt32BE(crc >>> 0, 12);
  return query;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}

function decryptDiscoveryData(discoveryResult: DiscoveryResult): void {
  const encryptInfo = discoveryResult.encrypt_info;
  if (!encryptInfo || !discoveryKeypair) return;

  const keyAndIv = discoveryKeypair.decryptDiscoveryKey(
    Buffer.from(encryptInfo.key, "base64"),
  );
  const key = keyAndIv.subarray(0, 16);
  const iv = keyAndIv.subarray(16);

  const session = new AesEncryptionSession(key, iv);
  const decrypted = session.decrypt(Buffer.from(encryptInfo.data));
  discoveryResult.decrypted_data = JSON.parse(decrypted);
}

/** Derive `DeviceConnectionParameters` from a new-discovery (20002/20004) result. */
function getConnectionParameters(
  discoveryResult: DiscoveryResult,
): DeviceConnectionParameters {
  const type_ = discoveryResult.device_type;
  const encryptSchm = discoveryResult.mgt_encrypt_schm;
  if (!encryptSchm) {
    throw new UnsupportedDeviceError(
      `Unsupported device ${discoveryResult.ip} of type ${type_} with no mgt_encrypt_schm`,
      {
        discoveryResult: discoveryResult as Record<string, unknown>,
        host: discoveryResult.ip,
      },
    );
  }

  let encryptType = encryptSchm.encrypt_type;
  if (!encryptType && discoveryResult.encrypt_info) {
    encryptType = discoveryResult.encrypt_info.sym_schm;
  }

  let loginVersion = encryptSchm.lv;
  if (!loginVersion && discoveryResult.encrypt_type) {
    loginVersion = Math.max(...discoveryResult.encrypt_type.map((v) => Number(v)));
  }

  if (!encryptType) {
    throw new UnsupportedDeviceError(
      `Unsupported device ${discoveryResult.ip} of type ${type_} with no encryption type`,
      {
        discoveryResult: discoveryResult as Record<string, unknown>,
        host: discoveryResult.ip,
      },
    );
  }

  return DeviceConnectionParameters.fromValues(type_, encryptType, {
    loginVersion,
    https: encryptSchm.is_support_https,
    httpPort: encryptSchm.http_port,
  });
}

function getDiscoveryJsonLegacy(data: Buffer, ip: string): Record<string, unknown> {
  try {
    return JSON.parse(xorDecryptPayload(data).toString("utf-8"));
  } catch (ex) {
    throw new KasaException(`Unable to read response from device: ${ip}: ${ex}`);
  }
}

function getDeviceInstanceLegacy(
  info: Record<string, unknown>,
  config: DeviceConfig,
): Device {
  const deviceClass = getDeviceClassFromSysInfo(info);
  const sysInfo = extractIotSysInfo(info);
  const deviceType = (sysInfo.mic_type ?? sysInfo.type) as string | undefined;
  if (deviceType === undefined) {
    throw new UnsupportedDeviceError("type nor mic_type found in sysinfo response");
  }
  const loginVersion =
    deviceType === "IOT.IPCAMERA"
      ? (sysInfo.stream_version as number | undefined)
      : undefined;

  config.connectionType = DeviceConnectionParameters.fromValues(
    deviceType,
    DeviceEncryptionType.Xor,
    { https: deviceType === "IOT.IPCAMERA", loginVersion },
  );

  const protocol = getProtocol(config);
  if (!protocol) {
    throw new UnsupportedDeviceError(
      `Unsupported connection type for ${config.host}: ${config.connectionType.deviceFamily}`,
      { host: config.host },
    );
  }
  const device = new deviceClass(config.host, protocol);
  device.updateFromDiscoverInfo(info);
  return device;
}

function getDiscoveryJson(data: Buffer, ip: string): Record<string, unknown> {
  try {
    return JSON.parse(data.subarray(16).toString("utf-8"));
  } catch (ex) {
    throw new KasaException(`Unable to read response from device: ${ip}: ${ex}`);
  }
}

function getDeviceInstance(info: Record<string, unknown>, config: DeviceConfig): Device {
  let discoveryResult: DiscoveryResult;
  try {
    const result = info.result as Record<string, unknown> | undefined;
    if (!result) throw new Error("Missing 'result' key");
    discoveryResult = result as unknown as DiscoveryResult;
  } catch (ex) {
    throw new UnsupportedDeviceError(
      `Unable to parse discovery from device: ${config.host}: ${ex}`,
      { host: config.host },
    );
  }

  if (discoveryResult.encrypt_info?.sym_schm === "AES") {
    try {
      decryptDiscoveryData(discoveryResult);
    } catch {
      // Decryption failures are non-fatal; decrypted_data is simply left unset.
    }
  }

  const type_ = discoveryResult.device_type;
  let connParams: DeviceConnectionParameters;
  try {
    connParams = getConnectionParameters(discoveryResult);
  } catch (ex) {
    if (ex instanceof UnsupportedDeviceError) throw ex;
    throw new UnsupportedDeviceError(
      `Unsupported device ${config.host} of type ${type_} with encrypt_scheme ${JSON.stringify(discoveryResult.mgt_encrypt_schm)}`,
      { discoveryResult: discoveryResult as Record<string, unknown>, host: config.host },
    );
  }
  config.connectionType = connParams;

  const deviceClass = getDeviceClassFromFamily(type_, { https: connParams.https });
  if (!deviceClass) {
    throw new UnsupportedDeviceError(
      `Unsupported device ${config.host} of type ${type_}: ${JSON.stringify(info)}`,
      { discoveryResult: discoveryResult as Record<string, unknown>, host: config.host },
    );
  }

  const protocol = getProtocol(config);
  if (!protocol) {
    throw new UnsupportedDeviceError(
      `Unsupported encryption scheme ${config.host} of type ${JSON.stringify(config.connectionType.toDict())}: ${JSON.stringify(info)}`,
      { discoveryResult: discoveryResult as Record<string, unknown>, host: config.host },
    );
  }

  const device = new deviceClass(config.host, protocol);

  const di: Record<string, unknown> = { ...discoveryResult };
  di.model = discoveryResult.device_model.split("(")[0];
  device.updateFromDiscoverInfo(di);
  return device;
}

interface DiscoverySessionOptions {
  target: string;
  onDiscovered?: OnDiscoveredCallable;
  onDiscoveredRaw?: OnDiscoveredRawCallable;
  onUnsupported?: OnUnsupportedCallable;
  discoveryPackets: number;
  discoveryTimeout: number;
  interfacePort?: number;
  credentials?: Credentials;
  timeout?: number;
}

class DiscoverySession {
  discoveredDevices: DeviceDict = {};
  unsupportedDeviceExceptions = new Map<string, UnsupportedDeviceError>();
  invalidDeviceExceptions = new Map<string, KasaException>();

  private socket: Bun.udp.Socket<"buffer"> | undefined;
  // Some devices (e.g. newer-firmware EP10s) answer both the legacy (9999, unauthenticated)
  // and new (20002/20004, KLAP/AES) probes, but only advertise the new scheme without
  // actually being provisioned for it, so authentication against it always fails. Track
  // which kind of response we've locked in per host so a legacy answer - which never
  // requires credentials - can still override an already-processed new-discovery one.
  private responseKind = new Map<string, "legacy" | "new">();
  private targetDiscovered = false;
  private abortController = new AbortController();
  private callbackPromises: Promise<unknown>[] = [];

  constructor(private readonly options: DiscoverySessionOptions) {}

  async run(): Promise<void> {
    this.socket = await Bun.udpSocket({
      hostname: "0.0.0.0",
      port: 0,
      binaryType: "buffer",
      socket: {
        data: (_socket, data, port, address) => {
          this.handleDatagram(Buffer.from(data), address, port);
        },
        // Devices that don't listen on a probed port (e.g. a KLAP-only device
        // never listening on legacy port 9999) trigger an ICMP port-unreachable,
        // which Bun surfaces here rather than on `data`. Ignore and keep discovering.
        error: () => {},
      },
    });
    this.socket.setBroadcast(true);

    try {
      await this.doDiscover();
    } finally {
      this.socket.close();
    }
    await Promise.all(this.callbackPromises);
  }

  private async doDiscover(): Promise<void> {
    const discoveryPort = this.options.interfacePort ?? DISCOVERY_PORT;
    const target = this.options.target;
    const sleepBetweenPackets =
      (this.options.discoveryTimeout * 1000) / this.options.discoveryPackets;

    const xorQuery = xorEncryptPayload(Buffer.from(DISCOVERY_QUERY, "utf-8"));
    const aesQuery = generateAesDiscoveryQuery();

    // Once the target has answered via new-discovery, give it exactly one more probe
    // round to see if a preferred legacy (unauthenticated) answer also arrives, rather
    // than waiting out the full discoveryTimeout for a device that will never send one.
    let newResponseSeenAtIteration: number | undefined;
    for (let i = 0; i < this.options.discoveryPackets; i++) {
      const kind = this.responseKind.get(target);
      if (kind === "legacy") break;
      if (kind === "new") {
        if (newResponseSeenAtIteration === undefined) newResponseSeenAtIteration = i;
        else if (i > newResponseSeenAtIteration) break;
      }
      this.socket?.send(xorQuery, discoveryPort, target);
      this.socket?.send(aesQuery, DISCOVERY_PORT_2, target);
      this.socket?.send(aesQuery, DISCOVERY_PORT_3, target);
      await sleep(sleepBetweenPackets, this.abortController.signal);
      if (this.targetDiscovered) break;
    }
  }

  private handleDatagram(data: Buffer, ip: string, port: number): void {
    const isLegacyPort = port === (this.options.interfacePort ?? DISCOVERY_PORT);
    const kind: "legacy" | "new" = isLegacyPort ? "legacy" : "new";

    const existingKind = this.responseKind.get(ip);
    // A legacy response is authoritative (no credentials required, always works if the
    // device is reachable), so nothing can improve on it. Otherwise, ignore repeat
    // responses of a kind we've already processed.
    if (existingKind === "legacy" || existingKind === kind) return;

    const config = new DeviceConfig(ip, {
      portOverride: this.options.interfacePort,
      credentials: this.options.credentials,
      timeout: this.options.timeout,
    });

    let device: Device | undefined;
    try {
      let info: Record<string, unknown>;
      let deviceFunc: (info: Record<string, unknown>, config: DeviceConfig) => Device;
      if (isLegacyPort) {
        info = getDiscoveryJsonLegacy(data, ip);
        deviceFunc = getDeviceInstanceLegacy;
      } else if (port === DISCOVERY_PORT_2 || port === DISCOVERY_PORT_3) {
        info = getDiscoveryJson(data, ip);
        deviceFunc = getDeviceInstance;
      } else {
        return;
      }

      this.options.onDiscoveredRaw?.({
        discoveryResponse: info,
        meta: { ip, port },
      });

      device = deviceFunc(info, config);
    } catch (ex) {
      if (ex instanceof UnsupportedDeviceError) {
        this.responseKind.set(ip, kind);
        this.unsupportedDeviceExceptions.set(ip, ex);
        if (this.options.onUnsupported) {
          this.callbackPromises.push(Promise.resolve(this.options.onUnsupported(ex)));
        }
        this.handleDiscoveredEvent(ip, kind);
        return;
      }
      if (ex instanceof KasaException) {
        this.responseKind.set(ip, kind);
        this.invalidDeviceExceptions.set(ip, ex);
        this.handleDiscoveredEvent(ip, kind);
        return;
      }
      throw ex;
    }

    this.responseKind.set(ip, kind);
    // A legacy response overriding an earlier tentative new-discovery one supersedes
    // whatever that attempt recorded.
    this.unsupportedDeviceExceptions.delete(ip);
    this.invalidDeviceExceptions.delete(ip);
    this.discoveredDevices[ip] = device;
    if (this.options.onDiscovered) {
      this.callbackPromises.push(Promise.resolve(this.options.onDiscovered(device)));
    }
    this.handleDiscoveredEvent(ip, kind);
  }

  private handleDiscoveredEvent(ip: string, kind: "legacy" | "new"): void {
    // Only a legacy response can stop the search early: a new-discovery response might
    // still be superseded by a legacy one that arrives on a later probe round.
    if (ip === this.options.target && kind === "legacy") {
      this.targetDiscovered = true;
      this.abortController.abort();
    }
  }
}

/** Options for {@link discover}. */
export interface DiscoverOptions {
  /** Broadcast target address; defaults to 255.255.255.255. Use a subnet broadcast (e.g. 192.168.1.255) for multi-homed hosts. */
  target?: string;
  onDiscovered?: OnDiscoveredCallable;
  onDiscoveredRaw?: OnDiscoveredRawCallable;
  onUnsupported?: OnUnsupportedCallable;
  /** Seconds to wait for responses. */
  discoveryTimeout?: number;
  /** Number of discovery packets to broadcast. */
  discoveryPackets?: number;
  credentials?: Credentials;
  username?: string;
  password?: string;
  /** Override the discovery port for legacy devices listening on 9999. */
  port?: number;
  /** Query timeout in seconds for devices returned by discovery. */
  timeout?: number;
}

/**
 * Discover supported devices on the local network.
 *
 * Sends discovery probes to `target:9999` (legacy XOR devices) and `target:20002`/`target:20004`
 * (newer KLAP/AES devices), waiting `discoveryTimeout` seconds for responses. Returned devices are
 * ready to use for basic discovery-provided attributes but need `await device.update()` before
 * accessing full state.
 */
export async function discover(options: DiscoverOptions = {}): Promise<DeviceDict> {
  let credentials = options.credentials;
  if (!credentials && options.username && options.password) {
    credentials = createCredentials(options.username, options.password);
  }

  const session = new DiscoverySession({
    target: options.target ?? "255.255.255.255",
    onDiscovered: options.onDiscovered,
    onDiscoveredRaw: options.onDiscoveredRaw,
    onUnsupported: options.onUnsupported,
    discoveryPackets: options.discoveryPackets ?? 3,
    discoveryTimeout: options.discoveryTimeout ?? 5,
    interfacePort: options.port,
    credentials,
    timeout: options.timeout,
  });

  await session.run();
  return session.discoveredDevices;
}

/** Options for {@link discoverSingle}. */
export interface DiscoverSingleOptions {
  discoveryTimeout?: number;
  port?: number;
  timeout?: number;
  credentials?: Credentials;
  username?: string;
  password?: string;
  onDiscoveredRaw?: OnDiscoveredRawCallable;
  onUnsupported?: OnUnsupportedCallable;
}

/**
 * Discover a single device by IP address or hostname.
 *
 * Prefer {@link connect} when the device's `DeviceConfig` is already known — it's faster and more
 * reliable when the network is congested or the device doesn't answer discovery broadcasts.
 */
export async function discoverSingle(
  host: string,
  options: DiscoverSingleOptions = {},
): Promise<Device | undefined> {
  let credentials = options.credentials;
  if (!credentials && options.username && options.password) {
    credentials = createCredentials(options.username, options.password);
  }

  let ip: string;
  if (isIP(host)) {
    ip = host;
  } else {
    try {
      const result = await dnsLookup(host, { family: 4 });
      ip = result.address;
    } catch (ex) {
      throw new KasaException(`Could not resolve hostname ${host}`, { cause: ex });
    }
  }

  const session = new DiscoverySession({
    target: ip,
    discoveryPackets: 3,
    discoveryTimeout: options.discoveryTimeout ?? 5,
    interfacePort: options.port,
    credentials,
    timeout: options.timeout,
    onDiscoveredRaw: options.onDiscoveredRaw,
  });

  await session.run();

  const device = session.discoveredDevices[ip];
  if (device) {
    return device;
  }
  const unsupported = session.unsupportedDeviceExceptions.get(ip);
  if (unsupported) {
    if (options.onUnsupported) {
      await options.onUnsupported(unsupported);
      return undefined;
    }
    throw unsupported;
  }
  const invalid = session.invalidDeviceExceptions.get(ip);
  if (invalid) throw invalid;

  throw new KasaTimeoutError(`Timed out getting discovery response for ${host}`);
}
