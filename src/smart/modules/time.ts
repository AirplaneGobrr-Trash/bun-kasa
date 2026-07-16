import type { Time as TimeInterface } from "../../interfaces/time.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the device local time module. */
export class Time extends SmartModule implements TimeInterface {
  static override readonly requiredComponent = "time";
  static override readonly queryGetterName = "get_device_time";

  private timezoneName = "Etc/UTC";
  private timeDiffMinutes = 0;

  override query(): Record<string, unknown> {
    return { [this.queryGetterName]: null };
  }

  override async postUpdateHook(): Promise<void> {
    this.timeDiffMinutes = (this.data.time_diff as number | undefined) ?? 0;
    const region = this.data.region as string | undefined;
    this.timezoneName =
      region ||
      `Etc/GMT${this.timeDiffMinutes <= 0 ? "+" : "-"}${Math.abs(this.timeDiffMinutes / 60)}`;
  }

  get timezone(): string {
    return this.timezoneName;
  }

  get time(): Date {
    return new Date((this.data.timestamp as number) * 1000);
  }

  async setTime(dt: Date): Promise<Record<string, unknown>> {
    const timestamp = Math.floor(dt.getTime() / 1000);
    const params: Record<string, unknown> = {
      timestamp,
      time_diff: this.timeDiffMinutes,
    };
    if (this.timezoneName) params.region = this.timezoneName;
    return this.call("set_device_time", params);
  }

  override async checkSupported(): Promise<boolean> {
    // Hub-attached sensors report the time module but don't return device time.
    if (this.smartDevice.isHubChild) return false;
    return super.checkSupported();
  }
}
