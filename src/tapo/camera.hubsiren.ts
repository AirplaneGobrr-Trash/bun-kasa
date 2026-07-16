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

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    setHubSirenStatus(on: boolean): Promise<Record<string, unknown>>;
    getHubSirenStatus(): Promise<Record<string, unknown>>;
    setHubSirenConfig(config: {
      duration?: number;
      sirenType?: string;
      volume?: number;
    }): Promise<Record<string, unknown>>;
    getHubSirenConfig(): Promise<Record<string, unknown>>;
    getHubSirenTypeList(): Promise<Record<string, unknown>>;
    getHubStorage(): Promise<Record<string, unknown>>;
  }
}

Camera.prototype.setHubSirenStatus = function (
  this: Camera,
  on: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setSirenStatus: { siren: { status: on ? "on" : "off" } },
  });
};

Camera.prototype.getHubSirenStatus = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getSirenStatus: { siren: {} } });
};

Camera.prototype.setHubSirenConfig = function (
  this: Camera,
  config: { duration?: number; sirenType?: string; volume?: number },
): Promise<Record<string, unknown>> {
  const siren: Record<string, unknown> = {};
  if (config.duration !== undefined) siren.duration = config.duration;
  if (config.sirenType !== undefined) siren.siren_type = config.sirenType;
  if (config.volume !== undefined) siren.volume = config.volume;

  return this.smartCamDevice.rawQuery({ setSirenConfig: { siren } });
};

Camera.prototype.getHubSirenConfig = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getSirenConfig: { siren: {} } });
};

Camera.prototype.getHubSirenTypeList = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getSirenTypeList: { siren: {} } });
};

Camera.prototype.getHubStorage = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getHubStorage: { hub_manage: { name: "hub_storage_info" } },
  });
};
