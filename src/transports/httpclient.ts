import type { DeviceConfig } from "../core/deviceconfig.ts";
import { ConnectionError, KasaException, KasaTimeoutError } from "../core/exceptions.ts";

/** Bun's `fetch` accepts a `tls` option that isn't yet reflected in `bun-types`. */
interface BunRequestInit extends RequestInit {
  tls?: { rejectUnauthorized?: boolean };
}

export interface HttpPostOptions {
  params?: Record<string, string>;
  data?: Buffer;
  json?: unknown;
  headers?: Record<string, string>;
  cookiesDict?: Record<string, string>;
  /** Whether to skip TLS certificate verification (devices use self-signed certs). */
  insecureTls?: boolean;
}

export interface HttpPostResult {
  status: number;
  data: Buffer;
}

/** Minimal cookie jar keyed by cookie name, holding only the most recent response's cookies. */
export class HttpClient {
  /** Some devices (P100) close the connection after each request; slow down if so. */
  private static readonly WAIT_BETWEEN_REQUESTS_ON_ERROR_MS = 250;

  private cookies = new Map<string, string>();
  private waitBetweenRequestsMs = 0;
  private lastRequestTime = 0;

  constructor(private readonly config: DeviceConfig) {}

  private buildUrl(url: string, params?: Record<string, string>): string {
    if (!params) return url;
    const u = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      u.searchParams.set(key, value);
    }
    return u.toString();
  }

  private buildCookieHeader(cookiesDict?: Record<string, string>): string | undefined {
    if (!cookiesDict || Object.keys(cookiesDict).length === 0) return undefined;
    return Object.entries(cookiesDict)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  async post(url: string, options: HttpPostOptions = {}): Promise<HttpPostResult> {
    if (this.waitBetweenRequestsMs) {
      const gap = Date.now() - this.lastRequestTime;
      if (gap < this.waitBetweenRequestsMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.waitBetweenRequestsMs - gap),
        );
      }
    }

    const headers: Record<string, string> = { ...options.headers };
    const cookieHeader = this.buildCookieHeader(options.cookiesDict);
    if (cookieHeader) headers.Cookie = cookieHeader;

    let body: string | Uint8Array | undefined;
    if (options.json !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      // Callers that already need the exact serialized bytes (e.g. to sign a
      // request tag) pass a pre-stringified JSON string; only objects need encoding.
      body =
        typeof options.json === "string" ? options.json : JSON.stringify(options.json);
    } else if (options.data !== undefined) {
      body = new Uint8Array(options.data);
    }

    const requestInit: BunRequestInit = {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout((this.config.timeout ?? 5) * 1000),
    };
    if (options.insecureTls) {
      requestInit.tls = { rejectUnauthorized: false };
    }

    let response: Response;
    try {
      response = await fetch(this.buildUrl(url, options.params), requestInit);
    } catch (ex) {
      if (this.waitBetweenRequestsMs === 0) {
        this.waitBetweenRequestsMs = HttpClient.WAIT_BETWEEN_REQUESTS_ON_ERROR_MS;
      }
      this.lastRequestTime = Date.now();
      if (ex instanceof DOMException && ex.name === "TimeoutError") {
        throw new KasaTimeoutError(
          `Unable to query the device, timed out: ${this.config.host}: ${ex}`,
        );
      }
      throw new ConnectionError(`Device connection error: ${this.config.host}: ${ex}`);
    }

    this.cookies.clear();
    const setCookieHeaders =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const setCookie of setCookieHeaders) {
      const [pair] = setCookie.split(";");
      const [name, value] = pair?.split("=") ?? [];
      if (name && value !== undefined) this.cookies.set(name.trim(), value.trim());
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (this.waitBetweenRequestsMs) {
      this.lastRequestTime = Date.now();
    }

    return { status: response.status, data: buffer };
  }

  getCookie(cookieName: string): string | undefined {
    return this.cookies.get(cookieName);
  }

  async close(): Promise<void> {
    // No persistent connection to close when using Bun's fetch.
  }
}

export function parseJson(buffer: Buffer): unknown {
  try {
    return JSON.parse(buffer.toString("utf-8"));
  } catch (ex) {
    throw new KasaException(`Unable to parse JSON response: ${ex}`);
  }
}
