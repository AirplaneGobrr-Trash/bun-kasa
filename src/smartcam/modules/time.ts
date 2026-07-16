import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { Time as TimeInterface } from "../../interfaces/time.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of the device local time module (SMARTCAM). */
export class Time extends SmartCamModule implements TimeInterface {
  static override readonly queryGetterName = "getTimezone";
  static override readonly queryModuleName = "system";
  static override readonly querySectionNames = "basic";

  private timezoneName = "Etc/UTC";
  private timeValue = new Date();

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "device_time",
        name: "Device time",
        attributeGetter: "time",
        container: this,
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    const q = super.query();
    q.getClockStatus = { [this.queryModuleName]: { name: "clock_status" } };
    return q;
  }

  override async postUpdateHook(): Promise<void> {
    const clockStatus = (
      this.data.getClockStatus as { system: { clock_status: Record<string, unknown> } }
    ).system.clock_status;
    const timezoneData = (
      this.data.getTimezone as { system: { basic: Record<string, unknown> } }
    ).system.basic;
    const zoneId = timezoneData.zone_id as string;
    const timestamp = clockStatus.seconds_from_1970 as number;

    this.timezoneName = zoneId || (timezoneData.timezone as string) || "Etc/UTC";
    this.timeValue = new Date(timestamp * 1000);
  }

  get timezone(): string {
    return this.timezoneName;
  }

  get time(): Date {
    return this.timeValue;
  }

  async setTime(dt: Date): Promise<Record<string, unknown>> {
    try {
      throw new KasaException(
        "SmartCam devices do not support setting clock time directly; only timezone " +
          "settings can be updated, which is not yet implemented for this port.",
      );
    } finally {
      void dt;
      this.setLastUpdateTime(undefined);
    }
  }
}
