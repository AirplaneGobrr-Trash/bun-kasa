import type { Led as LedInterface } from "../../interfaces/led.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of LED controls (SMARTCAM). */
export class Led extends SmartCamModule implements LedInterface {
  static override readonly requiredComponent = "led";
  static override readonly queryGetterName = "getLedStatus";
  static override readonly queryModuleName = "led";
  static override readonly querySectionNames = "config";

  get led(): boolean {
    return (this.data.config as { enabled: string }).enabled === "on";
  }

  async setLed(enable: boolean): Promise<Record<string, unknown>> {
    try {
      const params = { enabled: enable ? "on" : "off" };
      return await this.call("setLedStatus", { led: { config: params } });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }
}
