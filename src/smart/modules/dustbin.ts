import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Dust collection modes. */
export enum DustbinMode {
  Smart = 0,
  Light = 1,
  Balanced = 2,
  Max = 3,
  Off = -1000,
}

/** Implementation of the vacuum dustbin. */
export class Dustbin extends SmartModule {
  static override readonly requiredComponent = "dust_bucket";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "dustbin_empty",
        name: "Empty dustbin",
        container: this,
        attributeSetter: "startEmptying",
        category: FeatureCategory.Config,
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "dustbin_autocollection_enabled",
        name: "Automatic emptying enabled",
        container: this,
        attributeGetter: "autoCollection",
        attributeSetter: "setAutoCollection",
        category: FeatureCategory.Config,
        type: FeatureType.Switch,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "dustbin_mode",
        name: "Automatic emptying mode",
        container: this,
        attributeGetter: "mode",
        attributeSetter: "setMode",
        icon: "mdi:fan",
        choicesGetter: () =>
          Object.keys(DustbinMode).filter((k) => Number.isNaN(Number(k))),
        category: FeatureCategory.Config,
        type: FeatureType.Choice,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return { getAutoDustCollection: {}, getDustCollectionInfo: {} };
  }

  async startEmptying(): Promise<Record<string, unknown>> {
    return this.call("setSwitchDustCollection", { switch_dust_collection: true });
  }

  private get settings(): Record<string, unknown> {
    return this.data.getDustCollectionInfo as Record<string, unknown>;
  }

  get mode(): string {
    if (this.autoCollection === false) return DustbinMode[DustbinMode.Off] as string;
    return DustbinMode[this.settings.dust_collection_mode as number] as string;
  }

  async setMode(mode: string): Promise<Record<string, unknown>> {
    const value = DustbinMode[mode as keyof typeof DustbinMode];
    if (value === undefined) throw new Error(`Invalid auto-emptying mode ${mode}`);
    if (mode === DustbinMode[DustbinMode.Off]) return this.setAutoCollection(false);

    const settings = {
      ...this.settings,
      auto_dust_collection: true,
      dust_collection_mode: value,
    };
    return this.call("setDustCollectionInfo", settings);
  }

  get autoCollection(): boolean {
    return Boolean(this.settings.auto_dust_collection);
  }

  async setAutoCollection(on: boolean): Promise<Record<string, unknown>> {
    const settings = { ...this.settings, auto_dust_collection: on };
    return this.call("setDustCollectionInfo", settings);
  }
}
