export const BUN_KASA_VERSION = "0.1.0";

export * from "./core/index.ts";
export * as interfaces from "./interfaces/index.ts";
export * as transports from "./transports/index.ts";
export * as protocols from "./protocols/index.ts";
export * as iot from "./iot/index.ts";
export * as smart from "./smart/index.ts";
export * as smartcam from "./smartcam/index.ts";
import "./tapo/index.ts";
export { connect } from "./connect.ts";
export type {
  DeviceDict,
  DiscoveredMeta,
  DiscoveredRaw,
  DiscoverOptions,
  DiscoverSingleOptions,
  DiscoveryResult,
  OnDiscoveredCallable,
  OnDiscoveredRawCallable,
  OnUnsupportedCallable,
} from "./discover.ts";
export { discover, discoverSingle } from "./discover.ts";
