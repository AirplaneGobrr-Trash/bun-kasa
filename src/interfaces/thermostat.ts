/** Thermostat state. */
export enum ThermostatState {
  Heating = "heating",
  Calibrating = "progress_calibration",
  Idle = "idle",
  Hold = "hold_on",
  Off = "off",
  Shutdown = "shutdown",
  Unknown = "unknown",
}

export type TemperatureUnit = "celsius" | "fahrenheit";

/** Base interface for TP-Link thermostats. */
export interface Thermostat {
  get state(): boolean;
  setState(enabled: boolean): Promise<Record<string, unknown>>;

  get mode(): ThermostatState;

  get targetTemperature(): number;
  setTargetTemperature(target: number): Promise<Record<string, unknown>>;

  /** Return current temperature. */
  get temperature(): number;

  get temperatureUnit(): TemperatureUnit;
  setTemperatureUnit(unit: TemperatureUnit): Promise<Record<string, unknown>>;
}
