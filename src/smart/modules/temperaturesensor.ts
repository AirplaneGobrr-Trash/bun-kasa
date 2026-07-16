import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { TemperatureUnit } from "../../interfaces/thermostat.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the temperature module. */
export class TemperatureSensor extends SmartModule {
  static override readonly requiredComponent = "temperature";
  static override readonly queryGetterName = "get_comfort_temp_config";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "temperature",
        name: "Temperature",
        container: this,
        attributeGetter: "temperature",
        icon: "mdi:thermometer",
        category: FeatureCategory.Primary,
        unitGetter: "temperatureUnit",
        type: FeatureType.Sensor,
      }),
    );
    if ("current_temp_exception" in this.smartDevice.sysInfo) {
      this.addFeature(
        new Feature(this.device, {
          id: "temperature_warning",
          name: "Temperature warning",
          container: this,
          attributeGetter: "temperatureWarning",
          type: FeatureType.BinarySensor,
          icon: "mdi:alert",
          category: FeatureCategory.Debug,
        }),
      );
    }
    this.addFeature(
      new Feature(this.device, {
        id: "temperature_unit",
        name: "Temperature unit",
        container: this,
        attributeGetter: "temperatureUnit",
        attributeSetter: "setTemperatureUnit",
        type: FeatureType.Choice,
        choicesGetter: () => ["celsius", "fahrenheit"],
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get temperature(): number {
    return this.smartDevice.sysInfo.current_temp as number;
  }

  get temperatureWarning(): boolean {
    return ((this.smartDevice.sysInfo.current_temp_exception as number) ?? 0) !== 0;
  }

  get temperatureUnit(): TemperatureUnit {
    return this.smartDevice.sysInfo.temp_unit as TemperatureUnit;
  }

  async setTemperatureUnit(unit: TemperatureUnit): Promise<Record<string, unknown>> {
    return this.call("set_temperature_unit", { temp_unit: unit });
  }
}
