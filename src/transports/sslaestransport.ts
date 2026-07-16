import {
  type Credentials,
  DEFAULT_CREDENTIALS,
  createCredentials,
  getDefaultCredentials,
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
import { AesEncryptionSession } from "./crypto/aes.ts";
import { md5, sha256 } from "./crypto/hash.ts";
import { HttpClient } from "./httpclient.ts";

function sha256Hash(payload: Buffer): string {
  return sha256(payload).toString("hex").toUpperCase();
}

function md5Hash(payload: Buffer): string {
  return md5(payload).toString("hex").toUpperCase();
}

function credentialsEqual(a: Credentials, b: Credentials): boolean {
  return a.username === b.username && a.password === b.password;
}

enum TransportState {
  HandshakeRequired = "HANDSHAKE_REQUIRED",
  Established = "ESTABLISHED",
}

/**
 * Implementation of the SSL AES protocol used by newer Tapo cameras.
 *
 * AES is the name used in device discovery for TP-Link's TAPO encryption protocol.
 */
export class SslAesTransport extends BaseTransport {
  static readonly DEFAULT_PORT = 443;
  static readonly COMMON_HEADERS: Record<string, string> = {
    "Content-Type": "application/json; charset=UTF-8",
    requestByApp: "true",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "User-Agent": "Tapo CameraClient Android",
  };

  private readonly httpClient: HttpClient;
  private readonly defaultCredentials: Credentials;
  private state: TransportState = TransportState.HandshakeRequired;
  private encryptionSession: AesEncryptionSession | undefined;
  private readonly hostPort: string;
  private readonly appUrl: string;
  private tokenUrl: string | undefined;
  private readonly headers: Record<string, string>;
  private seq = 0;
  private pwdHash: string | undefined;
  private username: string | undefined;
  private password: string | undefined;
  private localNonce: string | undefined;
  private sendSecure = true;

  constructor(config: DeviceConfig) {
    super(config);

    if (
      (!this.credentialsValue || !this.credentialsValue.username) &&
      !this.credentialsHashValue
    ) {
      this.credentialsValue = createCredentials();
    }
    const defaultCredsKey =
      config.connectionType.loginVersion === 3 ? "TAPOCAMERA_LV3" : "TAPOCAMERA";
    const defaultCredsValue = DEFAULT_CREDENTIALS[defaultCredsKey];
    if (!defaultCredsValue)
      throw new KasaException(`Unknown default credentials key ${defaultCredsKey}`);
    this.defaultCredentials = getDefaultCredentials(defaultCredsValue);

    this.httpClient = new HttpClient(config);
    this.hostPort = `${this.host}:${this.port}`;
    this.appUrl = `https://${this.hostPort}`;
    this.headers = {
      ...SslAesTransport.COMMON_HEADERS,
      Host: this.hostPort,
      Referer: this.appUrl,
    };

    if (
      this.credentialsValue &&
      !credentialsEqual(this.credentialsValue, createCredentials())
    ) {
      this.username = this.credentialsValue.username;
      this.password = this.credentialsValue.password;
    } else if (this.credentialsHashValue) {
      const decoded = JSON.parse(
        Buffer.from(this.credentialsHashValue, "base64").toString("utf-8"),
      ) as {
        un: string;
        pwd: string;
      };
      this.username = decoded.un;
      this.password = decoded.pwd;
    }
  }

  get defaultPort(): number {
    return this.deviceConfig.connectionType.httpPort ?? SslAesTransport.DEFAULT_PORT;
  }

  private static createB64Credentials(credentials: Credentials): string {
    return Buffer.from(
      JSON.stringify({ un: credentials.username, pwd: credentials.password }),
    ).toString("base64");
  }

  get credentialsHash(): string | undefined {
    if (
      this.credentialsValue &&
      credentialsEqual(this.credentialsValue, createCredentials())
    ) {
      return undefined;
    }
    if (!this.credentialsValue && this.credentialsHashValue)
      return this.credentialsHashValue;
    if (this.credentialsValue?.username && this.credentialsValue.password) {
      return SslAesTransport.createB64Credentials(this.credentialsValue);
    }
    return undefined;
  }

  private getResponseError(respDict: Record<string, unknown>): SmartErrorCode {
    const raw = respDict.error_code as number | undefined;
    return raw !== undefined && raw in SmartErrorCode
      ? (raw as SmartErrorCode)
      : SmartErrorCode.INTERNAL_UNKNOWN_ERROR;
  }

  private getResponseInnerError(
    respDict: Record<string, unknown>,
  ): SmartErrorCode | undefined {
    const data = respDict.data as Record<string, unknown> | undefined;
    let raw = data?.code as number | undefined;
    if (raw === undefined) {
      const result = respDict.result as Record<string, unknown> | undefined;
      const innerData = result?.data as Record<string, unknown> | undefined;
      raw = innerData?.code as number | undefined;
    }
    if (raw === undefined) return undefined;
    return raw in SmartErrorCode
      ? (raw as SmartErrorCode)
      : SmartErrorCode.INTERNAL_UNKNOWN_ERROR;
  }

  private handleResponseErrorCode(respDict: Record<string, unknown>, msg: string): void {
    const errorCode = this.getResponseError(respDict);
    if (errorCode === SmartErrorCode.SUCCESS) return;
    const fullMsg = `${msg}: ${this.host}: ${SmartErrorCode[errorCode]}(${errorCode})`;
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
    const passthroughRequestStr = JSON.stringify(passthroughRequest);

    if (!this.pwdHash || !this.localNonce)
      throw new KasaException("Handshake not completed");
    const tag = SslAesTransport.generateTag(
      passthroughRequestStr,
      this.localNonce,
      this.pwdHash,
      this.seq,
    );
    const headers = { ...this.headers, Seq: String(this.seq), Tapo_tag: tag };
    this.seq += 1;

    const { status, data } = await this.httpClient.post(url, {
      json: passthroughRequestStr,
      headers,
      insecureTls: true,
    });

    if (status === 500) {
      let msg = `Device ${this.host} replied with status 500 after handshake, response: `;
      let decrypted: string | undefined;
      try {
        const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
        const result = respDict.result as Record<string, unknown> | undefined;
        const response = result?.response as string | undefined;
        if (response)
          decrypted = this.encryptionSession.decrypt(Buffer.from(response, "utf-8"));
      } catch {
        // fall through to raw message below
      }
      msg += decrypted ?? data.toString("utf-8");
      throw new RetryableError(msg);
    }

    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to passthrough`,
      );
    }

    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    this.handleResponseErrorCode(respDict, "Error sending secure_passthrough message");

    const result = respDict.result as Record<string, unknown> | undefined;
    const rawResponse = result?.response as string | undefined;
    if (rawResponse === undefined) {
      // Tapo cameras respond unencrypted to single requests.
      return respDict;
    }

    try {
      const response = this.encryptionSession.decrypt(Buffer.from(rawResponse, "utf-8"));
      return JSON.parse(response) as Record<string, unknown>;
    } catch (ex) {
      try {
        return JSON.parse(rawResponse) as Record<string, unknown>;
      } catch {
        throw new KasaException(
          `Unable to decrypt response from ${this.host}, error: ${ex}, response: ${rawResponse}`,
        );
      }
    }
  }

  private async sendUnencrypted(request: string): Promise<Record<string, unknown>> {
    if (!this.tokenUrl) throw new KasaException("Login has not completed");
    const { status, data } = await this.httpClient.post(this.tokenUrl, {
      json: request,
      headers: this.headers,
      insecureTls: true,
    });

    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to unencrypted send`,
      );
    }

    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    this.handleResponseErrorCode(respDict, "Error sending message");
    return respDict;
  }

  static generateConfirmHash(
    localNonce: string,
    serverNonce: string,
    pwdHash: string,
  ): string {
    const expectedConfirm = sha256Hash(Buffer.from(localNonce + pwdHash + serverNonce));
    return expectedConfirm + serverNonce + localNonce;
  }

  static generateDigestPassword(
    localNonce: string,
    serverNonce: string,
    pwdHash: string,
  ): string {
    const digestPasswordHash = sha256Hash(
      Buffer.from(pwdHash + localNonce + serverNonce),
    );
    return digestPasswordHash + localNonce + serverNonce;
  }

  static generateEncryptionToken(
    tokenType: string,
    localNonce: string,
    serverNonce: string,
    pwdHash: string,
  ): Buffer {
    const hashedKey = sha256Hash(Buffer.from(localNonce + pwdHash + serverNonce));
    return sha256(Buffer.from(tokenType + localNonce + serverNonce + hashedKey)).subarray(
      0,
      16,
    );
  }

  static generateTag(
    request: string,
    localNonce: string,
    pwdHash: string,
    seq: number,
  ): string {
    const pwdNonceHash = sha256Hash(Buffer.from(pwdHash + localNonce));
    return sha256Hash(Buffer.from(pwdNonceHash + request + String(seq)));
  }

  private async performHandshake(): Promise<void> {
    const result = await this.performHandshake1();
    if (result) {
      await this.performHandshake2(result.localNonce, result.serverNonce, result.pwdHash);
    }
  }

  private pwdToHash(): string {
    if (
      this.credentialsValue &&
      !credentialsEqual(this.credentialsValue, createCredentials())
    ) {
      return this.credentialsValue.password;
    }
    if (this.username && this.password) return this.password;
    return this.defaultCredentials.password;
  }

  private isLessSecureLogin(respDict: Record<string, unknown>): boolean {
    if (this.getResponseError(respDict) !== SmartErrorCode.SESSION_EXPIRED) return false;
    const result = respDict.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    const encryptType = data?.encrypt_type as string[] | undefined;
    return Boolean(
      data && encryptType && JSON.stringify(encryptType) !== JSON.stringify(["3"]),
    );
  }

  private async tryPerformLessSecureLogin(
    username: string,
    password: string,
  ): Promise<boolean> {
    const pwdHash = md5Hash(Buffer.from(password));
    const body = {
      method: "login",
      params: { hashed: true, password: pwdHash, username },
    };

    const { status, data } = await this.httpClient.post(this.appUrl, {
      json: body,
      headers: this.headers,
      insecureTls: true,
    });
    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to login`,
      );
    }
    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    const result = respDict.result as Record<string, unknown> | undefined;
    const stok = result?.stok as string | undefined;
    if (respDict.error_code === 0 && stok) {
      this.sendSecure = false;
      this.tokenUrl = `${this.appUrl}/stok=${stok}/ds`;
      this.pwdHash = pwdHash;
      return true;
    }
    return false;
  }

  private async performHandshake2(
    localNonce: string,
    serverNonce: string,
    pwdHash: string,
  ): Promise<void> {
    const digestPassword = SslAesTransport.generateDigestPassword(
      localNonce,
      serverNonce,
      pwdHash,
    );
    const body = {
      method: "login",
      params: {
        cnonce: localNonce,
        encrypt_type: "3",
        digest_passwd: digestPassword,
        username: this.username,
      },
    };
    const { status, data } = await this.httpClient.post(this.appUrl, {
      json: body,
      headers: this.headers,
      insecureTls: true,
    });
    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to handshake2`,
      );
    }
    const respDict = JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
    if (this.getResponseError(respDict) === SmartErrorCode.INVALID_NONCE) {
      throw new AuthenticationError(
        `Invalid password hash in handshake2 for ${this.host}`,
      );
    }
    this.handleResponseErrorCode(respDict, "Error in handshake2");

    const result = respDict.result as { start_seq: number; stok: string };
    this.seq = result.start_seq;
    this.tokenUrl = `${this.appUrl}/stok=${result.stok}/ds`;
    this.pwdHash = pwdHash;
    this.localNonce = localNonce;
    const lsk = SslAesTransport.generateEncryptionToken(
      "lsk",
      localNonce,
      serverNonce,
      pwdHash,
    );
    const ivb = SslAesTransport.generateEncryptionToken(
      "ivb",
      localNonce,
      serverNonce,
      pwdHash,
    );
    this.encryptionSession = new AesEncryptionSession(lsk, ivb);
    this.state = TransportState.Established;
  }

  private async trySendHandshake1(
    username: string,
    localNonce: string,
  ): Promise<Record<string, unknown>> {
    const body = {
      method: "login",
      params: { cnonce: localNonce, encrypt_type: "3", username },
    };
    const { status, data } = await this.httpClient.post(this.appUrl, {
      json: body,
      headers: this.headers,
      insecureTls: true,
    });
    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to handshake1`,
      );
    }
    return JSON.parse(data.toString("utf-8")) as Record<string, unknown>;
  }

  private async performHandshake1(): Promise<
    { localNonce: string; serverNonce: string; pwdHash: string } | undefined
  > {
    let respDict: Record<string, unknown> | undefined;
    let localNonce = "";
    if (this.username) {
      localNonce = randomHexToken(8);
      respDict = await this.trySendHandshake1(this.username, localNonce);
    }

    if (
      respDict &&
      this.isLessSecureLogin(respDict) &&
      this.getResponseInnerError(respDict) !== SmartErrorCode.BAD_USERNAME &&
      (await this.tryPerformLessSecureLogin(this.username as string, this.pwdToHash()))
    ) {
      this.state = TransportState.Established;
      return undefined;
    }

    const respResult = respDict?.result as Record<string, unknown> | undefined;
    const respData = respResult?.data as Record<string, unknown> | undefined;
    let errorCode: SmartErrorCode | undefined = respDict
      ? this.getResponseError(respDict)
      : undefined;
    if (
      !respDict ||
      errorCode !== SmartErrorCode.INVALID_NONCE ||
      !respData ||
      !("nonce" in respData)
    ) {
      localNonce = randomHexToken(8);
      const defaultRespDict = await this.trySendHandshake1(
        this.defaultCredentials.username,
        localNonce,
      );
      const defaultErrorCode = this.getResponseError(defaultRespDict);
      const defaultResult = defaultRespDict.result as Record<string, unknown> | undefined;
      const defaultData = defaultResult?.data as Record<string, unknown> | undefined;
      if (
        defaultErrorCode === SmartErrorCode.INVALID_NONCE &&
        defaultData &&
        "nonce" in defaultData
      ) {
        this.username = this.defaultCredentials.username;
        errorCode = defaultErrorCode;
        respDict = defaultRespDict;
      } else if (
        this.isLessSecureLogin(defaultRespDict) &&
        (await this.tryPerformLessSecureLogin(
          this.defaultCredentials.username,
          this.pwdToHash(),
        ))
      ) {
        this.username = this.defaultCredentials.username;
        this.state = TransportState.Established;
        return undefined;
      }
    }

    if (!this.username) {
      throw new AuthenticationError(
        `Credentials must be supplied to connect to ${this.host}`,
      );
    }

    const finalResult = respDict?.result as Record<string, unknown> | undefined;
    const finalData = finalResult?.data as Record<string, unknown> | undefined;
    if (
      errorCode !== SmartErrorCode.INVALID_NONCE ||
      !finalData ||
      !("nonce" in finalData)
    ) {
      if (
        respDict &&
        this.getResponseInnerError(respDict) === SmartErrorCode.DEVICE_BLOCKED
      ) {
        const data = respDict.data as Record<string, unknown> | undefined;
        const secLeft = data?.sec_left as number | undefined;
        const msg = `Device blocked${secLeft ? ` for ${secLeft} seconds` : ""}`;
        throw new DeviceError(msg, { errorCode: SmartErrorCode.DEVICE_BLOCKED });
      }
      throw new AuthenticationError(
        `Error trying handshake1: ${JSON.stringify(respDict)}`,
      );
    }

    const serverNonce = finalData.nonce as string;
    const deviceConfirm = finalData.device_confirm as string;

    let pwdHash = sha256Hash(Buffer.from(this.pwdToHash()));
    let expectedConfirm = SslAesTransport.generateConfirmHash(
      localNonce,
      serverNonce,
      pwdHash,
    );
    if (deviceConfirm === expectedConfirm) {
      return { localNonce, serverNonce, pwdHash };
    }

    pwdHash = md5Hash(Buffer.from(this.pwdToHash()));
    expectedConfirm = SslAesTransport.generateConfirmHash(
      localNonce,
      serverNonce,
      pwdHash,
    );
    if (deviceConfirm === expectedConfirm) {
      return { localNonce, serverNonce, pwdHash };
    }

    throw new AuthenticationError(
      `Device response did not match our challenge on ip ${this.host}, check that your e-mail and password (both case-sensitive) are correct.`,
    );
  }

  async send(request: string): Promise<Record<string, unknown>> {
    if (this.state === TransportState.HandshakeRequired) {
      await this.performHandshake();
    }
    if (this.sendSecure) {
      return this.sendSecurePassthrough(request);
    }
    return this.sendUnencrypted(request);
  }

  async close(): Promise<void> {
    await this.reset();
    await this.httpClient.close();
  }

  async reset(): Promise<void> {
    this.state = TransportState.HandshakeRequired;
    this.encryptionSession = undefined;
    this.seq = 0;
    this.pwdHash = undefined;
    this.localNonce = undefined;
  }
}

function randomHexToken(byteLength: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteLength)))
    .toString("hex")
    .toUpperCase();
}
