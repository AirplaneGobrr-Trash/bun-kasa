import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation for child_protection. */
export class ChildProtection extends SmartModule {
  static override readonly requiredComponent = "child_protection";
  static override readonly queryGetterName = "get_child_protection";

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

  override query(): Record<string, unknown> {
    return {};
  }

  get enabled(): boolean {
    return Boolean(this.data.child_protection);
  }

  async setEnabled(enabled: boolean): Promise<Record<string, unknown>> {
    return this.call("set_child_protection", { enable: enabled });
  }
}
