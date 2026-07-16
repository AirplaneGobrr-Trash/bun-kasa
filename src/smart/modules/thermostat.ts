import type { Feature } from "../../core/feature.ts";
import type { TemperatureUnit } from "../../interfaces/thermostat.ts";
import type {
  Thermostat as ThermostatInterface,
  ThermostatState,
} from "../../interfaces/thermostat.ts";
import { SmartModules } from "../modulenames.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of a Thermostat, delegating to TemperatureControl/TemperatureSensor. */
export class Thermostat extends SmartModule implements ThermostatInterface {
  override get allFeatures(): ReadonlyMap<string, Feature> {
    const ret = new Map<string, Feature>();
    const tempControl = this.smartDevice.modules.get(SmartModules.TemperatureControl);
    const tempSensor = this.smartDevice.modules.get(SmartModules.TemperatureSensor);
    for (const feature of tempControl?.allFeatures.values() ?? [])
      ret.set(feature.id, feature);
    for (const feature of tempSensor?.allFeatures.values() ?? [])
      ret.set(feature.id, feature);
    return ret;
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get state(): boolean {
    return this.smartDevice.modules.getRequired(SmartModules.TemperatureControl).state;
  }

  async setState(enabled: boolean): Promise<Record<string, unknown>> {
    return this.smartDevice.modules
      .getRequired(SmartModules.TemperatureControl)
      .setState(enabled);
  }

  get mode(): ThermostatState {
    return this.smartDevice.modules.getRequired(SmartModules.TemperatureControl).mode;
  }

  get targetTemperature(): number {
    return this.smartDevice.modules.getRequired(SmartModules.TemperatureControl)
      .targetTemperature;
  }

  async setTargetTemperature(target: number): Promise<Record<string, unknown>> {
    return this.smartDevice.modules
      .getRequired(SmartModules.TemperatureControl)
      .setTargetTemperature(target);
  }

  get temperature(): number {
    return this.smartDevice.modules.getRequired(SmartModules.TemperatureSensor)
      .temperature;
  }

  get temperatureUnit(): TemperatureUnit {
    return this.smartDevice.modules.getRequired(SmartModules.TemperatureSensor)
      .temperatureUnit;
  }

  async setTemperatureUnit(unit: TemperatureUnit): Promise<Record<string, unknown>> {
    return this.smartDevice.modules
      .getRequired(SmartModules.TemperatureSensor)
      .setTemperatureUnit(unit);
  }
}
