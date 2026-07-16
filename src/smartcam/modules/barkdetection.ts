import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of bark detection. */
export class BarkDetection extends DetectionModule {
  static override readonly requiredComponent = "barkDetection";
  static override readonly queryGetterName = "getBarkDetectionConfig";
  static override readonly queryModuleName = "bark_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "bark_detection";
  static override readonly detectionFeatureName = "Bark detection";
  static override readonly querySetterName = "setBarkDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
