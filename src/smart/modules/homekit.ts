import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the HomeKit module. */
export class HomeKit extends SmartModule {
  static override readonly queryGetterName = "get_homekit_info";
  static override readonly requiredComponent = "homekit";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "homekit_setup_code",
        name: "Homekit setup code",
        container: this,
        attributeGetter: () => this.info.mfi_setup_code as string,
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
  }

  get info(): Record<string, string> {
    return this.data as Record<string, string>;
  }
}
