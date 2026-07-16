import {
  type Credentials,
  createCredentials,
  getNamedDefaultCredentials,
} from "../core/credentials.ts";
import type { DeviceConfig } from "../core/deviceconfig.ts";
import {
  AuthenticationError,
  ConnectionError,
  DeviceError,
  KasaException,
  KasaTimeoutError,
  RetryableError,
  SMART_AUTHENTICATION_ERRORS,
  SMART_RETRYABLE_ERRORS,
  SmartErrorCode,
} from "../core/exceptions.ts";
import { BaseTransport } from "./basetransport.ts";
import { AesEncryptionSession } from "./crypto/aes.ts";
import { sha1 } from "./crypto/hash.ts";
import { KeyPair } from "./crypto/rsa.ts";
import { HttpClient } from "./httpclient.ts";

const ONE_DAY_SECONDS = 86400;
const SESSION_EXPIRE_BUFFER_SECONDS = 60 * 20;
const KEY_PAIR_CONTENT_LENGTH = 314;

function credentialsEqual(a: Credentials, b: Credentials): boolean {
  return a.username === b.username && a.password === b.password;
}

enum TransportState {
  HandshakeRequired = "HANDSHAKE_REQUIRED",
  LoginRequired = "LOGIN_REQUIRED",
  Established = "ESTABLISHED",
}

/**
 * Implementation of the AES encryption protocol.
 *
 * AES is the name used in device discovery for TP-Link's TAPO encryption protocol,
 * sometimes used by newer firmware versions on Kasa devices.
 */
export class AesTransport extends BaseTransport {
  static readonly DEFAULT_PORT = 80;
  static readonly SESSION_COOKIE_NAME = "TP_SESSIONID";
  static readonly TIMEOUT_COOKIE_NAME = "TIMEOUT";
  static readonly COMMON_HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
    requestByApp: "true",
    Accept: "application/json",
  };

  private readonly httpClient: HttpClient;
  private readonly loginVersion: number | undefined;
  private loginParams: Record<string, string>;
  private defaultCredentials: Credentials | undefined;
  private state: TransportState = TransportState.HandshakeRequired;
  private encryptionSession: AesEncryptionSession | undefined;
  private sessionExpireAt: number | undefined;
  private sessionCookie: Record<string, string> | undefined;
  private keyPair: KeyPair | undefined;
  private readonly appUrl: string;
  private tokenUrl: string | undefined;

  constructor(config: DeviceConfig) {
    super(config);
    this.loginVersion = config.connectionType.loginVersion;

    if (
      (!this.credentialsValue || !this.credentialsValue.username) &&
      !this.credentialsHashValue
    ) {
      this.credentialsValue = createCredentials();
    }
    if (this.credentialsValue) {
      this.loginParams = this.getLoginParams(this.credentialsValue);
    } else {
      this.loginParams = JSON.parse(
        Buffer.from(this.credentialsHashValue ?? "", "base64").toString("utf-8"),
      );
    }

    this.httpClient = new HttpClient(config);
    if (config.aesKeys) {
      this.keyPair = KeyPair.createFromDerKeys(
        config.aesKeys.private,
        config.aesKeys.public,
      );
    }
    this.appUrl = `http://${this.host}:${this.port}/app`;
  }

  get defaultPort(): number {
    return this.deviceConfig.connectionType.httpPort ?? AesTransport.DEFAULT_PORT;
  }

  get credentialsHash(): string | undefined {
    if (
      this.credentialsValue &&
      credentialsEqual(this.credentialsValue, createCredentials())
    ) {
      return undefined;
    }
    return Buffer.from(JSON.stringify(this.loginParams)).toString("base64");
  }

  private getLoginParams(credentials: Credentials): Record<string, string> {
    const [un, pw] = AesTransport.hashCredentials(this.loginVersion === 2, credentials);
    const passwordFieldName = this.loginVersion === 2 ? "password2" : "password";
    return { [passwordFieldName]: pw, username: un };
  }

  static hashCredentials(loginV2: boolean, credentials: Credentials): [string, string] {
    const un = Buffer.from(
      sha1(Buffer.from(credentials.username)).toString("hex"),
    ).toString("base64");
    const pw = loginV2
      ? Buffer.from(sha1(Buffer.from(credentials.password)).toString("hex")).toString(
          "base64",
        )
      : Buffer.from(credentials.password).toString("base64");
    return [un, pw];
  }

  private handleResponseErrorCode(respDict: Record<string, unknown>, msg: string): void {
    const errorCodeRaw = respDict.error_code as number | undefined;
    const errorCode = errorCodeRaw ?? SmartErrorCode.INTERNAL_UNKNOWN_ERROR;
    if (errorCode === SmartErrorCode.SUCCESS) return;
    const fullMsg = `${msg}: ${this.host}: ${SmartErrorCode[errorCode] ?? errorCode}(${errorCode})`;
    if ((SMART_RETRYABLE_ERRORS as number[]).includes(errorCode)) {
      throw new RetryableError(fullMsg, { errorCode });
    }
    if ((SMART_AUTHENTICATION_ERRORS as number[]).includes(errorCode)) {
      this.state = TransportState.HandshakeRequired;
      throw new AuthenticationError(fullMsg, { errorCode });
    }
    throw new DeviceError(fullMsg, { errorCode });
  }

  private async sendSecurePassthrough(request: string): Promise<Record<string, unknown>> {
    const url =
      this.state === TransportState.Established && this.tokenUrl
        ? this.tokenUrl
        : this.appUrl;

    if (!this.encryptionSession)
      throw new KasaException("Encryption session not established");
    const encryptedPayload = this.encryptionSession.encrypt(
      Buffer.from(request, "utf-8"),
    );
    const passthroughRequest = {
      method: "securePassthrough",
      params: { request: encryptedPayload.toString("utf-8") },
    };

    const { status, data } = await this.httpClient.post(url, {
      json: passthroughRequest,
      headers: AesTransport.COMMON_HEADERS,
      cookiesDict: this.sessionCookie,
    });

    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to passthrough`,
      );
    }

    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    this.handleResponseErrorCode(respDict, "Error sending secure_passthrough message");

    const result = respDict.result as { response: string };
    try {
      const decrypted = this.encryptionSession.decrypt(
        Buffer.from(result.response, "utf-8"),
      );
      return JSON.parse(decrypted) as Record<string, unknown>;
    } catch (ex) {
      try {
        return JSON.parse(result.response) as Record<string, unknown>;
      } catch {
        throw new KasaException(
          `Unable to decrypt response from ${this.host}, error: ${ex}, response: ${result.response}`,
        );
      }
    }
  }

  private async performLogin(): Promise<void> {
    try {
      await this.tryLogin(this.loginParams);
    } catch (ex) {
      if (
        !(ex instanceof AuthenticationError) ||
        ex.errorCode !== SmartErrorCode.LOGIN_ERROR
      ) {
        throw ex;
      }
      try {
        this.defaultCredentials ??= getNamedDefaultCredentials("TAPO");
        await this.performHandshake();
        await this.tryLogin(this.getLoginParams(this.defaultCredentials));
      } catch (innerEx) {
        if (
          innerEx instanceof AuthenticationError ||
          innerEx instanceof ConnectionError ||
          innerEx instanceof KasaTimeoutError
        ) {
          throw innerEx;
        }
        throw new KasaException(
          `Unable to login and trying default login raised another exception: ${innerEx}`,
        );
      }
    }
  }

  private async tryLogin(loginParams: Record<string, string>): Promise<void> {
    const loginRequest = {
      method: "login_device",
      params: loginParams,
      request_time_milis: Date.now(),
    };
    const respDict = await this.sendSecurePassthrough(JSON.stringify(loginRequest));
    this.handleResponseErrorCode(respDict, "Error logging in");
    const result = respDict.result as { token: string };
    this.tokenUrl = `${this.appUrl}?token=${result.token}`;
    this.state = TransportState.Established;
  }

  private async performHandshake(): Promise<void> {
    this.tokenUrl = undefined;
    this.sessionExpireAt = undefined;
    this.sessionCookie = undefined;

    if (!this.keyPair) {
      const kp = KeyPair.createKeyPair();
      this.deviceConfig.aesKeys = {
        private: kp.privateKeyDerB64,
        public: kp.publicKeyDerB64,
      };
      this.keyPair = kp;
    }
    const pubKey = `-----BEGIN PUBLIC KEY-----\n${this.keyPair.publicKeyDerB64}\n-----END PUBLIC KEY-----\n`;
    const requestBody = { method: "handshake", params: { key: pubKey } };

    const headers = {
      ...AesTransport.COMMON_HEADERS,
      "Content-Length": String(KEY_PAIR_CONTENT_LENGTH),
    };

    const { status, data } = await this.httpClient.post(this.appUrl, {
      json: requestBody,
      headers,
      cookiesDict: this.sessionCookie,
    });

    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to handshake`,
      );
    }

    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    this.handleResponseErrorCode(respDict, "Unable to complete handshake");

    const result = respDict.result as { key: string };
    const handshakeKey = result.key;

    const cookie =
      this.httpClient.getCookie(AesTransport.SESSION_COOKIE_NAME) ??
      this.httpClient.getCookie("SESSIONID");
    if (cookie) this.sessionCookie = { [AesTransport.SESSION_COOKIE_NAME]: cookie };

    const timeout = Number(
      this.httpClient.getCookie(AesTransport.TIMEOUT_COOKIE_NAME) ?? ONE_DAY_SECONDS,
    );
    this.sessionExpireAt = Date.now() / 1000 + timeout - SESSION_EXPIRE_BUFFER_SECONDS;

    const keyAndIv = this.keyPair.decryptHandshakeKey(
      Buffer.from(handshakeKey, "base64"),
    );
    this.encryptionSession = AesEncryptionSession.createFromHandshakeKey(keyAndIv);
    this.state = TransportState.LoginRequired;
  }

  private handshakeSessionExpired(): boolean {
    return (
      this.sessionExpireAt === undefined || this.sessionExpireAt - Date.now() / 1000 <= 0
    );
  }

  async send(request: string): Promise<Record<string, unknown>> {
    if (
      this.state === TransportState.HandshakeRequired ||
      this.handshakeSessionExpired()
    ) {
      await this.performHandshake();
    }
    if (this.state !== TransportState.Established) {
      try {
        await this.performLogin();
      } catch (ex) {
        this.state = TransportState.HandshakeRequired;
        throw ex;
      }
    }
    return this.sendSecurePassthrough(request);
  }

  async close(): Promise<void> {
    await this.reset();
    await this.httpClient.close();
  }

  async reset(): Promise<void> {
    this.state = TransportState.HandshakeRequired;
  }
}
