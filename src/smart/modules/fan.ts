import { Feature, FeatureType } from "../../core/feature.ts";
import type { Fan as FanInterface } from "../../interfaces/fan.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the fan_control module. */
export class Fan extends SmartModule implements FanInterface {
  static override readonly requiredComponent = "fan_control";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "fan_speed_level",
        name: "Fan speed level",
        container: this,
        attributeGetter: "fanSpeedLevel",
        attributeSetter: "setFanSpeedLevel",
        icon: "mdi:fan",
        type: FeatureType.Number,
        rangeGetter: () => [0, 4],
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "fan_sleep_mode",
        name: "Fan sleep mode",
        container: this,
        attributeGetter: "sleepMode",
        attributeSetter: "setSleepMode",
        icon: "mdi:sleep",
        type: FeatureType.Switch,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get fanSpeedLevel(): number {
    return this.data.device_on === false ? 0 : (this.data.fan_speed_level as number);
  }

  async setFanSpeedLevel(level: number): Promise<Record<string, unknown>> {
    if (level < 0 || level > 4)
      throw new RangeError("Invalid level, should be in range 0-4.");
    if (level === 0) return this.call("set_device_info", { device_on: false });
    return this.call("set_device_info", { device_on: true, fan_speed_level: level });
  }

  get sleepMode(): boolean {
    return Boolean(this.data.fan_sleep_mode_on);
  }

  async setSleepMode(on: boolean): Promise<Record<string, unknown>> {
    return this.call("set_device_info", { fan_sleep_mode_on: on });
  }

  override async checkSupported(): Promise<boolean> {
    return "fan_speed_level" in this.data;
  }
}
