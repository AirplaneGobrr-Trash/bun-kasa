import { getNamedDefaultCredentials } from "../core/credentials.ts";
import type { DeviceConfig } from "../core/deviceconfig.ts";
import { KasaException, RetryableError } from "../core/exceptions.ts";
import { BaseTransport } from "./basetransport.ts";
import { xorDecryptPayload, xorEncryptPayload } from "./crypto/xor.ts";
import { HttpClient } from "./httpclient.ts";

/**
 * Implementation of the Linkie encryption protocol.
 *
 * Linkie is used as the endpoint for TP-Link's camera encryption protocol, used by
 * newer firmware versions (e.g. some Kasa cameras).
 */
export class LinkieTransportV2 extends BaseTransport {
  static readonly DEFAULT_PORT = 10443;

  private readonly httpClient: HttpClient;
  private readonly appUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: DeviceConfig) {
    super(config);
    this.httpClient = new HttpClient(config);
    this.appUrl = `https://${this.host}:${this.port}/data/LINKIE2.json`;
    this.headers = {
      Authorization: `Basic ${this.credentialsHash}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  get defaultPort(): number {
    return this.deviceConfig.connectionType.httpPort ?? LinkieTransportV2.DEFAULT_PORT;
  }

  get credentialsHash(): string | undefined {
    const creds = getNamedDefaultCredentials("KASACAMERA");
    return Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
  }

  private async executeSend(request: string): Promise<Record<string, unknown>> {
    const encryptedCmd = xorEncryptPayload(Buffer.from(request, "utf-8"));
    const b64Cmd = encryptedCmd.toString("base64");
    // encodeURIComponent's unescaped set (A-Za-z0-9-_.!~*'()) matches Python's
    // `urllib.parse.quote(b64_cmd, safe="!~*'()")` exactly.
    const urlSafeCmd = encodeURIComponent(b64Cmd);

    const { status, data } = await this.httpClient.post(this.appUrl, {
      headers: this.headers,
      data: Buffer.from(`content=${urlSafeCmd}`, "utf-8"),
      insecureTls: true,
    });

    if (status !== 200) {
      throw new KasaException(
        `${this.host} responded with an unexpected status code ${status} to passthrough`,
      );
    }

    try {
      const decrypted = xorDecryptPayload(Buffer.from(data.toString("utf-8"), "base64"));
      return JSON.parse(decrypted.toString("utf-8")) as Record<string, unknown>;
    } catch {
      // fall through to plaintext error handling below
    }

    try {
      const errorPayload = JSON.parse(data.toString("utf-8"));
      throw new KasaException(
        `Device ${this.host} send error: ${JSON.stringify(errorPayload)}`,
      );
    } catch (ex) {
      if (ex instanceof KasaException) throw ex;
      throw new KasaException("Unable to read response");
    }
  }

  async send(request: string): Promise<Record<string, unknown>> {
    try {
      return await this.executeSend(request);
    } catch (ex) {
      await this.reset();
      throw new RetryableError(
        `Unable to query the device ${this.host}:${this.port}: ${ex}`,
      );
    }
  }

  async close(): Promise<void> {
    await this.httpClient.close();
  }

  /** NOOP for this transport. */
  async reset(): Promise<void> {}
}
