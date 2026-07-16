import type { Credentials } from "./credentials.ts";
import type { DeviceConfig } from "./deviceconfig.ts";

/**
 * Minimal transport contract that {@link BaseProtocol} implementations expose to
 * `Device`. Concrete transports (XOR, KLAP, AES, ...) are implemented in
 * `src/transports/` and satisfy this shape.
 */
export interface DeviceTransport {
  readonly host: string;
  readonly port: number;
  readonly credentials: Credentials | undefined;
  readonly credentialsHash: string | undefined;
  readonly config: DeviceConfig;
}

/**
 * Minimal protocol contract that `Device` depends on. Concrete protocols
 * (IOT, SMART, SMARTCAM) are implemented in `src/protocols/` and satisfy this
 * shape by wrapping a {@link DeviceTransport}.
 */
export interface BaseProtocol {
  readonly transport: DeviceTransport;
  readonly config: DeviceConfig;
  query(request: string | Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}
