import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import type { Module } from "../core/module.ts";

export const LIGHT_EFFECTS_OFF = "Off";
export const LIGHT_EFFECTS_UNNAMED_CUSTOM = "Custom";

/** Interface to represent a light effect module. */
export interface LightEffect {
  /** Return True if the device supports setting custom effects. */
  get hasCustomEffects(): boolean;

  get effect(): string;

  /** Return built-in effects list, e.g. `['Aurora', 'Bubbling Cauldron', ...]`. */
  get effectList(): string[];

  /**
   * Set an effect on the device.
   *
   * If brightness or transition is defined, its value is used instead of the
   * effect-specific default. See {@link effectList} for available effects, or use
   * {@link setCustomEffect} for custom effects.
   */
  setEffect(
    effect: string,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>>;

  /** Set a custom effect on the device. */
  setCustomEffect(effectDict: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Register the standard light-effect feature on a module implementing {@link LightEffect}. */
export function initializeLightEffectFeatures(module: LightEffect & Module): void {
  module.addFeature(
    new Feature(module.device, {
      id: "light_effect",
      name: "Light effect",
      container: module,
      attributeGetter: "effect",
      attributeSetter: "setEffect",
      category: FeatureCategory.Primary,
      type: FeatureType.Choice,
      choicesGetter: "effectList",
    }),
  );
}
