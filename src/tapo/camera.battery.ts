import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: battery-camera-specific config and status, ported from
 * ref/pytapo/pytapo/__init__.py's battery/PIR/ring/wake-up/scheduled-reboot getters and
 * setters. Unverified against real hardware — this project's only tested device (C100,
 * see C100_FILES.md) is mains-powered, not battery. Doesn't touch
 * src/smartcam/modules/camera.ts.
 */

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    getBatteryStatus(): Promise<Record<string, unknown>>;
    getBatteryPowerSave(): Promise<Record<string, unknown>>;
    setBatteryPowerSave(enabled: boolean): Promise<Record<string, unknown>>;
    getBatteryOperatingMode(): Promise<Record<string, unknown>>;
    getBatteryOperatingModeParam(): Promise<Record<string, unknown>>;
    setBatteryOperatingMode(mode: string): Promise<Record<string, unknown>>;
    getChargingMode(): Promise<Record<string, unknown>>;
    setChargingMode(chargingPrivacyMode: boolean): Promise<Record<string, unknown>>;
    getPowerMode(): Promise<Record<string, unknown>>;
    getBatteryStatistic(): Promise<Record<string, unknown>>;
    getBatteryConfig(): Promise<Record<string, unknown>>;
    setBatteryConfig(config: {
      showOnLiveView?: boolean;
      showPercentage?: boolean;
    }): Promise<Record<string, unknown>>;
    getBatteryCapability(): Promise<Record<string, unknown>>;
    getPirSensitivity(): Promise<Record<string, unknown>>;
    /** 10-100. */
    setPirSensitivity(sensitivity: number): Promise<Record<string, unknown>>;
    getWakeUpConfig(): Promise<Record<string, unknown>>;
    setWakeUpConfig(
      wakeUpType: "doorbell" | "detection",
    ): Promise<Record<string, unknown>>;
    getReboot(): Promise<Record<string, unknown>>;
    /** Scheduled (not immediate) reboot. Pass only the fields to change; others keep their current value. */
    setReboot(config: {
      enabled?: boolean;
      time?: string;
      day?: number | string;
      randomRange?: number;
    }): Promise<Record<string, unknown>>;
    getRingStatus(): Promise<Record<string, unknown>>;
    setRingStatus(enabled: boolean): Promise<Record<string, unknown>>;
    getClipsConfig(): Promise<Record<string, unknown>>;
    /** clipsLength: 20-120, recordBuffer: 3-10, retriggerTime: 0-60. */
    setClipsConfig(config: {
      clipsLength?: number;
      recordBuffer?: number;
      retriggerTime?: number;
    }): Promise<Record<string, unknown>>;
  }
}

Camera.prototype.getBatteryStatus = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryStatus: { battery: { name: "status" } },
  });
};

Camera.prototype.getBatteryPowerSave = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryPowerSave: { battery: { name: "power_save" } },
  });
};

Camera.prototype.setBatteryPowerSave = function (
  this: Camera,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setBatteryPowerSave: {
      battery: { power_save: { enabled: enabled ? "auto" : "off" } },
    },
  });
};

Camera.prototype.getBatteryOperatingMode = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryOperatingMode: { battery: { name: "operating" } },
  });
};

Camera.prototype.getBatteryOperatingModeParam = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryOperatingModeParam: { battery: { name: "operating_mode_param" } },
  });
};

Camera.prototype.setBatteryOperatingMode = async function (
  this: Camera,
  mode: string,
): Promise<Record<string, unknown>> {
  const paramResp = await this.getBatteryOperatingModeParam();
  const battery = paramResp.battery as Record<string, unknown> | undefined;
  const operatingModeParam = battery?.operating_mode_param as
    | Record<string, unknown>
    | undefined;
  const configArray =
    (operatingModeParam?.config_array as Array<Record<string, unknown>> | undefined) ??
    [];
  const modeIsValid = configArray.some((available) => available.mode === mode);
  if (!modeIsValid) throw new Error(`Mode ${mode} is invalid.`);

  return this.smartCamDevice.rawQuery({
    setBatteryOperatingMode: { battery: { operating: { follow_config: false, mode } } },
  });
};

Camera.prototype.getChargingMode = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getChargingMode: { battery: { name: "charging_mode" } },
  });
};

Camera.prototype.setChargingMode = function (
  this: Camera,
  chargingPrivacyMode: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setChargingMode: {
      battery: {
        charging_mode: { charging_privacy_mode: chargingPrivacyMode ? "on" : "off" },
      },
    },
  });
};

Camera.prototype.getPowerMode = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getPowerMode: { battery: { name: "power" } } });
};

Camera.prototype.getBatteryStatistic = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryStatistic: { battery: { statistic: { days: 30 } } },
  });
};

Camera.prototype.getBatteryConfig = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryConfig: { battery: { name: "config" } },
  });
};

Camera.prototype.setBatteryConfig = function (
  this: Camera,
  config: { showOnLiveView?: boolean; showPercentage?: boolean },
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  if (config.showOnLiveView !== undefined)
    params.show_on_liveview = config.showOnLiveView ? "on" : "off";
  if (config.showPercentage !== undefined)
    params.show_percentage = config.showPercentage ? "on" : "off";

  return this.smartCamDevice.rawQuery({
    setBatteryConfig: { battery: { config: params } },
  });
};

Camera.prototype.getBatteryCapability = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getBatteryCapability: { battery: { name: "capability" } },
  });
};

Camera.prototype.getPirSensitivity = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getPirSensitivity: { pir: { name: "config" } } });
};

Camera.prototype.setPirSensitivity = function (
  this: Camera,
  sensitivity: number,
): Promise<Record<string, unknown>> {
  if (sensitivity < 10 || sensitivity > 100) {
    throw new Error("PIR sensitivity has to be between 10 and 100");
  }
  return this.smartCamDevice.rawQuery({
    setPirSensitivity: { pir: { config: { sensitivity: String(sensitivity) } } },
  });
};

Camera.prototype.getWakeUpConfig = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getWakeUpConfig: { wake_up: { name: "config" } },
  });
};

Camera.prototype.setWakeUpConfig = function (
  this: Camera,
  wakeUpType: "doorbell" | "detection",
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setWakeUpConfig: { wake_up: { config: { wake_up_type: wakeUpType } } },
  });
};

Camera.prototype.getReboot = function (this: Camera): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getReboot: { timing_reboot: { name: ["reboot"] } },
  });
};

Camera.prototype.setReboot = async function (
  this: Camera,
  config: {
    enabled?: boolean;
    time?: string;
    day?: number | string;
    randomRange?: number;
  },
): Promise<Record<string, unknown>> {
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

  return this.smartCamDevice.rawQuery({
    setReboot: { timing_reboot: { reboot: params } },
  });
};

Camera.prototype.getRingStatus = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getRingStatus: { ring: { name: "status" } } });
};

Camera.prototype.setRingStatus = function (
  this: Camera,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setRingStatus: { ring: { status: { enabled: enabled ? "on" : "off" } } },
  });
};

Camera.prototype.getClipsConfig = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ getClipsConfig: { clips: { name: "config" } } });
};

Camera.prototype.setClipsConfig = function (
  this: Camera,
  config: { clipsLength?: number; recordBuffer?: number; retriggerTime?: number },
): Promise<Record<string, unknown>> {
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

  return this.smartCamDevice.rawQuery({ setClipsConfig: { clips: { config: params } } });
};
