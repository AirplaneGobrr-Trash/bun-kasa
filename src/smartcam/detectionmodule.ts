import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import { SmartCamModule } from "./smartcammodule.ts";

/** Base class for all SMARTCAM detection modules (motion, person, pet, etc). */
export abstract class DetectionModule extends SmartCamModule {
  /** Feature ID, set by the inheriting class. */
  static readonly detectionFeatureId: string = "";
  /** User-friendly short description, set by the inheriting class. */
  static readonly detectionFeatureName: string = "";
  /** Feature setter method name, set by the inheriting class. */
  static readonly querySetterName: string = "";
  /** Feature section name, set by the inheriting class. */
  static readonly querySetSectionName: string = "";

  private get detectionFeatureId(): string {
    return (this.constructor as typeof DetectionModule).detectionFeatureId;
  }

  private get detectionFeatureName(): string {
    return (this.constructor as typeof DetectionModule).detectionFeatureName;
  }

  private get querySetterName(): string {
    return (this.constructor as typeof DetectionModule).querySetterName;
  }

  private get querySetSectionName(): string {
    return (this.constructor as typeof DetectionModule).querySetSectionName;
  }

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: this.detectionFeatureId,
        name: this.detectionFeatureName,
        container: this,
        attributeGetter: "enabled",
        attributeSetter: "setEnabled",
        type: FeatureType.Switch,
        category: FeatureCategory.Config,
      }),
    );
  }

  get enabled(): boolean {
    const sectionName = this.querySectionNames as string;
    return (this.data[sectionName] as { enabled: string }).enabled === "on";
  }

  async setEnabled(enable: boolean): Promise<Record<string, unknown>> {
    try {
      const params = { enabled: enable ? "on" : "off" };
      return await this.smartCamDevice.querySetterHelper(
        this.querySetterName,
        this.queryModuleName,
        this.querySetSectionName,
        params,
      );
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }
}
