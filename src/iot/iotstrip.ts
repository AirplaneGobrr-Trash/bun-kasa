import type { Device } from "../core/device.ts";
import { DeviceType } from "../core/device_type.ts";
import { EmeterStatus } from "../core/emeterstatus.ts";
import { KasaException } from "../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import { CommonModules } from "../core/modulenames.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import type { Energy } from "../interfaces/energy.ts";
import { EnergyModuleFeature, initializeEnergyFeatures } from "../interfaces/energy.ts";
import { IotDevice } from "./iotdevice.ts";
import { IotModule } from "./iotmodule.ts";
import { IotPlug } from "./iotplug.ts";
import { IotModules } from "./modulenames.ts";
import {
  Antitheft,
  Cloud,
  Countdown,
  Emeter,
  HomeKit,
  Led,
  Schedule,
  Time,
  Usage,
} from "./modules/index.ts";

function sum(values: (number | undefined)[]): number {
  return values.reduce((total: number, v) => total + (v ?? 0), 0);
}

/**
 * Representation of a TP-Link Smart Power Strip (HS300, HS107, KP303, ...).
 *
 * A strip consists of the parent device and its children. All methods of the parent
 * act on all children, while the child devices share the common API with
 * {@link IotPlug}.
 */
export class IotStrip extends IotDevice {
  constructor(host: string, protocol: BaseProtocol) {
    super(host, protocol);
    this.deviceTypeValue = DeviceType.Strip;
  }

  override async initializeModules(): Promise<void> {
    // Strip has different modules to plug, so do not call super.
    this.addModule(IotModules.IotAntitheft, new Antitheft(this, "anti_theft"));
    this.addModule(IotModules.IotSchedule, new Schedule(this, "schedule"));
    this.addModule(IotModules.IotUsage, new Usage(this, "schedule"));
    this.addModule(CommonModules.Time, new Time(this, "time"));
    this.addModule(IotModules.IotCountdown, new Countdown(this, "countdown"));
    this.addModule(CommonModules.Led, new Led(this, "system"));
    this.addModule(IotModules.IotCloud, new Cloud(this, "cnCloud"));
    this.addModule(IotModules.IotHomeKit, new HomeKit(this, "smartlife.iot.homekit"));
    if (this.hasEmeter) {
      this.addModule(CommonModules.Energy, new StripEmeter(this, this.emeterType));
    }
  }

  override get isOn(): boolean {
    return this.children.some((plug) => plug.isOn);
  }

  override async update(updateChildren = true): Promise<void> {
    await super.update(updateChildren);

    if (this.childDevices.size === 0) {
      const children = this.sysInfo.children as Record<string, unknown>[];
      const childMap = new Map<string, Device>();
      for (const child of children) {
        const childId = child.id as string;
        const plug = new IotStripPlug(this.host, this, childId);
        childMap.set(`${this.mac}_${childId}`, plug);
      }
      this.childDevices = childMap;
      for (const child of this.stripChildren()) {
        await child.initializeModules();
      }
    }

    if (updateChildren) {
      for (const plug of this.stripChildren()) {
        await plug.update(updateChildren);
      }
    }

    if (this.featureMap.size === 0) {
      await this.initializeFeatures();
    }
  }

  private stripChildren(): IotStripPlug[] {
    return this.children as IotStripPlug[];
  }

  protected override async initializeFeatures(): Promise<void> {
    // Do not initialize features until children are created.
    if (this.children.length === 0) return;
    await super.initializeFeatures();
  }

  override async turnOn(): Promise<Record<string, unknown>> {
    for (const plug of this.children) {
      if (plug.isOff) await plug.turnOn();
    }
    return {};
  }

  override async turnOff(): Promise<Record<string, unknown>> {
    for (const plug of this.children) {
      if (plug.isOn) await plug.turnOff();
    }
    return {};
  }

  override get onSince(): Date | undefined {
    if (this.isOff) return undefined;
    const times = this.children
      .map((plug) => plug.onSince)
      .filter((t): t is Date => t !== undefined);
    if (times.length === 0) return undefined;
    return new Date(Math.min(...times.map((t) => t.getTime())));
  }
}

/** Energy module implementation that aggregates the strip's child modules. */
export class StripEmeter extends IotModule implements Energy {
  private readonly supportedFeatures =
    EnergyModuleFeature.CONSUMPTION_TOTAL |
    EnergyModuleFeature.PERIODIC_STATS |
    EnergyModuleFeature.VOLTAGE_CURRENT;

  private get children(): IotPlug[] {
    return this.iotDevice.children as unknown as IotPlug[];
  }

  private childEnergy(plug: IotPlug): Energy {
    return plug.modules.getRequired(CommonModules.Energy);
  }

  override initializeFeatures(): void {
    initializeEnergyFeatures(this, this.supportedFeatures);
  }

  supports(feature: EnergyModuleFeature): boolean {
    return (this.supportedFeatures & feature) !== 0;
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get currentConsumption(): number | undefined {
    return sum(this.children.map((plug) => this.childEnergy(plug).currentConsumption));
  }

  get consumptionThisMonth(): number | undefined {
    return sum(this.children.map((plug) => this.childEnergy(plug).consumptionThisMonth));
  }

  get consumptionToday(): number | undefined {
    return sum(this.children.map((plug) => this.childEnergy(plug).consumptionToday));
  }

  get consumptionTotal(): number | undefined {
    return sum(this.children.map((plug) => this.childEnergy(plug).consumptionTotal));
  }

  get status(): EmeterStatus {
    const statuses = this.children.map((plug) => this.childEnergy(plug).status);
    return new EmeterStatus({
      voltage: sum(statuses.map((s) => s.voltage)) / Math.max(statuses.length, 1),
      power: sum(statuses.map((s) => s.power)),
      current: sum(statuses.map((s) => s.current)),
      total: sum(statuses.map((s) => s.total)),
    });
  }

  get current(): number | undefined {
    return this.status.current;
  }

  get voltage(): number | undefined {
    return this.status.voltage;
  }

  async getStatus(): Promise<EmeterStatus> {
    const statuses = await Promise.all(
      this.children.map((plug) => this.childEnergy(plug).getStatus()),
    );
    return new EmeterStatus({
      voltage: sum(statuses.map((s) => s.voltage)) / Math.max(statuses.length, 1),
      power: sum(statuses.map((s) => s.power)),
      current: sum(statuses.map((s) => s.current)),
      total: sum(statuses.map((s) => s.total)),
    });
  }

  async getDailyStats(options?: {
    year?: number;
    month?: number;
    kwh?: boolean;
  }): Promise<Record<string, unknown>> {
    const results = await Promise.all(
      this.children.map((plug) => this.childEnergy(plug).getDailyStats(options)),
    );
    return mergeNumericRecords(results as Record<string, number>[]);
  }

  async getMonthlyStats(options?: { year?: number; kwh?: boolean }): Promise<
    Record<string, unknown>
  > {
    const results = await Promise.all(
      this.children.map((plug) => this.childEnergy(plug).getMonthlyStats(options)),
    );
    return mergeNumericRecords(results as Record<string, number>[]);
  }

  async eraseStats(): Promise<Record<string, unknown>> {
    for (const plug of this.children) {
      await this.childEnergy(plug).eraseStats();
    }
    return {};
  }
}

function mergeNumericRecords(records: Record<string, number>[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

/**
 * Representation of a single socket in a power strip.
 *
 * Instead of updating a socket directly, update the parent {@link IotStrip}.
 */
export class IotStripPlug extends IotPlug {
  readonly childId: string;
  private readonly parentStrip: IotStrip;

  constructor(host: string, parent: IotStrip, childId: string) {
    super(host, parent.protocol);
    this.parentStrip = parent;
    this.childId = childId;
    this.lastUpdate = parent.lastUpdate;
    this.setSysInfo(parent.sysInfo);
    this.deviceTypeValue = DeviceType.StripSocket;
  }

  override async initializeModules(): Promise<void> {
    if (this.hasEmeter) {
      this.addModule(CommonModules.Energy, new Emeter(this, this.emeterType));
    }
    this.addModule(IotModules.IotUsage, new Usage(this, "schedule"));
    this.addModule(IotModules.IotAntitheft, new Antitheft(this, "anti_theft"));
    this.addModule(IotModules.IotSchedule, new Schedule(this, "schedule"));
    this.addModule(IotModules.IotCountdown, new Countdown(this, "countdown"));
    // Note: no Time module on the child; time is delegated to the parent.
  }

  protected override async initializeFeatures(): Promise<void> {
    this.addFeature(
      new Feature(this, {
        id: "state",
        name: "State",
        attributeGetter: "isOn",
        attributeSetter: "setState",
        type: FeatureType.Switch,
        category: FeatureCategory.Primary,
      }),
    );
    this.addFeature(
      new Feature(this, {
        id: "on_since",
        name: "On since",
        attributeGetter: "onSince",
        icon: "mdi:clock",
        category: FeatureCategory.Info,
        type: FeatureType.Sensor,
      }),
    );

    for (const module of this.modules.values()) {
      module.initializeFeatures();
      for (const feature of module.allFeatures.values()) {
        this.addFeature(feature);
      }
    }
  }

  /** Update this socket. Called by the parent strip's own {@link IotStrip.update}. */
  override async update(_updateChildren = true): Promise<void> {
    await this.modularUpdate({});
    for (const module of this.iotModules.values()) {
      await module.postUpdateHook();
    }
    if (this.featureMap.size === 0) {
      await this.initializeFeatures();
    }
  }

  override createRequest(
    target: string,
    cmd: string,
    arg?: Record<string, unknown>,
  ): Record<string, unknown> {
    return { context: { child_ids: [this.childId] }, [target]: { [cmd]: arg ?? {} } };
  }

  override async queryHelper(
    target: string,
    cmd: string,
    arg?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.parentStrip.queryHelper(target, cmd, arg, [this.childId]);
  }

  override get isOn(): boolean {
    return Boolean(this.getChildInfo().state);
  }

  /**
   * Legacy strip-plug led state, always false for subdevices (see
   * python-kasa's `IotStripPlug.led`). Named `ledState` rather than `led` to
   * avoid colliding with {@link Device.led}, the `Led` module convenience getter.
   */
  get ledState(): boolean {
    return false;
  }

  override get time(): Date {
    return this.parentStrip.time;
  }

  override get timezone(): string {
    return this.parentStrip.timezone;
  }

  override get deviceId(): string {
    return `${this.mac}_${this.childId}`;
  }

  override get alias(): string | undefined {
    return this.getChildInfo().alias as string | undefined;
  }

  get nextAction(): unknown {
    return this.getChildInfo().next_action;
  }

  override get onSince(): Date | undefined {
    if (this.isOff) {
      this.onSinceCache = undefined;
      return undefined;
    }
    const info = this.getChildInfo();
    const onTimeSec = info.on_time as number;
    const time = this.parentStrip.time;
    const onSince = new Date(time.getTime() - onTimeSec * 1000);
    if (
      !this.onSinceCache ||
      Math.abs(onSince.getTime() - this.onSinceCache.getTime()) > 5000
    ) {
      this.onSinceCache = onSince;
    }
    return this.onSinceCache;
  }

  override get model(): string {
    return `Socket for ${this.parentStrip.sysInfo.model}`;
  }

  private getChildInfo(): Record<string, unknown> {
    const children = this.parentStrip.sysInfo.children as Record<string, unknown>[];
    const found = children.find((child) => child.id === this.childId);
    if (!found) throw new KasaException(`Unable to find children ${this.childId}`);
    return found;
  }
}
