import type { Device } from "./core/device.ts";
import { DeviceType } from "./core/device_type.ts";
import { DeviceConfig, DeviceEncryptionType, DeviceFamily } from "./core/deviceconfig.ts";
import { UnsupportedDeviceError } from "./core/exceptions.ts";
import type { BaseProtocol } from "./core/protocol.ts";
import {
  IotBulb,
  IotDimmer,
  IotLightStrip,
  IotPlug,
  IotStrip,
  IotWallSwitch,
  getIotDeviceTypeFromSysInfo,
} from "./iot/index.ts";
import { IotProtocol, SmartCamProtocol, SmartProtocol } from "./protocols/index.ts";
import { SmartDevice } from "./smart/index.ts";
import { SmartCamDevice } from "./smartcam/index.ts";
import {
  AesTransport,
  type BaseTransport,
  KlapTransport,
  KlapTransportV2,
  LinkieTransportV2,
  SslAesTransport,
  SslTransport,
  XorTransport,
} from "./transports/index.ts";

const GET_SYSINFO_QUERY = { system: { get_sysinfo: {} } };

export type DeviceConstructor = new (host: string, protocol: BaseProtocol) => Device;

const IOT_TYPE_TO_CLASS: Partial<Record<DeviceType, DeviceConstructor>> = {
  [DeviceType.Bulb]: IotBulb,
  [DeviceType.Plug]: IotPlug,
  [DeviceType.Dimmer]: IotDimmer,
  [DeviceType.Strip]: IotStrip,
  [DeviceType.WallSwitch]: IotWallSwitch,
  [DeviceType.LightStrip]: IotLightStrip,
};

export function getDeviceClassFromSysInfo(
  sysinfo: Record<string, unknown>,
): DeviceConstructor {
  const deviceType = getIotDeviceTypeFromSysInfo(sysinfo);
  const cls = IOT_TYPE_TO_CLASS[deviceType];
  if (!cls)
    throw new UnsupportedDeviceError(`Unsupported IOT device type: ${deviceType}`);
  return cls;
}

const SUPPORTED_DEVICE_TYPES: Record<string, DeviceConstructor> = {
  "SMART.TAPOPLUG": SmartDevice,
  "SMART.TAPOBULB": SmartDevice,
  "SMART.TAPOSWITCH": SmartDevice,
  "SMART.KASAPLUG": SmartDevice,
  "SMART.TAPOHUB": SmartDevice,
  "SMART.TAPOHUB.HTTPS": SmartCamDevice,
  "SMART.KASAHUB": SmartDevice,
  "SMART.KASASWITCH": SmartDevice,
  "SMART.IPCAMERA.HTTPS": SmartCamDevice,
  "SMART.TAPODOORBELL.HTTPS": SmartCamDevice,
  "SMART.TAPOROBOVAC.HTTPS": SmartDevice,
  "IOT.SMARTPLUGSWITCH": IotPlug,
  "IOT.SMARTBULB": IotBulb,
};

export function getDeviceClassFromFamily(
  deviceFamily: string,
  options?: { https?: boolean; requireExact?: boolean },
): DeviceConstructor | undefined {
  const lookupKey = `${deviceFamily}${options?.https ? ".HTTPS" : ""}`;
  let cls = SUPPORTED_DEVICE_TYPES[lookupKey];
  if (!cls && deviceFamily.startsWith("SMART.") && !options?.requireExact) {
    cls = SmartDevice;
  }
  return cls;
}

export function getProtocol(
  config: DeviceConfig,
  options?: { strict?: boolean },
): BaseProtocol | undefined {
  const ctype = config.connectionType;
  const protocolName = ctype.deviceFamily.split(".")[0];

  if (
    ctype.deviceFamily === DeviceFamily.SmartIpCamera ||
    ctype.deviceFamily === DeviceFamily.SmartTapoDoorbell
  ) {
    if (options?.strict && ctype.encryptionType !== DeviceEncryptionType.Aes)
      return undefined;
    return new SmartCamProtocol(new SslAesTransport(config));
  }

  if (ctype.deviceFamily === DeviceFamily.IotIpCamera) {
    if (options?.strict && ctype.encryptionType !== DeviceEncryptionType.Xor)
      return undefined;
    return new IotProtocol(new LinkieTransportV2(config));
  }

  // Older firmware used a different transport.
  if (
    ctype.deviceFamily === DeviceFamily.SmartTapoRobovac &&
    ctype.encryptionType === DeviceEncryptionType.Aes
  ) {
    return new SmartProtocol(new SslTransport(config));
  }

  const protocolTransportKey = `${protocolName}.${ctype.encryptionType}${ctype.https ? ".HTTPS" : ""}`;

  const supportedDeviceProtocols: Record<string, () => BaseProtocol> = {
    "IOT.XOR": () => new IotProtocol(new XorTransport(config)),
    "IOT.KLAP": () => new IotProtocol(new KlapTransport(config)),
    "SMART.AES": () => new SmartProtocol(new AesTransport(config)),
    "SMART.KLAP": () => new SmartProtocol(new KlapTransportV2(config)),
    "SMART.KLAP.HTTPS": () => new SmartProtocol(new KlapTransportV2(config)),
    // H200 is device family SMART.TAPOHUB but uses SmartCamProtocol; https
    // distinguishes it from plain SmartProtocol devices.
    "SMART.AES.HTTPS": () => new SmartCamProtocol(new SslAesTransport(config)),
  };

  const factory = supportedDeviceProtocols[protocolTransportKey];
  return factory?.();
}

/**
 * Connect to a single device by hostname or device configuration.
 *
 * This bypasses UDP-based discovery (not implemented in this port) and connects
 * directly to the device, which is both faster and more reliable when the network is
 * congested or the device doesn't respond to discovery broadcasts.
 */
export async function connect(options: {
  host?: string;
  config?: DeviceConfig;
}): Promise<Device> {
  const { host } = options;
  let { config } = options;
  if ((host && config) || (!host && !config)) {
    throw new Error("One of host or config must be provided and not both");
  }
  if (host) config = new DeviceConfig(host);
  if (!config) throw new Error("config must be provided");

  const protocol = getProtocol(config);
  if (!protocol) {
    throw new UnsupportedDeviceError(
      `Unsupported device for ${config.host}: ${config.connectionType.deviceFamily}`,
      { host: config.host },
    );
  }

  try {
    return await connectWithProtocol(config, protocol);
  } catch (ex) {
    await protocol.close();
    throw ex;
  }
}

async function connectWithProtocol(
  config: DeviceConfig,
  protocol: BaseProtocol,
): Promise<Device> {
  if (protocol instanceof IotProtocol && protocol.transport instanceof XorTransport) {
    const info = await protocol.query(GET_SYSINFO_QUERY);
    const DeviceCls = getDeviceClassFromSysInfo(info);
    const device = new DeviceCls(config.host, protocol);
    device.updateFromDiscoverInfo(info);
    await device.update();
    return device;
  }

  const DeviceCls = getDeviceClassFromFamily(config.connectionType.deviceFamily, {
    https: config.connectionType.https,
  });
  if (!DeviceCls) {
    throw new UnsupportedDeviceError(
      `Unsupported device for ${config.host}: ${config.connectionType.deviceFamily}`,
      { host: config.host },
    );
  }
  const device = new DeviceCls(config.host, protocol);
  await device.update();
  return device;
}
