import {
  AuthenticationError,
  ConnectionError,
  KasaException,
  KasaTimeoutError,
  RetryableError,
} from "../core/exceptions.ts";
import { BaseProtocol } from "./baseprotocol.ts";

const BACKOFF_SECONDS_AFTER_TIMEOUT_MS = 1000;

/** Protocol implementation for the legacy TP-Link IOT ("Kasa") protocol. */
export class IotProtocol extends BaseProtocol {
  private queryLock: Promise<unknown> = Promise.resolve();

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queryLock.then(fn, fn);
    this.queryLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async query(
    request: string | Record<string, unknown>,
    retryCount = 3,
  ): Promise<Record<string, unknown>> {
    const requestStr = typeof request === "string" ? request : JSON.stringify(request);
    return this.withLock(() => this.queryWithRetry(requestStr, retryCount));
  }

  private async queryWithRetry(
    request: string,
    retryCount: number,
  ): Promise<Record<string, unknown>> {
    for (let retry = 0; retry <= retryCount; retry++) {
      try {
        return await this.transportRef.send(request);
      } catch (ex) {
        if (ex instanceof ConnectionError) {
          if (retry >= retryCount) throw ex;
          continue;
        }
        if (ex instanceof AuthenticationError) {
          await this.transportRef.reset();
          throw ex;
        }
        if (ex instanceof RetryableError) {
          await this.transportRef.reset();
          if (retry >= retryCount) throw ex;
          continue;
        }
        if (ex instanceof KasaTimeoutError) {
          await this.transportRef.reset();
          if (retry >= retryCount) throw ex;
          await new Promise((resolve) =>
            setTimeout(resolve, BACKOFF_SECONDS_AFTER_TIMEOUT_MS),
          );
          continue;
        }
        if (ex instanceof KasaException) {
          await this.transportRef.reset();
          throw ex;
        }
        throw ex;
      }
    }
    throw new KasaException("Query reached somehow to unreachable");
  }

  async close(): Promise<void> {
    await this.transportRef.close();
  }
}
