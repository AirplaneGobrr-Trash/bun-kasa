import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { IotModule, merge } from "../iotmodule.ts";

/** Implements ambient light controls for the motion sensor. */
export class AmbientLight extends IotModule {
  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "ambient_light_enabled",
        name: "Ambient light enabled",
        icon: "mdi:brightness-percent",
        attributeGetter: "enabled",
        attributeSetter: "setEnabled",
        type: FeatureType.Switch,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "ambient_light",
        name: "Ambient Light",
        icon: "mdi:brightness-percent",
        attributeGetter: "ambientlightBrightness",
        type: FeatureType.Sensor,
        category: FeatureCategory.Primary,
        unitGetter: () => "%",
      }),
    );
  }

  override query(): Record<string, unknown> {
    return merge(
      this.queryForCommand("get_config"),
      this.queryForCommand("get_current_brt"),
    );
  }

  get config(): Record<string, unknown> {
    const config = this.data.get_config as { devs: Record<string, unknown>[] };
    return config.devs[0] as Record<string, unknown>;
  }

  get presets(): unknown {
    return this.config.level_array;
  }

  get enabled(): boolean {
    return Boolean(this.config.enable);
  }

  get ambientlightBrightness(): number {
    return Number((this.data.get_current_brt as { value: number }).value);
  }

  async setEnabled(state: boolean): Promise<Record<string, unknown>> {
    return this.call("set_enable", { enable: state ? 1 : 0 });
  }

  async currentBrightness(): Promise<Record<string, unknown>> {
    return this.call("get_current_brt");
  }

  async setBrightnessLimit(value: number): Promise<Record<string, unknown>> {
    return this.call("set_brt_level", { index: 0, value });
  }
}
