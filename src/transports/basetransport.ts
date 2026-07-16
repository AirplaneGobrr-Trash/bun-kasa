import type { Credentials } from "../core/credentials.ts";
import type { DeviceConfig } from "../core/deviceconfig.ts";
import type { DeviceTransport } from "../core/protocol.ts";

/** Base class for all TP-Link protocol transports. */
export abstract class BaseTransport implements DeviceTransport {
  static readonly DEFAULT_TIMEOUT = 5;

  protected readonly deviceConfig: DeviceConfig;
  protected hostValue: string;
  protected credentialsValue: Credentials | undefined;
  protected credentialsHashValue: string | undefined;
  protected timeoutValue: number;

  constructor(config: DeviceConfig) {
    this.deviceConfig = config;
    this.hostValue = config.host;
    this.credentialsValue = config.credentials;
    this.credentialsHashValue = config.credentialsHash;
    if (!config.timeout) config.timeout = BaseTransport.DEFAULT_TIMEOUT;
    this.timeoutValue = config.timeout;
  }

  /** The default port for the transport. */
  abstract get defaultPort(): number;

  /** The hashed credentials used by the transport. */
  abstract get credentialsHash(): string | undefined;

  get host(): string {
    return this.hostValue;
  }

  set host(value: string) {
    this.hostValue = value;
  }

  get port(): number {
    return this.deviceConfig.portOverride ?? this.defaultPort;
  }

  get credentials(): Credentials | undefined {
    return this.credentialsValue;
  }

  get config(): DeviceConfig {
    return this.deviceConfig;
  }

  get timeout(): number {
    return this.timeoutValue;
  }

  /** Send a message to the device and return the parsed response. */
  abstract send(request: string): Promise<Record<string, unknown>>;

  /** Close the transport. */
  abstract close(): Promise<void>;

  /** Reset internal state. */
  abstract reset(): Promise<void>;
}
