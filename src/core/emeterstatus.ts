const VALID_KEYS = [
  "voltage_mv",
  "power_mw",
  "current_ma",
  "energy_wh",
  "total_wh",
  "voltage",
  "power",
  "current",
  "total",
  "energy",
] as const;

/**
 * Container for converting different representations of emeter data.
 *
 * Newer FW/HW versions postfix the variable names with the used units,
 * where older ones do not. This class converts between the two so callers
 * can request either representation regardless of what the device reported.
 */
export class EmeterStatus {
  private readonly data: Record<string, number>;

  constructor(data: Record<string, number>) {
    this.data = data;
  }

  get voltage(): number | undefined {
    return this.get("voltage");
  }

  get power(): number | undefined {
    return this.get("power");
  }

  get current(): number | undefined {
    return this.get("current");
  }

  get total(): number | undefined {
    return this.get("total");
  }

  /** Return the value converted to the requested unit key. */
  get(item: string): number | undefined {
    if (item in this.data) {
      return this.data[item];
    }
    if (!(VALID_KEYS as readonly string[]).includes(item)) {
      throw new Error(`Unknown emeter key: ${item}`);
    }

    const underscoreIndex = item.indexOf("_");
    if (underscoreIndex !== -1) {
      // upscale, e.g. "voltage_mv" from "voltage"
      const base = item.slice(0, underscoreIndex);
      const baseValue = this.data[base];
      return baseValue === undefined ? undefined : baseValue * 1000;
    }

    // downscale, e.g. "voltage" from "voltage_mv"
    for (const key of Object.keys(this.data)) {
      if (key.startsWith(item)) {
        const value = this.get(key);
        if (value !== undefined) return value / 1000;
      }
    }
    return undefined;
  }

  toString(): string {
    return `<EmeterStatus power=${this.power} voltage=${this.voltage} current=${this.current} total=${this.total}>`;
  }
}
