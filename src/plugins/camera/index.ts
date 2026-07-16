/**
 * Entrypoint for the Camera monkey-patches. Two ways to load them, without editing
 * anything under src/smartcam/:
 *
 *   // Load everything (simplest — matches every capability test.ts exercises):
 *   import { camera } from "bun-kasa/src/plugins/index.ts";
 *   await camera.loadPlugins();
 *
 *   // Load only what you need (each capability is a separate dynamic import, so e.g.
 *   // requesting only `snapshot` never pulls in events-typed or node:child_process,
 *   // which the speaker subsystem needs):
 *   await camera.loadPlugins({ onvif: true, snapshot: true, video: false, speaker: false });
 *
 * Both loaders patch the same `Camera` prototype and are idempotent/safe to combine —
 * loadPlugins() just skips a capability it's already loaded. Note that TypeScript sees
 * every capability's `declare module` augmentation regardless of which one you actually
 * load at runtime (tsconfig's `include` type-checks the whole src/plugins tree), so
 * calling a method you opted out of is a type-safe compile but a runtime TypeError.
 */

export interface LoadPluginsOptions {
  /** camera.onvif: getDeviceInformation/getCapabilities/events/startEvents/stopEvents. */
  onvif?: boolean;
  /** camera.snapshot: get. */
  snapshot?: boolean;
  /** camera.video: probe. */
  video?: boolean;
  /** camera.speaker: connect/play/preload/disconnect, and CameraGroup's audio methods. */
  speaker?: boolean;
}

const PLUGIN_MODULES = {
  onvif: () => import("./onvifPatch.ts"),
  snapshot: () => import("./snapshot.ts"),
  video: () => import("./video.ts"),
  speaker: () => import("./speaker.ts"),
} as const satisfies Record<keyof LoadPluginsOptions, () => Promise<unknown>>;

const loaded = new Set<keyof LoadPluginsOptions>();

/** Patch the requested capabilities onto `Camera` (all four, by default). */
export async function loadPlugins(options: LoadPluginsOptions = {}): Promise<void> {
  const wanted = (Object.keys(PLUGIN_MODULES) as (keyof LoadPluginsOptions)[]).filter(
    (name) => options[name] ?? true,
  );
  await Promise.all(
    wanted
      .filter((name) => !loaded.has(name))
      .map(async (name) => {
        await PLUGIN_MODULES[name]();
        loaded.add(name);
      }),
  );
}

/** Which capabilities loadPlugins() has already patched in. */
export function loadedPlugins(): ReadonlySet<keyof LoadPluginsOptions> {
  return loaded;
}

export * from "./group.ts";
export * from "./localCredentials.ts";
export * as onvif from "./onvif.ts";
