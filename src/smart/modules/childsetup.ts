import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { ChildSetup as ChildSetupInterface } from "../../interfaces/childsetup.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation for child device setup: pairing and unpairing child devices. */
export class ChildSetup extends SmartModule implements ChildSetupInterface {
  static override readonly requiredComponent = "child_quick_setup";
  static override readonly queryGetterName = "get_support_child_device_category";
  // Supported child device categories will hardly ever change.
  override minimumUpdateIntervalSecs = 60 * 60 * 24;

  private categories: string[] = [];

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "pair",
        name: "Pair",
        container: this,
        attributeSetter: "pair",
        category: FeatureCategory.Config,
        type: FeatureType.Action,
      }),
    );
  }

  override async postUpdateHook(): Promise<void> {
    this.categories = (this.data.device_category_list as { category: string }[]).map(
      (c) => c.category,
    );
  }

  get supportedCategories(): string[] {
    return this.categories;
  }

  async pair(options?: { timeout?: number }): Promise<Record<string, unknown>[]> {
    await this.call("begin_scanning_child_device");
    await new Promise((resolve) => setTimeout(resolve, (options?.timeout ?? 10) * 1000));
    const detected = await this.getDetectedDevices();

    const deviceList = detected.child_device_list as Record<string, unknown>[];
    if (deviceList.length === 0) return [];

    return this.addDevices(detected);
  }

  async unpair(deviceId: string): Promise<Record<string, unknown>> {
    const payload = { child_device_list: [{ device_id: deviceId }] };
    const res = await this.call("remove_child_device_list", payload);
    await this.smartDevice.update();
    return res;
  }

  private async addDevices(
    devices: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    await this.call("add_child_device_list", devices);
    await this.smartDevice.update();

    const successes: Record<string, unknown>[] = [];
    for (const detected of devices.child_device_list as Record<string, unknown>[]) {
      const deviceId = detected.device_id as string;
      if (this.smartDevice.hasChild(deviceId)) successes.push(detected);
    }
    return successes;
  }

  private async getDetectedDevices(): Promise<Record<string, unknown>> {
    const param = { scan_list: this.data.device_category_list };
    const res = await this.call("get_scan_child_device_list", param);
    return res.get_scan_child_device_list as Record<string, unknown>;
  }
}
