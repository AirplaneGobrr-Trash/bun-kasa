import type { DeviceConfig } from "../core/deviceconfig.ts";
import type {
  BaseProtocol as CoreBaseProtocol,
  DeviceTransport,
} from "../core/protocol.ts";
import type { BaseTransport } from "../transports/basetransport.ts";

/** Base class for all TP-Link Smart Home communication protocols. */
export abstract class BaseProtocol implements CoreBaseProtocol {
  protected readonly transportRef: BaseTransport;

  constructor(transport: BaseTransport) {
    this.transportRef = transport;
  }

  get transport(): DeviceTransport {
    return this.transportRef;
  }

  protected get host(): string {
    return this.transportRef.host;
  }

  get config(): DeviceConfig {
    return this.transportRef.config;
  }

  /** Query the device for the protocol. */
  abstract query(
    request: string | Record<string, unknown>,
    retryCount?: number,
  ): Promise<Record<string, unknown>>;

  /** Close the protocol. */
  abstract close(): Promise<void>;
}
