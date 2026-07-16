import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of baby cry detection. */
export class BabyCryDetection extends DetectionModule {
  static override readonly requiredComponent = "babyCryDetection";
  static override readonly queryGetterName = "getBCDConfig";
  static override readonly queryModuleName = "sound_detection";
  static override readonly querySectionNames = "bcd";
  static override readonly detectionFeatureId = "baby_cry_detection";
  static override readonly detectionFeatureName = "Baby cry detection";
  static override readonly querySetterName = "setBCDConfig";
  static override readonly querySetSectionName = "bcd";
}
