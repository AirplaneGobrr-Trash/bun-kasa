import { DeviceType } from "../core/device_type.ts";
import { CommonModules } from "../core/modulenames.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import { IotDevice } from "./iotdevice.ts";
import { IotModules } from "./modulenames.ts";
import {
  AmbientLight,
  Antitheft,
  Cloud,
  Led,
  Motion,
  Schedule,
  Time,
  Usage,
} from "./modules/index.ts";

/** Representation of a TP-Link Smart Plug (HS100, HS110, ...). */
export class IotPlug extends IotDevice {
  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.Plug;
  }

  override async initializeModules(): Promise<void> {
    await super.initializeModules();
    this.addModule(IotModules.IotSchedule, new Schedule(this, "schedule"));
    this.addModule(IotModules.IotUsage, new Usage(this, "schedule"));
    this.addModule(IotModules.IotAntitheft, new Antitheft(this, "anti_theft"));
    this.addModule(CommonModules.Time, new Time(this, "time"));
    this.addModule(IotModules.IotCloud, new Cloud(this, "cnCloud"));
    this.addModule(CommonModules.Led, new Led(this, "system"));
  }

  override get isOn(): boolean {
    return Boolean(this.sysInfo.relay_state);
  }

  override async turnOn(): Promise<Record<string, unknown>> {
    return this.queryHelper("system", "set_relay_state", { state: 1 });
  }

  override async turnOff(): Promise<Record<string, unknown>> {
    return this.queryHelper("system", "set_relay_state", { state: 0 });
  }
}

/** Representation of a TP-Link Smart Wall Switch. */
export class IotWallSwitch extends IotPlug {
  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.WallSwitch;
  }

  override async initializeModules(): Promise<void> {
    await super.initializeModules();
    const devName = this.sysInfo.dev_name as string | undefined;
    if (devName?.includes("PIR")) {
      this.addModule(IotModules.IotMotion, new Motion(this, "smartlife.iot.PIR"));
      this.addModule(
        IotModules.IotAmbientLight,
        new AmbientLight(this, "smartlife.iot.LAS"),
      );
    }
  }
}
