import type { Device } from "./device.ts";
import type { Module } from "./module.ts";

/** Type to help decide how to present the feature. */
export enum FeatureType {
  /** Sensor is an informative read-only value */
  Sensor = "Sensor",
  /** BinarySensor is a read-only boolean */
  BinarySensor = "BinarySensor",
  /** Switch is a boolean setting */
  Switch = "Switch",
  /** Action triggers some action on device */
  Action = "Action",
  /** Number defines a numeric setting */
  Number = "Number",
  /** Choice defines a setting with pre-defined values */
  Choice = "Choice",
  Unknown = "Unknown",
}

/** Category hint to allow feature grouping. */
export enum FeatureCategory {
  /** Primary features control the device state directly. */
  Primary = "Primary",
  /** Config features change device behavior without immediate state changes. */
  Config = "Config",
  /** Informative/sensor features deliver some potentially interesting information. */
  Info = "Info",
  /** Debug features deliver more verbose information than informative features. */
  Debug = "Debug",
  /** The default category if none is specified. */
  Unset = "Unset",
}

type FeatureValue = number | boolean | string | undefined;

type AttributeGetter = string | ((container: Device | Module) => FeatureValue);
type AttributeSetter =
  | string
  | ((container: Device | Module, value?: FeatureValue) => Promise<unknown>);

export interface FeatureOptions {
  /** Identifier */
  id: string;
  /** User-friendly short description */
  name: string;
  /** Type of the feature */
  type: FeatureType;
  /** Property name or callable that allows accessing the value */
  attributeGetter?: AttributeGetter;
  /** Method name or callable coroutine that allows changing the value */
  attributeSetter?: AttributeSetter;
  /** Container storing the data; overrides `device` for getters */
  container?: Device | Module;
  /** Icon suggestion */
  icon?: string;
  /** Property name or callable returning the unit */
  unitGetter?: string | (() => string | undefined);
  /** Category hint for downstreams */
  category?: FeatureCategory;
  /** Hint for rounding sensor values to N digits after the decimal point */
  precisionHint?: number;
  /** Property name or callable returning [minimum, maximum] */
  rangeGetter?: string | (() => [number, number]);
  /** Property name or callable returning the list of choices */
  choicesGetter?: string | (() => string[] | undefined);
}

const DEFAULT_MAX = 2 ** 16;

/** Generic interface for device features. */
export class Feature {
  static readonly DEFAULT_MAX = DEFAULT_MAX;

  device: Device;
  id: string;
  name: string;
  type: FeatureType;
  attributeGetter?: AttributeGetter;
  attributeSetter?: AttributeSetter;
  icon?: string;
  unitGetter?: string | (() => string | undefined);
  category: FeatureCategory;
  precisionHint?: number;
  rangeGetter?: string | (() => [number, number]);
  choicesGetter?: string | (() => string[] | undefined);

  private readonly container: Device | Module;

  constructor(device: Device, options: FeatureOptions) {
    this.device = device;
    this.id = options.id;
    this.name = options.name;
    this.type = options.type;
    this.attributeGetter = options.attributeGetter;
    this.attributeSetter = options.attributeSetter;
    this.icon = options.icon;
    this.unitGetter = options.unitGetter;
    this.precisionHint = options.precisionHint;
    this.rangeGetter = options.rangeGetter;
    this.choicesGetter = options.choicesGetter;
    this.container = options.container ?? device;

    let category = options.category ?? FeatureCategory.Unset;
    if (category === FeatureCategory.Unset) {
      category = this.attributeSetter ? FeatureCategory.Config : FeatureCategory.Info;
    }
    this.category = category;

    if (this.type === FeatureType.Sensor || this.type === FeatureType.BinarySensor) {
      if (this.category === FeatureCategory.Config) {
        throw new Error(
          `Invalid type for configurable feature: ${this.name} (${this.id}): ${this.type}`,
        );
      }
      if (this.attributeSetter !== undefined) {
        throw new Error(
          `Read-only feature defines attributeSetter: ${this.name} (${this.id})`,
        );
      }
    }
  }

  private getPropertyValue<T>(getter: string | (() => T) | undefined): T | undefined {
    if (getter === undefined) return undefined;
    if (typeof getter === "string") {
      return (this.container as unknown as Record<string, T>)[getter];
    }
    return getter();
  }

  get choices(): string[] | undefined {
    return this.getPropertyValue(this.choicesGetter);
  }

  get unit(): string | undefined {
    return this.getPropertyValue(this.unitGetter);
  }

  get range(): [number, number] | undefined {
    return this.getPropertyValue(this.rangeGetter);
  }

  get maximumValue(): number {
    return this.range?.[1] ?? DEFAULT_MAX;
  }

  get minimumValue(): number {
    return this.range?.[0] ?? 0;
  }

  get value(): FeatureValue {
    if (this.type === FeatureType.Action) return "<Action>";
    if (this.attributeGetter === undefined) {
      throw new Error("Not an action and no attributeGetter set");
    }
    if (typeof this.attributeGetter === "function") {
      return this.attributeGetter(this.container);
    }
    return (this.container as unknown as Record<string, FeatureValue>)[
      this.attributeGetter
    ];
  }

  async setValue(value: FeatureValue): Promise<unknown> {
    if (this.attributeSetter === undefined) {
      throw new Error("Tried to set read-only feature.");
    }
    if (this.type === FeatureType.Number) {
      if (typeof value !== "number") {
        throw new Error("value must be a number");
      }
      if (value < this.minimumValue || value > this.maximumValue) {
        throw new Error(
          `Value ${value} out of range [${this.minimumValue}, ${this.maximumValue}]`,
        );
      }
    } else if (this.type === FeatureType.Choice) {
      if (!this.choices || typeof value !== "string" || !this.choices.includes(value)) {
        throw new Error(
          `Unexpected value for ${this.name}: '${value}' - allowed: ${this.choices}`,
        );
      }
    }

    if (typeof this.attributeSetter === "function") {
      if (this.type === FeatureType.Action) {
        return this.attributeSetter(this.container);
      }
      return this.attributeSetter(this.container, value);
    }

    const setterName = this.attributeSetter;
    const method = (
      this.container as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >
    )[setterName];
    if (!method) {
      throw new Error(
        `No method named ${setterName} on ${this.container.constructor.name}`,
      );
    }
    if (this.type === FeatureType.Action) {
      return method.call(this.container);
    }
    return method.call(this.container, value);
  }
}
