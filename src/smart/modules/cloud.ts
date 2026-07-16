import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the cloud module. */
export class Cloud extends SmartModule {
  static override readonly queryGetterName = "get_connect_cloud_state";
  static override readonly requiredComponent = "cloud_connect";
  override minimumUpdateIntervalSecs = 60;

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "cloud_connection",
        name: "Cloud connection",
        container: this,
        attributeGetter: "isConnected",
        icon: "mdi:cloud",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Info,
      }),
    );
  }

  get isConnected(): boolean {
    if (this.hasDataError()) return false;
    return this.data.status === 0;
  }
}
