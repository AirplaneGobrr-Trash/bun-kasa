import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the motion sensor module. */
export class MotionSensor extends SmartModule {
  static override readonly requiredComponent = "sensitivity";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "motion_detected",
        name: "Motion detected",
        container: this,
        attributeGetter: "motionDetected",
        icon: "mdi:motion-sensor",
        category: FeatureCategory.Primary,
        type: FeatureType.BinarySensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get motionDetected(): boolean {
    return Boolean(this.smartDevice.sysInfo.detected);
  }
}
