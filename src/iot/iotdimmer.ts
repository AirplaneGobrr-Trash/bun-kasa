import { DeviceType } from "../core/device_type.ts";
import { KasaException } from "../core/exceptions.ts";
import { CommonModules } from "../core/modulenames.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import { IotPlug } from "./iotplug.ts";
import { IotModules } from "./modulenames.ts";
import { AmbientLight, Dimmer, Light, Motion } from "./modules/index.ts";

/** Button action to perform. */
export enum ButtonAction {
  NoAction = "none",
  Instant = "instant_on_off",
  Gentle = "gentle_on_off",
  Preset = "customize_preset",
}

/** Which button action to configure. */
export enum ActionType {
  DoubleClick = "double_click_action",
  LongPress = "long_press_action",
}

/** Fade on/off setting. */
export enum FadeType {
  FadeOn = "fade_on",
  FadeOff = "fade_off",
}

const DIMMER_SERVICE = "smartlife.iot.dimmer";

/**
 * Representation of a TP-Link Smart Dimmer (HS220 and similar).
 *
 * Dimmers work similarly to plugs, but also support adjusting brightness. This
 * extends {@link IotPlug}.
 */
export class IotDimmer extends IotPlug {
  static readonly DIMMER_SERVICE = DIMMER_SERVICE;

  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.Dimmer;
  }

  override async initializeModules(): Promise<void> {
    await super.initializeModules();
    this.addModule(IotModules.IotMotion, new Motion(this, "smartlife.iot.PIR"));
    this.addModule(
      IotModules.IotAmbientLight,
      new AmbientLight(this, "smartlife.iot.LAS"),
    );
    this.addModule(IotModules.IotDimmer, new Dimmer(this, "smartlife.iot.dimmer"));
    this.addModule(CommonModules.Light, new Light(this, "light"));
  }

  /** Return current brightness on dimmers (0-100). Used by the Light module. */
  get brightness(): number {
    if (!this.isDimmable) throw new KasaException("Device is not dimmable.");
    return Number(this.sysInfo.brightness);
  }

  /** Set the new dimmer brightness level in percentage. Used by the Light module. */
  async setBrightnessRaw(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    if (!this.isDimmable) throw new KasaException("Device is not dimmable.");
    if (brightness < 0 || brightness > 100) {
      throw new KasaException(
        `Invalid brightness value: ${brightness} (valid range: 0-100%)`,
      );
    }
    // Dimmers do not support a brightness of 0, but bulbs do. Coerce to maintain a
    // consistent interface between dimmers and bulbs.
    const coerced = brightness === 0 ? 1 : brightness;
    if (options?.transition !== undefined) {
      return this.setDimmerTransition(coerced, options.transition);
    }
    return this.queryHelper(DIMMER_SERVICE, "set_brightness", { brightness: coerced });
  }

  override async turnOff(options?: { transition?: number }): Promise<
    Record<string, unknown>
  > {
    if (options?.transition !== undefined) {
      return this.setDimmerTransition(0, options.transition);
    }
    return super.turnOff();
  }

  override async turnOn(options?: { transition?: number }): Promise<
    Record<string, unknown>
  > {
    if (options?.transition !== undefined) {
      return this.setDimmerTransition(this.brightness, options.transition);
    }
    return super.turnOn();
  }

  /** Turn the dimmer on to `brightness` percentage over `transitionMs` milliseconds. */
  async setDimmerTransition(
    brightness: number,
    transitionMs: number,
  ): Promise<Record<string, unknown>> {
    if (brightness < 0 || brightness > 100) {
      throw new KasaException(
        `Invalid brightness value: ${brightness} (valid range: 0-100%)`,
      );
    }
    const duration = transitionMs === 0 ? 1 : transitionMs;
    if (duration <= 0)
      throw new KasaException(`Transition value ${duration} is not valid.`);
    return this.queryHelper(DIMMER_SERVICE, "set_dimmer_transition", {
      brightness,
      duration,
    });
  }

  async getBehaviors(): Promise<Record<string, unknown>> {
    return this.queryHelper(DIMMER_SERVICE, "get_default_behavior", {});
  }

  async setButtonAction(
    actionType: ActionType,
    action: ButtonAction,
    index?: number,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { mode: action };
    if (index !== undefined) payload.index = index;
    return this.queryHelper(DIMMER_SERVICE, `set_${actionType}`, payload);
  }

  async setFadeTime(
    fadeType: FadeType,
    timeMs: number,
  ): Promise<Record<string, unknown>> {
    return this.queryHelper(DIMMER_SERVICE, `set_${fadeType}_time`, { fadeTime: timeMs });
  }

  get isDimmable(): boolean {
    return "brightness" in this.sysInfo;
  }

  get isVariableColorTemp(): boolean {
    return false;
  }

  get isColor(): boolean {
    return false;
  }
}
