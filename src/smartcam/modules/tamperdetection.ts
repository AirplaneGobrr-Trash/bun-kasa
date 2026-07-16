import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of tamper detection. */
export class TamperDetection extends DetectionModule {
  static override readonly requiredComponent = "tamperDetection";
  static override readonly queryGetterName = "getTamperDetectionConfig";
  static override readonly queryModuleName = "tamper_detection";
  static override readonly querySectionNames = "tamper_det";
  static override readonly detectionFeatureId = "tamper_detection";
  static override readonly detectionFeatureName = "Tamper detection";
  static override readonly querySetterName = "setTamperDetectionConfig";
  static override readonly querySetSectionName = "tamper_det";
}
