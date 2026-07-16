import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: floodlight/white-lamp and PIR-triggered-floodlight controls, ported from
 * ref/pytapo/pytapo/__init__.py's getWhitelampStatus/getFloodlightStatus/
 * manualFloodlightOp/getFloodlightConfig/setFloodlightConfig/getFloodlightCapability/
 * getForceWhitelampState/setForceWhitelampState/reverseWhitelampStatus/
 * getPirDetCapability/getPirDetConfig/setPirDetConfig. Unverified against real hardware
 * (see CLAUDE.md's testing philosophy) — this project's only real device (C100, see
 * C100_FILES.md) has no floodlight, so exercise these against a floodlight-equipped
 * camera before trusting them. Doesn't touch src/smartcam/modules/camera.ts.
 */

export interface FloodlightConfig {
  scheduleMode?: string;
  autoOffEnabled?: boolean;
  endTime?: number;
  imgDetTriEnabled?: boolean;
  intensityLevel?: number;
  scheduleEnabled?: boolean;
  manualDuration?: number;
  startTime?: number;
  sunriseOffset?: number;
  sunsetOffset?: number;
  triggerDuration?: number;
}

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class CameraFloodlight {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  getWhitelampStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getWhitelampStatus: { image: { get_wtl_status: ["null"] } },
    });
  }

  getStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getFloodlightStatus: { floodlight: { get_floodlight_status: "" } },
    });
  }

  manualOp(on: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      manualFloodlightOp: {
        floodlight: { manual_floodlight_op: { action: on ? "start" : "stop" } },
      },
    });
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getFloodlightConfig: { floodlight: { name: "config" } },
    });
    const floodlight = (resp.getFloodlightConfig as Record<string, unknown> | undefined)
      ?.floodlight as Record<string, unknown> | undefined;
    return (floodlight?.config as Record<string, unknown> | undefined) ?? {};
  }

  setConfig(config: FloodlightConfig): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    if (config.scheduleMode !== undefined) params.schedule_mode = config.scheduleMode;
    if (config.autoOffEnabled !== undefined)
      params.auto_off_enabled = config.autoOffEnabled ? "on" : "off";
    if (config.endTime !== undefined) params.end_time = config.endTime;
    if (config.imgDetTriEnabled !== undefined)
      params.img_det_tri_enabled = config.imgDetTriEnabled;
    if (config.intensityLevel !== undefined)
      params.intensity_level = String(config.intensityLevel);
    if (config.scheduleEnabled !== undefined)
      params.schedule_enabled = config.scheduleEnabled ? "on" : "off";
    if (config.manualDuration !== undefined)
      params.manual_duration = String(config.manualDuration);
    if (config.startTime !== undefined) params.start_time = String(config.startTime);
    if (config.sunriseOffset !== undefined)
      params.sunrise_offset = String(config.sunriseOffset);
    if (config.sunsetOffset !== undefined)
      params.sunset_offset = String(config.sunsetOffset);
    if (config.triggerDuration !== undefined)
      params.trigger_duration = String(config.triggerDuration);

    return this.#rawQuery({ setFloodlightConfig: { floodlight: { config: params } } });
  }

  async getCapability(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getFloodlightCapability: { floodlight: { name: "capability" } },
    });
    const floodlight = (
      resp.getFloodlightCapability as Record<string, unknown> | undefined
    )?.floodlight as Record<string, unknown> | undefined;
    return (floodlight?.capability as Record<string, unknown> | undefined) ?? {};
  }

  async getForceWhitelampState(): Promise<boolean> {
    const resp = await this.#rawQuery({ getLdc: { image: { name: ["switch"] } } });
    const image = (resp.getLdc as Record<string, unknown> | undefined)?.image as
      | Record<string, unknown>
      | undefined;
    const switches = image?.switch as Record<string, unknown> | undefined;
    return switches?.force_wtl_state === "on";
  }

  setForceWhitelampState(enable: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setLdc: { image: { switch: { force_wtl_state: enable ? "on" : "off" } } },
    });
  }

  reverseWhitelampStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      reverseWhitelampStatus: { image: { reverse_wtl_status: ["null"] } },
    });
  }

  async getPirDetCapability(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getPirDetCapability: { pir_detection: { name: "pir_capability" } },
    });
    const pir = (resp.getPirDetCapability as Record<string, unknown> | undefined)
      ?.pir_detection as Record<string, unknown> | undefined;
    return (pir?.pir_capability as Record<string, unknown> | undefined) ?? {};
  }

  async getPirDetConfig(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getPirDetConfig: { pir_detection: { name: "pir_det" } },
    });
    const pir = (resp.getPirDetConfig as Record<string, unknown> | undefined)
      ?.pir_detection as Record<string, unknown> | undefined;
    return (pir?.pir_det as Record<string, unknown> | undefined) ?? {};
  }

  setPirDetConfig(config: {
    enabled?: boolean;
    channels?: string[];
    sensitivity?: string[];
  }): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    if (config.enabled !== undefined) params.enabled = config.enabled ? "on" : "off";
    if (config.channels?.length) params.channel_enabled = config.channels;
    if (config.sensitivity?.length) params.sensitivity = config.sensitivity;

    return this.#rawQuery({ setPirDetConfig: { pir_detection: { pir_det: params } } });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Floodlight/white-lamp and PIR-triggered-floodlight controls. */
    readonly floodlight: CameraFloodlight;
  }
}

const floodlightMap = new WeakMap<Camera, CameraFloodlight>();

Object.defineProperty(Camera.prototype, "floodlight", {
  configurable: true,
  get(this: Camera): CameraFloodlight {
    let instance = floodlightMap.get(this);
    if (!instance) {
      instance = new CameraFloodlight(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      floodlightMap.set(this, instance);
    }
    return instance;
  },
});
