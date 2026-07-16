import { SmartModule } from "../smartmodule.ts";

/** Implementation of the device module: core `get_device_info` and usage stats. */
export class DeviceModule extends SmartModule {
  static override readonly requiredComponent = "device";

  /** Critical module — never disable it based on query errors. */
  override async postUpdateHook(): Promise<void> {}

  override query(): Record<string, unknown> {
    if (this.smartDevice.isHubChild) {
      // Child devices get their device info updated by the parent device.
      return {};
    }
    const query: Record<string, unknown> = { get_device_info: null };
    if (this.supportedVersion >= 2) query.get_device_usage = null;
    return query;
  }
}
