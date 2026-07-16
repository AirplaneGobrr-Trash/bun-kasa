import { DeviceError, KasaException, SmartErrorCode } from "../core/exceptions.ts";
import { Module } from "../core/module.ts";
import type { SmartDevice } from "./smartdevice.ts";

const MINIMUM_HUB_CHILD_UPDATE_INTERVAL_SECS = 60 * 60 * 24;
const UPDATE_INTERVAL_AFTER_ERROR_SECS = 30;
const DISABLE_AFTER_ERROR_COUNT = 10;

/** Base class for SMART (Tapo/newer Kasa) modules. */
export abstract class SmartModule extends Module {
  /** Module is initialized if the given component is available. */
  static readonly requiredComponent: string | null = null;
  /** Module is initialized if any of the given keys exist in sysinfo. */
  static readonly sysinfoLookupKeys: string[] = [];
  /** Query to execute during the main update cycle. */
  static readonly queryGetterName: string = "";

  minimumUpdateIntervalSecs = 0;

  private lastUpdateTime: number | undefined;
  private lastUpdateError: KasaException | undefined;
  private errorCount = 0;

  protected get smartDevice(): SmartDevice {
    return this.deviceRef as SmartDevice;
  }

  /** Name the module is registered under. Defaults to the class name. */
  get name(): string {
    return this.constructor.name;
  }

  protected get requiredComponent(): string | null {
    return (this.constructor as typeof SmartModule).requiredComponent;
  }

  protected get queryGetterName(): string {
    return (this.constructor as typeof SmartModule).queryGetterName;
  }

  setError(err: unknown | undefined): void {
    if (err === undefined) {
      this.errorCount = 0;
      this.lastUpdateError = undefined;
    } else {
      this.lastUpdateError = new KasaException("Module update error", { cause: err });
      this.errorCount += 1;
    }
  }

  get lastUpdateErrorValue(): KasaException | undefined {
    return this.lastUpdateError;
  }

  setLastUpdateTime(time: number | undefined): void {
    this.lastUpdateTime = time;
  }

  get updateInterval(): number {
    if (this.lastUpdateError) return UPDATE_INTERVAL_AFTER_ERROR_SECS * this.errorCount;
    if (this.smartDevice.isHubChild) return MINIMUM_HUB_CHILD_UPDATE_INTERVAL_SECS;
    return this.minimumUpdateIntervalSecs;
  }

  get disabled(): boolean {
    return this.errorCount >= DISABLE_AFTER_ERROR_COUNT;
  }

  shouldUpdate(updateTimeSecs: number): boolean {
    return (
      !this.updateInterval ||
      this.lastUpdateTime === undefined ||
      updateTimeSecs - this.lastUpdateTime >= this.updateInterval
    );
  }

  override async postUpdateHook(): Promise<void> {
    if (!this.data) throw new KasaException("Module data is empty");
  }

  override query(): Record<string, unknown> {
    if (this.queryGetterName) return { [this.queryGetterName]: null };
    return {};
  }

  async call(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.smartDevice.queryHelper(method, params);
  }

  /** Optional response keys: errors on these keys are removed instead of raised. */
  get optionalResponseKeys(): string[] {
    return [];
  }

  override get data(): Record<string, unknown> {
    const dev = this.smartDevice;
    const q = this.query();

    if (Object.keys(q).length === 0) return dev.sysInfo;

    const queryKeys = Object.keys(q);
    const queryKey = queryKeys[0] as string;

    let source = dev;
    if (!dev.hasLastUpdateKey(queryKey)) {
      const parent = dev.parentSmartDevice;
      if (parent?.hasLastUpdateKey(queryKey)) {
        source = parent;
      } else {
        throw new KasaException(
          `You need to call update() prior accessing module data for '${this.moduleKey}'`,
        );
      }
    }

    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(source.lastUpdate)) {
      if (queryKeys.includes(key)) filtered[key] = source.lastUpdate[key];
    }

    const removeKeys: string[] = [];
    for (const key of Object.keys(filtered)) {
      const value = filtered[key];
      if (typeof value === "number" && SmartErrorCode[value] !== undefined) {
        if (this.optionalResponseKeys.includes(key)) {
          removeKeys.push(key);
        } else {
          throw new DeviceError(`${key} for ${this.name}`, {
            errorCode: value as SmartErrorCode,
          });
        }
      }
    }
    for (const key of removeKeys) delete filtered[key];

    const remainingKeys = Object.keys(filtered);
    if (remainingKeys.length === 1 && removeKeys.length === 0) {
      return filtered[remainingKeys[0] as string] as Record<string, unknown>;
    }

    return filtered;
  }

  /** Version supported by the device, or -1 if the module has no required component. */
  get supportedVersion(): number {
    if (this.requiredComponent !== null) {
      return this.smartDevice.components[this.requiredComponent] ?? -1;
    }
    return -1;
  }

  /**
   * Additional check to see if the module is supported by the device.
   *
   * Used for parents that report components available only on a child, or for
   * modules where the device reports a component but doesn't really support it.
   */
  async checkSupported(): Promise<boolean> {
    return true;
  }

  hasDataError(): boolean {
    try {
      return !this.data;
    } catch (ex) {
      if (ex instanceof DeviceError) return true;
      throw ex;
    }
  }
}
