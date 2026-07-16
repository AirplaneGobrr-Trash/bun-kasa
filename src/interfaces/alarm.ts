/** Base interface to represent an alarm module. */
export interface Alarm {
  get alarmSound(): string;
  setAlarmSound(sound: string): Promise<Record<string, unknown>>;

  get alarmSounds(): string[];

  get alarmVolume(): number;
  setAlarmVolume(volume: number): Promise<Record<string, unknown>>;

  get alarmDuration(): number;
  setAlarmDuration(duration: number): Promise<Record<string, unknown>>;

  get active(): boolean;

  /**
   * Play the alarm.
   *
   * The optional `duration` (seconds), `volume`, and `sound` override the device
   * settings. See {@link alarmSounds} for the list of sounds available.
   */
  play(options?: { duration?: number; volume?: number; sound?: string }): Promise<
    Record<string, unknown>
  >;

  stop(): Promise<Record<string, unknown>>;
}
