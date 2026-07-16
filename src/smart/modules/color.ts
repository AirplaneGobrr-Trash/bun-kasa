import { Feature, FeatureType } from "../../core/feature.ts";
import type { HSV } from "../../interfaces/light.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the color module. */
export class Color extends SmartModule {
  static override readonly requiredComponent = "color";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "hsv",
        name: "HSV",
        container: this,
        attributeGetter: "hsv",
        attributeSetter: "setHsv",
        type: FeatureType.Unknown,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get hsv(): HSV {
    return {
      hue: (this.data.hue as number) ?? 0,
      saturation: (this.data.saturation as number) ?? 0,
      value: (this.data.brightness as number) ?? 0,
    };
  }

  private raiseForInvalidBrightness(value: number): void {
    if (!Number.isInteger(value)) throw new TypeError("Brightness must be an integer");
    if (value < 0 || value > 100) {
      throw new RangeError(`Invalid brightness value: ${value} (valid range: 0-100%)`);
    }
  }

  async setHsv(
    hue: number,
    saturation: number,
    value?: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    void options;
    if (!Number.isInteger(hue) || hue < 0 || hue > 360) {
      throw new RangeError(`Invalid hue value: ${hue} (valid range: 0-360)`);
    }
    if (!Number.isInteger(saturation) || saturation < 0 || saturation > 100) {
      throw new RangeError(
        `Invalid saturation value: ${saturation} (valid range: 0-100%)`,
      );
    }
    if (value !== undefined) this.raiseForInvalidBrightness(value);

    const payload: Record<string, unknown> = { color_temp: 0, hue, saturation };
    if (value !== undefined) payload.brightness = value;
    return this.call("set_device_info", payload);
  }
}
