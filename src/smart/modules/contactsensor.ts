import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the contact sensor module. */
export class ContactSensor extends SmartModule {
  // We depend on availability of the sysinfo key rather than a component.
  static override readonly sysinfoLookupKeys = ["open"];

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "is_open",
        name: "Open",
        container: this,
        attributeGetter: "isOpen",
        icon: "mdi:door",
        category: FeatureCategory.Primary,
        type: FeatureType.BinarySensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get isOpen(): boolean {
    return Boolean(this.smartDevice.sysInfo.open);
  }
}
