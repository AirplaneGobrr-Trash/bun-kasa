import { IotModule, merge } from "../iotmodule.ts";

interface StatEntry {
  day?: number;
  month?: number;
  time: number;
}

/** Base class for emeter/usage interfaces. */
export class Usage extends IotModule {
  override query(): Record<string, unknown> {
    const now = new Date();
    let req = this.queryForCommand("get_realtime");
    req = merge(
      req,
      this.queryForCommand("get_daystat", {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      }),
    );
    req = merge(req, this.queryForCommand("get_monthstat", { year: now.getFullYear() }));
    return req;
  }

  override get estimatedQueryResponseSize(): number {
    return 2048;
  }

  get dailyData(): StatEntry[] {
    return (this.data.get_daystat as { day_list: StatEntry[] }).day_list;
  }

  get monthlyData(): StatEntry[] {
    return (this.data.get_monthstat as { month_list: StatEntry[] }).month_list;
  }

  get usageToday(): number | undefined {
    const today = new Date().getDate();
    for (const entry of [...this.dailyData].reverse()) {
      if (entry.day === today) return entry.time;
    }
    return undefined;
  }

  get usageThisMonth(): number | undefined {
    const thisMonth = new Date().getMonth() + 1;
    for (const entry of [...this.monthlyData].reverse()) {
      if (entry.month === thisMonth) return entry.time;
    }
    return undefined;
  }

  async getRawDaystat(options?: { year?: number; month?: number }): Promise<
    Record<string, unknown>
  > {
    const now = new Date();
    return this.call("get_daystat", {
      year: options?.year ?? now.getFullYear(),
      month: options?.month ?? now.getMonth() + 1,
    });
  }

  async getRawMonthstat(options?: { year?: number }): Promise<Record<string, unknown>> {
    return this.call("get_monthstat", {
      year: options?.year ?? new Date().getFullYear(),
    });
  }

  async getDaystat(options?: { year?: number; month?: number }): Promise<
    Record<number, number>
  > {
    const data = (await this.getRawDaystat(options)) as { day_list: StatEntry[] };
    return this.convertStatData(data.day_list, "day");
  }

  async getMonthstat(options?: { year?: number }): Promise<Record<number, number>> {
    const data = (await this.getRawMonthstat(options)) as { month_list: StatEntry[] };
    return this.convertStatData(data.month_list, "month");
  }

  async eraseStats(): Promise<Record<string, unknown>> {
    return this.call("erase_runtime_stat");
  }

  protected convertStatData(
    data: StatEntry[],
    entryKey: "day" | "month",
  ): Record<number, number> {
    const result: Record<number, number> = {};
    for (const entry of data) {
      const key = entry[entryKey];
      if (key !== undefined) result[key] = entry.time;
    }
    return result;
  }
}
