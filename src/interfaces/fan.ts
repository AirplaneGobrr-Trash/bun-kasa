/** Interface for a fan. */
export interface Fan {
  get fanSpeedLevel(): number;
  setFanSpeedLevel(level: number): Promise<Record<string, unknown>>;
}
