import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Waterleak status. */
export enum WaterleakStatus {
  Normal = "normal",
  LeakDetected = "water_leak",
  Drying = "water_dry",
}

/** Implementation of the waterleak module. */
export class WaterleakSensor extends SmartModule {
  static override readonly requiredComponent = "sensor_alarm";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "water_leak",
        name: "Water leak",
        container: this,
        attributeGetter: "status",
        icon: "mdi:water",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "water_alert",
        name: "Water alert",
        container: this,
        attributeGetter: "alert",
        icon: "mdi:water-alert",
        category: FeatureCategory.Primary,
        type: FeatureType.BinarySensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "water_alert_timestamp",
        name: "Last alert timestamp",
        container: this,
        attributeGetter: "alertTimestamp",
        icon: "mdi:alert",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get status(): WaterleakStatus {
    return this.smartDevice.sysInfo.water_leak_status as WaterleakStatus;
  }

  get alert(): boolean {
    return Boolean(this.smartDevice.sysInfo.in_alarm);
  }

  get alertTimestamp(): Date | undefined {
    const sysInfo = this.smartDevice.sysInfo;
    if (!("trigger_timestamp" in sysInfo)) return undefined;
    const ts = sysInfo.trigger_timestamp as number;
    return new Date(ts * 1000);
  }
}
