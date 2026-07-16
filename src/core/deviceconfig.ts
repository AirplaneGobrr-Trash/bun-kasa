import { type Credentials, createCredentials } from "./credentials.ts";
import { KasaException } from "./exceptions.ts";

/** A public/private key pair. */
export interface KeyPairDict {
  private: string;
  public: string;
}

/** Encryption type used by a device. */
export enum DeviceEncryptionType {
  Klap = "KLAP",
  Aes = "AES",
  Xor = "XOR",
}

/** Device family identifier. */
export enum DeviceFamily {
  IotSmartPlugSwitch = "IOT.SMARTPLUGSWITCH",
  IotSmartBulb = "IOT.SMARTBULB",
  IotIpCamera = "IOT.IPCAMERA",
  SmartKasaPlug = "SMART.KASAPLUG",
  SmartKasaSwitch = "SMART.KASASWITCH",
  SmartTapoPlug = "SMART.TAPOPLUG",
  SmartTapoBulb = "SMART.TAPOBULB",
  SmartTapoSwitch = "SMART.TAPOSWITCH",
  SmartTapoHub = "SMART.TAPOHUB",
  SmartKasaHub = "SMART.KASAHUB",
  SmartIpCamera = "SMART.IPCAMERA",
  SmartTapoRobovac = "SMART.TAPOROBOVAC",
  SmartTapoChime = "SMART.TAPOCHIME",
  SmartTapoDoorbell = "SMART.TAPODOORBELL",
}

/** Parameters determining the connection type for a device. */
export class DeviceConnectionParameters {
  constructor(
    public deviceFamily: DeviceFamily,
    public encryptionType: DeviceEncryptionType,
    public loginVersion?: number,
    public https = false,
    public httpPort?: number,
  ) {}

  static fromValues(
    deviceFamily: string,
    encryptionType: string,
    options?: { loginVersion?: number; https?: boolean; httpPort?: number },
  ): DeviceConnectionParameters {
    const family = Object.values(DeviceFamily).find((value) => value === deviceFamily);
    const encryption = Object.values(DeviceEncryptionType).find(
      (value) => value === encryptionType,
    );
    if (!family || !encryption) {
      throw new KasaException(
        `Invalid connection parameters for ${deviceFamily}.${encryptionType}.${options?.loginVersion}`,
      );
    }
    return new DeviceConnectionParameters(
      family,
      encryption,
      options?.loginVersion,
      options?.https ?? false,
      options?.httpPort,
    );
  }

  toDict(): Record<string, unknown> {
    const dict: Record<string, unknown> = {
      device_family: this.deviceFamily,
      encryption_type: this.encryptionType,
      https: this.https,
    };
    if (this.loginVersion !== undefined) dict.login_version = this.loginVersion;
    if (this.httpPort !== undefined) dict.http_port = this.httpPort;
    return dict;
  }

  static fromDict(dict: Record<string, unknown>): DeviceConnectionParameters {
    return DeviceConnectionParameters.fromValues(
      dict.device_family as string,
      dict.encryption_type as string,
      {
        loginVersion: dict.login_version as number | undefined,
        https: dict.https as boolean | undefined,
        httpPort: dict.http_port as number | undefined,
      },
    );
  }
}

function defaultConnectionType(): DeviceConnectionParameters {
  return new DeviceConnectionParameters(
    DeviceFamily.IotSmartPlugSwitch,
    DeviceEncryptionType.Xor,
  );
}

/** Parameters that determine how to connect to a device. */
export class DeviceConfig {
  static readonly DEFAULT_TIMEOUT = 5;

  /** IP address or hostname */
  host: string;
  /** Timeout for querying the device, in seconds */
  timeout: number;
  /** Override the default port to support port forwarding */
  portOverride?: number;
  /** Credentials for devices requiring authentication */
  credentials?: Credentials;
  /**
   * Credentials hash for devices requiring authentication.
   * If credentials are also supplied they take precedence over credentialsHash.
   */
  credentialsHash?: string;
  /** The batch size for protocols supporting multiple request batches. */
  batchSize?: number;
  /** The protocol specific type of connection. Defaults to the legacy type. */
  connectionType: DeviceConnectionParameters;
  aesKeys?: KeyPairDict;

  constructor(
    host: string,
    options?: {
      timeout?: number;
      portOverride?: number;
      credentials?: Credentials;
      credentialsHash?: string;
      batchSize?: number;
      connectionType?: DeviceConnectionParameters;
      aesKeys?: KeyPairDict;
    },
  ) {
    this.host = host;
    this.timeout = options?.timeout ?? DeviceConfig.DEFAULT_TIMEOUT;
    this.portOverride = options?.portOverride;
    this.credentials = options?.credentials;
    this.credentialsHash = options?.credentialsHash;
    this.batchSize = options?.batchSize;
    this.connectionType = options?.connectionType ?? defaultConnectionType();
    this.aesKeys = options?.aesKeys;
  }

  /** True if the device uses http. */
  get usesHttp(): boolean {
    return (
      this.connectionType.encryptionType !== DeviceEncryptionType.Xor ||
      this.connectionType.https
    );
  }

  toDict(): Record<string, unknown> {
    const dict: Record<string, unknown> = {
      host: this.host,
      timeout: this.timeout,
      connection_type: this.connectionType.toDict(),
    };
    if (this.portOverride !== undefined) dict.port_override = this.portOverride;
    if (this.credentials !== undefined) dict.credentials = { ...this.credentials };
    if (this.credentialsHash !== undefined) dict.credentials_hash = this.credentialsHash;
    if (this.batchSize !== undefined) dict.batch_size = this.batchSize;
    if (this.aesKeys !== undefined) dict.aes_keys = this.aesKeys;
    return dict;
  }

  static fromDict(dict: Record<string, unknown>): DeviceConfig {
    const rawCredentials = dict.credentials as
      | { username: string; password: string }
      | undefined;
    return new DeviceConfig(dict.host as string, {
      timeout: dict.timeout as number | undefined,
      portOverride: dict.port_override as number | undefined,
      credentials: rawCredentials
        ? createCredentials(rawCredentials.username, rawCredentials.password)
        : undefined,
      credentialsHash: dict.credentials_hash as string | undefined,
      batchSize: dict.batch_size as number | undefined,
      connectionType: dict.connection_type
        ? DeviceConnectionParameters.fromDict(
            dict.connection_type as Record<string, unknown>,
          )
        : undefined,
      aesKeys: dict.aes_keys as KeyPairDict | undefined,
    });
  }

  /**
   * Convert deviceconfig to a plain object, controlling how credentials are serialized.
   *
   * If credentialsHashOverride is provided, credentials are omitted.
   * If credentialsHashOverride is '', both credentials and credentialsHash are omitted.
   */
  toDictControlCredentials(options?: {
    credentialsHashOverride?: string;
    excludeCredentials?: boolean;
  }): Record<string, unknown> {
    if (options?.credentialsHashOverride === undefined) {
      if (!options?.excludeCredentials) return this.toDict();
      const clone = new DeviceConfig(this.host, {
        ...this,
        credentials: undefined,
      });
      return clone.toDict();
    }

    const clone = new DeviceConfig(this.host, {
      ...this,
      credentialsHash: options.credentialsHashOverride || undefined,
      credentials: undefined,
    });
    return clone.toDict();
  }
}
