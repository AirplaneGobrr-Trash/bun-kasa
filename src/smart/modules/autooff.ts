import { Feature, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of the auto-off module. */
export class AutoOff extends SmartModule {
  static override readonly requiredComponent = "auto_off";
  static override readonly queryGetterName = "get_auto_off_config";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "auto_off_enabled",
        name: "Auto off enabled",
        container: this,
        attributeGetter: "enabled",
        attributeSetter: "setEnabled",
        type: FeatureType.Switch,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "auto_off_minutes",
        name: "Auto off in",
        container: this,
        attributeGetter: "delay",
        attributeSetter: "setDelay",
        type: FeatureType.Number,
        unitGetter: () => "min",
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "auto_off_at",
        name: "Auto off at",
        container: this,
        attributeGetter: "autoOffAt",
        type: FeatureType.Sensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return { [this.queryGetterName]: { start_index: 0 } };
  }

  get enabled(): boolean {
    return Boolean(this.data.enable);
  }

  async setEnabled(enable: boolean): Promise<Record<string, unknown>> {
    return this.call("set_auto_off_config", { enable, delay_min: this.data.delay_min });
  }

  get delay(): number {
    return this.data.delay_min as number;
  }

  async setDelay(delay: number): Promise<Record<string, unknown>> {
    return this.call("set_auto_off_config", {
      delay_min: delay,
      enable: this.data.enable,
    });
  }

  get isTimerActive(): boolean {
    return this.smartDevice.sysInfo.auto_off_status === "on";
  }

  get autoOffAt(): Date | undefined {
    if (!this.isTimerActive) return undefined;
    const remainSecs = this.smartDevice.sysInfo.auto_off_remain_time as number;
    return new Date(this.smartDevice.time.getTime() + remainSecs * 1000);
  }

  override async checkSupported(): Promise<boolean> {
    return "auto_off_status" in this.smartDevice.sysInfo;
  }
}
