import type { LightEffect as LightEffectInterface } from "../../interfaces/lighteffect.ts";
import {
  LIGHT_EFFECTS_OFF,
  initializeLightEffectFeatures,
} from "../../interfaces/lighteffect.ts";
import { EFFECT_MAPPING_V1, EFFECT_NAMES_V1 } from "../effects.ts";
import { IotModule } from "../iotmodule.ts";

/** Implementation of dynamic light effects for IOT light strips. */
export class LightEffect extends IotModule implements LightEffectInterface {
  override initializeFeatures(): void {
    initializeLightEffectFeatures(this);
  }

  get effect(): string {
    const eff = this.data.lighting_effect_state as { name: string; enable: number };
    if (eff.enable) return eff.name || "Custom";
    return LIGHT_EFFECTS_OFF;
  }

  get brightness(): number {
    return (this.data.lighting_effect_state as { brightness: number }).brightness;
  }

  get effectList(): string[] {
    return [LIGHT_EFFECTS_OFF, ...EFFECT_NAMES_V1];
  }

  async setEffect(
    effect: string,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>> {
    if (effect === LIGHT_EFFECTS_OFF) {
      const current = EFFECT_MAPPING_V1[this.effect] ?? EFFECT_MAPPING_V1.Aurora;
      const effectDict = { ...current, enable: 0 };
      return this.setCustomEffect(effectDict);
    }
    const preset = EFFECT_MAPPING_V1[effect];
    if (!preset) {
      throw new Error(`The effect ${effect} is not a built in effect.`);
    }
    const effectDict: Record<string, unknown> = { ...preset };
    if (options?.brightness !== undefined) effectDict.brightness = options.brightness;
    if (options?.transition !== undefined) effectDict.transition = options.transition;
    return this.setCustomEffect(effectDict);
  }

  async setCustomEffect(
    effectDict: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.call("set_lighting_effect", effectDict);
  }

  get hasCustomEffects(): boolean {
    return true;
  }

  override query(): Record<string, unknown> {
    return {};
  }
}
