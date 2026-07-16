import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { ThermostatState } from "../../interfaces/thermostat.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the temperature-control module. */
export class TemperatureControl extends SmartModule {
  static override readonly requiredComponent = "temp_control";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "target_temperature",
        name: "Target temperature",
        container: this,
        attributeGetter: "targetTemperature",
        attributeSetter: "setTargetTemperature",
        rangeGetter: "allowedTemperatureRange",
        icon: "mdi:thermometer",
        type: FeatureType.Number,
        category: FeatureCategory.Primary,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "temperature_offset",
        name: "Temperature offset",
        container: this,
        attributeGetter: "temperatureOffset",
        attributeSetter: "setTemperatureOffset",
        rangeGetter: () => [-10, 10],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "state",
        name: "State",
        container: this,
        attributeGetter: "state",
        attributeSetter: "setState",
        category: FeatureCategory.Primary,
        type: FeatureType.Switch,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "thermostat_mode",
        name: "Thermostat mode",
        container: this,
        attributeGetter: "mode",
        category: FeatureCategory.Primary,
        type: FeatureType.Sensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get state(): boolean {
    return this.smartDevice.sysInfo.frost_protection_on === false;
  }

  async setState(enabled: boolean): Promise<Record<string, unknown>> {
    return this.call("set_device_info", { frost_protection_on: !enabled });
  }

  get mode(): ThermostatState {
    if (this.smartDevice.sysInfo.frost_protection_on) return ThermostatState.Off;

    const states = this.states;
    states.delete("low_battery");

    if (states.size === 0) return ThermostatState.Idle;

    for (const state of Object.values(ThermostatState)) {
      if (states.has(state)) return state;
    }
    return ThermostatState.Unknown;
  }

  get allowedTemperatureRange(): [number, number] {
    return [this.minimumTargetTemperature, this.maximumTargetTemperature];
  }

  get minimumTargetTemperature(): number {
    return this.smartDevice.sysInfo.min_control_temp as number;
  }

  get maximumTargetTemperature(): number {
    return this.smartDevice.sysInfo.max_control_temp as number;
  }

  get targetTemperature(): number {
    return this.smartDevice.sysInfo.target_temp as number;
  }

  get states(): Set<string> {
    return new Set(this.smartDevice.sysInfo.trv_states as string[]);
  }

  async setTargetTemperature(target: number): Promise<Record<string, unknown>> {
    if (
      target < this.minimumTargetTemperature ||
      target > this.maximumTargetTemperature
    ) {
      throw new RangeError(
        `Invalid target temperature ${target}, must be in range [${this.minimumTargetTemperature},${this.maximumTargetTemperature}]`,
      );
    }
    const payload: Record<string, unknown> = { target_temp: target };
    if ("frost_protection_on" in this.smartDevice.sysInfo)
      payload.frost_protection_on = false;
    return this.call("set_device_info", payload);
  }

  get temperatureOffset(): number {
    return this.smartDevice.sysInfo.temp_offset as number;
  }

  async setTemperatureOffset(offset: number): Promise<Record<string, unknown>> {
    if (offset < -10 || offset > 10)
      throw new RangeError("Temperature offset must be [-10, 10]");
    return this.call("set_device_info", { temp_offset: offset });
  }
}
