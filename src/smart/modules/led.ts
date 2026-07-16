import type { Led as LedInterface } from "../../interfaces/led.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of LED controls. */
export class Led extends SmartModule implements LedInterface {
  static override readonly requiredComponent = "led";
  static override readonly queryGetterName = "get_led_info";
  // Led queries can cause the device to crash on P100.
  override minimumUpdateIntervalSecs = 60 * 60;

  override query(): Record<string, unknown> {
    return { [this.queryGetterName]: null };
  }

  get mode(): string {
    return this.data.led_rule as string;
  }

  get led(): boolean {
    return this.data.led_rule !== "never";
  }

  async setLed(enable: boolean): Promise<Record<string, unknown>> {
    try {
      const rule = enable ? "always" : "never";
      return await this.call("set_led_info", { ...this.data, led_rule: rule });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get nightModeSettings(): Record<string, unknown> {
    return {
      start: this.data.start_time,
      end: this.data.end_time,
      type: this.data.night_mode_type,
      sunriseOffset: this.data.sunrise_offset,
      sunsetOffset: this.data.sunset_offset,
    };
  }
}
