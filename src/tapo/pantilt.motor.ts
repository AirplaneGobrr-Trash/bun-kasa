import { PanTilt } from "../smartcam/modules/pantilt.ts";

/**
 * Monkey-patch: PTZ motor extras not covered by src/smartcam/modules/pantilt.ts's
 * pan()/tilt()/move() (which use `motorMove`/x-y coords), ported from
 * ref/pytapo/pytapo/__init__.py's moveMotorStep and friends, calibrateMotor,
 * getMotorCapability, deletePreset, and cruise/patrol (continuous-rotation "sweep"
 * mode). Doesn't touch src/smartcam/modules/pantilt.ts.
 */

const STEP_CLOCKWISE = 0;
const STEP_COUNTERCLOCKWISE = 180;
const STEP_VERTICAL = 90;
const STEP_HORIZONTAL = 270;

declare module "../smartcam/modules/pantilt.ts" {
  interface PanTilt {
    /** Rotate by a relative step in the given direction, 0 <= angle < 360. */
    moveMotorStep(angle: number): Promise<Record<string, unknown>>;
    moveMotorClockWise(): Promise<Record<string, unknown>>;
    moveMotorCounterClockWise(): Promise<Record<string, unknown>>;
    moveMotorVertical(): Promise<Record<string, unknown>>;
    moveMotorHorizontal(): Promise<Record<string, unknown>>;
    calibrateMotor(): Promise<Record<string, unknown>>;
    getMotorCapability(): Promise<Record<string, unknown>>;
    deletePreset(presetId: string): Promise<Record<string, unknown>>;
    getCruise(): Promise<Record<string, unknown>>;
    getPatrolSchedule(): Promise<Record<string, unknown>>;
    setPatrolStatus(enabled: boolean): Promise<Record<string, unknown>>;
    /** Start a continuous sweep along one axis ("x" or "y"), or stop by passing enabled=false. */
    setCruise(enabled: boolean, coord?: "x" | "y"): Promise<Record<string, unknown>>;
  }
}

PanTilt.prototype.moveMotorStep = function (
  this: PanTilt,
  angle: number,
): Promise<Record<string, unknown>> {
  if (angle < 0 || angle >= 360) {
    throw new Error("Angle must be in a range 0 <= angle < 360");
  }
  return this.smartCamDevice.rawQuery({
    relativeMove: { motor: { movestep: { direction: String(angle) } } },
  });
};

PanTilt.prototype.moveMotorClockWise = function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  return this.moveMotorStep(STEP_CLOCKWISE);
};

PanTilt.prototype.moveMotorCounterClockWise = function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  return this.moveMotorStep(STEP_COUNTERCLOCKWISE);
};

PanTilt.prototype.moveMotorVertical = function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  return this.moveMotorStep(STEP_VERTICAL);
};

PanTilt.prototype.moveMotorHorizontal = function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  return this.moveMotorStep(STEP_HORIZONTAL);
};

PanTilt.prototype.calibrateMotor = function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    manualCalibrate: { motor: { manual_cali: "" } },
  });
};

PanTilt.prototype.getMotorCapability = function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ get: { motor: { name: ["capability"] } } });
};

PanTilt.prototype.deletePreset = function (
  this: PanTilt,
  presetId: string,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    deleteMotorPostion: { preset: { remove_preset: { id: [presetId] } } },
  });
};

PanTilt.prototype.getCruise = function (this: PanTilt): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getPatrolAction: { patrol: { get_patrol_action: {} } },
  });
};

PanTilt.prototype.getPatrolSchedule = async function (
  this: PanTilt,
): Promise<Record<string, unknown>> {
  const resp = await this.smartCamDevice.rawQuery({
    getPatrolSchedule: { patrol: { get_patrol_schedule: {} } },
  });
  const patrol = (resp.getPatrolSchedule as Record<string, unknown> | undefined)
    ?.patrol as Record<string, unknown> | undefined;
  return (patrol?.patrol as Record<string, unknown> | undefined) ?? {};
};

PanTilt.prototype.setPatrolStatus = function (
  this: PanTilt,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setPatrolStatus: { patrol: { set_patrol_status: { value: enabled ? "on" : "off" } } },
  });
};

PanTilt.prototype.setCruise = function (
  this: PanTilt,
  enabled: boolean,
  coord?: "x" | "y",
): Promise<Record<string, unknown>> {
  if (enabled && coord) {
    return this.smartCamDevice.rawQuery({ cruiseMove: { motor: { cruise: { coord } } } });
  }
  return this.smartCamDevice.rawQuery({ cruiseStop: { motor: { cruise_stop: {} } } });
};
