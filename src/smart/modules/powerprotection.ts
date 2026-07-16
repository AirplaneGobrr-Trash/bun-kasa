import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation for power_protection. */
export class PowerProtection extends SmartModule {
  static override readonly requiredComponent = "power_protection";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "overloaded",
        name: "Overloaded",
        container: this,
        attributeGetter: "overloaded",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Info,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "power_protection_threshold",
        name: "Power protection threshold",
        container: this,
        attributeGetter: "thresholdOrZero",
        attributeSetter: "setThresholdAutoEnable",
        unitGetter: () => "W",
        type: FeatureType.Number,
        rangeGetter: () => [0, this.maxPower],
        category: FeatureCategory.Config,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return { get_protection_power: {}, get_max_power: {} };
  }

  get overloaded(): boolean {
    return this.smartDevice.sysInfo.power_protection_status === "overloaded";
  }

  private get protectionPowerData(): Record<string, unknown> {
    return this.data.get_protection_power as Record<string, unknown>;
  }

  private enabledKey(): string {
    const key = Object.keys(this.protectionPowerData).find((k) => k.includes("enabled"));
    if (!key) throw new Error("No enabled key found in get_protection_power response");
    return key;
  }

  get enabled(): boolean {
    return Boolean(this.protectionPowerData[this.enabledKey()]);
  }

  async setEnabled(
    enabled: boolean,
    options?: { threshold?: number },
  ): Promise<Record<string, unknown>> {
    let threshold = options?.threshold;
    if (threshold === undefined && enabled && this.protectionThreshold === 0) {
      threshold = Math.floor(this.maxPower / 2);
    }
    if (threshold !== undefined && (threshold < 0 || threshold > this.maxPower)) {
      throw new RangeError(
        `Threshold out of range: ${threshold} (${this.protectionThreshold})`,
      );
    }
    const params: Record<string, unknown> = {
      ...this.protectionPowerData,
      [this.enabledKey()]: enabled,
    };
    if (threshold !== undefined) params.protection_power = threshold;
    return this.call("set_protection_power", params);
  }

  async setThresholdAutoEnable(threshold: number): Promise<Record<string, unknown>> {
    if (threshold === 0) return this.setEnabled(false);
    return this.setEnabled(true, { threshold });
  }

  get thresholdOrZero(): number {
    return this.enabled ? this.protectionThreshold : 0;
  }

  private get maxPower(): number {
    return (this.data.get_max_power as { max_power: number }).max_power;
  }

  get protectionThreshold(): number {
    return (this.protectionPowerData.protection_power as number | undefined) ?? 0;
  }

  async setProtectionThreshold(threshold: number): Promise<Record<string, unknown>> {
    if (threshold < 0 || threshold > this.maxPower) {
      throw new RangeError(
        `Threshold out of range: ${threshold} (${this.protectionThreshold})`,
      );
    }
    const params = { ...this.protectionPowerData, protection_power: threshold };
    return this.call("set_protection_power", params);
  }

  override async checkSupported(): Promise<boolean> {
    return "power_protection_status" in this.smartDevice.sysInfo;
  }
}
