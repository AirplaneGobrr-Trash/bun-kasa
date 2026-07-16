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

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Whether lens distortion correction is enabled. */
    getLensDistortionCorrection(): Promise<boolean>;
    setLensDistortionCorrection(enable: boolean): Promise<Record<string, unknown>>;
    /** Whether the image is flipped vertically (upside-down mounting). */
    getImageFlipVertical(): Promise<boolean>;
    setImageFlipVertical(enable: boolean): Promise<Record<string, unknown>>;
    /** "on" (always IR night vision), "off" (always color), or "auto" (light-sensing). */
    getDayNightMode(): Promise<DayNightMode>;
    setDayNightMode(mode: DayNightMode): Promise<Record<string, unknown>>;
    /** Mains flicker-avoidance frequency: "auto", "50" (Hz), or "60" (Hz). */
    getLightFrequencyMode(): Promise<LightFrequencyMode>;
    setLightFrequencyMode(mode: LightFrequencyMode): Promise<Record<string, unknown>>;
  }
}

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

Camera.prototype.getLensDistortionCorrection = async function (
  this: Camera,
): Promise<boolean> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return (await getImageSwitch(rawQuery, "ldc")) === "on";
};

Camera.prototype.setLensDistortionCorrection = function (
  this: Camera,
  enable: boolean,
): Promise<Record<string, unknown>> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return setImageSwitch(rawQuery, "ldc", enable ? "on" : "off");
};

Camera.prototype.getImageFlipVertical = async function (this: Camera): Promise<boolean> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return (await getImageSwitch(rawQuery, "flip_type")) === "center";
};

Camera.prototype.setImageFlipVertical = function (
  this: Camera,
  enable: boolean,
): Promise<Record<string, unknown>> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return setImageSwitch(rawQuery, "flip_type", enable ? "center" : "off");
};

Camera.prototype.getDayNightMode = function (this: Camera): Promise<DayNightMode> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return getImageCommon(rawQuery, "inf_type") as Promise<DayNightMode>;
};

Camera.prototype.setDayNightMode = function (
  this: Camera,
  mode: DayNightMode,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setDayNightModeConfig: { image: { common: { inf_type: mode } } },
  });
};

Camera.prototype.getLightFrequencyMode = function (
  this: Camera,
): Promise<LightFrequencyMode> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return getImageCommon(rawQuery, "light_freq_mode") as Promise<LightFrequencyMode>;
};

Camera.prototype.setLightFrequencyMode = function (
  this: Camera,
  mode: LightFrequencyMode,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setLightFrequencyInfo: { image: { common: { light_freq_mode: mode } } },
  });
};
