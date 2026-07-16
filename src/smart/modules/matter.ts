import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the matter module. */
export class Matter extends SmartModule {
  static override readonly queryGetterName = "get_matter_setup_info";
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
