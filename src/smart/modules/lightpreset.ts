import { CommonModules } from "../../core/modulenames.ts";
import type { LightState } from "../../interfaces/light.ts";
import type { LightPreset as LightPresetInterface } from "../../interfaces/lightpreset.ts";
import { PRESET_NOT_SET } from "../../interfaces/lightpreset.ts";
import { SmartModule } from "../smartmodule.ts";
import type { Light } from "./light.ts";

const SYS_INFO_STATE_KEY = "preset_state";

/** Implementation of SMART light presets. */
export class LightPreset extends SmartModule implements LightPresetInterface {
  static override readonly requiredComponent = "preset";
  static override readonly queryGetterName = "get_preset_rules";
  override minimumUpdateIntervalSecs = 60;

  private stateInSysinfo = false;
  private brightnessOnly = false;
  private presetsByName = new Map<string, LightState>();
  private presetNames: string[] = [PRESET_NOT_SET];

  private ensureInit(): void {
    // Lazily read from sysInfo since the device isn't guaranteed to be updated yet
    // at construction time (mirrors the Python `__init__` check).
    this.stateInSysinfo = SYS_INFO_STATE_KEY in this.smartDevice.sysInfo;
  }

  override async postUpdateHook(): Promise<void> {
    this.ensureInit();
    let index = 0;
    this.presetsByName = new Map();

    const stateKey = this.stateInSysinfo ? SYS_INFO_STATE_KEY : "states";
    const presetStates = this.data[stateKey] as Record<string, unknown>[] | undefined;
    if (presetStates) {
      for (const presetState of presetStates) {
        if (!("brightness" in presetState)) continue;
        const colorTemp = presetState.color_temp as number | undefined;
        const hue = presetState.hue as number | undefined;
        const saturation = presetState.saturation as number | undefined;
        this.presetsByName.set(`Light preset ${index + 1}`, {
          brightness: presetState.brightness as number,
          colorTemp,
          hue,
          saturation,
        });
        if (colorTemp === undefined && hue === undefined && saturation === undefined) {
          this.brightnessOnly = true;
        }
        index += 1;
      }
    } else if (this.data.brightness) {
      this.brightnessOnly = true;
      for (const presetBrightness of this.data.brightness as number[]) {
        this.presetsByName.set(`Brightness preset ${index + 1}`, {
          brightness: presetBrightness,
        });
        index += 1;
      }
    }

    this.presetNames = [PRESET_NOT_SET, ...this.presetsByName.keys()];
  }

  get presetList(): string[] {
    return this.presetNames;
  }

  get presetStatesList(): LightState[] {
    return [...this.presetsByName.values()];
  }

  get preset(): string {
    const light = this.smartDevice.modules.getRequired(
      CommonModules.Light,
    ) as unknown as Light;
    const brightness = light.brightness;
    const colorTemp = light.hasFeature("color_temperature") ? light.colorTemp : undefined;
    const hasColor = light.hasFeature("hsv");
    const [h, s] = hasColor
      ? [light.hsv.hue, light.hsv.saturation]
      : [undefined, undefined];

    for (const [name, preset] of this.presetsByName) {
      if (
        preset.brightness === brightness &&
        (preset.colorTemp === colorTemp || !light.hasFeature("color_temperature")) &&
        preset.hue === h &&
        preset.saturation === s
      ) {
        return name;
      }
    }
    return PRESET_NOT_SET;
  }

  async setPreset(presetName: string): Promise<Record<string, unknown>> {
    const light = this.smartDevice.modules.getRequired(
      CommonModules.Light,
    ) as unknown as Light;
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

  async savePreset(
    presetName: string,
    presetState: LightState,
  ): Promise<Record<string, unknown>> {
    try {
      if (!this.presetsByName.has(presetName)) {
        throw new Error(`${presetName} is not a valid preset: ${this.presetList}`);
      }
      const index = [...this.presetsByName.keys()].indexOf(presetName);
      if (this.brightnessOnly) {
        const brightList = [...this.presetsByName.values()].map((s) => s.brightness);
        brightList[index] = presetState.brightness as number;
        return await this.call("set_preset_rules", { brightness: brightList });
      }
      const newInfo: Record<string, unknown> = {};
      if (presetState.brightness !== undefined)
        newInfo.brightness = presetState.brightness;
      if (presetState.hue !== undefined) newInfo.hue = presetState.hue;
      if (presetState.saturation !== undefined)
        newInfo.saturation = presetState.saturation;
      if (presetState.colorTemp !== undefined) newInfo.color_temp = presetState.colorTemp;
      return await this.call("edit_preset_rules", { index, state: newInfo });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get hasSavePreset(): boolean {
    return true;
  }

  override query(): Record<string, unknown> {
    this.ensureInit();
    if (this.stateInSysinfo) return {};
    if (this.supportedVersion < 3) return { [this.queryGetterName]: null };
    return { [this.queryGetterName]: { start_index: 0 } };
  }

  override async checkSupported(): Promise<boolean> {
    return "brightness" in this.smartDevice.sysInfo;
  }
}
