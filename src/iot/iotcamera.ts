import { DeviceType } from "../core/device_type.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import { IotDevice } from "./iotdevice.ts";

/** Representation of a TP-Link (legacy protocol) camera. */
export class IotCamera extends IotDevice {
  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.Camera;
  }

  override get time(): Date {
    return new Date((this.sysInfo.system_time as number) * 1000);
  }

  override get timezone(): string {
    return "Etc/UTC";
  }

  override get isOn(): boolean {
    return true;
  }
}
