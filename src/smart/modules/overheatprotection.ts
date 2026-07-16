import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation for overheat_protection. */
export class OverheatProtection extends SmartModule {
  static override readonly sysinfoLookupKeys = ["overheated", "overheat_status"];

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "overheated",
        name: "Overheated",
        attributeGetter: "overheated",
        icon: "mdi:heat-wave",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Info,
      }),
    );
  }

  get overheated(): boolean {
    const sysInfo = this.smartDevice.sysInfo;
    if (sysInfo.overheat_status !== undefined) {
      return sysInfo.overheat_status !== "normal";
    }
    return Boolean(sysInfo.overheated);
  }

  override query(): Record<string, unknown> {
    return {};
  }
}
