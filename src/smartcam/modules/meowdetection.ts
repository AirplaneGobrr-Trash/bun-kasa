import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of meow detection. */
export class MeowDetection extends DetectionModule {
  static override readonly requiredComponent = "meowDetection";
  static override readonly queryGetterName = "getMeowDetectionConfig";
  static override readonly queryModuleName = "meow_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "meow_detection";
  static override readonly detectionFeatureName = "Meow detection";
  static override readonly querySetterName = "setMeowDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
