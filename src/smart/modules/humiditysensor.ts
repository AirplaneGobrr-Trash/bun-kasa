import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the humidity module. */
export class HumiditySensor extends SmartModule {
  static override readonly requiredComponent = "humidity";
  static override readonly queryGetterName = "get_comfort_humidity_config";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "humidity",
        name: "Humidity",
        container: this,
        attributeGetter: "humidity",
        icon: "mdi:water-percent",
        unitGetter: () => "%",
        category: FeatureCategory.Primary,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "humidity_warning",
        name: "Humidity warning",
        container: this,
        attributeGetter: "humidityWarning",
        type: FeatureType.BinarySensor,
        icon: "mdi:alert",
        category: FeatureCategory.Debug,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get humidity(): number {
    return this.smartDevice.sysInfo.current_humidity as number;
  }

  get humidityWarning(): boolean {
    return this.smartDevice.sysInfo.current_humidity_exception !== 0;
  }
}
