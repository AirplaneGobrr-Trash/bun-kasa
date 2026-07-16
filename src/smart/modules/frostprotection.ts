import { SmartModule } from "../smartmodule.ts";

/** Implementation for the frost protection module. Turns the thermostat on and off. */
export class FrostProtection extends SmartModule {
  static override readonly requiredComponent = "frost_protection";
  static override readonly queryGetterName = "get_frost_protection";

  override query(): Record<string, unknown> {
    return {};
  }

  get enabled(): boolean {
    return Boolean(this.smartDevice.sysInfo.frost_protection_on);
  }

  async setEnabled(enable: boolean): Promise<Record<string, unknown>> {
    return this.call("set_device_info", { frost_protection_on: enable });
  }

  get minimumTemperature(): number {
    return this.data.min_temp as number;
  }

  get temperatureUnit(): string {
    return this.data.temp_unit as string;
  }
}
