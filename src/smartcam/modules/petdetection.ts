import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of pet detection. */
export class PetDetection extends DetectionModule {
  static override readonly requiredComponent = "petDetection";
  static override readonly queryGetterName = "getPetDetectionConfig";
  static override readonly queryModuleName = "pet_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "pet_detection";
  static override readonly detectionFeatureName = "Pet detection";
  static override readonly querySetterName = "setPetDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
