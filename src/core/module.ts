import type { Device } from "./device.ts";
import { KasaException } from "./exceptions.ts";
import type { Feature } from "./feature.ts";

/**
 * Base class for all modules.
 *
 * Implementing modules should implement {@link query} to return the query they
 * want executed during the regular update cycle, and the abstract {@link data}
 * getter to return their slice of the last update's raw response.
 */
export abstract class Module {
  protected readonly moduleFeatures = new Map<string, Feature>();

  constructor(
    protected readonly deviceRef: Device,
    protected readonly moduleKey: string,
  ) {}

  get device(): Device {
    return this.deviceRef;
  }

  /** Get the features for this module (and any submodules). */
  get allFeatures(): ReadonlyMap<string, Feature> {
    return this.moduleFeatures;
  }

  /** Return true if the module exposes a feature with the given id. */
  hasFeature(id: string): boolean {
    return this.moduleFeatures.has(id);
  }

  /** Get a `Feature` by id, or undefined if not supported. */
  getFeature(id: string): Feature | undefined {
    return this.moduleFeatures.get(id);
  }

  /** Query to execute during the update cycle. */
  abstract query(): Record<string, unknown>;

  /** Return the module-specific raw data from the last update. */
  abstract get data(): unknown;

  /**
   * Initialize features after the initial update.
   *
   * Implement this if features depend on module query responses. Called once per
   * module, after {@link postUpdateHook} has run for every device module (and its
   * children's modules).
   */
  initializeFeatures(): void {
    // no-op by default
  }

  /**
   * Perform actions after a device update.
   *
   * Implement this if a module needs to perform actions each time the device has
   * updated, such as generating collections for property access. Called after
   * every update, and before {@link initializeFeatures} on the first update.
   */
  async postUpdateHook(): Promise<void> {
    // no-op by default
  }

  /**
   * Register a feature exposed by this module.
   *
   * Public (rather than protected) so that shared mixin-style helper functions for
   * interfaces like `Energy`/`Led`/`LightEffect` (see `src/interfaces/`) can add
   * features on behalf of a concrete module without needing to be part of its class
   * hierarchy — TS classes cannot use Python-style multiple inheritance.
   */
  addFeature(feature: Feature): void {
    if (this.moduleFeatures.has(feature.id)) {
      throw new KasaException(`Duplicate id detected ${feature.id}`);
    }
    this.moduleFeatures.set(feature.id, feature);
  }

  toString(): string {
    return `<Module ${this.constructor.name} (${this.moduleKey}) for ${this.deviceRef.host}>`;
  }
}
