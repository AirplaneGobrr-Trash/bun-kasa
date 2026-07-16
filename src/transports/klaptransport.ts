import {
  type Credentials,
  DEFAULT_CREDENTIALS,
  createCredentials,
  getDefaultCredentials,
} from "../core/credentials.ts";
import type { DeviceConfig } from "../core/deviceconfig.ts";
import {
  AuthenticationError,
  KasaException,
  RetryableError,
} from "../core/exceptions.ts";
import { BaseTransport } from "./basetransport.ts";
import { md5, sha1, sha256 } from "./crypto/hash.ts";
import { KlapEncryptionSession } from "./crypto/klap.ts";
import { HttpClient, parseJson } from "./httpclient.ts";

const ONE_DAY_SECONDS = 86400;
const SESSION_EXPIRE_BUFFER_SECONDS = 60 * 20;

function credentialsEqual(a: Credentials, b: Credentials): boolean {
  return a.username === b.username && a.password === b.password;
}

/**
 * Implementation of the KLAP encryption protocol.
 *
 * KLAP is the name used in device discovery for TP-Link's encryption protocol used by
 * newer firmware versions. See `ref/python-kasa/kasa/transports/klaptransport.py` for
 * the protocol notes this was ported from.
 */
export class KlapTransport extends BaseTransport {
  static readonly DEFAULT_PORT = 80;
  static readonly DEFAULT_HTTPS_PORT = 4433;
  static readonly SESSION_COOKIE_NAME = "TP_SESSIONID";
  static readonly TIMEOUT_COOKIE_NAME = "TIMEOUT";

  protected readonly httpClient: HttpClient;
  protected localAuthHash: Buffer;
  private readonly defaultCredentialsAuthHash = new Map<string, Buffer>();
  private blankAuthHash: Buffer | undefined;
  private handshakeDone = false;
  private encryptionSession: KlapEncryptionSession | undefined;
  private sessionExpireAt: number | undefined;
  private sessionCookie: Record<string, string> | undefined;
  private readonly appUrl: string;
  private readonly requestUrl: string;

  constructor(config: DeviceConfig) {
    super(config);
    this.httpClient = new HttpClient(config);

    if (
      (!this.credentialsValue || !this.credentialsValue.username) &&
      !this.credentialsHashValue
    ) {
      this.credentialsValue = createCredentials();
    }
    if (this.credentialsValue) {
      this.localAuthHash = this.generateAuthHash(this.credentialsValue);
    } else {
      this.localAuthHash = Buffer.from(this.credentialsHashValue ?? "", "base64");
    }

    const protocol = config.connectionType.https ? "https" : "http";
    this.appUrl = `${protocol}://${this.host}:${this.port}/app`;
    this.requestUrl = `${this.appUrl}/request`;
  }

  get defaultPort(): number {
    const httpPort = this.deviceConfig.connectionType.httpPort;
    if (httpPort) return httpPort;
    if (this.deviceConfig.connectionType.https) return KlapTransport.DEFAULT_HTTPS_PORT;
    return KlapTransport.DEFAULT_PORT;
  }

  get credentialsHash(): string | undefined {
    if (
      this.credentialsValue &&
      credentialsEqual(this.credentialsValue, createCredentials())
    ) {
      return undefined;
    }
    return this.localAuthHash.toString("base64");
  }

  protected generateAuthHash(creds: Credentials): Buffer {
    return md5(
      Buffer.concat([md5(Buffer.from(creds.username)), md5(Buffer.from(creds.password))]),
    );
  }

  protected handshake1SeedAuthHash(
    localSeed: Buffer,
    _remoteSeed: Buffer,
    authHash: Buffer,
  ): Buffer {
    return sha256(Buffer.concat([localSeed, authHash]));
  }

  protected handshake2SeedAuthHash(
    _localSeed: Buffer,
    remoteSeed: Buffer,
    authHash: Buffer,
  ): Buffer {
    return sha256(Buffer.concat([remoteSeed, authHash]));
  }

  protected generateOwnerHash(creds: Credentials): Buffer {
    return md5(Buffer.from(creds.username));
  }

  private async performHandshake1(): Promise<{
    localSeed: Buffer;
    remoteSeed: Buffer;
    authHash: Buffer;
  }> {
    const localSeed = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));

    const { status, data } = await this.httpClient.post(`${this.appUrl}/handshake1`, {
      data: localSeed,
      insecureTls: true,
    });

    if (status !== 200) {
      throw new KasaException(
        `Device ${this.host} responded with ${status} to handshake1`,
      );
    }

    const remoteSeed = data.subarray(0, 16);
    const serverHash = data.subarray(16);
    if (serverHash.length !== 32) {
      throw new KasaException(
        `Device ${this.host} responded with unexpected klap response to handshake1`,
      );
    }

    const localSeedAuthHash = this.handshake1SeedAuthHash(
      localSeed,
      remoteSeed,
      this.localAuthHash,
    );
    if (localSeedAuthHash.equals(serverHash)) {
      return { localSeed, remoteSeed, authHash: this.localAuthHash };
    }

    for (const [key, value] of Object.entries(DEFAULT_CREDENTIALS)) {
      let authHash = this.defaultCredentialsAuthHash.get(key);
      if (!authHash) {
        authHash = this.generateAuthHash(getDefaultCredentials(value));
        this.defaultCredentialsAuthHash.set(key, authHash);
      }
      const hash = this.handshake1SeedAuthHash(localSeed, remoteSeed, authHash);
      if (hash.equals(serverHash)) {
        return { localSeed, remoteSeed, authHash };
      }
    }

    const blankCreds = createCredentials();
    if (!this.credentialsValue || !credentialsEqual(this.credentialsValue, blankCreds)) {
      this.blankAuthHash ??= this.generateAuthHash(blankCreds);
      const hash = this.handshake1SeedAuthHash(localSeed, remoteSeed, this.blankAuthHash);
      if (hash.equals(serverHash)) {
        return { localSeed, remoteSeed, authHash: this.blankAuthHash };
      }
    }

    throw new AuthenticationError(
      `Device response did not match our challenge on ip ${this.host}, check that your e-mail and password (both case-sensitive) are correct.`,
    );
  }

  private async performHandshake2(
    localSeed: Buffer,
    remoteSeed: Buffer,
    authHash: Buffer,
  ): Promise<KlapEncryptionSession> {
    const payload = this.handshake2SeedAuthHash(localSeed, remoteSeed, authHash);
    const { status } = await this.httpClient.post(`${this.appUrl}/handshake2`, {
      data: payload,
      cookiesDict: this.sessionCookie,
      insecureTls: true,
    });

    if (status !== 200) {
      throw new KasaException(
        `Device ${this.host} responded with ${status} to handshake2`,
      );
    }

    return new KlapEncryptionSession(localSeed, remoteSeed, authHash);
  }

  private async performHandshake(): Promise<void> {
    this.handshakeDone = false;
    this.sessionExpireAt = undefined;
    this.sessionCookie = undefined;

    const { localSeed, remoteSeed, authHash } = await this.performHandshake1();
    const cookie = this.httpClient.getCookie(KlapTransport.SESSION_COOKIE_NAME);
    if (cookie) this.sessionCookie = { [KlapTransport.SESSION_COOKIE_NAME]: cookie };
    const timeout = Number(
      this.httpClient.getCookie(KlapTransport.TIMEOUT_COOKIE_NAME) ?? ONE_DAY_SECONDS,
    );
    this.sessionExpireAt = Date.now() / 1000 + timeout - SESSION_EXPIRE_BUFFER_SECONDS;
    this.encryptionSession = await this.performHandshake2(
      localSeed,
      remoteSeed,
      authHash,
    );
    this.handshakeDone = true;
  }

  private handshakeSessionExpired(): boolean {
    return (
      this.sessionExpireAt === undefined || this.sessionExpireAt - Date.now() / 1000 <= 0
    );
  }

  async send(request: string): Promise<Record<string, unknown>> {
    if (!this.handshakeDone || this.handshakeSessionExpired()) {
      await this.performHandshake();
    }

    if (!this.encryptionSession)
      throw new KasaException("Encryption session not established");
    const { data: payload, seq } = this.encryptionSession.encrypt(request);

    const { status, data } = await this.httpClient.post(this.requestUrl, {
      params: { seq: String(seq) },
      data: payload,
      cookiesDict: this.sessionCookie,
      insecureTls: true,
    });

    if (status !== 200) {
      if (status === 403) {
        this.handshakeDone = false;
        throw new RetryableError(
          `Got a security error from ${this.host} after handshake completed`,
        );
      }
      throw new KasaException(
        `Device ${this.host} responded with ${status} to request with seq ${seq}`,
      );
    }

    let decrypted: string;
    try {
      decrypted = this.encryptionSession.decrypt(data);
    } catch (ex) {
      throw new KasaException(
        `Error trying to decrypt device ${this.host} response: ${ex}`,
      );
    }

    return JSON.parse(decrypted) as Record<string, unknown>;
  }

  async close(): Promise<void> {
    await this.reset();
    await this.httpClient.close();
  }

  async reset(): Promise<void> {
    this.handshakeDone = false;
  }
}

/** KLAP transport with v2 handshake hashes. */
export class KlapTransportV2 extends KlapTransport {
  protected override generateAuthHash(creds: Credentials): Buffer {
    return sha256(
      Buffer.concat([
        sha1(Buffer.from(creds.username)),
        sha1(Buffer.from(creds.password)),
      ]),
    );
  }

  protected override handshake1SeedAuthHash(
    localSeed: Buffer,
    remoteSeed: Buffer,
    authHash: Buffer,
  ): Buffer {
    return sha256(Buffer.concat([localSeed, remoteSeed, authHash]));
  }

  protected override handshake2SeedAuthHash(
    localSeed: Buffer,
    remoteSeed: Buffer,
    authHash: Buffer,
  ): Buffer {
    return sha256(Buffer.concat([remoteSeed, localSeed, authHash]));
  }
}

// re-exported for callers that only need JSON parsing of raw transport bytes
export { parseJson };
