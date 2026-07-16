import {
  type Credentials,
  createCredentials,
  getNamedDefaultCredentials,
} from "../core/credentials.ts";
import type { DeviceConfig } from "../core/deviceconfig.ts";
import {
  AuthenticationError,
  DeviceError,
  KasaException,
  RetryableError,
  SMART_AUTHENTICATION_ERRORS,
  SMART_RETRYABLE_ERRORS,
  SmartErrorCode,
} from "../core/exceptions.ts";
import { BaseTransport } from "./basetransport.ts";
import { md5 } from "./crypto/hash.ts";
import { HttpClient } from "./httpclient.ts";

const ONE_DAY_SECONDS = 86400;
const SESSION_EXPIRE_BUFFER_SECONDS = 60 * 20;
const BACKOFF_SECONDS_AFTER_LOGIN_ERROR = 1;

function md5Hash(payload: Buffer): string {
  return md5(payload).toString("hex").toUpperCase();
}

enum TransportState {
  LoginRequired = "LOGIN_REQUIRED",
  Established = "ESTABLISHED",
}

/**
 * Implementation of the clear-text passthrough SSL transport.
 *
 * This transport does not encrypt the passthrough payloads at all, but requires a
 * login. Seen on some devices (like robovacs).
 */
export class SslTransport extends BaseTransport {
  static readonly DEFAULT_PORT = 4433;
  static readonly COMMON_HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
  };

  private readonly httpClient: HttpClient;
  private loginParams: Record<string, string>;
  private defaultCredentials: Credentials | undefined;
  private state: TransportState = TransportState.LoginRequired;
  private sessionExpireAt: number | undefined;
  private appUrl: string;

  constructor(config: DeviceConfig) {
    super(config);

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
    this.appUrl = `https://${this.host}:${this.port}/app`;
  }

  get defaultPort(): number {
    return this.deviceConfig.connectionType.httpPort ?? SslTransport.DEFAULT_PORT;
  }

  get credentialsHash(): string {
    return Buffer.from(JSON.stringify(this.loginParams)).toString("base64");
  }

  private getLoginParams(credentials: Credentials): Record<string, string> {
    const [un, pw] = SslTransport.hashCredentials(credentials);
    return { password: pw, username: un };
  }

  static hashCredentials(credentials: Credentials): [string, string] {
    return [credentials.username, md5Hash(Buffer.from(credentials.password))];
  }

  private async handleResponseErrorCode(
    respDict: Record<string, unknown>,
    msg: string,
  ): Promise<void> {
    const errorCode = respDict.error_code as SmartErrorCode;
    if (errorCode === SmartErrorCode.SUCCESS) return;
    const fullMsg = `${msg}: ${this.host}: ${SmartErrorCode[errorCode]}(${errorCode})`;
    if ((SMART_RETRYABLE_ERRORS as number[]).includes(errorCode)) {
      throw new RetryableError(fullMsg, { errorCode });
    }
    if ((SMART_AUTHENTICATION_ERRORS as number[]).includes(errorCode)) {
      await this.reset();
      throw new AuthenticationError(fullMsg, { errorCode });
    }
    throw new DeviceError(fullMsg, { errorCode });
  }

  private async sendRequest(request: string): Promise<Record<string, unknown>> {
    const { status, data } = await this.httpClient.post(this.appUrl, {
      json: request,
      headers: SslTransport.COMMON_HEADERS,
      insecureTls: true,
    });

    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status}`,
      );
    }

    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    await this.handleResponseErrorCode(respDict, "Error sending request");
    return respDict;
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
        if (!this.defaultCredentials) {
          this.defaultCredentials = getNamedDefaultCredentials("TAPO");
          await new Promise((resolve) =>
            setTimeout(resolve, BACKOFF_SECONDS_AFTER_LOGIN_ERROR * 1000),
          );
        }
        await this.tryLogin(this.getLoginParams(this.defaultCredentials));
      } catch (innerEx) {
        if (innerEx instanceof AuthenticationError) throw innerEx;
        throw new KasaException(
          `Unable to login and trying default login raised another exception: ${innerEx}`,
        );
      }
    }
  }

  private async tryLogin(loginParams: Record<string, string>): Promise<void> {
    const loginRequest = { method: "login", params: loginParams };
    const respDict = await this.sendRequest(JSON.stringify(loginRequest));
    await this.handleResponseErrorCode(respDict, "Error logging in");

    const result = respDict.result as { token: string };
    this.appUrl = `${this.appUrl}?token=${result.token}`;
    this.state = TransportState.Established;
    this.sessionExpireAt =
      Date.now() / 1000 + ONE_DAY_SECONDS - SESSION_EXPIRE_BUFFER_SECONDS;
  }

  private sessionExpired(): boolean {
    return (
      this.sessionExpireAt === undefined || this.sessionExpireAt - Date.now() / 1000 <= 0
    );
  }

  async send(request: string): Promise<Record<string, unknown>> {
    if (this.state !== TransportState.Established || this.sessionExpired()) {
      await this.performLogin();
    }
    return this.sendRequest(request);
  }

  async close(): Promise<void> {
    await this.reset();
    await this.httpClient.close();
  }

  async reset(): Promise<void> {
    this.state = TransportState.LoginRequired;
    this.appUrl = `https://${this.host}:${this.port}/app`;
  }
}
