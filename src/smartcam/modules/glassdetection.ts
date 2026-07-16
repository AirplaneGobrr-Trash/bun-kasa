import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of glass-breaking detection. */
export class GlassDetection extends DetectionModule {
  static override readonly requiredComponent = "glassDetection";
  static override readonly queryGetterName = "getGlassDetectionConfig";
  static override readonly queryModuleName = "glass_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "glass_detection";
  static override readonly detectionFeatureName = "Glass detection";
  static override readonly querySetterName = "setGlassDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
