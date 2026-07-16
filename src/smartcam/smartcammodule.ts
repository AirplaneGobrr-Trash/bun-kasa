import { DeviceError, KasaException, SmartErrorCode } from "../core/exceptions.ts";
import { SmartModule } from "../smart/smartmodule.ts";
import type { SmartCamDevice } from "./smartcamdevice.ts";

/** Base class for SMARTCAM modules. */
export abstract class SmartCamModule extends SmartModule {
  /** Section name(s) to be queried within the module's response. */
  static readonly querySectionNames: string | string[] | null = null;
  /** Module name to be queried (the key nested under the getter response). */
  static readonly queryModuleName: string = "";

  protected get smartCamDevice(): SmartCamDevice {
    return this.deviceRef as SmartCamDevice;
  }

  protected get querySectionNames(): string | string[] | null {
    return (this.constructor as typeof SmartCamModule).querySectionNames;
  }

  protected get queryModuleName(): string {
    return (this.constructor as typeof SmartCamModule).queryModuleName;
  }

  override query(): Record<string, unknown> {
    if (!this.queryGetterName) return {};
    const sectionNames = this.querySectionNames ? { name: this.querySectionNames } : {};
    return { [this.queryGetterName]: { [this.queryModuleName]: sectionNames } };
  }

  override async call(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.smartCamDevice.queryHelper(method, params);
  }

  override get data(): Record<string, unknown> {
    const dev = this.smartCamDevice;
    const q = this.query();

    if (Object.keys(q).length === 0) return dev.sysInfo;

    const qKeys = Object.keys(q);
    if (qKeys.length === 1) {
      const queryResp =
        (dev.lastUpdate[this.queryGetterName] as Record<string, unknown>) ?? {};
      if (typeof queryResp === "number" && SmartErrorCode[queryResp] !== undefined) {
        throw new DeviceError(`Error accessing module data in ${this.moduleKey}`, {
          errorCode: queryResp as SmartErrorCode,
        });
      }
      if (Object.keys(queryResp).length === 0) {
        throw new KasaException(
          `You need to call update() prior accessing module data for '${this.moduleKey}'`,
        );
      }
      return (queryResp[this.queryModuleName] as Record<string, unknown>) ?? queryResp;
    }

    const found: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dev.lastUpdate)) {
      if (qKeys.includes(key)) found[key] = value;
    }
    for (const key of qKeys) {
      if (!(key in found)) {
        throw new KasaException(
          `${key} not found, you need to call update() prior accessing module data for '${this.moduleKey}'`,
        );
      }
      const value = found[key];
      if (typeof value === "number" && SmartErrorCode[value] !== undefined) {
        throw new DeviceError(`Error accessing module data ${key} in ${this.moduleKey}`, {
          errorCode: value as SmartErrorCode,
        });
      }
    }
    return found;
  }
}
