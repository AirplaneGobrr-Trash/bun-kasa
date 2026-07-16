import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation for child lock. */
export class ChildLock extends SmartModule {
  static override readonly requiredComponent = "button_and_led";
  static override readonly queryGetterName = "getChildLockInfo";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "child_lock",
        name: "Child lock",
        container: this,
        attributeGetter: "enabled",
        attributeSetter: "setEnabled",
        type: FeatureType.Switch,
        category: FeatureCategory.Config,
      }),
    );
  }

  get enabled(): boolean {
    return Boolean(this.data.child_lock_status);
  }

  async setEnabled(enabled: boolean): Promise<Record<string, unknown>> {
    return this.call("setChildLockInfo", { child_lock_status: enabled });
  }
}
