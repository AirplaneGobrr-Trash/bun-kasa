import type { Socket } from "bun";
import { KasaException, KasaTimeoutError, RetryableError } from "../core/exceptions.ts";
import { BaseTransport } from "./basetransport.ts";
import { xorDecrypt, xorEncrypt } from "./crypto/xor.ts";

const BLOCK_SIZE = 4;

interface PendingRead {
  n: number;
  resolve: (buffer: Buffer) => void;
  reject: (error: unknown) => void;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutSeconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new KasaTimeoutError(message)),
      timeoutSeconds * 1000,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Legacy (pre-2020) TP-Link "Smart Home Protocol" transport.
 *
 * Encryption/decryption based on the reverse engineering work of Lubomir
 * Stroetmann and Tobias Esser
 * (https://www.softscheck.com/en/reverse-engineering-tp-link-hs110/).
 */
export class XorTransport extends BaseTransport {
  static readonly DEFAULT_PORT = 9999;

  private socket: Socket<undefined> | undefined;
  private connecting: Promise<void> | undefined;
  private recvBuffer = Buffer.alloc(0);
  private pendingRead: PendingRead | undefined;
  private lock: Promise<unknown> = Promise.resolve();

  get defaultPort(): number {
    return XorTransport.DEFAULT_PORT;
  }

  get credentialsHash(): string | undefined {
    return undefined;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private onData(data: Buffer): void {
    this.recvBuffer = Buffer.concat([this.recvBuffer, data]);
    if (this.pendingRead && this.recvBuffer.length >= this.pendingRead.n) {
      const { n, resolve } = this.pendingRead;
      const result = Buffer.from(this.recvBuffer.subarray(0, n));
      this.recvBuffer = Buffer.from(this.recvBuffer.subarray(n));
      this.pendingRead = undefined;
      resolve(result);
    }
  }

  private readExactly(n: number): Promise<Buffer> {
    if (this.recvBuffer.length >= n) {
      const result = Buffer.from(this.recvBuffer.subarray(0, n));
      this.recvBuffer = Buffer.from(this.recvBuffer.subarray(n));
      return Promise.resolve(result);
    }
    return new Promise((resolve, reject) => {
      this.pendingRead = { n, resolve, reject };
    });
  }

  private failPending(error: unknown): void {
    if (this.pendingRead) {
      this.pendingRead.reject(error);
      this.pendingRead = undefined;
    }
  }

  private async connect(timeoutSeconds: number): Promise<void> {
    if (this.socket) return;
    if (!this.connecting) {
      this.connecting = this.doConnect(timeoutSeconds).finally(() => {
        this.connecting = undefined;
      });
    }
    return this.connecting;
  }

  private async doConnect(timeoutSeconds: number): Promise<void> {
    this.socket = await withTimeout(
      Bun.connect<undefined>({
        hostname: this.host,
        port: this.port,
        socket: {
          data: (_socket, data) => this.onData(Buffer.from(data)),
          close: () => {
            this.socket = undefined;
          },
          error: (_socket, error) => {
            this.failPending(error);
            this.socket = undefined;
          },
        },
      }),
      timeoutSeconds,
      `Timeout after ${timeoutSeconds} seconds connecting to the device: ${this.host}:${this.port}`,
    );
  }

  private async executeSend(request: string): Promise<Record<string, unknown>> {
    if (!this.socket) throw new KasaException("Not connected");
    this.socket.write(xorEncrypt(request));

    const packedBlockSize = await this.readExactly(BLOCK_SIZE);
    const length = packedBlockSize.readUInt32BE(0);
    const buffer = await this.readExactly(length);
    const response = xorDecrypt(buffer);
    return JSON.parse(response) as Record<string, unknown>;
  }

  async send(request: string): Promise<Record<string, unknown>> {
    return this.withLock(async () => {
      try {
        await this.connect(this.timeout);
      } catch (ex) {
        await this.reset();
        if (ex instanceof KasaTimeoutError) throw ex;
        throw new RetryableError(
          `Unable to connect to the device: ${this.host}:${this.port}: ${ex}`,
        );
      }

      try {
        return await withTimeout(
          this.executeSend(request),
          this.timeout,
          `Timeout after ${this.timeout} seconds sending request to the device ${this.host}:${this.port}`,
        );
      } catch (ex) {
        await this.reset();
        if (ex instanceof KasaTimeoutError) throw ex;
        throw new RetryableError(
          `Unable to query the device ${this.host}:${this.port}: ${ex}`,
        );
      }
    });
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    this.recvBuffer = Buffer.alloc(0);
    this.failPending(new KasaException("Connection closed"));
    socket?.end();
  }

  /** The transport cannot be reset, so we close instead. */
  async reset(): Promise<void> {
    await this.close();
  }
}
