import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: doorbell chime and quick-response controls, ported from
 * ref/pytapo/pytapo/__init__.py's playQuickResponse/getQuickResponseList/
 * getChimeRingPlan/setChimeRingPlan/getChimeAlarmConfigure/setChimeAlarmConfigure/
 * getSupportAlarmTypeList. Unverified against real hardware — this project's only
 * tested device (C100, see C100_FILES.md) is a plug-in indoor camera, not a doorbell.
 * Doesn't touch src/smartcam/modules/camera.ts.
 */

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    playQuickResponse(id: number | string): Promise<Record<string, unknown>>;
    getQuickResponseList(): Promise<Record<string, unknown>>;
    getChimeRingPlan(): Promise<Record<string, unknown>>;
    setChimeRingPlan(config: {
      enabled?: boolean;
      ringPlan?: unknown;
    }): Promise<Record<string, unknown>>;
    /** Per-chime-device alarm sound configuration, keyed by the chime's MAC address. */
    getChimeAlarmConfigure(macAddress: string): Promise<Record<string, unknown>>;
    setChimeAlarmConfigure(
      macAddress: string,
      config: {
        enabled?: boolean;
        type?: number | string;
        volume?: number;
        duration?: number;
      },
    ): Promise<Record<string, unknown>>;
    getSupportAlarmTypeList(): Promise<Record<string, unknown>>;
  }
}

Camera.prototype.playQuickResponse = function (
  this: Camera,
  id: number | string,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    playQuickResp: { quick_response: { play_quick_resp_audio: { id, force: "force" } } },
  });
};

Camera.prototype.getQuickResponseList = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getQuickRespList: { quick_response: {} } });
};

Camera.prototype.getChimeRingPlan = async function (
  this: Camera,
): Promise<Record<string, unknown>> {
  const resp = await this.smartCamDevice.rawQuery({
    getChimeRingPlan: { chime_ring_plan: { name: "chn1_chime_ring_plan" } },
  });
  const plan = (resp.getChimeRingPlan as Record<string, unknown> | undefined)
    ?.chime_ring_plan as Record<string, unknown> | undefined;
  return (plan?.chn1_chime_ring_plan as Record<string, unknown> | undefined) ?? {};
};

Camera.prototype.setChimeRingPlan = async function (
  this: Camera,
  config: { enabled?: boolean; ringPlan?: unknown },
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  if (config.enabled !== undefined) {
    params.enabled = config.enabled ? "on" : "off";
  } else {
    const current = await this.getChimeRingPlan();
    params.enabled = current.enabled;
  }
  if (config.ringPlan !== undefined) {
    params.ring_plan_1 = config.ringPlan;
  } else {
    const current = await this.getChimeRingPlan();
    params.ring_plan_1 = current.ring_plan_1;
  }

  return this.smartCamDevice.rawQuery({
    setChimeRingPlan: { chime_ring_plan: { chn1_chime_ring_plan: params } },
  });
};

Camera.prototype.getChimeAlarmConfigure = function (
  this: Camera,
  macAddress: string,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    get_chime_alarm_configure: { mac: macAddress },
  });
};

Camera.prototype.setChimeAlarmConfigure = function (
  this: Camera,
  macAddress: string,
  config: {
    enabled?: boolean;
    type?: number | string;
    volume?: number;
    duration?: number;
  },
): Promise<Record<string, unknown>> {
  if (
    config.duration !== undefined &&
    config.duration !== 0 &&
    (config.duration < 5 || config.duration > 30)
  ) {
    throw new Error("Duration has to be between 5 and 30, or 0.");
  }
  if (config.volume !== undefined && (config.volume < 1 || config.volume > 15)) {
    throw new Error("Volume has to be between 1 and 15.");
  }

  const params: Record<string, unknown> = { mac: macAddress };
  if (config.enabled !== undefined) params.on_off = config.enabled ? 1 : 0;
  if (config.type !== undefined) params.type = String(config.type);
  if (config.volume !== undefined) params.volume = String(config.volume);
  if (config.duration !== undefined) params.duration = config.duration;

  return this.smartCamDevice.rawQuery({ set_chime_alarm_configure: params });
};

Camera.prototype.getSupportAlarmTypeList = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ get_support_alarm_type_list: null });
};
