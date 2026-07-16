import { DeviceType } from "../core/device_type.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import { IotBulb } from "./iotbulb.ts";
import { IotModules } from "./modulenames.ts";
import { LightEffect } from "./modules/index.ts";

/**
 * Representation of a TP-Link Smart light strip (KL430 and similar).
 *
 * Light strips work like bulbs, but use a different service for controlling, and
 * expose extra information such as length and the active effect.
 */
export class IotLightStrip extends IotBulb {
  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.LightStrip;
  }

  protected override get lightService(): string {
    return "smartlife.iot.lightStrip";
  }

  protected override get setLightMethod(): string {
    return "set_light_state";
  }

  override async initializeModules(): Promise<void> {
    await super.initializeModules();
    this.addModule(
      IotModules.IotLightEffect,
      new LightEffect(this, "smartlife.iot.lighting_effect"),
    );
  }

  get length(): number {
    return this.sysInfo.length as number;
  }
}
