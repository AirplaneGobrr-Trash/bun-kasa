import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: miscellaneous camera controls with no python-kasa equivalent, ported
 * from ref/pytapo/pytapo/__init__.py's getMediaEncrypt/setMediaEncrypt,
 * getNotificationsEnabled/setNotificationsEnabled, getSmartTrackConfig/
 * setSmartTrackConfig/setAutoTrackTarget, setAlarm (the sound+light alarm-mode config,
 * distinct from src/smartcam/modules/alarm.ts's `siren` component and
 * camera.alarmevents.ts's manual event trigger), and playAlarm. Doesn't touch
 * src/smartcam/modules/camera.ts.
 */

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    getMediaEncrypt(): Promise<Record<string, unknown>>;
    setMediaEncrypt(enabled: boolean): Promise<Record<string, unknown>>;
    /** Whether push notifications (and optionally "rich"/image notifications) are enabled. */
    getNotificationsEnabled(): Promise<Record<string, unknown>>;
    setNotificationsEnabled(config: {
      notificationsEnabled?: boolean;
      richNotificationsEnabled?: boolean;
    }): Promise<Record<string, unknown>>;
    getSmartTrackConfig(): Promise<Record<string, unknown>>;
    setSmartTrackConfig(type: string, enabled: boolean): Promise<Record<string, unknown>>;
    setAutoTrackTarget(enabled: boolean): Promise<Record<string, unknown>>;
    /**
     * Configure the trigger-alarm behavior (sound and/or light on detection) — the
     * `msg_alarm`/`alarm_mode` config, not the `siren` component's play()/stop().
     */
    setAlarm(config: {
      enabled: boolean;
      soundEnabled?: boolean;
      lightEnabled?: boolean;
      alarmVolume?: number;
      alarmDuration?: number;
      alarmType?: number | string;
    }): Promise<Record<string, unknown>>;
    playAlarm(
      alarmDuration: number,
      alarmType: number | string,
      alarmVolume: number,
    ): Promise<Record<string, unknown>>;
  }
}

Camera.prototype.getMediaEncrypt = async function (
  this: Camera,
): Promise<Record<string, unknown>> {
  const resp = await this.smartCamDevice.rawQuery({
    getMediaEncrypt: { cet: { name: ["media_encrypt"] } },
  });
  const cet = (resp.getMediaEncrypt as Record<string, unknown> | undefined)?.cet as
    | Record<string, unknown>
    | undefined;
  return (cet?.media_encrypt as Record<string, unknown> | undefined) ?? {};
};

Camera.prototype.setMediaEncrypt = function (
  this: Camera,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setMediaEncrypt: { cet: { media_encrypt: { enabled: enabled ? "on" : "off" } } },
  });
};

Camera.prototype.getNotificationsEnabled = async function (
  this: Camera,
): Promise<Record<string, unknown>> {
  const resp = await this.smartCamDevice.rawQuery({
    getMsgPushConfig: { msg_push: { name: ["chn1_msg_push_info"] } },
  });
  const msgPush = (resp.getMsgPushConfig as Record<string, unknown> | undefined)
    ?.msg_push as Record<string, unknown> | undefined;
  return (msgPush?.chn1_msg_push_info as Record<string, unknown> | undefined) ?? {};
};

Camera.prototype.setNotificationsEnabled = function (
  this: Camera,
  config: { notificationsEnabled?: boolean; richNotificationsEnabled?: boolean },
): Promise<Record<string, unknown>> {
  const info: Record<string, unknown> = {};
  if (config.notificationsEnabled !== undefined)
    info.notification_enabled = config.notificationsEnabled ? "on" : "off";
  if (config.richNotificationsEnabled !== undefined)
    info.rich_notification_enabled = config.richNotificationsEnabled ? "on" : "off";

  return this.smartCamDevice.rawQuery({
    setMsgPushConfig: { msg_push: { chn1_msg_push_info: info } },
  });
};

Camera.prototype.getSmartTrackConfig = async function (
  this: Camera,
): Promise<Record<string, unknown>> {
  const resp = await this.smartCamDevice.rawQuery({
    getSmartTrackConfig: { smart_track: { name: "smart_track_info" } },
  });
  const smartTrack = (resp.getSmartTrackConfig as Record<string, unknown> | undefined)
    ?.smart_track as Record<string, unknown> | undefined;
  return (smartTrack?.smart_track_info as Record<string, unknown> | undefined) ?? {};
};

Camera.prototype.setSmartTrackConfig = function (
  this: Camera,
  type: string,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setSmartTrackConfig: {
      smart_track: { smart_track_info: { [type]: enabled ? "on" : "off" } },
    },
  });
};

Camera.prototype.setAutoTrackTarget = function (
  this: Camera,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setTargetTrackConfig: {
      target_track: { target_track_info: { enabled: enabled ? "on" : "off" } },
    },
  });
};

Camera.prototype.setAlarm = function (
  this: Camera,
  config: {
    enabled: boolean;
    soundEnabled?: boolean;
    lightEnabled?: boolean;
    alarmVolume?: number;
    alarmDuration?: number;
    alarmType?: number | string;
  },
): Promise<Record<string, unknown>> {
  const soundEnabled = config.soundEnabled ?? true;
  const lightEnabled = config.lightEnabled ?? true;
  if (!soundEnabled && !lightEnabled) {
    throw new Error("You need to use at least sound or light for alarm");
  }

  const alarmMode: string[] = [];
  if (soundEnabled) alarmMode.push("sound");
  if (lightEnabled) alarmMode.push("light");

  const info: Record<string, unknown> = {
    alarm_type: "0",
    enabled: config.enabled ? "on" : "off",
    light_type: "0",
    alarm_mode: alarmMode,
  };
  if (config.alarmVolume !== undefined) info.alarm_volume = config.alarmVolume;
  if (config.alarmDuration !== undefined) info.alarm_duration = config.alarmDuration;
  if (config.alarmType !== undefined) info.alarm_type = String(config.alarmType);

  // pytapo sends this as a raw {"method": "set", "msg_alarm": {...}} request (msg_alarm
  // as a sibling of "method", not nested under "params"), bypassing its usual
  // executeFunction() envelope. rawQuery() always nests single-key requests under
  // "params" (see SmartProtocol.executeQuery) with no way to opt out, so this may need
  // adjusting if the device rejects it — unverified against real hardware.
  return this.smartCamDevice.rawQuery({
    set: { msg_alarm: { chn1_msg_alarm_info: info } },
  });
};

Camera.prototype.playAlarm = function (
  this: Camera,
  alarmDuration: number,
  alarmType: number | string,
  alarmVolume: number,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    play_alarm: {
      alarm_duration: alarmDuration,
      alarm_type: String(alarmType),
      alarm_volume: String(alarmVolume),
    },
  });
};
