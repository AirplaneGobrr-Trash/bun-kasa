import { type ModuleName, moduleName } from "../core/modulemapping.ts";
import type { SmartLightEffect } from "./effects.ts";
import type { AutoOff } from "./modules/autooff.ts";
import type { BatterySensor } from "./modules/batterysensor.ts";
import type { Brightness } from "./modules/brightness.ts";
import type { ChildDevice } from "./modules/childdevice.ts";
import type { ChildLock } from "./modules/childlock.ts";
import type { ChildProtection } from "./modules/childprotection.ts";
import type { Clean } from "./modules/clean.ts";
import type { CleanRecords } from "./modules/cleanrecords.ts";
import type { Cloud } from "./modules/cloud.ts";
import type { Color } from "./modules/color.ts";
import type { ColorTemperature } from "./modules/colortemperature.ts";
import type { Consumables } from "./modules/consumables.ts";
import type { ContactSensor } from "./modules/contactsensor.ts";
import type { DeviceModule } from "./modules/devicemodule.ts";
import type { Dustbin } from "./modules/dustbin.ts";
import type { Firmware } from "./modules/firmware.ts";
import type { FrostProtection } from "./modules/frostprotection.ts";
import type { HomeKit } from "./modules/homekit.ts";
import type { HumiditySensor } from "./modules/humiditysensor.ts";
import type { LightTransition } from "./modules/lighttransition.ts";
import type { Matter } from "./modules/matter.ts";
import type { Mop } from "./modules/mop.ts";
import type { MotionSensor } from "./modules/motionsensor.ts";
import type { PowerProtection } from "./modules/powerprotection.ts";
import type { ReportMode } from "./modules/reportmode.ts";
import type { Speaker } from "./modules/speaker.ts";
import type { TemperatureControl } from "./modules/temperaturecontrol.ts";
import type { TemperatureSensor } from "./modules/temperaturesensor.ts";
import type { TriggerLogs } from "./modules/triggerlogs.ts";
import type { WaterleakSensor } from "./modules/waterleaksensor.ts";

/** SMART-family-specific module names, mirroring the "SMART only Modules" section of `Module` in kasa/module.py. */
export const SmartModules = {
  AutoOff: moduleName<AutoOff>("AutoOff"),
  BatterySensor: moduleName<BatterySensor>("BatterySensor"),
  Brightness: moduleName<Brightness>("Brightness"),
  ChildDevice: moduleName<ChildDevice>("ChildDevice"),
  Cloud: moduleName<Cloud>("Cloud"),
  Color: moduleName<Color>("Color"),
  ColorTemperature: moduleName<ColorTemperature>("ColorTemperature"),
  ContactSensor: moduleName<ContactSensor>("ContactSensor"),
  DeviceModule: moduleName<DeviceModule>("DeviceModule"),
  Firmware: moduleName<Firmware>("Firmware"),
  FrostProtection: moduleName<FrostProtection>("FrostProtection"),
  HumiditySensor: moduleName<HumiditySensor>("HumiditySensor"),
  LightTransition: moduleName<LightTransition>("LightTransition"),
  MotionSensor: moduleName<MotionSensor>("MotionSensor"),
  ReportMode: moduleName<ReportMode>("ReportMode"),
  SmartLightEffect: moduleName<SmartLightEffect>("LightEffect"),
  TemperatureSensor: moduleName<TemperatureSensor>("TemperatureSensor"),
  TemperatureControl: moduleName<TemperatureControl>("TemperatureControl"),
  WaterleakSensor: moduleName<WaterleakSensor>("WaterleakSensor"),
  ChildProtection: moduleName<ChildProtection>("ChildProtection"),
  ChildLock: moduleName<ChildLock>("ChildLock"),
  TriggerLogs: moduleName<TriggerLogs>("TriggerLogs"),
  PowerProtection: moduleName<PowerProtection>("PowerProtection"),
  HomeKit: moduleName<HomeKit>("HomeKit"),
  Matter: moduleName<Matter>("Matter"),
  Clean: moduleName<Clean>("Clean"),
  Consumables: moduleName<Consumables>("Consumables"),
  Dustbin: moduleName<Dustbin>("Dustbin"),
  Speaker: moduleName<Speaker>("Speaker"),
  Mop: moduleName<Mop>("Mop"),
  CleanRecords: moduleName<CleanRecords>("CleanRecords"),
} as const satisfies Record<string, ModuleName<unknown>>;
