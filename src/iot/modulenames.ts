import { type ModuleName, moduleName } from "../core/modulemapping.ts";
import type { AmbientLight } from "./modules/ambientlight.ts";
import type { Antitheft } from "./modules/antitheft.ts";
import type { Cloud } from "./modules/cloud.ts";
import type { Countdown } from "./modules/countdown.ts";
import type { Dimmer } from "./modules/dimmer.ts";
import type { HomeKit } from "./modules/homekit.ts";
import type { LightEffect } from "./modules/lighteffect.ts";
import type { Motion } from "./modules/motion.ts";
import type { Schedule } from "./modules/schedule.ts";
import type { Usage } from "./modules/usage.ts";

/** IOT-family-specific module names, mirroring the "IOT only Modules" section of `Module` in kasa/module.py. */
export const IotModules = {
  IotAmbientLight: moduleName<AmbientLight>("ambient"),
  IotAntitheft: moduleName<Antitheft>("anti_theft"),
  IotCountdown: moduleName<Countdown>("countdown"),
  IotDimmer: moduleName<Dimmer>("dimmer"),
  IotMotion: moduleName<Motion>("motion"),
  IotSchedule: moduleName<Schedule>("schedule"),
  IotUsage: moduleName<Usage>("usage"),
  IotCloud: moduleName<Cloud>("cloud"),
  IotHomeKit: moduleName<HomeKit>("homekit"),
  IotLightEffect: moduleName<LightEffect>("LightEffect"),
} as const satisfies Record<string, ModuleName<unknown>>;
