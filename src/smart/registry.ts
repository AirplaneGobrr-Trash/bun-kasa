import {
  Alarm,
  AutoOff,
  BatterySensor,
  Brightness,
  ChildDevice,
  ChildLock,
  ChildProtection,
  ChildSetup,
  Clean,
  CleanRecords,
  Cloud,
  Color,
  ColorTemperature,
  Consumables,
  ContactSensor,
  DeviceModule,
  Dustbin,
  Energy,
  Fan,
  Firmware,
  FrostProtection,
  HomeKit,
  HumiditySensor,
  Led,
  Light,
  LightEffect,
  LightPreset,
  LightStripEffect,
  LightTransition,
  Matter,
  Mop,
  MotionSensor,
  OverheatProtection,
  PowerProtection,
  ReportMode,
  Speaker,
  TemperatureControl,
  TemperatureSensor,
  Thermostat,
  Time,
  TriggerLogs,
  WaterleakSensor,
} from "./modules/index.ts";
import type { SmartModule } from "./smartmodule.ts";

/**
 * Explicit registry of every SMART module class.
 *
 * This is the TS analog of Python's `SmartModule.__init_subclass__`-based
 * auto-registration (which relies on subclass hooks TS doesn't have): adding a new
 * module means adding one file plus one entry here. `SmartDevice._initializeModules`
 * (see `smartdevice.ts`) iterates this array, checking each class's static
 * `requiredComponent`/`sysinfoLookupKeys` against the device's negotiated
 * capabilities. A future public plugin API can push additional classes into the same
 * array without other changes.
 */
export const REGISTERED_SMART_MODULES: (typeof SmartModule)[] = [
  Alarm,
  AutoOff,
  BatterySensor,
  Brightness,
  ChildDevice,
  ChildLock,
  ChildProtection,
  ChildSetup,
  Clean,
  CleanRecords,
  Cloud,
  Color,
  ColorTemperature,
  Consumables,
  ContactSensor,
  DeviceModule,
  Dustbin,
  Energy,
  Fan,
  Firmware,
  FrostProtection,
  HomeKit,
  HumiditySensor,
  Led,
  LightEffect,
  LightPreset,
  LightStripEffect,
  LightTransition,
  Matter,
  Mop,
  MotionSensor,
  OverheatProtection,
  PowerProtection,
  ReportMode,
  Speaker,
  TemperatureControl,
  TemperatureSensor,
  TriggerLogs,
  WaterleakSensor,
];

/**
 * Modules derived from combinations of other modules (not driven directly by
 * component negotiation): added after the main registry scan.
 */
export { Light, Thermostat };
