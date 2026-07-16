import type {
  Alarm,
  ChildSetup,
  Energy,
  Fan,
  Led,
  Light,
  LightEffect,
  LightPreset,
  Thermostat,
  Time,
} from "../interfaces/index.ts";
import { type ModuleName, moduleName } from "./modulemapping.ts";

/**
 * Well-known module names, analogous to Python's `Module.*` constants
 * (`kasa/module.py`). Family-specific constants (IOT/SMART/SMARTCAM) are added
 * to this object in their respective phases.
 *
 * These are plain strings at runtime (the generic type parameter is compile-time
 * only) so this file has no runtime dependency on `src/interfaces/*` despite the
 * `import type` above.
 */
export const CommonModules = {
  Alarm: moduleName<Alarm>("Alarm"),
  ChildSetup: moduleName<ChildSetup>("ChildSetup"),
  Energy: moduleName<Energy>("Energy"),
  Fan: moduleName<Fan>("Fan"),
  LightEffect: moduleName<LightEffect>("LightEffect"),
  Led: moduleName<Led>("Led"),
  Light: moduleName<Light>("Light"),
  LightPreset: moduleName<LightPreset>("LightPreset"),
  Thermostat: moduleName<Thermostat>("Thermostat"),
  Time: moduleName<Time>("Time"),
} as const satisfies Record<string, ModuleName<unknown>>;
