import { KasaException } from "../core/exceptions.ts";
import { Module } from "../core/module.ts";
import type { IotDevice } from "./iotdevice.ts";

/** Recursively merge `source` into `dest`, mutating and returning `dest`. */
export function merge(
  dest: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    if (
      key in dest &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof dest[key] === "object" &&
      dest[key] !== null &&
      !Array.isArray(dest[key])
    ) {
      merge(dest[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      dest[key] = value;
    }
  }
  return dest;
}

/** Base class implementation for all IOT modules. */
export abstract class IotModule extends Module {
  protected get iotDevice(): IotDevice {
    return this.deviceRef as IotDevice;
  }

  async call(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.iotDevice.queryHelper(this.moduleKey, method, params);
  }

  queryForCommand(
    query: string,
    params?: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.iotDevice.createRequest(this.moduleKey, query, params);
  }

  /**
   * Estimated maximum size of a query response, used to decide when to split queries
   * across multiple requests. Modules with larger responses should override this.
   */
  get estimatedQueryResponseSize(): number {
    return 256;
  }

  override get data(): Record<string, unknown> {
    const dev = this.iotDevice;
    const q = this.query();

    if (Object.keys(q).length === 0) return dev.sysInfo;

    if (!dev.hasLastUpdateKey(this.moduleKey)) {
      throw new KasaException(
        `You need to call update() prior accessing module data for '${this.moduleKey}'`,
      );
    }

    return dev.getLastUpdateValue(this.moduleKey) as Record<string, unknown>;
  }

  /** Return whether the module is supported by the device. */
  get isSupported(): boolean {
    if (!this.iotDevice.hasLastUpdateKey(this.moduleKey)) return true;
    return !("err_code" in this.data);
  }
}
