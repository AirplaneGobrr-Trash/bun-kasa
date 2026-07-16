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
import type { BaseTransport } from "../transports/basetransport.ts";
import { md5 } from "../transports/crypto/hash.ts";
import { BaseProtocol } from "./baseprotocol.ts";

const BACKOFF_SECONDS_AFTER_TIMEOUT_MS = 1000;
const DEFAULT_MULTI_REQUEST_BATCH_SIZE = 5;

/** Requests known not to work properly when sent as part of a multipleRequest. */
const FORCE_SINGLE_REQUEST = new Set(["connectAp", "getConnectStatus", "scanApList"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Protocol implementation for the modern TP-Link SMART (Tapo/newer Kasa) protocol. */
export class SmartProtocol extends BaseProtocol {
  static readonly DEFAULT_MULTI_REQUEST_BATCH_SIZE = DEFAULT_MULTI_REQUEST_BATCH_SIZE;

  protected readonly terminalUuid: string;
  private queryLock: Promise<unknown> = Promise.resolve();
  protected multiRequestBatchSize: number;
  private methodMissingLogged = false;

  constructor(transport: BaseTransport) {
    super(transport);
    this.terminalUuid = md5(crypto.getRandomValues(Buffer.alloc(16))).toString("base64");
    this.multiRequestBatchSize =
      transport.config.batchSize ?? DEFAULT_MULTI_REQUEST_BATCH_SIZE;
  }

  protected getSmartRequest(method: string, params?: Record<string, unknown>): string {
    const request: Record<string, unknown> = {
      method,
      request_time_milis: Date.now(),
      terminal_uuid: this.terminalUuid,
    };
    if (params) request.params = params;
    return JSON.stringify(request);
  }

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
    return this.withLock(() => this.queryWithRetry(request, retryCount));
  }

  private async queryWithRetry(
    request: string | Record<string, unknown>,
    retryCount: number,
  ): Promise<Record<string, unknown>> {
    for (let retry = 0; retry <= retryCount; retry++) {
      try {
        return await this.executeQuery(request, retry, true);
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
          await new Promise((resolve) =>
            setTimeout(resolve, BACKOFF_SECONDS_AFTER_TIMEOUT_MS),
          );
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

  protected async executeMultipleQuery(
    requests: Record<string, unknown>,
    retryCount: number,
    iterateListPages: boolean,
  ): Promise<Record<string, unknown>> {
    const multiResult: Record<string, unknown> = {};
    const entries = Object.entries(requests);
    const raiseOnError = entries.length === 1;

    const multiRequests = entries
      .filter(([method]) => !FORCE_SINGLE_REQUEST.has(method))
      .map(([method, params]) => (params ? { method, params } : { method }));

    const step = this.multiRequestBatchSize;
    if (step === 1) {
      for (const request of multiRequests) {
        const method = request.method;
        const req = this.getSmartRequest(
          method,
          request.params as Record<string, unknown> | undefined,
        );
        const resp = await this.transportRef.send(req);
        this.handleResponseErrorCode(resp, method, raiseOnError);
        multiResult[method] = resp.result;
      }
      return multiResult;
    }

    for (let i = 0; i < multiRequests.length; i += step) {
      const requestsStep = multiRequests.slice(i, i + step);
      const smartParams = { requests: requestsStep };
      const smartRequest = this.getSmartRequest("multipleRequest", smartParams);

      const responseStep = await this.transportRef.send(smartRequest);
      try {
        this.handleResponseErrorCode(responseStep, "multi-request-batch");
      } catch (ex) {
        if (
          ex instanceof DeviceError &&
          (ex.errorCode === SmartErrorCode.JSON_DECODE_FAIL_ERROR ||
            ex.errorCode === SmartErrorCode.INTERNAL_UNKNOWN_ERROR) &&
          this.multiRequestBatchSize !== 1
        ) {
          this.multiRequestBatchSize = 1;
          throw new RetryableError("JSON Decode failure, multi requests disabled");
        }
        throw ex;
      }

      const result = responseStep.result as { responses: Array<Record<string, unknown>> };
      for (const response of result.responses) {
        const method = response.method as string | undefined;
        if (!method) {
          if (!this.methodMissingLogged) this.methodMissingLogged = true;
          continue;
        }
        this.handleResponseErrorCode(response, method, raiseOnError);
        const responseResult = response.result;
        const requestParams = requests[method] as Record<string, unknown> | undefined;
        if (iterateListPages && responseResult && isPlainRecord(responseResult)) {
          await this.handleResponseLists(
            responseResult,
            method,
            requestParams,
            retryCount,
          );
        }
        multiResult[method] = responseResult;
      }
    }

    // Multi requests don't continue after errors, so re-query anything missing.
    for (const [method, params] of entries) {
      if (!(method in multiResult)) {
        const resp = await this.transportRef.send(
          this.getSmartRequest(method, params as Record<string, unknown> | undefined),
        );
        this.handleResponseErrorCode(resp, method, raiseOnError);
        multiResult[method] = resp.result;
      }
    }

    return multiResult;
  }

  protected async executeQuery(
    request: string | Record<string, unknown>,
    retryCount: number,
    iterateListPages = true,
  ): Promise<Record<string, unknown>> {
    let smartMethod: string;
    let smartParams: Record<string, unknown> | undefined;

    if (isPlainRecord(request)) {
      const entries = Object.entries(request);
      if (entries.length === 1) {
        const [method, params] = entries[0] as [
          string,
          Record<string, unknown> | undefined,
        ];
        smartMethod = method;
        smartParams = params;
      } else {
        return this.executeMultipleQuery(request, retryCount, iterateListPages);
      }
    } else {
      smartMethod = request;
      smartParams = undefined;
    }

    const smartRequest = this.getSmartRequest(smartMethod, smartParams);
    const responseData = await this.transportRef.send(smartRequest);

    this.handleResponseErrorCode(responseData, smartMethod);

    const result = responseData.result;
    if (iterateListPages && result && isPlainRecord(result)) {
      await this.handleResponseLists(result, smartMethod, smartParams, retryCount);
    }
    return { [smartMethod]: result };
  }

  protected getListRequest(
    method: string,
    _params: Record<string, unknown> | undefined,
    startIndex: number,
  ): Record<string, unknown> {
    return { [method]: { start_index: startIndex } };
  }

  private async handleResponseLists(
    responseResult: Record<string, unknown>,
    method: string,
    params: Record<string, unknown> | undefined,
    retryCount: number,
  ): Promise<void> {
    if (!("start_index" in responseResult)) return;
    const listSum = responseResult.sum as number | undefined;
    if (listSum === undefined) return;

    const listName = Object.keys(responseResult).find((key) =>
      Array.isArray(responseResult[key]),
    );
    if (!listName) return;

    let listValue = responseResult[listName] as unknown[];
    while (listValue.length < listSum) {
      const request = this.getListRequest(method, params, listValue.length);
      const response = await this.executeQuery(request, retryCount, false);
      const nextBatch = response[method] as Record<string, unknown>;
      const nextBatchList = nextBatch[listName] as unknown[];
      if (!nextBatchList || nextBatchList.length === 0) break;
      listValue = listValue.concat(nextBatchList);
      responseResult[listName] = listValue;
    }
  }

  protected handleResponseErrorCode(
    respDict: Record<string, unknown>,
    method: string,
    raiseOnError = true,
  ): void {
    const errorCodeRaw = respDict.error_code as number | undefined;
    const errorCode = errorCodeRaw ?? SmartErrorCode.INTERNAL_UNKNOWN_ERROR;

    if (errorCode === SmartErrorCode.SUCCESS) return;

    if (!raiseOnError) {
      respDict.result = errorCode;
      return;
    }

    const msg = `Error querying device: ${this.host}: ${SmartErrorCode[errorCode] ?? errorCode}(${errorCode}) for method: ${method}`;
    if ((SMART_RETRYABLE_ERRORS as number[]).includes(errorCode)) {
      throw new RetryableError(msg, { errorCode });
    }
    if ((SMART_AUTHENTICATION_ERRORS as number[]).includes(errorCode)) {
      throw new AuthenticationError(msg, { errorCode });
    }
    throw new DeviceError(msg, { errorCode });
  }

  async close(): Promise<void> {
    await this.transportRef.close();
  }
}

/**
 * Protocol wrapper for controlling child devices.
 *
 * Internal class used to communicate with child devices: overrides {@link query} to
 * wrap all outgoing queries in a `control_child` envelope, and unwraps the device's
 * response before returning it to the caller.
 */
export class ChildProtocolWrapper extends SmartProtocol {
  constructor(
    private readonly deviceId: string,
    private readonly parentProtocol: SmartProtocol,
  ) {
    super(parentProtocol.transport as BaseTransport);
  }

  private getMethodAndParamsForRequest(
    request: Record<string, unknown> | string,
  ): [string, unknown] {
    if (isPlainRecord(request)) {
      const entries = Object.entries(request);
      const first = entries[0];
      if (entries.length === 1 && first) {
        return [first[0], first[1]];
      }
      const requests = entries.map(([method, params]) =>
        params ? { method, params } : { method },
      );
      return ["multipleRequest", { requests }];
    }
    return [request, undefined];
  }

  override async query(
    request: string | Record<string, unknown>,
    retryCount = 3,
  ): Promise<Record<string, unknown>> {
    const [method, params] = this.getMethodAndParamsForRequest(request);
    const requestData = { method, params };
    const wrappedPayload = {
      control_child: { device_id: this.deviceId, requestData },
    };

    const response = await this.parentProtocol.query(wrappedPayload, retryCount);
    const result = response.control_child as Record<string, unknown> | undefined;
    if (result?.responseData) {
      const responseData = result.responseData as Record<string, unknown>;
      const innerResult = responseData.result as Record<string, unknown> | undefined;
      if (innerResult?.responses) {
        const retVal: Record<string, unknown> = {};
        for (const multiResponse of innerResult.responses as Array<
          Record<string, unknown>
        >) {
          const multiMethod = multiResponse.method as string;
          this.handleResponseErrorCode(multiResponse, multiMethod, false);
          retVal[multiMethod] = multiResponse.result;
        }
        return retVal;
      }
      this.handleResponseErrorCode(responseData, "control_child");
      return { [method]: innerResult };
    }
    return { [method]: undefined };
  }

  override async close(): Promise<void> {
    // The parent protocol owns the transport.
  }
}
