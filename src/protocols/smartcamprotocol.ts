import {
  AuthenticationError,
  DeviceError,
  KasaException,
  RetryableError,
  SMART_AUTHENTICATION_ERRORS,
  SMART_RETRYABLE_ERRORS,
  SmartErrorCode,
} from "../core/exceptions.ts";
import type { BaseTransport } from "../transports/basetransport.ts";
import { SmartProtocol } from "./smartprotocol.ts";

/** getMethodNames that should be sent as `{"method": "do"}` rather than `{"method": "get"}`. */
const GET_METHODS_AS_DO = new Set([
  "getSdCardFormatStatus",
  "getConnectionType",
  "getUserID",
  "getP2PSharePassword",
  "getAESEncryptKey",
  "getFirmwareAFResult",
  "getWhitelampStatus",
]);

interface SingleRequest {
  methodType: string;
  methodName: string;
  paramName: string;
  request: Record<string, unknown>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeSnakeName(name: string): string {
  let result = "";
  for (const char of name) {
    result +=
      char === char.toUpperCase() && char !== char.toLowerCase()
        ? `_${char.toLowerCase()}`
        : char;
  }
  return result.replace(/^_/, "");
}

function getSmartCameraSingleRequest(request: Record<string, unknown>): SingleRequest {
  const method = Object.keys(request)[0] as string;
  if (method === "multipleRequest") {
    const params = request.multipleRequest;
    return {
      methodType: "multi",
      methodName: "multipleRequest",
      paramName: "",
      request: { method: "multipleRequest", params },
    };
  }

  const inner = request[method] as Record<string, unknown>;
  const param = Object.keys(inner)[0] as string;
  return {
    methodType: method,
    methodName: method,
    paramName: param,
    request: { method, [param]: inner[param] },
  };
}

function makeSmartCameraSingleRequest(request: string): SingleRequest {
  const method = request;
  const snakeName = makeSnakeName(request);
  const shortMethod = method.slice(0, 3);
  let methodType: string;
  let param: string;
  if (
    (shortMethod === "get" || shortMethod === "set") &&
    !GET_METHODS_AS_DO.has(method)
  ) {
    methodType = shortMethod;
    param = snakeName.slice(4);
  } else {
    methodType = "do";
    param = snakeName;
  }
  return {
    methodType,
    methodName: method,
    paramName: param,
    request: { method: methodType, [param]: {} },
  };
}

/** Protocol implementation for TP-Link's SMARTCAM (Tapo camera) devices. */
export class SmartCamProtocol extends SmartProtocol {
  protected override getListRequest(
    method: string,
    params: Record<string, unknown> | undefined,
    startIndex: number,
  ): Record<string, unknown> {
    const moduleName = Object.keys(params ?? {})[0] as string;
    return { [method]: { [moduleName]: { start_index: startIndex } } };
  }

  protected override handleResponseErrorCode(
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

  protected override async executeQuery(
    request: string | Record<string, unknown>,
    retryCount: number,
    iterateListPages = true,
  ): Promise<Record<string, unknown>> {
    let singleRequest: SingleRequest;
    if (isPlainRecord(request)) {
      const method = Object.keys(request)[0] as string;
      const validTop =
        method === "get" ||
        method === "set" ||
        method === "do" ||
        method === "multipleRequest";
      if (Object.keys(request).length === 1 && validTop) {
        singleRequest = getSmartCameraSingleRequest(request);
      } else {
        return this.executeMultipleQuery(request, retryCount, iterateListPages);
      }
    } else {
      singleRequest = makeSmartCameraSingleRequest(request);
    }

    const smartRequest = JSON.stringify(singleRequest.request);
    const responseData = await this.transportRef.send(smartRequest);

    if ("error_code" in responseData) {
      this.handleResponseErrorCode(responseData, singleRequest.methodName);
    }

    if (singleRequest.methodType === "get") {
      const section = Object.keys(responseData)[0];
      if (
        !section ||
        Object.keys((responseData[section] as Record<string, unknown>) ?? {}).length === 0
      ) {
        throw new DeviceError(`No results for get request ${singleRequest.methodName}`);
      }
    }

    if (singleRequest.methodType === "do") {
      return { [singleRequest.methodName]: responseData };
    }
    if (singleRequest.methodType === "set") {
      return {};
    }
    if (singleRequest.methodType === "multi") {
      return { [singleRequest.methodName]: responseData.result };
    }
    return {
      [singleRequest.methodName]: {
        [singleRequest.paramName]: responseData[singleRequest.paramName],
      },
    };
  }

  override async close(): Promise<void> {
    await this.transportRef.close();
  }
}

/**
 * Protocol wrapper for controlling child devices attached to a SMARTCAM hub.
 *
 * Overrides {@link query} to wrap outgoing queries in a `controlChild` envelope and
 * unwraps the device's response before returning it to the caller.
 */
export class ChildCameraProtocolWrapper extends SmartProtocol {
  constructor(
    private readonly deviceId: string,
    private readonly parentProtocol: SmartProtocol,
  ) {
    super(parentProtocol.transport as BaseTransport);
  }

  override async query(
    request: string | Record<string, unknown>,
    retryCount = 3,
  ): Promise<Record<string, unknown>> {
    if (!isPlainRecord(request)) {
      throw new KasaException("Child requests must be dictionaries.");
    }

    const methods: string[] = [];
    const requests: Record<string, unknown>[] = [];
    for (const [key, val] of Object.entries(request)) {
      methods.push(key);
      requests.push({
        method: "controlChild",
        params: {
          childControl: {
            device_id: this.deviceId,
            request_data: { method: key, params: val },
          },
        },
      });
    }

    const multipleRequest = { multipleRequest: { requests } };
    const response = await this.parentProtocol.query(multipleRequest, retryCount);
    const multi = response.multipleRequest as {
      responses: Array<Record<string, unknown>>;
    };
    const responseDict: Record<string, unknown> = {};
    const raiseOnError = requests.length === 1;

    multi.responses.forEach((resp, index) => {
      const result = resp.result as Record<string, unknown>;
      const responseData = result.response_data as Record<string, unknown>;
      const method = methods[index] as string;
      this.handleResponseErrorCode(responseData, method, raiseOnError);
      responseDict[method] = responseData.result;
    });

    return responseDict;
  }

  override async close(): Promise<void> {
    // The parent protocol owns the transport.
  }
}
