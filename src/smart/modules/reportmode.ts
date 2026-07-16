import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the report module. */
export class ReportMode extends SmartModule {
  static override readonly requiredComponent = "report_mode";
  static override readonly queryGetterName = "get_report_mode";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "report_interval",
        name: "Report interval",
        container: this,
        attributeGetter: "reportInterval",
        unitGetter: () => "s",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get reportInterval(): number {
    return this.smartDevice.sysInfo.report_interval as number;
  }
}
