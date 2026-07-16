import type { Credentials } from "../../core/credentials.ts";
import { createCredentials } from "../../core/credentials.ts";

/**
 * Tapo cameras authenticate ONVIF/RTSP/snapshot access with a separate "local account"
 * (set in the Tapo app under Advanced Settings > Camera Account), distinct from the cloud
 * account used for the JSON-RPC `securePassthrough` channel. There's no device-reported
 * default for it, so resolution order is: explicit param > KASA_LOCAL_USERNAME/PASSWORD env
 * vars > this hardcoded fallback.
 */
const DEFAULT_LOCAL_USERNAME = "username";
const DEFAULT_LOCAL_PASSWORD = "password";

export function resolveLocalCredentials(explicit?: Credentials): Credentials {
  if (explicit?.username && explicit.password) return explicit;
  return createCredentials(
    process.env.KASA_LOCAL_USERNAME ?? DEFAULT_LOCAL_USERNAME,
    process.env.KASA_LOCAL_PASSWORD ?? DEFAULT_LOCAL_PASSWORD,
  );
}
