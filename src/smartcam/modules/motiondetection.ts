import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of motion detection. */
export class MotionDetection extends DetectionModule {
  static override readonly requiredComponent = "detection";
  static override readonly queryGetterName = "getDetectionConfig";
  static override readonly queryModuleName = "motion_detection";
  static override readonly querySectionNames = "motion_det";
  static override readonly detectionFeatureId = "motion_detection";
  static override readonly detectionFeatureName = "Motion detection";
  static override readonly querySetterName = "setDetectionConfig";
  static override readonly querySetSectionName = "motion_det";
}
