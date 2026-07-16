import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of line-crossing detection. */
export class LineCrossingDetection extends DetectionModule {
  static override readonly requiredComponent = "linecrossingDetection";
  static override readonly queryGetterName = "getLinecrossingDetectionConfig";
  static override readonly queryModuleName = "linecrossing_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "line_crossing_detection";
  static override readonly detectionFeatureName = "Line crossing detection";
  static override readonly querySetterName = "setLinecrossingDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
