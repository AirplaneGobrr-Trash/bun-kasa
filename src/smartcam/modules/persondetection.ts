import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of person detection. */
export class PersonDetection extends DetectionModule {
  static override readonly requiredComponent = "personDetection";
  static override readonly queryGetterName = "getPersonDetectionConfig";
  static override readonly queryModuleName = "people_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "person_detection";
  static override readonly detectionFeatureName = "Person detection";
  static override readonly querySetterName = "setPersonDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
