import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: image-tuning controls (lens distortion correction, vertical flip,
 * day/night mode, mains light-frequency mode), ported from
 * ref/pytapo/pytapo/__init__.py's getLensDistortionCorrection/setLensDistortionCorrection,
 * getImageFlipVertical/setImageFlipVertical, getDayNightMode/setDayNightMode, and
 * getLightFrequencyMode/setLightFrequencyMode. Only the standalone-camera (no `chn_id`
 * dual-lens/child-channel) codepaths are ported — see C100_FILES.md; this project's only
 * verified hardware is a standalone C100. Doesn't touch src/smartcam/modules/camera.ts.
 */

export type DayNightMode = "on" | "off" | "auto";
export type LightFrequencyMode = "auto" | "50" | "60";

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function getImageSwitch(rawQuery: RawQuery, switchName: string): Promise<string> {
  const resp = await rawQuery({ getLdc: { image: { name: ["switch"] } } });
  const image = (resp.getLdc as Record<string, unknown> | undefined)?.image as
    | Record<string, unknown>
    | undefined;
  const switches = image?.switch as Record<string, unknown> | undefined;
  const value = switches?.[switchName];
  if (typeof value !== "string") {
    throw new Error(`Switch ${switchName} is not supported by this camera`);
  }
  return value;
}

function setImageSwitch(
  rawQuery: RawQuery,
  switchName: string,
  value: string,
): Promise<Record<string, unknown>> {
  return rawQuery({ setLdc: { image: { switch: { [switchName]: value } } } });
}

async function getImageCommon(rawQuery: RawQuery, field: string): Promise<string> {
  const resp = await rawQuery({ getLightFrequencyInfo: { image: { name: "common" } } });
  const image = (resp.getLightFrequencyInfo as Record<string, unknown> | undefined)
    ?.image as Record<string, unknown> | undefined;
  const common = image?.common as Record<string, unknown> | undefined;
  const value = common?.[field];
  if (typeof value !== "string") {
    throw new Error(`Field ${field} is not supported by this camera`);
  }
  return value;
}

export class CameraImageTuning {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  /** Whether lens distortion correction is enabled. */
  async getLensDistortionCorrection(): Promise<boolean> {
    return (await getImageSwitch(this.#rawQuery, "ldc")) === "on";
  }

  setLensDistortionCorrection(enable: boolean): Promise<Record<string, unknown>> {
    return setImageSwitch(this.#rawQuery, "ldc", enable ? "on" : "off");
  }

  /** Whether the image is flipped vertically (upside-down mounting). */
  async getImageFlipVertical(): Promise<boolean> {
    return (await getImageSwitch(this.#rawQuery, "flip_type")) === "center";
  }

  setImageFlipVertical(enable: boolean): Promise<Record<string, unknown>> {
    return setImageSwitch(this.#rawQuery, "flip_type", enable ? "center" : "off");
  }

  /** "on" (always IR night vision), "off" (always color), or "auto" (light-sensing). */
  getDayNightMode(): Promise<DayNightMode> {
    return getImageCommon(this.#rawQuery, "inf_type") as Promise<DayNightMode>;
  }

  setDayNightMode(mode: DayNightMode): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setDayNightModeConfig: { image: { common: { inf_type: mode } } },
    });
  }

  /** Mains flicker-avoidance frequency: "auto", "50" (Hz), or "60" (Hz). */
  getLightFrequencyMode(): Promise<LightFrequencyMode> {
    return getImageCommon(
      this.#rawQuery,
      "light_freq_mode",
    ) as Promise<LightFrequencyMode>;
  }

  setLightFrequencyMode(mode: LightFrequencyMode): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setLightFrequencyInfo: { image: { common: { light_freq_mode: mode } } },
    });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Image tuning: lens distortion correction, flip, day/night mode, light frequency. */
    readonly imageTuning: CameraImageTuning;
  }
}

const imageTuningMap = new WeakMap<Camera, CameraImageTuning>();

Object.defineProperty(Camera.prototype, "imageTuning", {
  configurable: true,
  get(this: Camera): CameraImageTuning {
    let instance = imageTuningMap.get(this);
    if (!instance) {
      instance = new CameraImageTuning(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      imageTuningMap.set(this, instance);
    }
    return instance;
  },
});
