import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: doorbell chime and quick-response controls, ported from
 * ref/pytapo/pytapo/__init__.py's playQuickResponse/getQuickResponseList/
 * getChimeRingPlan/setChimeRingPlan/getChimeAlarmConfigure/setChimeAlarmConfigure/
 * getSupportAlarmTypeList. Unverified against real hardware — this project's only
 * tested device (C100, see C100_FILES.md) is a plug-in indoor camera, not a doorbell.
 * Doesn't touch src/smartcam/modules/camera.ts.
 */

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class CameraChime {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  playQuickResponse(id: number | string): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      playQuickResp: {
        quick_response: { play_quick_resp_audio: { id, force: "force" } },
      },
    });
  }

  getQuickResponseList(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getQuickRespList: { quick_response: {} } });
  }

  async getRingPlan(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getChimeRingPlan: { chime_ring_plan: { name: "chn1_chime_ring_plan" } },
    });
    const plan = (resp.getChimeRingPlan as Record<string, unknown> | undefined)
      ?.chime_ring_plan as Record<string, unknown> | undefined;
    return (plan?.chn1_chime_ring_plan as Record<string, unknown> | undefined) ?? {};
  }

  async setRingPlan(config: {
    enabled?: boolean;
    ringPlan?: unknown;
  }): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    if (config.enabled !== undefined) {
      params.enabled = config.enabled ? "on" : "off";
    } else {
      const current = await this.getRingPlan();
      params.enabled = current.enabled;
    }
    if (config.ringPlan !== undefined) {
      params.ring_plan_1 = config.ringPlan;
    } else {
      const current = await this.getRingPlan();
      params.ring_plan_1 = current.ring_plan_1;
    }

    return this.#rawQuery({
      setChimeRingPlan: { chime_ring_plan: { chn1_chime_ring_plan: params } },
    });
  }

  /** Per-chime-device alarm sound configuration, keyed by the chime's MAC address. */
  getAlarmConfigure(macAddress: string): Promise<Record<string, unknown>> {
    return this.#rawQuery({ get_chime_alarm_configure: { mac: macAddress } });
  }

  setAlarmConfigure(
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

    return this.#rawQuery({ set_chime_alarm_configure: params });
  }

  getSupportAlarmTypeList(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ get_support_alarm_type_list: null });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Doorbell chime and quick-response controls. */
    readonly chime: CameraChime;
  }
}

const chimeMap = new WeakMap<Camera, CameraChime>();

Object.defineProperty(Camera.prototype, "chime", {
  configurable: true,
  get(this: Camera): CameraChime {
    let instance = chimeMap.get(this);
    if (!instance) {
      instance = new CameraChime(this.smartCamDevice.rawQuery.bind(this.smartCamDevice));
      chimeMap.set(this, instance);
    }
    return instance;
  },
});
