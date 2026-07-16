/**
 * Plugin entrypoints, grouped per device family — each family's monkey-patches live in
 * their own directory (camera/) and are loaded independently:
 *
 *   import { camera } from "bun-kasa/src/plugins/index.ts";
 *
 *   await camera.loadPlugins();  // onvif/snapshot/video/speaker on the SMARTCAM Camera module
 *
 * See camera/index.ts for its options and capability list. RGB support for bulbs isn't a
 * plugin — it lives directly on the `Light` module (src/interfaces/light.ts's `rgb`/
 * `setRgb`), since it's small enough to bake in without the opt-in machinery.
 */

export * as camera from "./camera/index.ts";
