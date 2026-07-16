import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the battery module. */
export class BatterySensor extends SmartModule {
  static override readonly requiredComponent = "battery_detect";
  static override readonly queryGetterName = "get_battery_detect_info";

  override initializeFeatures(): void {
    const sysInfo = this.smartDevice.sysInfo;
    if ("at_low_battery" in sysInfo || "is_low" in sysInfo) {
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
    }
    if ("battery_percentage" in sysInfo) {
      this.addFeature(
        new Feature(this.device, {
          id: "battery_level",
          name: "Battery level",
          container: this,
          attributeGetter: "battery",
          icon: "mdi:battery",
          unitGetter: () => "%",
          category: FeatureCategory.Info,
          type: FeatureType.Sensor,
        }),
      );
    }
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get battery(): number {
    return this.smartDevice.sysInfo.battery_percentage as number;
  }

  get batteryLow(): boolean {
    const sysInfo = this.smartDevice.sysInfo;
    const isLow = sysInfo.at_low_battery ?? sysInfo.is_low;
    if (isLow === undefined)
      throw new KasaException("Device does not report battery low status");
    return Boolean(isLow);
  }
}
