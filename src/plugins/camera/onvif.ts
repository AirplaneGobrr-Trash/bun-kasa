import { createHash, randomBytes } from "node:crypto";
import type { Credentials } from "../../core/credentials.ts";
import { KasaException } from "../../core/exceptions.ts";

/**
 * Minimal hand-rolled ONVIF SOAP client — WS-Security UsernameToken digest auth, mirroring
 * the mechanism proven against a real C100 in ref/camera/onvif_events.py (wsse_header()).
 * No XML DOM parser dependency: responses are matched with small tag/attribute regexes,
 * which is sufficient for the fixed, known-shape ONVIF responses this file cares about.
 */

export class OnvifError extends KasaException {}

export interface OnvifDeviceInformation {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface OnvifCapabilities {
  deviceXAddr?: string;
  mediaXAddr?: string;
  eventsXAddr?: string;
  ptzXAddr?: string;
}

export interface OnvifProfile {
  token: string;
  name?: string;
}

export interface OnvifNotification {
  topic: string;
  values: Record<string, string>;
}

const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSU_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const PASSWORD_DIGEST_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest";
const NONCE_ENCODING_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";

export const OnvifAction = {
  GetDeviceInformation: "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation",
  GetCapabilities: "http://www.onvif.org/ver10/device/wsdl/GetCapabilities",
  GetProfiles: "http://www.onvif.org/ver10/media/wsdl/GetProfiles",
  GetSnapshotUri: "http://www.onvif.org/ver10/media/wsdl/GetSnapshotUri",
  CreatePullPointSubscription:
    "http://www.onvif.org/ver10/events/wsdl/CreatePullPointSubscription",
  PullMessages: "http://www.onvif.org/ver10/events/wsdl/PullMessages",
  Renew: "http://docs.oasis-open.org/wsn/bw-2/SubscriptionManager/RenewRequest",
} as const;

const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

function wsseSecurityHeader(credentials: Credentials): string {
  const nonce = randomBytes(16);
  const created = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const digest = createHash("sha1")
    .update(
      Buffer.concat([
        nonce,
        Buffer.from(created, "utf-8"),
        Buffer.from(credentials.password, "utf-8"),
      ]),
    )
    .digest("base64");

  return `<wsse:Security xmlns:wsse="${WSSE_NS}">
      <wsse:UsernameToken>
        <wsse:Username>${escapeXml(credentials.username)}</wsse:Username>
        <wsse:Password Type="${PASSWORD_DIGEST_TYPE}">${digest}</wsse:Password>
        <wsse:Nonce EncodingType="${NONCE_ENCODING_TYPE}">${nonce.toString("base64")}</wsse:Nonce>
        <wsu:Created xmlns:wsu="${WSU_NS}">${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>`;
}

function envelope(bodyXml: string, credentials?: Credentials): string {
  const header = credentials
    ? `<s:Header>${wsseSecurityHeader(credentials)}</s:Header>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
            xmlns:tev="http://www.onvif.org/ver10/events/wsdl"
            xmlns:wsnt="http://docs.oasis-open.org/wsn/b-2"
            xmlns:wsa5="http://www.w3.org/2005/08/addressing"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  ${header}
  <s:Body>${bodyXml}</s:Body>
</s:Envelope>`;
}

async function soapRequest(
  url: string,
  action: string,
  bodyXml: string,
  credentials?: Credentials,
  timeoutMs = 10_000,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml", SOAPAction: action },
      body: envelope(bodyXml, credentials),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (ex) {
    throw new OnvifError(`ONVIF request to ${url} (${action}) failed: ${ex}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new OnvifError(
      `ONVIF request to ${url} (${action}) failed: ${response.status} ${response.statusText}: ${text}`,
    );
  }
  return text;
}

interface XmlElement {
  attrs: Record<string, string>;
  inner: string;
}

function extractElements(xml: string, tag: string): XmlElement[] {
  const re = new RegExp(
    `<(?:\\w+:)?${tag}\\b([^>]*)>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`,
    "gi",
  );
  const results: XmlElement[] = [];
  for (const match of xml.matchAll(re)) {
    const attrsRaw = match[1] ?? "";
    const attrs: Record<string, string> = {};
    for (const attrMatch of attrsRaw.matchAll(/(\w+)="([^"]*)"/g)) {
      const [, name, value] = attrMatch;
      if (name !== undefined && value !== undefined) attrs[name] = value;
    }
    results.push({ attrs, inner: (match[2] ?? "").trim() });
  }
  return results;
}

function extractTag(xml: string, tag: string): string | undefined {
  return extractElements(xml, tag)[0]?.inner;
}

/** Fetch basic ONVIF device identity (manufacturer/model/firmware/serial). */
export async function getDeviceInformation(
  url: string,
  credentials?: Credentials,
): Promise<OnvifDeviceInformation> {
  const xml = await soapRequest(
    url,
    OnvifAction.GetDeviceInformation,
    "<tds:GetDeviceInformation/>",
    credentials,
  );
  return {
    manufacturer: extractTag(xml, "Manufacturer"),
    model: extractTag(xml, "Model"),
    firmwareVersion: extractTag(xml, "FirmwareVersion"),
    serialNumber: extractTag(xml, "SerialNumber"),
    hardwareId: extractTag(xml, "HardwareId"),
  };
}

/** Discover the service endpoints (XAddr) for Media/Events/PTZ, which may differ from `url`. */
export async function getCapabilities(
  url: string,
  credentials?: Credentials,
): Promise<OnvifCapabilities> {
  const xml = await soapRequest(
    url,
    OnvifAction.GetCapabilities,
    "<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>",
    credentials,
  );
  const deviceBlock = extractElements(xml, "Device")[0]?.inner ?? "";
  const mediaBlock = extractElements(xml, "Media")[0]?.inner ?? "";
  const eventsBlock = extractElements(xml, "Events")[0]?.inner ?? "";
  const ptzBlock = extractElements(xml, "PTZ")[0]?.inner ?? "";
  return {
    deviceXAddr: extractTag(deviceBlock, "XAddr"),
    mediaXAddr: extractTag(mediaBlock, "XAddr"),
    eventsXAddr: extractTag(eventsBlock, "XAddr"),
    ptzXAddr: extractTag(ptzBlock, "XAddr"),
  };
}

/** List media profiles, needed to scope GetSnapshotUri to a specific stream. */
export async function getProfiles(
  mediaUrl: string,
  credentials?: Credentials,
): Promise<OnvifProfile[]> {
  const xml = await soapRequest(
    mediaUrl,
    OnvifAction.GetProfiles,
    "<trt:GetProfiles/>",
    credentials,
  );
  const profiles: OnvifProfile[] = [];
  for (const el of extractElements(xml, "Profiles")) {
    const token = el.attrs.token;
    if (token) profiles.push({ token, name: extractTag(el.inner, "Name") });
  }
  return profiles;
}

/** Resolve the still-image snapshot URI for a media profile. */
export async function getSnapshotUri(
  mediaUrl: string,
  profileToken: string,
  credentials?: Credentials,
): Promise<string | undefined> {
  const xml = await soapRequest(
    mediaUrl,
    OnvifAction.GetSnapshotUri,
    `<trt:GetSnapshotUri><trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken></trt:GetSnapshotUri>`,
    credentials,
  );
  return extractTag(xml, "Uri");
}

/** Subscribe to the pull-point event source; returns the subscription's own SOAP address. */
export async function createPullPointSubscription(
  eventsUrl: string,
  credentials: Credentials,
  leaseSeconds = 60,
): Promise<string> {
  const xml = await soapRequest(
    eventsUrl,
    OnvifAction.CreatePullPointSubscription,
    `<tev:CreatePullPointSubscription><tev:InitialTerminationTime>PT${leaseSeconds}S</tev:InitialTerminationTime></tev:CreatePullPointSubscription>`,
    credentials,
  );
  const address = extractTag(xml, "Address");
  if (!address)
    throw new OnvifError(
      "No subscription address in CreatePullPointSubscription response",
    );
  return address;
}

export async function renewSubscription(
  subscriptionUrl: string,
  credentials: Credentials,
  leaseSeconds = 60,
): Promise<void> {
  await soapRequest(
    subscriptionUrl,
    OnvifAction.Renew,
    `<wsnt:Renew><wsnt:TerminationTime>PT${leaseSeconds}S</wsnt:TerminationTime></wsnt:Renew>`,
    credentials,
  );
}

/** Long-poll the subscription for new notifications (motion/person/tamper/etc). */
export async function pullMessages(
  subscriptionUrl: string,
  credentials: Credentials,
  timeoutSeconds = 5,
  messageLimit = 10,
): Promise<OnvifNotification[]> {
  const xml = await soapRequest(
    subscriptionUrl,
    OnvifAction.PullMessages,
    `<tev:PullMessages><tev:MessageLimit>${messageLimit}</tev:MessageLimit><tev:Timeout>PT${timeoutSeconds}S</tev:Timeout></tev:PullMessages>`,
    credentials,
    (timeoutSeconds + 5) * 1000,
  );
  return extractElements(xml, "NotificationMessage").map((msg) => {
    const topic = extractTag(msg.inner, "Topic") ?? "";
    const values: Record<string, string> = {};
    for (const item of extractElements(msg.inner, "SimpleItem")) {
      const name = item.attrs.Name;
      const value = item.attrs.Value;
      if (name && value !== undefined) values[name] = value;
    }
    return { topic, values };
  });
}
