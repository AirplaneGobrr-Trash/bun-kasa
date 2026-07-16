import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Status of the vacuum. */
export enum VacuumStatus {
  Idle = 0,
  Cleaning = 1,
  Mapping = 2,
  GoingHome = 4,
  Charging = 5,
  Charged = 6,
  Paused = 7,
  Undocked = 8,
  Error = 100,
  UnknownInternal = -1000,
}

/** Error codes for the vacuum. */
export enum VacuumErrorCode {
  Ok = 0,
  SideBrushStuck = 2,
  MainBrushStuck = 3,
  WheelBlocked = 4,
  Trapped = 6,
  TrappedCliff = 7,
  DustBinRemoved = 14,
  UnableToMove = 15,
  LidarBlocked = 16,
  UnableToFindDock = 21,
  BatteryLow = 22,
  UnknownInternal = -1000,
}

/** Fan speed level. */
export enum FanSpeed {
  Quiet = 1,
  Standard = 2,
  Turbo = 3,
  Max = 4,
  Ultra = 5,
}

/** Clean mode for `setSwitchClean`/`getCleanStatus`. */
export enum CleanMode {
  /** Clean all rooms with uniform settings. */
  StandardHome = 0,
  /** Clean all rooms with per-room settings and custom order. */
  AdvancedHome = 1,
  /** Clean a small area around the vacuum's current position. */
  Spot = 2,
  /** Clean selected rooms only. */
  Room = 3,
  /** Clean user-defined rectangular areas. */
  Zone = 4,
  /** Run a saved custom cleaning preset. */
  Custom = 5,
}

/** Per-area cleaning settings shared by rooms and zones. */
export interface CleanAreaSettings {
  suction?: FanSpeed;
  cistern: number;
  cleanNumber: number;
}

/** Information about a room on the vacuum's map. */
export interface RoomInfo extends CleanAreaSettings {
  id: number;
  name?: string;
  color: number;
}

export enum AreaType {
  Room = "room",
  Area = "area",
  VirtualWall = "virtual_wall",
  Forbid = "forbid",
  CarpetRectangle = "carpet_rectangle",
}

export enum AreaUnit {
  Sqm = 0,
  Sqft = 1,
  Ping = 2,
}

const START_TYPE_DEFAULT = 1;
const MAP_DATA_TYPE_DEFAULT = 0;

/** Implementation of the vacuum clean module. */
export class Clean extends SmartModule {
  static override readonly requiredComponent = "clean";

  private errorCode = VacuumErrorCode.Ok;

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "vacuum_return_home",
        name: "Return home",
        container: this,
        attributeSetter: "returnHome",
        category: FeatureCategory.Primary,
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "vacuum_start",
        name: "Start cleaning",
        container: this,
        attributeSetter: "start",
        category: FeatureCategory.Primary,
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "vacuum_pause",
        name: "Pause",
        container: this,
        attributeSetter: "pause",
        category: FeatureCategory.Primary,
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "vacuum_status",
        name: "Vacuum status",
        container: this,
        attributeGetter: "status",
        category: FeatureCategory.Primary,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "vacuum_error",
        name: "Error",
        container: this,
        attributeGetter: "error",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "battery_level",
        name: "Battery level",
        container: this,
        attributeGetter: "battery",
        icon: "mdi:battery",
        unitGetter: () => "%",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "vacuum_fan_speed",
        name: "Fan speed",
        container: this,
        attributeGetter: "fanSpeedPreset",
        attributeSetter: "setFanSpeedPreset",
        icon: "mdi:fan",
        choicesGetter: () => Object.keys(FanSpeed).filter((k) => Number.isNaN(Number(k))),
        category: FeatureCategory.Primary,
        type: FeatureType.Choice,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "clean_count",
        name: "Clean count",
        container: this,
        attributeGetter: "cleanCount",
        attributeSetter: "setCleanCount",
        rangeGetter: () => [1, 3],
        category: FeatureCategory.Config,
        type: FeatureType.Number,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "carpet_boost",
        name: "Carpet boost",
        container: this,
        attributeGetter: "carpetBoost",
        attributeSetter: "setCarpetBoost",
        icon: "mdi:rug",
        category: FeatureCategory.Config,
        type: FeatureType.Switch,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "clean_area",
        name: "Cleaning area",
        container: this,
        attributeGetter: "cleanArea",
        unitGetter: "areaUnit",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "clean_time",
        name: "Cleaning time",
        container: this,
        attributeGetter: "cleanTimeMinutes",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "clean_progress",
        name: "Cleaning progress",
        container: this,
        attributeGetter: "cleanProgress",
        unitGetter: () => "%",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );
  }

  override async postUpdateHook(): Promise<void> {
    const errors = (this.vacStatus.err_status as number[] | undefined) ?? [];
    if (errors.length === 0) {
      this.errorCode = VacuumErrorCode.Ok;
      return;
    }
    const error = errors[0] as number;
    this.errorCode =
      error in VacuumErrorCode
        ? (error as VacuumErrorCode)
        : VacuumErrorCode.UnknownInternal;
  }

  override query(): Record<string, unknown> {
    return {
      getVacStatus: {},
      getCleanInfo: {},
      getCarpetClean: {},
      getAreaUnit: {},
      getBatteryInfo: {},
      getCleanStatus: {},
      getCleanAttr: { type: "global" },
      getMapInfo: {},
    };
  }

  async start(): Promise<Record<string, unknown>> {
    if (this.status === VacuumStatus.Paused) return this.resume();
    return this.call("setSwitchClean", {
      clean_mode: CleanMode.StandardHome,
      clean_on: true,
      clean_order: true,
      force_clean: false,
    });
  }

  async pause(): Promise<Record<string, unknown>> {
    if (this.status === VacuumStatus.GoingHome) return this.setReturnHome(false);
    return this.setPause(true);
  }

  async resume(): Promise<Record<string, unknown>> {
    return this.setPause(false);
  }

  async setPause(enabled: boolean): Promise<Record<string, unknown>> {
    return this.call("setRobotPause", { pause: enabled });
  }

  async returnHome(): Promise<Record<string, unknown>> {
    return this.setReturnHome(true);
  }

  async setReturnHome(enabled: boolean): Promise<Record<string, unknown>> {
    return this.call("setSwitchCharge", { switch_charge: enabled });
  }

  get error(): VacuumErrorCode {
    return this.errorCode;
  }

  get fanSpeedPreset(): string {
    return FanSpeed[this.settings.suction as number] as string;
  }

  async setFanSpeedPreset(speed: string): Promise<Record<string, unknown>> {
    const value = FanSpeed[speed as keyof typeof FanSpeed];
    if (value === undefined) throw new Error(`Invalid fan speed ${speed}`);
    return this.changeSetting("suction", value);
  }

  private async changeSetting(
    name: string,
    value: number,
    scope: "global" | "pose" = "global",
  ): Promise<Record<string, unknown>> {
    return this.call("setCleanAttr", { [name]: value, type: scope });
  }

  get battery(): number {
    return (this.data.getBatteryInfo as { battery_percentage: number })
      .battery_percentage;
  }

  private get vacStatus(): Record<string, unknown> {
    return this.data.getVacStatus as Record<string, unknown>;
  }

  private get info(): Record<string, unknown> {
    return this.data.getCleanInfo as Record<string, unknown>;
  }

  private get settings(): Record<string, unknown> {
    return this.data.getCleanAttr as Record<string, unknown>;
  }

  get status(): VacuumStatus {
    if (this.errorCode !== VacuumErrorCode.Ok) return VacuumStatus.Error;
    const statusCode = this.vacStatus.status as number;
    return statusCode in VacuumStatus
      ? (statusCode as VacuumStatus)
      : VacuumStatus.UnknownInternal;
  }

  get carpetBoost(): boolean {
    return (
      (this.data.getCarpetClean as { carpet_clean_prefer: string })
        .carpet_clean_prefer === "boost"
    );
  }

  async setCarpetBoost(on: boolean): Promise<Record<string, unknown>> {
    return this.call("setCarpetClean", { carpet_clean_prefer: on ? "boost" : "normal" });
  }

  get areaUnit(): AreaUnit {
    return (this.data.getAreaUnit as { area_unit: AreaUnit }).area_unit;
  }

  get cleanArea(): number {
    return this.info.clean_area as number;
  }

  get cleanTimeMinutes(): number {
    return this.info.clean_time as number;
  }

  get cleanProgress(): number {
    return this.info.clean_percent as number;
  }

  get cleanCount(): number {
    return this.settings.clean_number as number;
  }

  async setCleanCount(count: number): Promise<Record<string, unknown>> {
    return this.changeSetting("clean_number", count);
  }

  get currentMapId(): number {
    return (this.data.getMapInfo as { current_map_id: number }).current_map_id;
  }

  get currentMapName(): string | undefined {
    const mapInfo = this.data.getMapInfo as {
      current_map_id: number;
      map_list?: Record<string, unknown>[];
    };
    const currentId = mapInfo.current_map_id;
    const map = (mapInfo.map_list ?? []).find((m) => m.map_id === currentId);
    const rawName = map?.map_name as string | undefined;
    if (!rawName) return undefined;
    try {
      return Buffer.from(rawName, "base64").toString("utf-8");
    } catch {
      return rawName;
    }
  }

  get cleanType(): CleanMode | undefined {
    const cs = this.data.getCleanStatus as { clean_status?: CleanMode } | undefined;
    return cs?.clean_status;
  }

  async cleanRooms(
    roomIds: number[],
    options?: { mapId?: number },
  ): Promise<Record<string, unknown>> {
    if (roomIds.length === 0) throw new Error("roomIds must not be empty");
    const mapId = options?.mapId ?? this.currentMapId;
    return this.call("setSwitchClean", {
      clean_mode: CleanMode.Room,
      clean_on: true,
      clean_order: true,
      force_clean: false,
      map_id: mapId,
      room_list: roomIds,
      start_type: START_TYPE_DEFAULT,
    });
  }

  async getRooms(mapId?: number): Promise<RoomInfo[]> {
    const targetMapId = mapId ?? this.currentMapId;
    const resp = await this.call("getMapData", {
      map_id: targetMapId,
      type: MAP_DATA_TYPE_DEFAULT,
    });
    const mapData = (resp.getMapData ?? resp) as {
      area_list?: Record<string, unknown>[];
    };

    const rooms: RoomInfo[] = [];
    for (const area of mapData.area_list ?? []) {
      if (area.type !== AreaType.Room) continue;
      let name: string | undefined;
      const rawName = area.name as string | undefined;
      if (rawName) {
        try {
          name = Buffer.from(rawName, "base64").toString("utf-8");
        } catch {
          name = rawName;
        }
      }
      const suctionVal = area.suction as number | undefined;
      rooms.push({
        id: area.id as number,
        name,
        color: (area.color as number) ?? 0,
        suction: suctionVal ? (suctionVal as FanSpeed) : undefined,
        cistern: (area.cistern as number) ?? 0,
        cleanNumber: (area.clean_number as number) ?? 0,
      });
    }
    return rooms;
  }
}
