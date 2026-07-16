import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: alarm-event info/trigger and HDR, ported from
 * ref/pytapo/pytapo/__init__.py's getAlarm/startManualAlarm/stopManualAlarm/setHDR.
 * Distinct from the siren *sound* itself (already ported from python-kasa as
 * src/smartcam/modules/alarm.ts, the `siren` component's play()/stop()): these commands
 * are the camera's separate `msg_alarm` event pipeline — the "camera detected a
 * trigger and recorded/notified" flow, not "make noise". Floodlight controls
 * (getFloodlightStatus/setFloodlightConfig/manualFloodlightOp) are not ported here since
 * the only verified hardware (see C100_FILES.md) has no floodlight. Doesn't touch
 * src/smartcam/modules/camera.ts.
 */

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Info about the most recent alarm-event trigger on channel 1. */
    getLastAlarmInfo(): Promise<Record<string, unknown>>;
    /** Manually trigger the alarm-event pipeline (recording/notification), not the siren. */
    startManualAlarm(): Promise<Record<string, unknown>>;
    stopManualAlarm(): Promise<Record<string, unknown>>;
    /** Toggle HDR on the main video stream. */
    setHDR(enable: boolean): Promise<Record<string, unknown>>;
  }
}

Camera.prototype.getLastAlarmInfo = async function (
  this: Camera,
): Promise<Record<string, unknown>> {
  const resp = await this.smartCamDevice.rawQuery({
    getLastAlarmInfo: { msg_alarm: { name: ["chn1_msg_alarm_info"] } },
  });
  const msgAlarm = (resp.getLastAlarmInfo as Record<string, unknown> | undefined)
    ?.msg_alarm as Record<string, unknown> | undefined;
  return (msgAlarm?.chn1_msg_alarm_info as Record<string, unknown> | undefined) ?? {};
};

Camera.prototype.startManualAlarm = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    do: { msg_alarm: { manual_msg_alarm: { action: "start" } } },
  });
};

Camera.prototype.stopManualAlarm = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    do: { msg_alarm: { manual_msg_alarm: { action: "stop" } } },
  });
};

Camera.prototype.setHDR = function (
  this: Camera,
  enable: boolean,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    setHDR: { video: { set_hdr: { hdr: enable ? 1 : 0, secname: "main" } } },
  });
};
