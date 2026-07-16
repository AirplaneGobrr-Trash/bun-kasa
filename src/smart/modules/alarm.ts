import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { Alarm as AlarmInterface } from "../../interfaces/alarm.ts";
import { SmartModule } from "../smartmodule.ts";

const DURATION_MAX = 10 * 60;

const VOLUME_INT_TO_STR: Record<number, string> = {
  0: "mute",
  1: "low",
  2: "normal",
  3: "high",
};
const VOLUME_STR_LIST = Object.values(VOLUME_INT_TO_STR);
const VOLUME_INT_RANGE: [number, number] = [0, 3];
const VOLUME_STR_TO_INT: Record<string, number> = Object.fromEntries(
  Object.entries(VOLUME_INT_TO_STR).map(([k, v]) => [v, Number(k)]),
);

export type AlarmVolume = "mute" | "low" | "normal" | "high";

/** Implementation of the alarm module. */
export class Alarm extends SmartModule implements AlarmInterface {
  static override readonly requiredComponent = "alarm";

  override query(): Record<string, unknown> {
    return { get_alarm_configure: null, get_support_alarm_type_list: null };
  }

  override initializeFeatures(): void {
    const device = this.device;
    this.addFeature(
      new Feature(device, {
        id: "alarm",
        name: "Alarm",
        container: this,
        attributeGetter: "active",
        icon: "mdi:bell",
        type: FeatureType.BinarySensor,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "alarm_source",
        name: "Alarm source",
        container: this,
        attributeGetter: "source",
        icon: "mdi:bell",
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "alarm_sound",
        name: "Alarm sound",
        container: this,
        attributeGetter: "alarmSound",
        attributeSetter: "setAlarmSound",
        category: FeatureCategory.Config,
        type: FeatureType.Choice,
        choicesGetter: "alarmSounds",
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "alarm_volume",
        name: "Alarm volume",
        container: this,
        attributeGetter: "alarmVolumeStr",
        attributeSetter: "setAlarmVolume",
        category: FeatureCategory.Config,
        type: FeatureType.Choice,
        choicesGetter: () => VOLUME_STR_LIST,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "alarm_volume_level",
        name: "Alarm volume",
        container: this,
        attributeGetter: "alarmVolume",
        attributeSetter: "setAlarmVolume",
        category: FeatureCategory.Config,
        type: FeatureType.Number,
        rangeGetter: () => VOLUME_INT_RANGE,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "alarm_duration",
        name: "Alarm duration",
        container: this,
        attributeGetter: "alarmDuration",
        attributeSetter: "setAlarmDuration",
        category: FeatureCategory.Config,
        type: FeatureType.Number,
        rangeGetter: () => [1, DURATION_MAX],
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "test_alarm",
        name: "Test alarm",
        container: this,
        attributeSetter: "play",
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "stop_alarm",
        name: "Stop alarm",
        container: this,
        attributeSetter: "stop",
        type: FeatureType.Action,
      }),
    );
  }

  get alarmSound(): string {
    return (this.data.get_alarm_configure as { type: string }).type;
  }

  async setAlarmSound(sound: string): Promise<Record<string, unknown>> {
    this.checkSound(sound);
    const payload = {
      ...(this.data.get_alarm_configure as Record<string, unknown>),
      type: sound,
    };
    return this.call("set_alarm_configure", payload);
  }

  get alarmSounds(): string[] {
    return (this.data.get_support_alarm_type_list as { alarm_type_list: string[] })
      .alarm_type_list;
  }

  get alarmVolume(): number {
    return VOLUME_STR_TO_INT[this.alarmVolumeStr] as number;
  }

  private get alarmVolumeStr(): AlarmVolume {
    return (this.data.get_alarm_configure as { volume: AlarmVolume }).volume;
  }

  async setAlarmVolume(volume: AlarmVolume | number): Promise<Record<string, unknown>> {
    const converted = this.checkAndConvertVolume(volume);
    const payload = {
      ...(this.data.get_alarm_configure as Record<string, unknown>),
      volume: converted,
    };
    return this.call("set_alarm_configure", payload);
  }

  get alarmDuration(): number {
    return (this.data.get_alarm_configure as { duration: number }).duration;
  }

  async setAlarmDuration(duration: number): Promise<Record<string, unknown>> {
    this.checkDuration(duration);
    const payload = {
      ...(this.data.get_alarm_configure as Record<string, unknown>),
      duration,
    };
    return this.call("set_alarm_configure", payload);
  }

  get active(): boolean {
    return Boolean(this.smartDevice.sysInfo.in_alarm);
  }

  get source(): string | undefined {
    const src = this.smartDevice.sysInfo.in_alarm_source as string | undefined;
    return src || undefined;
  }

  async play(options?: {
    duration?: number;
    volume?: number | AlarmVolume;
    sound?: string;
  }): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};
    if (options?.duration !== undefined) {
      this.checkDuration(options.duration);
      params.alarm_duration = options.duration;
    }
    if (options?.volume !== undefined) {
      params.alarm_volume = this.checkAndConvertVolume(options.volume);
    }
    if (options?.sound !== undefined) {
      this.checkSound(options.sound);
      params.alarm_type = options.sound;
    }
    return this.call("play_alarm", params);
  }

  async stop(): Promise<Record<string, unknown>> {
    return this.call("stop_alarm");
  }

  private checkAndConvertVolume(volume: string | number): string {
    const resolved =
      typeof volume === "number" ? (VOLUME_INT_TO_STR[volume] ?? "invalid") : volume;
    if (!Object.values(VOLUME_INT_TO_STR).includes(resolved)) {
      throw new Error(
        `Invalid volume ${resolved} available: ${Object.values(VOLUME_INT_TO_STR)}`,
      );
    }
    return resolved;
  }

  private checkDuration(duration: number): void {
    if (duration < 1 || duration > DURATION_MAX) {
      throw new Error(`Invalid duration ${duration} available: 1-600`);
    }
  }

  private checkSound(sound: string): void {
    if (!this.alarmSounds.includes(sound)) {
      throw new Error(`Invalid sound ${sound} available: ${this.alarmSounds}`);
    }
  }
}
