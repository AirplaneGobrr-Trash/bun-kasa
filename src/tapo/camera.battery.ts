import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: battery-camera-specific config and status, ported from
 * ref/pytapo/pytapo/__init__.py's battery/PIR/ring/wake-up/scheduled-reboot getters and
 * setters. Unverified against real hardware — this project's only tested device (C100,
 * see C100_FILES.md) is mains-powered, not battery. Doesn't touch
 * src/smartcam/modules/camera.ts.
 */

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class CameraBattery {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  getStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getBatteryStatus: { battery: { name: "status" } } });
  }

  getPowerSave(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getBatteryPowerSave: { battery: { name: "power_save" } } });
  }

  setPowerSave(enabled: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setBatteryPowerSave: {
        battery: { power_save: { enabled: enabled ? "auto" : "off" } },
      },
    });
  }

  getOperatingMode(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getBatteryOperatingMode: { battery: { name: "operating" } },
    });
  }

  getOperatingModeParam(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getBatteryOperatingModeParam: { battery: { name: "operating_mode_param" } },
    });
  }

  async setOperatingMode(mode: string): Promise<Record<string, unknown>> {
    const paramResp = await this.getOperatingModeParam();
    const battery = paramResp.battery as Record<string, unknown> | undefined;
    const operatingModeParam = battery?.operating_mode_param as
      | Record<string, unknown>
      | undefined;
    const configArray =
      (operatingModeParam?.config_array as Array<Record<string, unknown>> | undefined) ??
      [];
    const modeIsValid = configArray.some((available) => available.mode === mode);
    if (!modeIsValid) throw new Error(`Mode ${mode} is invalid.`);

    return this.#rawQuery({
      setBatteryOperatingMode: { battery: { operating: { follow_config: false, mode } } },
    });
  }

  getChargingMode(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getChargingMode: { battery: { name: "charging_mode" } } });
  }

  setChargingMode(chargingPrivacyMode: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setChargingMode: {
        battery: {
          charging_mode: { charging_privacy_mode: chargingPrivacyMode ? "on" : "off" },
        },
      },
    });
  }

  getPowerMode(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getPowerMode: { battery: { name: "power" } } });
  }

  getStatistic(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getBatteryStatistic: { battery: { statistic: { days: 30 } } },
    });
  }

  getConfig(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getBatteryConfig: { battery: { name: "config" } } });
  }

  setConfig(config: {
    showOnLiveView?: boolean;
    showPercentage?: boolean;
  }): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    if (config.showOnLiveView !== undefined)
      params.show_on_liveview = config.showOnLiveView ? "on" : "off";
    if (config.showPercentage !== undefined)
      params.show_percentage = config.showPercentage ? "on" : "off";

    return this.#rawQuery({ setBatteryConfig: { battery: { config: params } } });
  }

  getCapability(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getBatteryCapability: { battery: { name: "capability" } } });
  }

  getPirSensitivity(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getPirSensitivity: { pir: { name: "config" } } });
  }

  /** 10-100. */
  setPirSensitivity(sensitivity: number): Promise<Record<string, unknown>> {
    if (sensitivity < 10 || sensitivity > 100) {
      throw new Error("PIR sensitivity has to be between 10 and 100");
    }
    return this.#rawQuery({
      setPirSensitivity: { pir: { config: { sensitivity: String(sensitivity) } } },
    });
  }

  getWakeUpConfig(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getWakeUpConfig: { wake_up: { name: "config" } } });
  }

  setWakeUpConfig(
    wakeUpType: "doorbell" | "detection",
  ): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setWakeUpConfig: { wake_up: { config: { wake_up_type: wakeUpType } } },
    });
  }

  getReboot(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getReboot: { timing_reboot: { name: ["reboot"] } } });
  }

  /** Scheduled (not immediate) reboot. Pass only the fields to change; others keep their current value. */
  async setReboot(config: {
    enabled?: boolean;
    time?: string;
    day?: number | string;
    randomRange?: number;
  }): Promise<Record<string, unknown>> {
    let current: Record<string, unknown> | undefined;
    if (
      config.enabled === undefined ||
      config.time === undefined ||
      config.day === undefined
    ) {
      const resp = await this.getReboot();
      const timingReboot = resp.timing_reboot as Record<string, unknown> | undefined;
      current = timingReboot?.reboot as Record<string, unknown> | undefined;
    }

    const params: Record<string, unknown> = {
      enabled:
        config.enabled !== undefined ? (config.enabled ? "on" : "off") : current?.enabled,
      time: config.time !== undefined ? config.time : current?.time,
      day: config.day !== undefined ? String(config.day) : current?.day,
      random_range: config.randomRange ?? 30,
    };

    return this.#rawQuery({ setReboot: { timing_reboot: { reboot: params } } });
  }

  getRingStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getRingStatus: { ring: { name: "status" } } });
  }

  setRingStatus(enabled: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setRingStatus: { ring: { status: { enabled: enabled ? "on" : "off" } } },
    });
  }

  getClipsConfig(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ getClipsConfig: { clips: { name: "config" } } });
  }

  /** clipsLength: 20-120, recordBuffer: 3-10, retriggerTime: 0-60. */
  setClipsConfig(config: {
    clipsLength?: number;
    recordBuffer?: number;
    retriggerTime?: number;
  }): Promise<Record<string, unknown>> {
    if (
      config.retriggerTime !== undefined &&
      (config.retriggerTime < 0 || config.retriggerTime > 60)
    ) {
      throw new Error("Retrigger time has to be between 0 and 60.");
    }
    if (
      config.clipsLength !== undefined &&
      (config.clipsLength < 20 || config.clipsLength > 120)
    ) {
      throw new Error("Clips Length has to be between 20 and 120.");
    }
    if (
      config.recordBuffer !== undefined &&
      (config.recordBuffer < 3 || config.recordBuffer > 10)
    ) {
      throw new Error("Record buffer has to be between 3 and 10.");
    }

    const params: Record<string, unknown> = {};
    if (config.clipsLength !== undefined) params.clips_length = config.clipsLength;
    if (config.recordBuffer !== undefined) params.record_buffer = config.recordBuffer;
    if (config.retriggerTime !== undefined) params.retrigger_time = config.retriggerTime;

    return this.#rawQuery({ setClipsConfig: { clips: { config: params } } });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Battery-camera config/status: power, PIR, wake-up, scheduled reboot, ring, clips. */
    readonly battery: CameraBattery;
  }
}

const batteryMap = new WeakMap<Camera, CameraBattery>();

Object.defineProperty(Camera.prototype, "battery", {
  configurable: true,
  get(this: Camera): CameraBattery {
    let instance = batteryMap.get(this);
    if (!instance) {
      instance = new CameraBattery(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      batteryMap.set(this, instance);
    }
    return instance;
  },
});
