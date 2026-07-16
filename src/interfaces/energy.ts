import type { EmeterStatus } from "../core/emeterstatus.ts";
import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import type { Module } from "../core/module.ts";

/** Features that an {@link Energy} module may support. */
export enum EnergyModuleFeature {
  /** Device reports {@link Energy.voltage} and {@link Energy.current} */
  VOLTAGE_CURRENT = 1 << 0,
  /** Device reports {@link Energy.consumptionTotal} */
  CONSUMPTION_TOTAL = 1 << 1,
  /** Device reports periodic stats via {@link Energy.getDailyStats}/{@link Energy.getMonthlyStats} */
  PERIODIC_STATS = 1 << 2,
}

/** Base interface to represent an Energy module. */
export interface Energy {
  get status(): EmeterStatus;

  /** Get the current power consumption in Watts. */
  get currentConsumption(): number | undefined;

  /** Return today's energy consumption in kWh. */
  get consumptionToday(): number | undefined;

  /** Return this month's energy consumption in kWh. */
  get consumptionThisMonth(): number | undefined;

  /** Return total consumption since last reboot in kWh. */
  get consumptionTotal(): number | undefined;

  /** Return the current in A. */
  get current(): number | undefined;

  /** Get the current voltage in V. */
  get voltage(): number | undefined;

  /** Return real-time statistics. */
  getStatus(): Promise<EmeterStatus>;

  eraseStats(): Promise<Record<string, unknown>>;

  /** Return daily stats for the given year & month as `{ day: energy, ... }`. */
  getDailyStats(options?: { year?: number; month?: number; kwh?: boolean }): Promise<
    Record<string, unknown>
  >;

  /** Return monthly stats for the given year. */
  getMonthlyStats(options?: { year?: number; kwh?: boolean }): Promise<
    Record<string, unknown>
  >;
}

/** Return True if the given supported-features bitmask includes `feature`. */
export function energySupports(
  supportedFeatures: number,
  feature: EnergyModuleFeature,
): boolean {
  return (supportedFeatures & feature) !== 0;
}

/**
 * Register the standard Energy features on a module implementing {@link Energy}.
 *
 * `supportedFeatures` is a bitmask of {@link EnergyModuleFeature}; concrete modules
 * compute this themselves (it varies by device/firmware) and pass it in.
 */
export function initializeEnergyFeatures(
  module: Energy & Module,
  supportedFeatures: number,
): void {
  const device = module.device;
  module.addFeature(
    new Feature(device, {
      name: "Current consumption",
      attributeGetter: "currentConsumption",
      container: module,
      unitGetter: () => "W",
      id: "current_consumption",
      precisionHint: 1,
      category: FeatureCategory.Primary,
      type: FeatureType.Sensor,
    }),
  );
  module.addFeature(
    new Feature(device, {
      name: "Today's consumption",
      attributeGetter: "consumptionToday",
      container: module,
      unitGetter: () => "kWh",
      id: "consumption_today",
      precisionHint: 3,
      category: FeatureCategory.Info,
      type: FeatureType.Sensor,
    }),
  );
  module.addFeature(
    new Feature(device, {
      id: "consumption_this_month",
      name: "This month's consumption",
      attributeGetter: "consumptionThisMonth",
      container: module,
      unitGetter: () => "kWh",
      precisionHint: 3,
      category: FeatureCategory.Info,
      type: FeatureType.Sensor,
    }),
  );
  if (energySupports(supportedFeatures, EnergyModuleFeature.CONSUMPTION_TOTAL)) {
    module.addFeature(
      new Feature(device, {
        name: "Total consumption since reboot",
        attributeGetter: "consumptionTotal",
        container: module,
        unitGetter: () => "kWh",
        id: "consumption_total",
        precisionHint: 3,
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
  }
  if (energySupports(supportedFeatures, EnergyModuleFeature.VOLTAGE_CURRENT)) {
    module.addFeature(
      new Feature(device, {
        name: "Voltage",
        attributeGetter: "voltage",
        container: module,
        unitGetter: () => "V",
        id: "voltage",
        precisionHint: 1,
        category: FeatureCategory.Primary,
        type: FeatureType.Sensor,
      }),
    );
    module.addFeature(
      new Feature(device, {
        name: "Current",
        attributeGetter: "current",
        container: module,
        unitGetter: () => "A",
        id: "current",
        precisionHint: 2,
        category: FeatureCategory.Primary,
        type: FeatureType.Sensor,
      }),
    );
  }
}
