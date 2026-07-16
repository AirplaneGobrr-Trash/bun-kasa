import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import type { Module } from "../core/module.ts";

/** Base interface to represent a LED module. */
export interface Led {
  get led(): boolean;
  setLed(enable: boolean): Promise<Record<string, unknown>>;
}

/**
 * Register the standard LED feature on a module implementing {@link Led}.
 *
 * TS classes cannot use Python-style multiple inheritance, so concrete modules that
 * implement `Led` alongside a family base class (`IotModule`/`SmartModule`) should
 * call this from their own `initializeFeatures()` override instead of inheriting it.
 */
export function initializeLedFeatures(module: Led & Module): void {
  module.addFeature(
    new Feature(module.device, {
      container: module,
      name: "LED",
      id: "led",
      icon: "mdi:led",
      attributeGetter: "led",
      attributeSetter: "setLed",
      type: FeatureType.Switch,
      category: FeatureCategory.Config,
    }),
  );
}
