import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModules } from "../modulenames.ts";
import { SmartModule } from "../smartmodule.ts";
import type { AreaUnit, Clean } from "./clean.ts";

/** A single historical cleanup result. */
export interface CleanRecord {
  cleanTimeMinutes: number;
  cleanArea: number;
  dustCollection: boolean;
  timestamp: Date;
  infoNum?: number;
  message?: number;
  mapId?: number;
  startType?: number;
  taskType?: number;
  recordIndex?: number;
  error: number;
}

function parseRecord(raw: Record<string, unknown>): CleanRecord {
  return {
    cleanTimeMinutes: raw.clean_time as number,
    cleanArea: raw.clean_area as number,
    dustCollection: Boolean(raw.dust_collection),
    timestamp: new Date((raw.timestamp as number) * 1000),
    infoNum: raw.info_num as number | undefined,
    message: raw.message as number | undefined,
    mapId: raw.map_id as number | undefined,
    startType: raw.start_type as number | undefined,
    taskType: raw.task_type as number | undefined,
    recordIndex: raw.record_index as number | undefined,
    error: (raw.error as number) ?? 0,
  };
}

/** Parsed response payload for `getCleanRecords`. */
export interface CleanRecords_Records {
  totalTimeMinutes: number;
  totalArea: number;
  totalCount: number;
  records: CleanRecord[];
  lastClean: CleanRecord;
}

function parseRecords(raw: Record<string, unknown>): CleanRecords_Records {
  const lastCleanRaw = raw.lastest_day_record as
    | [number, number, number, boolean]
    | undefined;
  const lastClean = lastCleanRaw
    ? parseRecord({
        timestamp: lastCleanRaw[0],
        clean_time: lastCleanRaw[1],
        clean_area: lastCleanRaw[2],
        dust_collection: lastCleanRaw[3],
      })
    : parseRecord({});
  return {
    totalTimeMinutes: raw.total_time as number,
    totalArea: raw.total_area as number,
    totalCount: raw.total_number as number,
    records: ((raw.record_list as Record<string, unknown>[]) ?? []).map(parseRecord),
    lastClean,
  };
}

/** Implementation of vacuum cleaning records. */
export class CleanRecords extends SmartModule {
  static override readonly requiredComponent = "clean_percent";

  private parsedData: CleanRecords_Records | undefined;

  override async postUpdateHook(): Promise<void> {
    this.parsedData = parseRecords(this.data);
  }

  override initializeFeatures(): void {
    for (const type_ of ["total", "last"]) {
      this.addFeature(
        new Feature(this.device, {
          id: `${type_}_clean_area`,
          name: `${capitalize(type_)} area cleaned`,
          container: this,
          attributeGetter: type_ === "total" ? "totalCleanArea" : "lastCleanArea",
          unitGetter: "areaUnit",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
      this.addFeature(
        new Feature(this.device, {
          id: `${type_}_clean_time`,
          name: `${capitalize(type_)} time cleaned`,
          container: this,
          attributeGetter:
            type_ === "total" ? "totalCleanTimeMinutes" : "lastCleanTimeMinutes",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
    }
    this.addFeature(
      new Feature(this.device, {
        id: "total_clean_count",
        name: "Total clean count",
        container: this,
        attributeGetter: "totalCleanCount",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "last_clean_timestamp",
        name: "Last clean timestamp",
        container: this,
        attributeGetter: "lastCleanTimestamp",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return { getCleanRecords: {} };
  }

  private get parsed(): CleanRecords_Records {
    if (!this.parsedData) throw new Error("Data not yet available, call update() first");
    return this.parsedData;
  }

  get totalCleanArea(): number {
    return this.parsed.totalArea;
  }

  get totalCleanTimeMinutes(): number {
    return this.parsed.totalTimeMinutes;
  }

  get totalCleanCount(): number {
    return this.parsed.totalCount;
  }

  get lastCleanArea(): number {
    return this.parsed.lastClean.cleanArea;
  }

  get lastCleanTimeMinutes(): number {
    return this.parsed.lastClean.cleanTimeMinutes;
  }

  get lastCleanTimestamp(): Date {
    return this.parsed.lastClean.timestamp;
  }

  get areaUnit(): AreaUnit {
    const clean = this.smartDevice.modules.getRequired(SmartModules.Clean) as Clean;
    return clean.areaUnit;
  }

  get records(): CleanRecords_Records {
    return this.parsed;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
