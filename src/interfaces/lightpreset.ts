import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import type { Module } from "../core/module.ts";
import type { LightState } from "./light.ts";

export const PRESET_NOT_SET = "Not set";

/** Base interface for light preset modules. */
export interface LightPreset {
  /** Return list of preset names, e.g. `['Off', 'Preset 1', 'Preset 2', ...]`. */
  get presetList(): string[];

  /** Return list of preset light states. */
  get presetStatesList(): LightState[];

  get preset(): string;

  /** Set a light preset for the device. */
  setPreset(presetName: string): Promise<Record<string, unknown>>;

  /** Update the preset with `presetName` with the new `presetInfo`. */
  savePreset(
    presetName: string,
    presetInfo: LightState,
  ): Promise<Record<string, unknown>>;

  /** Return True if the device supports updating presets. */
  get hasSavePreset(): boolean;
}

/** Register the standard light-preset feature on a module implementing {@link LightPreset}. */
export function initializeLightPresetFeatures(module: LightPreset & Module): void {
  module.addFeature(
    new Feature(module.device, {
      id: "light_preset",
      name: "Light preset",
      container: module,
      attributeGetter: "preset",
      attributeSetter: "setPreset",
      category: FeatureCategory.Config,
      type: FeatureType.Choice,
      choicesGetter: "presetList",
    }),
  );
}
