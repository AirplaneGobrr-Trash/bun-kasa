import {
  LIGHT_EFFECTS_OFF,
  LIGHT_EFFECTS_UNNAMED_CUSTOM,
} from "../../interfaces/lighteffect.ts";
import type { SmartLightEffect } from "../effects.ts";
import { EFFECT_MAPPING, EFFECT_NAMES } from "../effects.ts";
import { SmartModules } from "../modulenames.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of dynamic light effects for SMART light strips. */
export class LightStripEffect extends SmartModule implements SmartLightEffect {
  static override readonly requiredComponent = "light_strip_lighting_effect";

  private readonly effectListValue = [LIGHT_EFFECTS_OFF, ...EFFECT_NAMES];

  /**
   * Registered as "LightEffect": this module implements the same common interface as
   * the bulb light-effect module, and a device only ever supports one or the other.
   */
  override get name(): string {
    return "LightEffect";
  }

  get effect(): string {
    const eff = this.data.lighting_effect as {
      name: string;
      enable: number;
      custom?: number;
    };
    const name = eff.name;
    if (eff.enable && this.effectListValue.includes(name)) return name;
    if (eff.enable && eff.custom) return name || LIGHT_EFFECTS_UNNAMED_CUSTOM;
    return LIGHT_EFFECTS_OFF;
  }

  get isActive(): boolean {
    const eff = this.data.lighting_effect as { name: string; enable: number };
    return Boolean(eff.enable) && this.effectListValue.includes(eff.name);
  }

  get brightness(): number {
    return (this.data.lighting_effect as { brightness: number }).brightness;
  }

  async setBrightness(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    void options;
    if (brightness <= 0) return this.setEffect(LIGHT_EFFECTS_OFF);
    return this.setCustomEffect({ brightness, bAdjusted: true });
  }

  get effectList(): string[] {
    return this.effectListValue;
  }

  async setEffect(
    effect: string,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>> {
    try {
      const brightnessModule = this.smartDevice.modules.getRequired(
        SmartModules.Brightness,
      );
      if (effect === LIGHT_EFFECTS_OFF) {
        const current = EFFECT_MAPPING[this.effect] ?? EFFECT_MAPPING.Aurora;
        const effectDict = { ...current, enable: 0 };
        return await this.setCustomEffect(effectDict);
      }
      const preset = EFFECT_MAPPING[effect];
      if (!preset) throw new Error(`The effect ${effect} is not a built in effect.`);
      const effectDict: Record<string, unknown> = { ...preset };

      if (options?.brightness !== undefined) {
        effectDict.brightness = options.brightness;
      } else if (brightnessModule.brightness) {
        effectDict.brightness = brightnessModule.brightness;
      }
      if (options?.transition !== undefined) effectDict.transition = options.transition;

      return await this.setCustomEffect(effectDict);
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  async setCustomEffect(
    effectDict: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.call("set_lighting_effect", effectDict);
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get hasCustomEffects(): boolean {
    return true;
  }

  override query(): Record<string, unknown> {
    return {};
  }
}
