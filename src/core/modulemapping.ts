import { KasaException } from "./exceptions.ts";

/**
 * A branded string identifying a module by name, carrying its module type `T`
 * for static typing purposes only (no runtime effect, mirrors Python's
 * `ModuleName(str, Generic[T])`).
 */
export type ModuleName<T> = string & { readonly __moduleBrand?: T };

/** Create a `ModuleName<T>` from a plain string. */
export function moduleName<T>(name: string): ModuleName<T> {
  return name as ModuleName<T>;
}

/** Typed collection of a device's modules, keyed by module name. */
export class ModuleMapping<M> implements Iterable<[string, M]> {
  private readonly map = new Map<string, M>();

  set(name: string, module: M): void {
    this.map.set(name, module);
  }

  /**
   * Get a module by name, typed as `T`.
   *
   * `T` is intentionally not constrained to `M`: common cross-family module names
   * (e.g. `CommonModules.Time`) are typed against interfaces (`interfaces.Time`)
   * rather than a specific family's module base class, since a `ModuleMapping<M>`
   * can hold instances of any concrete class that structurally implements `T`.
   */
  get<T>(name: ModuleName<T>): T | undefined {
    return this.map.get(name) as T | undefined;
  }

  /** Like {@link get}, but throws if the module is not supported by the device. */
  getRequired<T>(name: ModuleName<T>): T {
    const module = this.get(name);
    if (!module) {
      throw new KasaException(`Module ${name} not supported`);
    }
    return module;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  values(): IterableIterator<M> {
    return this.map.values();
  }

  entries(): IterableIterator<[string, M]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, M]> {
    return this.map.entries();
  }
}
