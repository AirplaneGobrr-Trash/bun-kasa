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

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class PanTiltMotor {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  /** Rotate by a relative step in the given direction, 0 <= angle < 360. */
  step(angle: number): Promise<Record<string, unknown>> {
    if (angle < 0 || angle >= 360) {
      throw new Error("Angle must be in a range 0 <= angle < 360");
    }
    return this.#rawQuery({
      relativeMove: { motor: { movestep: { direction: String(angle) } } },
    });
  }

  clockwise(): Promise<Record<string, unknown>> {
    return this.step(STEP_CLOCKWISE);
  }

  counterClockwise(): Promise<Record<string, unknown>> {
    return this.step(STEP_COUNTERCLOCKWISE);
  }

  vertical(): Promise<Record<string, unknown>> {
    return this.step(STEP_VERTICAL);
  }

  horizontal(): Promise<Record<string, unknown>> {
    return this.step(STEP_HORIZONTAL);
  }

  calibrate(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ manualCalibrate: { motor: { manual_cali: "" } } });
  }

  getCapability(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ get: { motor: { name: ["capability"] } } });
  }

  deletePreset(presetId: string): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      deleteMotorPostion: { preset: { remove_preset: { id: [presetId] } } },
    });
  }

  getCruise(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getPatrolAction: { patrol: { get_patrol_action: {} } } });
  }

  async getPatrolSchedule(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getPatrolSchedule: { patrol: { get_patrol_schedule: {} } },
    });
    const patrol = (resp.getPatrolSchedule as Record<string, unknown> | undefined)
      ?.patrol as Record<string, unknown> | undefined;
    return (patrol?.patrol as Record<string, unknown> | undefined) ?? {};
  }

  setPatrolStatus(enabled: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setPatrolStatus: {
        patrol: { set_patrol_status: { value: enabled ? "on" : "off" } },
      },
    });
  }

  /** Start a continuous sweep along one axis ("x" or "y"), or stop by passing enabled=false. */
  setCruise(enabled: boolean, coord?: "x" | "y"): Promise<Record<string, unknown>> {
    if (enabled && coord) {
      return this.#rawQuery({ cruiseMove: { motor: { cruise: { coord } } } });
    }
    return this.#rawQuery({ cruiseStop: { motor: { cruise_stop: {} } } });
  }
}

declare module "../smartcam/modules/pantilt.ts" {
  interface PanTilt {
    /** PTZ motor extras: step/calibrate/preset/cruise/patrol, beyond pan()/tilt()/move(). */
    readonly motor: PanTiltMotor;
  }
}

const motorMap = new WeakMap<PanTilt, PanTiltMotor>();

Object.defineProperty(PanTilt.prototype, "motor", {
  configurable: true,
  get(this: PanTilt): PanTiltMotor {
    let instance = motorMap.get(this);
    if (!instance) {
      instance = new PanTiltMotor(this.smartCamDevice.rawQuery.bind(this.smartCamDevice));
      motorMap.set(this, instance);
    }
    return instance;
  },
});
