import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

interface ConsumableMeta {
  name: string;
  id: string;
  dataKey: string;
  lifetimeMinutes: number;
}

/** A vacuum consumable (brush, filter, etc.) and its usage. */
export interface Consumable {
  name: string;
  id: string;
  lifetimeMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
}

const CONSUMABLE_METAS: ConsumableMeta[] = [
  {
    name: "Main brush",
    id: "main_brush",
    dataKey: "roll_brush_time",
    lifetimeMinutes: 400 * 60,
  },
  {
    name: "Side brush",
    id: "side_brush",
    dataKey: "edge_brush_time",
    lifetimeMinutes: 200 * 60,
  },
  { name: "Filter", id: "filter", dataKey: "filter_time", lifetimeMinutes: 200 * 60 },
  { name: "Sensor", id: "sensor", dataKey: "sensor_time", lifetimeMinutes: 30 * 60 },
  {
    name: "Charging contacts",
    id: "charging_contacts",
    dataKey: "charge_contact_time",
    lifetimeMinutes: 30 * 60,
  },
];

/** Implementation of vacuum consumables. */
export class Consumables extends SmartModule {
  static override readonly requiredComponent = "consumables";
  static override readonly queryGetterName = "getConsumablesInfo";

  private consumablesById = new Map<string, Consumable>();

  override initializeFeatures(): void {
    for (const meta of CONSUMABLE_METAS) {
      if (!(meta.dataKey in this.data)) continue;

      this.addFeature(
        new Feature(this.device, {
          id: `${meta.id}_used`,
          name: `${meta.name} used`,
          container: this,
          attributeGetter: () => this.consumablesById.get(meta.id)?.usedMinutes,
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
      this.addFeature(
        new Feature(this.device, {
          id: `${meta.id}_remaining`,
          name: `${meta.name} remaining`,
          container: this,
          attributeGetter: () => this.consumablesById.get(meta.id)?.remainingMinutes,
          category: FeatureCategory.Info,
          type: FeatureType.Sensor,
        }),
      );
      this.addFeature(
        new Feature(this.device, {
          id: `${meta.id}_reset`,
          name: `Reset ${meta.name.toLowerCase()} consumable`,
          container: this,
          attributeSetter: () => this.resetConsumable(meta.id),
          category: FeatureCategory.Debug,
          type: FeatureType.Action,
        }),
      );
    }
  }

  override async postUpdateHook(): Promise<void> {
    for (const meta of CONSUMABLE_METAS) {
      if (!(meta.dataKey in this.data)) continue;
      const usedMinutes = this.data[meta.dataKey] as number;
      this.consumablesById.set(meta.id, {
        id: meta.id,
        name: meta.name,
        lifetimeMinutes: meta.lifetimeMinutes,
        usedMinutes,
        remainingMinutes: meta.lifetimeMinutes - usedMinutes,
      });
    }
  }

  async resetConsumable(consumableId: string): Promise<Record<string, unknown>> {
    const meta = CONSUMABLE_METAS.find((m) => m.id === consumableId);
    if (!meta) throw new Error(`Unknown consumable ${consumableId}`);
    const name = meta.dataKey.replace(/_time$/, "");
    return this.call("resetConsumablesTime", { reset_list: [name] });
  }

  get consumables(): ReadonlyMap<string, Consumable> {
    return this.consumablesById;
  }
}
