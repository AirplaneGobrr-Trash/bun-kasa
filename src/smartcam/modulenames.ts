import { type ModuleName, moduleName } from "../core/modulemapping.ts";
import type { Alarm } from "./modules/alarm.ts";
import type { BabyCryDetection } from "./modules/babycrydetection.ts";
import type { BarkDetection } from "./modules/barkdetection.ts";
import type { Battery } from "./modules/battery.ts";
import type { Camera } from "./modules/camera.ts";
import type { DeviceModule } from "./modules/device.ts";
import type { GlassDetection } from "./modules/glassdetection.ts";
import type { LensMask } from "./modules/lensmask.ts";
import type { LineCrossingDetection } from "./modules/linecrossingdetection.ts";
import type { MeowDetection } from "./modules/meowdetection.ts";
import type { MotionDetection } from "./modules/motiondetection.ts";
import type { PanTilt } from "./modules/pantilt.ts";
import type { PersonDetection } from "./modules/persondetection.ts";
import type { PetDetection } from "./modules/petdetection.ts";
import type { TamperDetection } from "./modules/tamperdetection.ts";
import type { VehicleDetection } from "./modules/vehicledetection.ts";

/** SMARTCAM-family-specific module names, mirroring `SmartCamModule` in kasa/smartcam/smartcammodule.py. */
export const SmartCamModules = {
  SmartCamAlarm: moduleName<Alarm>("SmartCamAlarm"),
  SmartCamMotionDetection: moduleName<MotionDetection>("MotionDetection"),
  SmartCamPersonDetection: moduleName<PersonDetection>("PersonDetection"),
  SmartCamPetDetection: moduleName<PetDetection>("PetDetection"),
  SmartCamTamperDetection: moduleName<TamperDetection>("TamperDetection"),
  SmartCamBabyCryDetection: moduleName<BabyCryDetection>("BabyCryDetection"),
  SmartCamLineCrossingDetection: moduleName<LineCrossingDetection>(
    "LineCrossingDetection",
  ),
  SmartCamBarkDetection: moduleName<BarkDetection>("BarkDetection"),
  SmartCamGlassDetection: moduleName<GlassDetection>("GlassDetection"),
  SmartCamMeowDetection: moduleName<MeowDetection>("MeowDetection"),
  SmartCamVehicleDetection: moduleName<VehicleDetection>("VehicleDetection"),
  SmartCamBattery: moduleName<Battery>("Battery"),
  SmartCamDeviceModule: moduleName<DeviceModule>("devicemodule"),
  Camera: moduleName<Camera>("Camera"),
  LensMask: moduleName<LensMask>("LensMask"),
  PanTilt: moduleName<PanTilt>("PanTilt"),
} as const satisfies Record<string, ModuleName<unknown>>;
