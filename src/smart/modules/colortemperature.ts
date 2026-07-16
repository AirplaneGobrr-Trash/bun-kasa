import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { ColorTempRange } from "../../interfaces/light.ts";
import { SmartModule } from "../smartmodule.ts";

const DEFAULT_TEMP_RANGE: ColorTempRange = { min: 2500, max: 6500 };

/** Implementation of the color-temperature module. */
export class ColorTemperature extends SmartModule {
  static override readonly requiredComponent = "color_temperature";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "color_temperature",
        name: "Color temperature",
        container: this,
        attributeGetter: "colorTemp",
        attributeSetter: "setColorTemp",
        rangeGetter: () => [
          this.validTemperatureRange.min,
          this.validTemperatureRange.max,
        ],
        category: FeatureCategory.Primary,
        type: FeatureType.Number,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get validTemperatureRange(): ColorTempRange {
    const range = this.data.color_temp_range as [number, number] | undefined;
    if (!range) return DEFAULT_TEMP_RANGE;
    return { min: range[0], max: range[1] };
  }

  get colorTemp(): number {
    return this.data.color_temp as number;
  }

  async setColorTemp(
    temp: number,
    options?: { brightness?: number },
  ): Promise<Record<string, unknown>> {
    const range = this.validTemperatureRange;
    if (temp < range.min || temp > range.max) {
      throw new RangeError(
        `Temperature should be between ${range.min} and ${range.max}, was ${temp}`,
      );
    }
    const params: Record<string, unknown> = { color_temp: temp };
    if (options?.brightness) params.brightness = options.brightness;
    return this.call("set_device_info", params);
  }

  override async checkSupported(): Promise<boolean> {
    const range = this.validTemperatureRange;
    return range.min !== range.max;
  }
}
