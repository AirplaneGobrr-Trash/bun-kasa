import { LIGHT_EFFECTS_OFF } from "../../interfaces/lighteffect.ts";
import type { SmartLightEffect } from "../effects.ts";
import { SmartModules } from "../modulenames.ts";
import { SmartModule } from "../smartmodule.ts";

const AVAILABLE_BULB_EFFECTS: Record<string, string> = { L1: "Party", L2: "Relax" };

/** Implementation of dynamic light effects for SMART bulbs. */
export class LightEffect extends SmartModule implements SmartLightEffect {
  static override readonly requiredComponent = "light_effect";
  static override readonly queryGetterName = "get_dynamic_light_effect_rules";
  override minimumUpdateIntervalSecs = 60 * 60 * 24;

  private effectValue = LIGHT_EFFECTS_OFF;
  private effectStateList = new Map<string, Record<string, unknown>>();
  private effectListValue: string[] = [];
  private scenesNamesToId = new Map<string, string>();

  override async postUpdateHook(): Promise<void> {
    const rules = this.data.rule_list as Record<string, unknown>[];
    this.effectStateList = new Map();
    for (const effect of rules) {
      const id = effect.id as string;
      const copy = { ...effect };
      if (!copy.scene_name) {
        copy.scene_name = AVAILABLE_BULB_EFFECTS[id] ?? "";
      } else {
        try {
          copy.scene_name = Buffer.from(copy.scene_name as string, "base64").toString(
            "utf-8",
          );
        } catch {
          // leave as-is
        }
      }
      this.effectStateList.set(id, copy);
    }

    this.effectListValue = [LIGHT_EFFECTS_OFF];
    this.scenesNamesToId = new Map();
    for (const effect of this.effectStateList.values()) {
      const sceneName = effect.scene_name as string;
      this.effectListValue.push(sceneName);
      this.scenesNamesToId.set(sceneName, effect.id as string);
    }

    const info = this.smartDevice.info;
    if (info.dynamic_light_effect_enable) {
      const activeId = info.dynamic_light_effect_id as string;
      this.effectValue =
        (this.effectStateList.get(activeId)?.scene_name as string) ?? LIGHT_EFFECTS_OFF;
    } else {
      this.effectValue = LIGHT_EFFECTS_OFF;
    }
  }

  get effectList(): string[] {
    return this.effectListValue;
  }

  get effect(): string {
    return this.effectValue;
  }

  async setEffect(
    effect: string,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>> {
    void options?.transition;
    try {
      if (effect !== LIGHT_EFFECTS_OFF && !this.scenesNamesToId.has(effect)) {
        throw new Error(
          `The effect ${effect} is not a built in effect. Possible values are: ${LIGHT_EFFECTS_OFF} ${[...this.scenesNamesToId.keys()].join(" ")}`,
        );
      }
      const enable = effect !== LIGHT_EFFECTS_OFF;
      const params: Record<string, unknown> = { enable };
      if (enable) {
        const effectId = this.scenesNamesToId.get(effect) as string;
        params.id = effectId;

        const brightnessModule = this.smartDevice.modules.getRequired(
          SmartModules.Brightness,
        );
        const brightness = options?.brightness ?? brightnessModule.brightness;
        await this.setBrightness(brightness, { effectId });
      }
      return await this.call("set_dynamic_light_effect_rule_enable", params);
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get isActive(): boolean {
    return Boolean(this.smartDevice.info.dynamic_light_effect_enable);
  }

  private getEffectData(effectId?: string): Record<string, unknown> {
    const id = effectId ?? (this.data.current_rule_id as string);
    const effect = this.effectStateList.get(id);
    if (!effect) throw new Error(`Unknown effect id ${id}`);
    return effect;
  }

  get brightness(): number {
    const colorStatusList = this.getEffectData().color_status_list as number[][];
    return (colorStatusList[0] as number[])[0] as number;
  }

  async setBrightness(
    brightness: number,
    options?: { transition?: number; effectId?: string },
  ): Promise<Record<string, unknown>> {
    void options?.transition;
    try {
      const newEffect = { ...this.getEffectData(options?.effectId) };
      const colorStatusList = newEffect.color_status_list as number[][];
      newEffect.color_status_list = colorStatusList.map((state) => [
        brightness,
        state[1],
        state[2],
        state[3],
      ]);
      return await this.call("edit_dynamic_light_effect_rule", newEffect);
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  async setCustomEffect(
    _effectDict: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    throw new Error(
      "Device does not support setting custom effects. Use hasCustomEffects to check for support.",
    );
  }

  get hasCustomEffects(): boolean {
    return false;
  }

  override query(): Record<string, unknown> {
    return { [this.queryGetterName]: { start_index: 0 } };
  }
}
