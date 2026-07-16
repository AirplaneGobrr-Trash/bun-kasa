/** Base interface for TP-Link time modules. */
export interface Time {
  /** Return the current device time. */
  get time(): Date;

  /** Return the current timezone as an IANA identifier. */
  get timezone(): string;

  setTime(dt: Date): Promise<Record<string, unknown>>;
}
