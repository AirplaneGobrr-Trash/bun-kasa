import { EmeterStatus } from "../../core/emeterstatus.ts";
import { DeviceError, KasaException, SmartErrorCode } from "../../core/exceptions.ts";
import type { Energy as EnergyInterface } from "../../interfaces/energy.ts";
import { EnergyModuleFeature } from "../../interfaces/energy.ts";
import { SmartModule } from "../smartmodule.ts";

const OPTIONAL_METHOD_ERRORS = new Set([
  SmartErrorCode.PARAMS_ERROR,
  SmartErrorCode.UNKNOWN_METHOD_ERROR,
]);

/** Implementation of the energy-monitoring module. */
export class Energy extends SmartModule implements EnergyInterface {
  static override readonly requiredComponent = "energy_monitoring";

  private energyData: Record<string, unknown> = {};
  private currentConsumptionValue: number | undefined;
  private supportedFeatures: number = EnergyModuleFeature.PERIODIC_STATS;

  private getCurrentPowerMw(
    data: Record<string, unknown>,
    energy?: Record<string, unknown>,
  ): number | undefined {
    const energyData = energy ?? this.energyData;
    const emeterData = data.get_emeter_data as Record<string, unknown> | undefined;
    if (emeterData?.power_mw !== undefined) return emeterData.power_mw as number;

    if (energyData.current_power !== undefined) return energyData.current_power as number;

    const currentPower = data.get_current_power as Record<string, unknown> | undefined;
    if (currentPower?.current_power !== undefined)
      return (currentPower.current_power as number) * 1000;

    return undefined;
  }

  override async postUpdateHook(): Promise<void> {
    let data: Record<string, unknown>;
    try {
      data = this.data;
    } catch (ex) {
      this.energyData = {};
      this.currentConsumptionValue = undefined;
      if (ex instanceof DeviceError) throw ex;
      throw ex;
    }

    this.energyData =
      (data.get_energy_usage as Record<string, unknown> | undefined) ?? data;

    const emeterData = data.get_emeter_data as Record<string, unknown> | undefined;
    if (emeterData && "voltage_mv" in emeterData) {
      this.supportedFeatures |= EnergyModuleFeature.VOLTAGE_CURRENT;
    }

    const power = this.getCurrentPowerMw(data);
    this.currentConsumptionValue = power !== undefined ? power / 1000 : undefined;
  }

  override query(): Record<string, unknown> {
    const req: Record<string, unknown> = { get_energy_usage: null };
    if (this.supportedVersion > 1) {
      req.get_current_power = null;
      req.get_emeter_data = null;
      req.get_emeter_vgain_igain = null;
    }
    return req;
  }

  override get optionalResponseKeys(): string[] {
    if (this.supportedVersion > 1) return ["get_energy_usage", "get_current_power"];
    return [];
  }

  get currentConsumption(): number | undefined {
    return this.currentConsumptionValue;
  }

  get energy(): Record<string, unknown> {
    return this.energyData;
  }

  private getStatusFromEnergy(
    energy: Record<string, unknown>,
    powerMw?: number,
  ): EmeterStatus {
    return new EmeterStatus({
      power:
        (powerMw !== undefined
          ? powerMw
          : (energy.current_power as number | undefined)) ?? 0,
      total: ((energy.today_energy as number | undefined) ?? 0) / 1000,
    });
  }

  get status(): EmeterStatus {
    const data = this.data;
    const emeterData = data.get_emeter_data as Record<string, number> | undefined;
    if (emeterData) return new EmeterStatus(emeterData);
    return this.getStatusFromEnergy(this.energy, this.getCurrentPowerMw(data));
  }

  async getStatus(): Promise<EmeterStatus> {
    if (this.supportedVersion > 1) {
      try {
        const res = await this.call("get_emeter_data");
        return new EmeterStatus(res.get_emeter_data as Record<string, number>);
      } catch (ex) {
        if (
          !(ex instanceof DeviceError) ||
          !OPTIONAL_METHOD_ERRORS.has(ex.errorCode as SmartErrorCode)
        ) {
          throw ex;
        }
      }
    }

    let energy: Record<string, unknown> = {};
    try {
      const res = await this.call("get_energy_usage");
      energy = res.get_energy_usage as Record<string, unknown>;
      if (energy.current_power !== undefined) return this.getStatusFromEnergy(energy);
    } catch (ex) {
      if (this.supportedVersion <= 1) throw ex;
    }

    let currentPower: Record<string, unknown> = {};
    if (this.supportedVersion > 1) {
      try {
        const res = await this.call("get_current_power");
        currentPower = res.get_current_power as Record<string, unknown>;
      } catch (ex) {
        if (
          !(ex instanceof DeviceError) ||
          !OPTIONAL_METHOD_ERRORS.has(ex.errorCode as SmartErrorCode)
        ) {
          throw ex;
        }
      }
    }

    return this.getStatusFromEnergy(
      energy,
      this.getCurrentPowerMw({ get_current_power: currentPower }, energy),
    );
  }

  get consumptionThisMonth(): number | undefined {
    const month = this.energy.month_energy as number | undefined;
    return month !== undefined ? month / 1000 : undefined;
  }

  get consumptionToday(): number | undefined {
    const today = this.energy.today_energy as number | undefined;
    return today !== undefined ? today / 1000 : undefined;
  }

  get consumptionTotal(): number | undefined {
    return undefined;
  }

  get current(): number | undefined {
    const emeterData = this.data.get_emeter_data as Record<string, unknown> | undefined;
    const ma = emeterData?.current_ma as number | undefined;
    return ma !== undefined ? ma / 1000 : undefined;
  }

  get voltage(): number | undefined {
    const emeterData = this.data.get_emeter_data as Record<string, unknown> | undefined;
    const mv = emeterData?.voltage_mv as number | undefined;
    return mv !== undefined ? mv / 1000 : undefined;
  }

  async eraseStats(): Promise<never> {
    throw new KasaException("Device does not support periodic statistics");
  }

  async getDailyStats(): Promise<Record<string, unknown>> {
    throw new KasaException("Device does not support periodic statistics");
  }

  async getMonthlyStats(): Promise<Record<string, unknown>> {
    throw new KasaException("Device does not support periodic statistics");
  }

  override async checkSupported(): Promise<boolean> {
    // Energy module is not supported on the P304M parent device.
    return "device_on" in this.smartDevice.sysInfo;
  }
}
