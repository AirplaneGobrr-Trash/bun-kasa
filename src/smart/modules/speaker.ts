import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the vacuum speaker. */
export class Speaker extends SmartModule {
  static override readonly requiredComponent = "speaker";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "locate",
        name: "Locate device",
        container: this,
        attributeSetter: "locate",
        category: FeatureCategory.Primary,
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "volume",
        name: "Volume",
        container: this,
        attributeGetter: "volume",
        attributeSetter: "setVolume",
        rangeGetter: () => [0, 100],
        category: FeatureCategory.Config,
        type: FeatureType.Number,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return { getVolume: null };
  }

  get volume(): number {
    return this.data.volume as number;
  }

  async setVolume(volume: number): Promise<Record<string, unknown>> {
    if (volume < 0 || volume > 100)
      throw new RangeError("Volume must be between 0 and 100");
    return this.call("setVolume", { volume });
  }

  async locate(): Promise<Record<string, unknown>> {
    return this.call("playSelectAudio", { audio_type: "seek_me" });
  }
}
