import type { LightEffect } from "../interfaces/lighteffect.ts";

export * from "./effects_data.ts";

/**
 * Interface for SMART light effects, extending {@link LightEffect} with brightness
 * controls.
 */
export interface SmartLightEffect extends LightEffect {
  setBrightness(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;
  get brightness(): number;
  get isActive(): boolean;
}
