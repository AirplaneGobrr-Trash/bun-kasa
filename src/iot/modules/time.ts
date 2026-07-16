import { KasaException } from "../../core/exceptions.ts";
import type { Time as TimeInterface } from "../../interfaces/time.ts";
import { IotModule, merge } from "../iotmodule.ts";
import { getTimezoneIndex, getTimezoneName } from "../iottimezone.ts";

interface RawTime {
  year: number;
  month: number;
  mday: number;
  hour: number;
  min: number;
  sec: number;
}

/** Implements the timezone settings for IOT devices. */
export class Time extends IotModule implements TimeInterface {
  private timezoneName = "Etc/UTC";

  override query(): Record<string, unknown> {
    return merge(this.queryForCommand("get_time"), this.queryForCommand("get_timezone"));
  }

  override async postUpdateHook(): Promise<void> {
    const tz = this.data.get_timezone as { index: number } | undefined;
    this.timezoneName = tz ? getTimezoneName(tz.index) : "Etc/UTC";
  }

  get time(): Date {
    const res = this.data.get_time as RawTime;
    return new Date(res.year, res.month - 1, res.mday, res.hour, res.min, res.sec);
  }

  get timezone(): string {
    return this.timezoneName;
  }

  async getTime(): Promise<Date | undefined> {
    try {
      const res = (await this.call("get_time")) as unknown as RawTime;
      return new Date(res.year, res.month - 1, res.mday, res.hour, res.min, res.sec);
    } catch (ex) {
      if (ex instanceof KasaException) return undefined;
      throw ex;
    }
  }

  async setTime(dt: Date): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      mday: dt.getDate(),
      hour: dt.getHours(),
      min: dt.getMinutes(),
      sec: dt.getSeconds(),
    };

    const tz = this.data.get_timezone as { index: number } | undefined;
    const index = getTimezoneIndex(this.timezoneName);
    let method = "set_time";
    if (index !== undefined && tz && tz.index !== -1 && tz.index !== index) {
      params.index = index;
      method = "set_timezone";
    }
    return this.call(method, params);
  }

  async getTimezone(): Promise<Record<string, unknown>> {
    return this.call("get_timezone");
  }
}
