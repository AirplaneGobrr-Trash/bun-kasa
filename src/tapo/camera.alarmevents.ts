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

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class CameraAlarmEvents {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  /** Info about the most recent alarm-event trigger on channel 1. */
  async getLastAlarmInfo(): Promise<Record<string, unknown>> {
    const resp = await this.#rawQuery({
      getLastAlarmInfo: { msg_alarm: { name: ["chn1_msg_alarm_info"] } },
    });
    const msgAlarm = (resp.getLastAlarmInfo as Record<string, unknown> | undefined)
      ?.msg_alarm as Record<string, unknown> | undefined;
    return (msgAlarm?.chn1_msg_alarm_info as Record<string, unknown> | undefined) ?? {};
  }

  /** Manually trigger the alarm-event pipeline (recording/notification), not the siren. */
  startManualAlarm(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      do: { msg_alarm: { manual_msg_alarm: { action: "start" } } },
    });
  }

  stopManualAlarm(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      do: { msg_alarm: { manual_msg_alarm: { action: "stop" } } },
    });
  }

  /** Toggle HDR on the main video stream. */
  setHDR(enable: boolean): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      setHDR: { video: { set_hdr: { hdr: enable ? 1 : 0, secname: "main" } } },
    });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Alarm-event pipeline (msg_alarm trigger/recording), plus HDR toggle. */
    readonly alarmEvents: CameraAlarmEvents;
  }
}

const alarmEventsMap = new WeakMap<Camera, CameraAlarmEvents>();

Object.defineProperty(Camera.prototype, "alarmEvents", {
  configurable: true,
  get(this: Camera): CameraAlarmEvents {
    let instance = alarmEventsMap.get(this);
    if (!instance) {
      instance = new CameraAlarmEvents(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      alarmEventsMap.set(this, instance);
    }
    return instance;
  },
});
