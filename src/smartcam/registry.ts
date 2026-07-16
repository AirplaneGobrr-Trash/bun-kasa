import {
  Alarm,
  BabyCryDetection,
  BarkDetection,
  Battery,
  Camera,
  ChildDevice,
  ChildSetup,
  DeviceModule,
  GlassDetection,
  HomeKit,
  Led,
  LensMask,
  LineCrossingDetection,
  Matter,
  MeowDetection,
  MotionDetection,
  PanTilt,
  PersonDetection,
  PetDetection,
  TamperDetection,
  Time,
  VehicleDetection,
} from "./modules/index.ts";
import type { SmartCamModule } from "./smartcammodule.ts";

/**
 * Explicit registry of every SMARTCAM module class.
 *
 * See `smart/registry.ts` for the rationale (TS analog of Python's
 * `__init_subclass__`-based auto-registration).
 */
export const REGISTERED_SMARTCAM_MODULES: (typeof SmartCamModule)[] = [
  Alarm,
  BabyCryDetection,
  BarkDetection,
  Battery,
  Camera,
  ChildDevice,
  ChildSetup,
  DeviceModule,
  GlassDetection,
  HomeKit,
  Led,
  LensMask,
  LineCrossingDetection,
  Matter,
  MeowDetection,
  MotionDetection,
  PanTilt,
  PersonDetection,
  PetDetection,
  TamperDetection,
  Time,
  VehicleDetection,
];
