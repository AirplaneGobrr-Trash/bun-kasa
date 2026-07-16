import type { Led as LedInterface } from "../../interfaces/led.ts";
import { initializeLedFeatures } from "../../interfaces/led.ts";
import { IotModule } from "../iotmodule.ts";

/** Implementation of LED controls. */
export class Led extends IotModule implements LedInterface {
  override query(): Record<string, unknown> {
    return {};
  }

  override initializeFeatures(): void {
    initializeLedFeatures(this);
  }

  get mode(): string {
    return this.led ? "always" : "never";
  }

  get led(): boolean {
    return Boolean(1 - (this.data.led_off as number));
  }

  async setLed(state: boolean): Promise<Record<string, unknown>> {
    return this.call("set_led_off", { off: state ? 0 : 1 });
  }

  override get isSupported(): boolean {
    return "led_off" in this.data;
  }
}
