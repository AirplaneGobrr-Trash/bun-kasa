import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { ChildSetup as ChildSetupInterface } from "../../interfaces/childsetup.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation for SMARTCAM child device setup: pairing and unpairing. */
export class ChildSetup extends SmartCamModule implements ChildSetupInterface {
  static override readonly requiredComponent = "childQuickSetup";
  static override readonly queryGetterName = "getSupportChildDeviceCategory";
  static override readonly queryModuleName = "childControl";
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
      (c) => c.category.replace("ipcamera", "camera"),
    );
  }

  get supportedCategories(): string[] {
    return this.categories;
  }

  async pair(options?: { timeout?: number }): Promise<Record<string, unknown>[]> {
    await this.call("startScanChildDevice", {
      childControl: { category: this.categories },
    });
    await new Promise((resolve) => setTimeout(resolve, (options?.timeout ?? 10) * 1000));
    const res = await this.call("getScanChildDeviceList", {
      childControl: { category: this.categories },
    });

    const detectedList = (
      res.getScanChildDeviceList as { child_device_list: Record<string, unknown>[] }
    ).child_device_list;
    if (detectedList.length === 0) return [];

    return this.addDevices(detectedList);
  }

  private async addDevices(
    detectedList: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    await this.call("addScanChildDeviceList", {
      childControl: { child_device_list: detectedList },
    });
    await this.smartCamDevice.update();

    const successes: Record<string, unknown>[] = [];
    for (const detected of detectedList) {
      const deviceId = detected.device_id as string;
      if (this.smartCamDevice.hasChild(deviceId)) successes.push(detected);
    }
    return successes;
  }

  async unpair(deviceId: string): Promise<Record<string, unknown>> {
    const payload = { childControl: { child_device_list: [{ device_id: deviceId }] } };
    const res = await this.call("removeChildDeviceList", payload);
    await this.smartCamDevice.update();
    return res;
  }
}
