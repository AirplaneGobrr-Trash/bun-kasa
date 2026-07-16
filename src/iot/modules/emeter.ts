import { EmeterStatus } from "../../core/emeterstatus.ts";
import type { Energy as EnergyInterface } from "../../interfaces/energy.ts";
import {
  EnergyModuleFeature,
  initializeEnergyFeatures,
} from "../../interfaces/energy.ts";
import { Usage } from "./usage.ts";

/** Emeter module. */
export class Emeter extends Usage implements EnergyInterface {
  protected supportedFeatures = 0;

  override initializeFeatures(): void {
    initializeEnergyFeatures(this, this.supportedFeatures);
  }

  override async postUpdateHook(): Promise<void> {
    const realtime = this.data.get_realtime as Record<string, unknown>;
    this.supportedFeatures = EnergyModuleFeature.PERIODIC_STATS;
    if ("voltage_mv" in realtime || "voltage" in realtime) {
      this.supportedFeatures |= EnergyModuleFeature.VOLTAGE_CURRENT;
    }
    if ("total_wh" in realtime || "total" in realtime) {
      this.supportedFeatures |= EnergyModuleFeature.CONSUMPTION_TOTAL;
    }
  }

  get status(): EmeterStatus {
    return new EmeterStatus(this.data.get_realtime as Record<string, number>);
  }

  get consumptionToday(): number | undefined {
    const today = new Date().getDate();
    const data = this.convertStatData(this.dailyData, "day");
    return data[today] ?? 0.0;
  }

  get consumptionThisMonth(): number | undefined {
    const currentMonth = new Date().getMonth() + 1;
    const data = this.convertStatData(this.monthlyData, "month");
    return data[currentMonth] ?? 0.0;
  }

  get currentConsumption(): number | undefined {
    return this.status.power;
  }

  get consumptionTotal(): number | undefined {
    return this.status.total;
  }

  get current(): number | undefined {
    return this.status.current;
  }

  get voltage(): number | undefined {
    return this.status.voltage;
  }

  override async eraseStats(): Promise<Record<string, unknown>> {
    return this.call("erase_emeter_stat");
  }

  async getStatus(): Promise<EmeterStatus> {
    return new EmeterStatus((await this.call("get_realtime")) as Record<string, number>);
  }

  async getDailyStats(options?: {
    year?: number;
    month?: number;
    kwh?: boolean;
  }): Promise<Record<string, unknown>> {
    const data = (await this.getRawDaystat(options)) as {
      day_list: Record<string, number>[];
    };
    return this.convertEmeterStatData(data.day_list, "day", options?.kwh ?? true);
  }

  async getMonthlyStats(options?: { year?: number; kwh?: boolean }): Promise<
    Record<string, unknown>
  > {
    const data = (await this.getRawMonthstat(options)) as {
      month_list: Record<string, number>[];
    };
    return this.convertEmeterStatData(data.month_list, "month", options?.kwh ?? true);
  }

  private convertEmeterStatData(
    data: Record<string, number>[],
    entryKey: "day" | "month",
    kwh: boolean,
  ): Record<number, number> {
    if (data.length === 0) return {};

    let scale = 1;
    let valueKey: string;
    if ("energy_wh" in (data[0] as Record<string, number>)) {
      valueKey = "energy_wh";
      if (kwh) scale = 1 / 1000;
    } else {
      valueKey = "energy";
      if (!kwh) scale = 1000;
    }

    const result: Record<number, number> = {};
    for (const entry of data) {
      const key = entry[entryKey];
      if (key !== undefined) result[key] = (entry[valueKey] as number) * scale;
    }
    return result;
  }
}
