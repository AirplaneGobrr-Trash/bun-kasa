import type {
  Alarm,
  ChildSetup,
  Energy,
  Fan,
  Led,
  Light,
  LightEffect,
  LightPreset,
  Thermostat,
  Time,
} from "../interfaces/index.ts";
import type { Credentials } from "./credentials.ts";
import { DeviceType } from "./device_type.ts";
import type { DeviceConfig } from "./deviceconfig.ts";
import { KasaException } from "./exceptions.ts";
import type { Feature } from "./feature.ts";
import type { Module } from "./module.ts";
import type { ModuleMapping } from "./modulemapping.ts";
import { CommonModules } from "./modulenames.ts";
import type { BaseProtocol } from "./protocol.ts";

/** A wifi network reported by a device's wifi scan. */
export interface WifiNetwork {
  ssid: string;
  // Available on both netif and softaponboarding
  keyType?: number;
  // Available only on softaponboarding
  cipherType?: number;
  channel?: number;
  // Available on softaponboarding, SMART, and SMARTCAM devices
  bssid?: string;
  rssi?: number;
  // Available on both SMART and SMARTCAM devices
  signalLevel?: number;
  auth?: number;
  encryption?: number;
}

/** Device model information. */
export interface DeviceInfo {
  shortName: string;
  longName: string;
  brand: string;
  deviceFamily: string;
  deviceType: DeviceType;
  hardwareVersion: string;
  firmwareVersion: string;
  firmwareBuild?: string;
  requiresAuth: boolean;
  region?: string;
}

/**
 * Common device interface.
 *
 * Do not instantiate this class directly; instead obtain a device instance from
 * `connect()`.
 */
export abstract class Device {
  /**
   * Raw response from the last {@link update} call, and discovery info if the device
   * was obtained via discovery.
   *
   * Public (rather than protected) because parent/child device relationships (e.g.
   * power strip sockets, hub-attached children) need to read and share this state
   * across sibling instances that don't share a class hierarchy — TS's protected
   * access rules only allow same-hierarchy access, unlike Python's convention-based
   * privacy.
   */
  lastUpdate: Record<string, unknown> = {};
  discoveryInfo?: Record<string, unknown>;

  protected readonly featureMap = new Map<string, Feature>();
  parentDevice?: Device;
  childDevices: Map<string, Device> = new Map();

  protected deviceTypeValue: DeviceType = DeviceType.Unknown;

  constructor(protected readonly protocolRef: BaseProtocol) {}

  get protocol(): BaseProtocol {
    return this.protocolRef;
  }

  /** Update the device state. */
  abstract update(updateChildren?: boolean): Promise<void>;

  /** Disconnect and close any underlying connection resources. */
  async disconnect(): Promise<void> {
    await this.protocolRef.close();
  }

  /** Return the device modules. */
  abstract get modules(): ModuleMapping<Module>;

  /**
   * Convenience accessors for the well-known cross-family modules in
   * {@link CommonModules}, equivalent to `this.modules.get(CommonModules.X)`.
   * Undefined when the device doesn't support the module. Deliberate deviation
   * from python-kasa, which only exposes `dev.modules[Module.X]` — see
   * architecture.md.
   */
  get alarm(): Alarm | undefined {
    return this.modules.get(CommonModules.Alarm);
  }

  get childSetup(): ChildSetup | undefined {
    return this.modules.get(CommonModules.ChildSetup);
  }

  get energy(): Energy | undefined {
    return this.modules.get(CommonModules.Energy);
  }

  get fan(): Fan | undefined {
    return this.modules.get(CommonModules.Fan);
  }

  get led(): Led | undefined {
    return this.modules.get(CommonModules.Led);
  }

  get light(): Light | undefined {
    return this.modules.get(CommonModules.Light);
  }

  get lightEffect(): LightEffect | undefined {
    return this.modules.get(CommonModules.LightEffect);
  }

  get lightPreset(): LightPreset | undefined {
    return this.modules.get(CommonModules.LightPreset);
  }

  get thermostat(): Thermostat | undefined {
    return this.modules.get(CommonModules.Thermostat);
  }

  get timeModule(): Time | undefined {
    return this.modules.get(CommonModules.Time);
  }

  abstract get isOn(): boolean;

  get isOff(): boolean {
    return !this.isOn;
  }

  abstract turnOn(): Promise<Record<string, unknown>>;
  abstract turnOff(): Promise<Record<string, unknown>>;

  /** Set the device state to `on`. */
  abstract setState(on: boolean): Promise<Record<string, unknown>>;

  get host(): string {
    return this.protocolRef.transport.host;
  }

  get port(): number {
    return this.protocolRef.transport.port;
  }

  get credentials(): Credentials | undefined {
    return this.protocolRef.transport.credentials;
  }

  get credentialsHash(): string | undefined {
    return this.protocolRef.transport.credentialsHash;
  }

  get deviceType(): DeviceType {
    return this.deviceTypeValue;
  }

  /** Update state from info obtained via discovery. */
  abstract updateFromDiscoverInfo(info: Record<string, unknown>): void;

  get config(): DeviceConfig {
    return this.protocolRef.config;
  }

  abstract get model(): string;

  get region(): string | undefined {
    return this.deviceInfo.region;
  }

  get deviceInfo(): DeviceInfo {
    return this.getDeviceInfo(this.lastUpdate, this.discoveryInfo);
  }

  protected abstract getDeviceInfo(
    info: Record<string, unknown>,
    discoveryInfo: Record<string, unknown> | undefined,
  ): DeviceInfo;

  abstract get alias(): string | undefined;

  async rawQuery(
    request: string | Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.protocolRef.query(request);
  }

  get parent(): Device | undefined {
    return this.parentDevice;
  }

  get children(): Device[] {
    return Array.from(this.childDevices.values());
  }

  /** Return child device by its device id or alias. */
  getChildDevice(nameOrId: string): Device | undefined {
    if (this.childDevices.has(nameOrId)) return this.childDevices.get(nameOrId);
    const nameLower = nameOrId.toLowerCase();
    return this.children.find((child) => child.alias?.toLowerCase() === nameLower);
  }

  abstract get sysInfo(): Record<string, unknown>;

  abstract get time(): Date;

  /** Return the timezone name (IANA identifier) reported by the device. */
  abstract get timezone(): string;

  abstract get hwInfo(): Record<string, unknown>;

  abstract get location(): Record<string, unknown>;

  abstract get rssi(): number | undefined;

  /** Return the mac address formatted with colons. */
  abstract get mac(): string;

  abstract get deviceId(): string;

  /** Return all the internal state data. */
  abstract get internalState(): unknown;

  /** Return available features and their values. */
  get stateInformation(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const feature of this.featureMap.values()) {
      result[feature.name] = feature.value;
    }
    return result;
  }

  get features(): ReadonlyMap<string, Feature> {
    return this.featureMap;
  }

  protected addFeature(feature: Feature): void {
    if (this.featureMap.has(feature.id)) {
      throw new KasaException(`Duplicate feature id ${feature.id}`);
    }
    this.featureMap.set(feature.id, feature);
  }

  abstract get hasEmeter(): boolean;

  /**
   * Return the time that the device was turned on, or undefined if turned off.
   *
   * Implementations should return a cached value if the device-reported value
   * differs by under five seconds, to avoid device-caused jitter.
   */
  abstract get onSince(): Date | undefined;

  abstract wifiScan(): Promise<WifiNetwork[]>;

  abstract wifiJoin(
    ssid: string,
    password: string,
    keytype?: string,
  ): Promise<Record<string, unknown>>;

  abstract setAlias(alias: string): Promise<Record<string, unknown>>;

  /**
   * Reboot the device.
   *
   * Note that a delay of zero causes this to block, as the device reboots
   * immediately without responding to the call.
   */
  abstract reboot(delay?: number): Promise<void>;

  /**
   * Reset the device back to factory settings.
   *
   * Note this does not downgrade the firmware.
   */
  abstract factoryReset(): Promise<void>;

  toString(): string {
    const updateNeeded =
      Object.keys(this.lastUpdate).length === 0 ? " - update() needed" : "";
    if (Object.keys(this.lastUpdate).length === 0 && !this.discoveryInfo) {
      return `<${this.deviceType} at ${this.host}${updateNeeded}>`;
    }
    return `<${this.deviceType} at ${this.host} - ${this.alias} (${this.model})${updateNeeded}>`;
  }
}
