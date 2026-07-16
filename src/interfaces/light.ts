/** Light preset / state info. */
export interface LightState {
  lightOn?: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  colorTemp?: number;
  transition?: number;
}

/** Color temperature range. */
export interface ColorTempRange {
  min: number;
  max: number;
}

/** Hue-saturation-value. */
export interface HSV {
  hue: number;
  saturation: number;
  value: number;
}

/** 0-255 per channel. */
export interface RGB {
  red: number;
  green: number;
  blue: number;
}

/** Convert 0-360/0-100/0-100 HSV to 0-255 RGB. */
export function hsvToRgb(hue: number, saturation: number, value: number): RGB {
  const s = saturation / 100;
  const v = value / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    red: Math.round((r + m) * 255),
    green: Math.round((g + m) * 255),
    blue: Math.round((b + m) * 255),
  };
}

/** Convert 0-255 RGB to 0-360/0-100/0-100 HSV. */
export function rgbToHsv(red: number, green: number, blue: number): HSV {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;

  const saturation = max === 0 ? 0 : delta / max;

  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation * 100),
    value: Math.round(max * 100),
  };
}

/** Default `rgb` getter: derive RGB from the light's `hsv`. */
export function getRgbFromHsv(light: Pick<Light, "hsv">): RGB {
  const { hue, saturation, value } = light.hsv;
  return hsvToRgb(hue, saturation, value);
}

/** Default `setRgb`: validate channels, convert to HSV, delegate to `setHsv`. */
export function setRgbViaHsv(
  light: Pick<Light, "setHsv">,
  red: number,
  green: number,
  blue: number,
  options?: { transition?: number },
): Promise<Record<string, unknown>> {
  for (const [name, channel] of [
    ["red", red],
    ["green", green],
    ["blue", blue],
  ] as const) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new RangeError(`Invalid ${name} value: ${channel} (valid range: 0-255)`);
    }
  }
  const hsv = rgbToHsv(red, green, blue);
  return light.setHsv(hsv.hue, hsv.saturation, hsv.value, options);
}

/** Base interface for TP-Link lights. */
export interface Light {
  /** Return the current HSV state of the bulb (degrees, %, %). */
  get hsv(): HSV;

  /** Return the current color as 0-255 RGB, derived from `hsv`. */
  get rgb(): RGB;

  /** Return the current color temperature in Kelvin. */
  get colorTemp(): number;

  /** Return the current brightness in percentage. */
  get brightness(): number;

  /**
   * Set new HSV.
   *
   * @param hue hue in degrees
   * @param saturation saturation in percentage [0,100]
   * @param value value in percentage [0,100]
   */
  setHsv(
    hue: number,
    saturation: number,
    value?: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;

  /** Set the color from 0-255 RGB, converted to HSV under the hood. */
  setRgb(
    red: number,
    green: number,
    blue: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;

  /** Set the color temperature of the device in Kelvin. */
  setColorTemp(
    temp: number,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>>;

  /** Set the brightness in percentage. */
  setBrightness(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;

  get state(): LightState;
  setState(state: LightState): Promise<Record<string, unknown>>;
}
