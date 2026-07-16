import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: hub-level siren controls, ported from ref/pytapo/pytapo/__init__.py's
 * setHubSirenStatus/getHubSirenStatus/setHubSirenConfig/getHubSirenConfig/
 * getHubSirenTypeList/getHubStorage. Distinct from src/smartcam/modules/alarm.ts's
 * `siren` component (a standalone camera's own siren): these use the `siren` top-level
 * key without a `msg_alarm`/component wrapper, which pytapo's source notes is the H200
 * hub's own siren, not a component on the camera being addressed. Unverified against
 * real hardware — this project's only tested device (C100, see C100_FILES.md) is not a
 * hub. Doesn't touch src/smartcam/modules/camera.ts.
 */

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class CameraHubSiren {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  setStatus(on: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({ setSirenStatus: { siren: { status: on ? "on" : "off" } } });
  }

  getStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getSirenStatus: { siren: {} } });
  }

  setConfig(config: {
    duration?: number;
    sirenType?: string;
    volume?: number;
  }): Promise<Record<string, unknown>> {
    const siren: Record<string, unknown> = {};
    if (config.duration !== undefined) siren.duration = config.duration;
    if (config.sirenType !== undefined) siren.siren_type = config.sirenType;
    if (config.volume !== undefined) siren.volume = config.volume;

    return this.#rawQuery({ setSirenConfig: { siren } });
  }

  getConfig(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getSirenConfig: { siren: {} } });
  }

  getTypeList(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getSirenTypeList: { siren: {} } });
  }

  getStorage(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getHubStorage: { hub_manage: { name: "hub_storage_info" } },
    });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Hub-level (H200) siren controls, distinct from the camera's own `siren` component. */
    readonly hubSiren: CameraHubSiren;
  }
}

const hubSirenMap = new WeakMap<Camera, CameraHubSiren>();

Object.defineProperty(Camera.prototype, "hubSiren", {
  configurable: true,
  get(this: Camera): CameraHubSiren {
    let instance = hubSirenMap.get(this);
    if (!instance) {
      instance = new CameraHubSiren(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      hubSirenMap.set(this, instance);
    }
    return instance;
  },
});
