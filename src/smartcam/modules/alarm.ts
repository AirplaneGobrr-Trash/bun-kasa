import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type { Alarm as AlarmInterface } from "../../interfaces/alarm.ts";
import { SmartCamModule } from "../smartcammodule.ts";

const DURATION_MIN = 0;
const DURATION_MAX = 6000;
const VOLUME_MIN = 0;
const VOLUME_MAX = 10;

/** Implementation of the SMARTCAM alarm (siren) module. */
export class Alarm extends SmartCamModule implements AlarmInterface {
  static override readonly requiredComponent = "siren";
  static override readonly queryGetterName = "getSirenStatus";
  static override readonly queryModuleName = "siren";

  override query(): Record<string, unknown> {
    const q = super.query();
    q.getSirenConfig = { [this.queryModuleName]: {} };
    q.getSirenTypeList = { [this.queryModuleName]: {} };
    return q;
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
        category: FeatureCategory.Debug,
        type: FeatureType.BinarySensor,
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
        attributeGetter: "alarmVolume",
        attributeSetter: "setAlarmVolume",
        category: FeatureCategory.Config,
        type: FeatureType.Number,
        rangeGetter: () => [VOLUME_MIN, VOLUME_MAX],
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
        rangeGetter: () => [DURATION_MIN, DURATION_MAX],
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
    return (this.data.getSirenConfig as { siren_type: string }).siren_type;
  }

  async setAlarmSound(sound: string): Promise<Record<string, unknown>> {
    try {
      const config = this.validateAndGetConfig({ sound });
      return await this.call("setSirenConfig", { siren: config });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get alarmSounds(): string[] {
    return (this.data.getSirenTypeList as { siren_type_list: string[] }).siren_type_list;
  }

  /** Unlike duration, the device expects/returns a string for volume. */
  get alarmVolume(): number {
    return Number((this.data.getSirenConfig as { volume: string }).volume);
  }

  async setAlarmVolume(volume: number): Promise<Record<string, unknown>> {
    try {
      const config = this.validateAndGetConfig({ volume });
      return await this.call("setSirenConfig", { siren: config });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get alarmDuration(): number {
    return (this.data.getSirenConfig as { duration: number }).duration;
  }

  async setAlarmDuration(duration: number): Promise<Record<string, unknown>> {
    try {
      const config = this.validateAndGetConfig({ duration });
      return await this.call("setSirenConfig", { siren: config });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get active(): boolean {
    return (this.data.getSirenStatus as { status: string }).status !== "off";
  }

  async play(options?: { duration?: number; volume?: number; sound?: string }): Promise<
    Record<string, unknown>
  > {
    const config = this.validateAndGetConfig(options ?? {});
    if (Object.keys(config).length > 0)
      await this.call("setSirenConfig", { siren: config });
    return this.call("setSirenStatus", { siren: { status: "on" } });
  }

  async stop(): Promise<Record<string, unknown>> {
    return this.call("setSirenStatus", { siren: { status: "off" } });
  }

  private validateAndGetConfig(options: {
    duration?: number;
    volume?: number;
    sound?: string;
  }): Record<string, unknown> {
    if (options.sound && !this.alarmSounds.includes(options.sound)) {
      throw new Error(
        `sound must be one of ${this.alarmSounds.join(", ")}: ${options.sound}`,
      );
    }
    if (
      options.duration !== undefined &&
      (options.duration < DURATION_MIN || options.duration > DURATION_MAX)
    ) {
      throw new Error(`duration must be between ${DURATION_MIN} and ${DURATION_MAX}`);
    }
    if (
      options.volume !== undefined &&
      (options.volume < VOLUME_MIN || options.volume > VOLUME_MAX)
    ) {
      throw new Error(`volume must be between ${VOLUME_MIN} and ${VOLUME_MAX}`);
    }

    const config: Record<string, unknown> = {};
    if (options.sound) config.siren_type = options.sound;
    if (options.duration !== undefined) config.duration = options.duration;
    if (options.volume !== undefined) config.volume = String(options.volume);
    return config;
  }
}
