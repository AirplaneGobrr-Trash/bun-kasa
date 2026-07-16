import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of the matter module (SMARTCAM). */
export class Matter extends SmartCamModule {
  static override readonly queryGetterName = "getMatterSetupInfo";
  static override readonly queryModuleName = "matter";
  static override readonly requiredComponent = "matter";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "matter_setup_code",
        name: "Matter setup code",
        container: this,
        attributeGetter: () => this.info.setup_code as string,
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "matter_setup_payload",
        name: "Matter setup payload",
        container: this,
        attributeGetter: () => this.info.setup_payload as string,
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
  }

  get info(): Record<string, string> {
    return this.data as Record<string, string>;
  }
}
