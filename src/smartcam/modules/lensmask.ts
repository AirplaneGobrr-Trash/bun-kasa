import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of the lens mask (privacy shutter) module. */
export class LensMask extends SmartCamModule {
  static override readonly requiredComponent = "lensMask";
  static override readonly queryGetterName = "getLensMaskConfig";
  static override readonly queryModuleName = "lens_mask";
  static override readonly querySectionNames = "lens_mask_info";

  get enabled(): boolean {
    return (this.data.lens_mask_info as { enabled: string }).enabled === "on";
  }

  async setEnabled(enable: boolean): Promise<Record<string, unknown>> {
    try {
      const params = { enabled: enable ? "on" : "off" };
      return await this.smartCamDevice.querySetterHelper(
        "setLensMaskConfig",
        this.queryModuleName,
        "lens_mask_info",
        params,
      );
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }
}
