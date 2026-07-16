import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Water level for mopping. */
export enum Waterlevel {
  Disable = 0,
  Low = 1,
  Medium = 2,
  High = 3,
}

/** Implementation of the vacuum mop. */
export class Mop extends SmartModule {
  static override readonly requiredComponent = "mop";

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "mop_attached",
        name: "Mop attached",
        container: this,
        icon: "mdi:square-rounded",
        attributeGetter: "mopAttached",
        category: FeatureCategory.Info,
        type: FeatureType.BinarySensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "mop_waterlevel",
        name: "Mop water level",
        container: this,
        attributeGetter: "waterlevel",
        attributeSetter: "setWaterlevel",
        icon: "mdi:water",
        choicesGetter: () =>
          Object.keys(Waterlevel).filter((k) => Number.isNaN(Number(k))),
        category: FeatureCategory.Config,
        type: FeatureType.Choice,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return { getMopState: {}, getCleanAttr: { type: "global" } };
  }

  get mopAttached(): boolean {
    return Boolean((this.data.getMopState as { mop_state: boolean }).mop_state);
  }

  private get settings(): Record<string, unknown> {
    return this.data.getCleanAttr as Record<string, unknown>;
  }

  get waterlevel(): string {
    return Waterlevel[Number(this.settings.cistern)] as string;
  }

  async setWaterlevel(mode: string): Promise<Record<string, unknown>> {
    const value = Waterlevel[mode as keyof typeof Waterlevel];
    if (value === undefined) throw new Error(`Invalid waterlevel ${mode}`);
    return this.call("setCleanAttr", { cistern: value, type: "global" });
  }
}
