import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of the SMARTCAM battery module. */
export class Battery extends SmartCamModule {
  static override readonly requiredComponent = "battery";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "battery_low",
        name: "Battery low",
        container: this,
        attributeGetter: "batteryLow",
        icon: "mdi:alert",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Debug,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "battery_level",
        name: "Battery level",
        container: this,
        attributeGetter: "batteryPercent",
        icon: "mdi:battery",
        unitGetter: () => "%",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
    if (this.optionalFloatSysinfo("battery_temperature") !== undefined) {
      this.addFeature(
        new Feature(this.device, {
          id: "battery_temperature",
          name: "Battery temperature",
          container: this,
          attributeGetter: "batteryTemperature",
          icon: "mdi:battery",
          unitGetter: () => "celsius",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
    }
    if (this.optionalFloatSysinfo("battery_voltage") !== undefined) {
      this.addFeature(
        new Feature(this.device, {
          id: "battery_voltage",
          name: "Battery voltage",
          container: this,
          attributeGetter: "batteryVoltage",
          icon: "mdi:battery",
          unitGetter: () => "V",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
    }
    this.addFeature(
      new Feature(this.device, {
        id: "battery_charging",
        name: "Battery charging",
        container: this,
        attributeGetter: "batteryCharging",
        icon: "mdi:alert",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Debug,
      }),
    );
  }

  private optionalFloatSysinfo(key: string): number | undefined {
    const raw = this.smartCamDevice.sysInfo[key];
    if (raw === undefined || raw === null || raw === "NO") return undefined;
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get batteryPercent(): number {
    return this.smartCamDevice.sysInfo.battery_percent as number;
  }

  get batteryLow(): boolean {
    return Boolean(this.smartCamDevice.sysInfo.low_battery);
  }

  get batteryTemperature(): number | undefined {
    return this.optionalFloatSysinfo("battery_temperature");
  }

  get batteryVoltage(): number | undefined {
    const v = this.optionalFloatSysinfo("battery_voltage");
    return v === undefined ? undefined : v / 1000;
  }

  get batteryCharging(): boolean {
    const v = this.smartCamDevice.sysInfo.battery_charging;
    if (typeof v === "boolean") return v;
    if (v === undefined || v === null) return false;
    return ["yes", "true", "1", "charging", "on"].includes(
      String(v).trim().toLowerCase(),
    );
  }
}
