/** Interface for child setup on hubs. */
export interface ChildSetup {
  get supportedCategories(): string[];

  /** Scan for new devices and pair them. */
  pair(options?: { timeout?: number }): Promise<Record<string, unknown>[]>;

  /** Remove device from the hub. */
  unpair(deviceId: string): Promise<Record<string, unknown>>;
}
