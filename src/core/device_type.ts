/** TP-Link device type enum. */
export enum DeviceType {
  Plug = "plug",
  Bulb = "bulb",
  Strip = "strip",
  Camera = "camera",
  WallSwitch = "wallswitch",
  StripSocket = "stripsocket",
  Dimmer = "dimmer",
  LightStrip = "lightstrip",
  Sensor = "sensor",
  Hub = "hub",
  Fan = "fan",
  Thermostat = "thermostat",
  Vacuum = "vacuum",
  Chime = "chime",
  Doorbell = "doorbell",
  Unknown = "unknown",
}

/** Return device type from a string value. */
export function deviceTypeFromValue(value: string): DeviceType {
  return (Object.values(DeviceType) as string[]).includes(value)
    ? (value as DeviceType)
    : DeviceType.Unknown;
}
