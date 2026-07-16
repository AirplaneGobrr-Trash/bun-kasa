import { DeviceType } from "../core/device_type.ts";
import { KasaException } from "../core/exceptions.ts";
import { CommonModules } from "../core/modulenames.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import type { ColorTempRange, HSV } from "../interfaces/light.ts";
import { IotDevice } from "./iotdevice.ts";
import { IotModules } from "./modulenames.ts";
import {
  Antitheft,
  Cloud,
  Countdown,
  Emeter,
  Light,
  LightPreset,
  Schedule,
  Time,
  Usage,
} from "./modules/index.ts";

/** Type of turn-on behavior. */
export enum BehaviorMode {
  /** Return to the last known state. */
  Last = "last_status",
  /** Use a chosen preset. */
  Preset = "customize_preset",
  /** Circadian. */
  Circadian = "circadian",
}

/** A single turn-on behavior. */
export interface TurnOnBehavior {
  mode: BehaviorMode;
  /** Index of preset to use, or undefined for the last known state. */
  preset?: number;
  brightness?: number;
  colorTemp?: number;
  hue?: number;
  saturation?: number;
}

/** The behaviors for turning the bulb on. */
export interface TurnOnBehaviors {
  /** The behavior when the bulb is turned on programmatically. */
  soft: TurnOnBehavior;
  /** The behavior when the bulb has been off from mains power. */
  hard: TurnOnBehavior;
}

function parseTurnOnBehavior(raw: Record<string, unknown>): TurnOnBehavior {
  return {
    mode: raw.mode as BehaviorMode,
    preset: raw.index as number | undefined,
    brightness: raw.brightness as number | undefined,
    colorTemp: raw.color_temp as number | undefined,
    hue: raw.hue as number | undefined,
    saturation: raw.saturation as number | undefined,
  };
}

function serializeTurnOnBehavior(behavior: TurnOnBehavior): Record<string, unknown> {
  const result: Record<string, unknown> = { mode: behavior.mode };
  if (behavior.preset !== undefined) result.index = behavior.preset;
  if (behavior.brightness !== undefined) result.brightness = behavior.brightness;
  if (behavior.colorTemp !== undefined) result.color_temp = behavior.colorTemp;
  if (behavior.hue !== undefined) result.hue = behavior.hue;
  if (behavior.saturation !== undefined) result.saturation = behavior.saturation;
  return result;
}

const TPLINK_KELVIN: Record<string, ColorTempRange> = {
  LB130: { min: 2500, max: 9000 },
  LB120: { min: 2700, max: 6500 },
  LB230: { min: 2500, max: 9000 },
  KB130: { min: 2500, max: 9000 },
  KL130: { min: 2500, max: 9000 },
  KL125: { min: 2500, max: 6500 },
  KL135: { min: 2500, max: 9000 },
  "KL120(EU)": { min: 2700, max: 6500 },
  "KL120(US)": { min: 2700, max: 5000 },
  KL430: { min: 2500, max: 9000 },
};

const NON_COLOR_MODE_FLAGS = new Set(["transition_period", "on_off"]);

/**
 * Representation of a TP-Link Smart Bulb (LB*, KL*, KB*).
 *
 * The `Light`/`LightPreset` modules (see `src/iot/modules/`) expose the public
 * `Light`/`LightPreset` interface API; this class exposes the lower-level
 * device-specific plumbing they delegate to.
 */
export class IotBulb extends IotDevice {
  static readonly LIGHT_SERVICE = "smartlife.iot.smartbulb.lightingservice";
  static readonly SET_LIGHT_METHOD = "transition_light_state";

  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.Bulb;
    this.emeterType = "smartlife.iot.common.emeter";
  }

  protected get lightService(): string {
    return IotBulb.LIGHT_SERVICE;
  }

  protected get setLightMethod(): string {
    return IotBulb.SET_LIGHT_METHOD;
  }

  override async initializeModules(): Promise<void> {
    await super.initializeModules();
    this.addModule(
      IotModules.IotSchedule,
      new Schedule(this, "smartlife.iot.common.schedule"),
    );
    this.addModule(IotModules.IotUsage, new Usage(this, "smartlife.iot.common.schedule"));
    this.addModule(
      IotModules.IotAntitheft,
      new Antitheft(this, "smartlife.iot.common.anti_theft"),
    );
    this.addModule(
      CommonModules.Time,
      new Time(this, "smartlife.iot.common.timesetting"),
    );
    this.addModule(CommonModules.Energy, new Emeter(this, this.emeterType));
    this.addModule(IotModules.IotCountdown, new Countdown(this, "countdown"));
    this.addModule(IotModules.IotCloud, new Cloud(this, "smartlife.iot.common.cloud"));
    this.addModule(CommonModules.Light, new Light(this, this.lightService));
    this.addModule(CommonModules.LightPreset, new LightPreset(this, this.lightService));
  }

  get isColor(): boolean {
    return Boolean(this.sysInfo.is_color);
  }

  get isDimmable(): boolean {
    return Boolean(this.sysInfo.is_dimmable);
  }

  get isVariableColorTemp(): boolean {
    return Boolean(this.sysInfo.is_variable_color_temp);
  }

  get validTemperatureRange(): [number, number] {
    if (!this.isVariableColorTemp)
      throw new KasaException("Color temperature not supported");
    const model = this.sysInfo.model as string;
    for (const [pattern, range] of Object.entries(TPLINK_KELVIN)) {
      if (model.startsWith(pattern.replace(/\\/g, ""))) return [range.min, range.max];
    }
    return [2700, 5000];
  }

  get lightState(): Record<string, unknown> {
    const state = this.sysInfo.light_state as Record<string, unknown> | undefined;
    if (state === undefined) {
      throw new KasaException(
        "The device has no light_state or you have not called update()",
      );
    }
    const isOn = state.on_off;
    if (!isOn) {
      return { ...(state.dft_on_state as Record<string, unknown>), on_off: isOn };
    }
    return state;
  }

  get hasEffects(): boolean {
    return "lighting_effect_state" in this.sysInfo;
  }

  async getLightDetails(): Promise<Record<string, number>> {
    return this.queryHelper(this.lightService, "get_light_details") as Promise<
      Record<string, number>
    >;
  }

  async getTurnOnBehavior(): Promise<TurnOnBehaviors> {
    const raw = await this.queryHelper(this.lightService, "get_default_behavior");
    return {
      soft: parseTurnOnBehavior(raw.soft_on as Record<string, unknown>),
      hard: parseTurnOnBehavior(raw.hard_on as Record<string, unknown>),
    };
  }

  async setTurnOnBehavior(behavior: TurnOnBehaviors): Promise<Record<string, unknown>> {
    return this.queryHelper(this.lightService, "set_default_behavior", {
      soft_on: serializeTurnOnBehavior(behavior.soft),
      hard_on: serializeTurnOnBehavior(behavior.hard),
    });
  }

  async getLightState(): Promise<Record<string, unknown>> {
    return this.queryHelper(this.lightService, "get_light_state");
  }

  /** Set the light state. Used by the Light module. */
  async setLightStateRaw(
    state: Record<string, unknown>,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    const merged = { ...state };
    if (options?.transition !== undefined) merged.transition_period = options.transition;

    if ("brightness" in merged)
      this.raiseForInvalidBrightness(merged.brightness as number);

    if (!("on_off" in merged)) merged.on_off = 1;

    if (
      merged.on_off &&
      [...Object.keys(merged)].every((k) => NON_COLOR_MODE_FLAGS.has(k))
    ) {
      merged.ignore_default = 0;
    } else {
      merged.ignore_default = 1;
    }

    return this.queryHelper(this.lightService, this.setLightMethod, merged);
  }

  /** Return the current HSV state of the bulb. Used by the Light module. */
  get hsv(): HSV {
    if (!this.isColor) throw new KasaException("Bulb does not support color.");
    const state = this.lightState;
    return {
      hue: state.hue as number,
      saturation: state.saturation as number,
      value: this.brightness,
    };
  }

  /** Set new HSV. Used by the Light module. */
  async setHsvRaw(
    hue: number,
    saturation: number,
    value?: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    if (!this.isColor) throw new KasaException("Bulb does not support color.");
    if (hue < 0 || hue > 360)
      throw new KasaException(`Invalid hue value: ${hue} (valid range: 0-360)`);
    if (saturation < 0 || saturation > 100) {
      throw new KasaException(
        `Invalid saturation value: ${saturation} (valid range: 0-100%)`,
      );
    }

    const lightState: Record<string, unknown> = { hue, saturation, color_temp: 0 };
    if (value !== undefined) {
      this.raiseForInvalidBrightness(value);
      lightState.brightness = value;
    }
    return this.setLightStateRaw(lightState, options);
  }

  /** Return color temperature of the device in Kelvin. Used by the Light module. */
  get colorTemp(): number {
    if (!this.isVariableColorTemp)
      throw new KasaException("Bulb does not support colortemp.");
    return Number(this.lightState.color_temp);
  }

  /** Set the color temperature of the device in Kelvin. Used by the Light module. */
  async setColorTempRaw(
    temp: number,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>> {
    if (!this.isVariableColorTemp)
      throw new KasaException("Bulb does not support colortemp.");
    const [min, max] = this.validTemperatureRange;
    if (temp < min || temp > max) {
      throw new KasaException(
        `Temperature should be between ${min} and ${max}, was ${temp}`,
      );
    }
    const lightState: Record<string, unknown> = { color_temp: temp };
    if (options?.brightness !== undefined) lightState.brightness = options.brightness;
    return this.setLightStateRaw(lightState, { transition: options?.transition });
  }

  private raiseForInvalidBrightness(value: number): void {
    if (value < 0 || value > 100) {
      throw new KasaException(`Invalid brightness value: ${value} (valid range: 0-100%)`);
    }
  }

  /** Return the current brightness in percentage. Used by the Light module. */
  get brightness(): number {
    if (!this.isDimmable) throw new KasaException("Bulb is not dimmable.");
    const lightEffect = this.modules.get(IotModules.IotLightEffect);
    if (lightEffect && lightEffect.effect !== "Off") {
      return lightEffect.brightness;
    }
    return Number(this.lightState.brightness);
  }

  /** Set the brightness in percentage. Used by the Light module. */
  async setBrightnessRaw(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    if (!this.isDimmable) throw new KasaException("Bulb is not dimmable.");
    this.raiseForInvalidBrightness(brightness);
    return this.setLightStateRaw({ brightness }, options);
  }

  override get isOn(): boolean {
    return Boolean(this.lightState.on_off);
  }

  override async turnOff(options?: { transition?: number }): Promise<
    Record<string, unknown>
  > {
    return this.setLightStateRaw({ on_off: 0 }, options);
  }

  override async turnOn(options?: { transition?: number }): Promise<
    Record<string, unknown>
  > {
    return this.setLightStateRaw({ on_off: 1 }, options);
  }

  override get hasEmeter(): boolean {
    return true;
  }

  override async setAlias(alias: string): Promise<Record<string, unknown>> {
    return this.queryHelper("smartlife.iot.common.system", "set_dev_alias", { alias });
  }

  override get maxDeviceResponseSize(): number {
    return 4096;
  }
}
