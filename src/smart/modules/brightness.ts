import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModules } from "../modulenames.ts";
import { SmartModule } from "../smartmodule.ts";

const BRIGHTNESS_MIN = 0;
const BRIGHTNESS_MAX = 100;

/** Implementation of the brightness module. */
export class Brightness extends SmartModule {
  static override readonly requiredComponent = "brightness";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "brightness",
        name: "Brightness",
        container: this,
        attributeGetter: "brightness",
        attributeSetter: "setBrightness",
        rangeGetter: () => [BRIGHTNESS_MIN, BRIGHTNESS_MAX],
        type: FeatureType.Number,
        category: FeatureCategory.Primary,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get brightness(): number {
    const lightEffect = this.smartDevice.modules.get(SmartModules.SmartLightEffect);
    if (lightEffect?.isActive) return lightEffect.brightness;
    return this.data.brightness as number;
  }

  async setBrightness(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    void options;
    if (
      !Number.isInteger(brightness) ||
      brightness < BRIGHTNESS_MIN ||
      brightness > BRIGHTNESS_MAX
    ) {
      throw new Error(
        `Invalid brightness value: ${brightness} (valid range: ${BRIGHTNESS_MIN}-${BRIGHTNESS_MAX}%)`,
      );
    }
    if (brightness === 0) return this.smartDevice.turnOff();

    const lightEffect = this.smartDevice.modules.get(SmartModules.SmartLightEffect);
    if (lightEffect?.isActive) return lightEffect.setBrightness(brightness);

    return this.call("set_device_info", { brightness });
  }

  override async checkSupported(): Promise<boolean> {
    return "brightness" in this.data;
  }
}
