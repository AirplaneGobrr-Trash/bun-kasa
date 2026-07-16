import { CommonModules } from "../../core/modulenames.ts";
import type { LightState } from "../../interfaces/light.ts";
import type { LightPreset as LightPresetInterface } from "../../interfaces/lightpreset.ts";
import { PRESET_NOT_SET } from "../../interfaces/lightpreset.ts";
import { IotModule } from "../iotmodule.ts";
import type { Light } from "./light.ts";

/** Light configuration preset. */
export interface IotLightPreset extends LightState {
  index: number;
  brightness: number;
  custom?: number;
  id?: string;
  mode?: number;
}

function parsePreset(index: number, raw: Record<string, unknown>): IotLightPreset {
  return {
    index,
    brightness: raw.brightness as number,
    hue: raw.hue as number | undefined,
    saturation: raw.saturation as number | undefined,
    colorTemp: raw.color_temp as number | undefined,
    custom: raw.custom as number | undefined,
    id: raw.id as string | undefined,
    mode: raw.mode as number | undefined,
  };
}

/** Class for setting light presets on IOT bulbs. */
export class LightPreset extends IotModule implements LightPresetInterface {
  private presetsByName = new Map<string, IotLightPreset>();
  private presetNames: string[] = [PRESET_NOT_SET];

  override async postUpdateHook(): Promise<void> {
    const raw = this.data.preferred_state as Record<string, unknown>[];
    this.presetsByName = new Map();
    raw.forEach((vals, index) => {
      if ("id" in vals) return; // handled by the LightEffect module
      this.presetsByName.set(`Light preset ${index + 1}`, parsePreset(index, vals));
    });
    this.presetNames = [PRESET_NOT_SET, ...this.presetsByName.keys()];
  }

  get presetList(): string[] {
    return this.presetNames;
  }

  get presetStatesList(): IotLightPreset[] {
    return Array.from(this.presetsByName.values());
  }

  private get lightModule(): Light {
    return this.iotDevice.modules.getRequired(CommonModules.Light) as unknown as Light;
  }

  get preset(): string {
    const light = this.lightModule;
    const isColor = light.hasFeature("hsv");
    const isVariableColorTemp = light.hasFeature("color_temperature");

    const brightness = light.brightness;
    const colorTemp = isVariableColorTemp ? light.colorTemp : undefined;
    const [h, s] = isColor
      ? [light.hsv.hue, light.hsv.saturation]
      : [undefined, undefined];

    for (const [name, preset] of this.presetsByName) {
      if (
        preset.brightness === brightness &&
        (preset.colorTemp === colorTemp || !isVariableColorTemp) &&
        (preset.hue === h || !isColor) &&
        (preset.saturation === s || !isColor)
      ) {
        return name;
      }
    }
    return PRESET_NOT_SET;
  }

  async setPreset(presetName: string): Promise<Record<string, unknown>> {
    const light = this.lightModule;
    let preset: LightState;
    if (presetName === PRESET_NOT_SET) {
      preset = light.hasFeature("hsv")
        ? { hue: 0, saturation: 0, brightness: 100 }
        : { brightness: 100 };
    } else {
      const found = this.presetsByName.get(presetName);
      if (!found)
        throw new Error(`${presetName} is not a valid preset: ${this.presetList}`);
      preset = found;
    }
    return light.setState(preset);
  }

  get hasSavePreset(): boolean {
    return true;
  }

  async savePreset(
    presetName: string,
    presetState: LightState,
  ): Promise<Record<string, unknown>> {
    if (this.presetsByName.size === 0)
      throw new Error("Device does not supported saving presets");
    if (!this.presetsByName.has(presetName)) {
      throw new Error(`${presetName} is not a valid preset: ${this.presetList}`);
    }
    const index = Array.from(this.presetsByName.keys()).indexOf(presetName);
    const state: Record<string, unknown> = { index };
    if (presetState.brightness !== undefined) state.brightness = presetState.brightness;
    if (presetState.hue !== undefined) state.hue = presetState.hue;
    if (presetState.saturation !== undefined) state.saturation = presetState.saturation;
    if (presetState.colorTemp !== undefined) state.color_temp = presetState.colorTemp;
    return this.call("set_preferred_state", state);
  }

  override query(): Record<string, unknown> {
    return {};
  }
}
