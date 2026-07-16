import { DetectionModule } from "../detectionmodule.ts";

/** Implementation of vehicle detection. */
export class VehicleDetection extends DetectionModule {
  static override readonly requiredComponent = "vehicleDetection";
  static override readonly queryGetterName = "getVehicleDetectionConfig";
  static override readonly queryModuleName = "vehicle_detection";
  static override readonly querySectionNames = "detection";
  static override readonly detectionFeatureId = "vehicle_detection";
  static override readonly detectionFeatureName = "Vehicle detection";
  static override readonly querySetterName = "setVehicleDetectionConfig";
  static override readonly querySetSectionName = "detection";
}
