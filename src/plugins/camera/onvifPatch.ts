import { makeEventEmitterClass } from "events-typed";
import type { Credentials } from "../../core/credentials.ts";
import { Camera } from "../../smartcam/modules/camera.ts";
import { resolveLocalCredentials } from "./localCredentials.ts";
import type { OnvifCapabilities, OnvifDeviceInformation } from "./onvif.ts";
import * as onvif from "./onvif.ts";

/**
 * Monkey-patch: real ONVIF support for `Camera`, layered on top of the existing
 * `onvifUrl()` URL builder without editing src/smartcam/modules/camera.ts. Uses the
 * "local account" credentials (see localCredentials.ts), matching the WS-Security
 * digest mechanism proven against a real C100 in ref/camera/onvif_events.py. The event
 * surface (events/startEvents/stopEvents) mirrors ref/camera/Camera.ts's shape.
 */

export interface CameraMotionEvent {
  host: string;
  active: boolean;
}

export interface OnvifTopicEvent {
  host: string;
  topic: string;
  [key: string]: string;
}

export interface CameraOnvifEvents {
  motion: [CameraMotionEvent];
  person: [CameraMotionEvent];
  tamper: [CameraMotionEvent];
  event: [OnvifTopicEvent];
}

const CameraEventEmitter = makeEventEmitterClass<CameraOnvifEvents>();
type CameraEventEmitter = InstanceType<typeof CameraEventEmitter>;

const ONVIF_EVENTS_LEASE_SECONDS = 60;
const ONVIF_EVENTS_POLL_INTERVAL_MS = 3000;
const ONVIF_EVENTS_RENEW_MARGIN_SECONDS = 10;

export class CameraOnvif {
  readonly #camera: Camera;
  readonly #emitter = new CameraEventEmitter();
  #pollStop: (() => void) | null = null;

  constructor(camera: Camera) {
    this.#camera = camera;
  }

  /** Typed motion/person/tamper/event emitter, populated once startEvents() is called. */
  get events(): CameraEventEmitter {
    return this.#emitter;
  }

  /** Fetch manufacturer/model/firmware/serial over ONVIF `GetDeviceInformation`. */
  async getDeviceInformation(credentials?: Credentials): Promise<OnvifDeviceInformation> {
    const url = this.#camera.onvifUrl();
    if (!url) throw new Error("Camera has no ONVIF endpoint (hub child or camera off)");
    return onvif.getDeviceInformation(url, resolveLocalCredentials(credentials));
  }

  /** Discover the Media/Events/PTZ service endpoints ONVIF `GetCapabilities` reports. */
  async getCapabilities(credentials?: Credentials): Promise<OnvifCapabilities> {
    const url = this.#camera.onvifUrl();
    if (!url) throw new Error("Camera has no ONVIF endpoint (hub child or camera off)");
    return onvif.getCapabilities(url, resolveLocalCredentials(credentials));
  }

  /** Start polling ONVIF pull-point events (motion/person/tamper/etc). Idempotent. */
  startEvents(
    credentials?: Credentials,
    options?: { onError?: (err: unknown) => void },
  ): void {
    if (this.#pollStop) return;

    const deviceUrl = this.#camera.onvifUrl();
    if (!deviceUrl)
      throw new Error("Camera has no ONVIF endpoint (hub child or camera off)");

    const wsseCredentials = resolveLocalCredentials(credentials);
    const emitter = this.#emitter;
    const host = this.#camera.device.host;

    let stopped = false;
    let subscriptionUrl: string | undefined;
    let expiresAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      if (stopped) return;
      try {
        if (!subscriptionUrl) {
          // Some firmwares serve Events off the same base URL as the device service
          // rather than a dedicated XAddr, so fall back to deviceUrl if undiscovered.
          const capabilities = await onvif.getCapabilities(deviceUrl, wsseCredentials);
          const eventsUrl = capabilities.eventsXAddr ?? deviceUrl;
          subscriptionUrl = await onvif.createPullPointSubscription(
            eventsUrl,
            wsseCredentials,
            ONVIF_EVENTS_LEASE_SECONDS,
          );
          expiresAt = Date.now() + ONVIF_EVENTS_LEASE_SECONDS * 1000;
        }

        if (Date.now() > expiresAt - ONVIF_EVENTS_RENEW_MARGIN_SECONDS * 1000) {
          await onvif.renewSubscription(
            subscriptionUrl,
            wsseCredentials,
            ONVIF_EVENTS_LEASE_SECONDS,
          );
          expiresAt = Date.now() + ONVIF_EVENTS_LEASE_SECONDS * 1000;
        }

        const notifications = await onvif.pullMessages(subscriptionUrl, wsseCredentials);
        for (const notification of notifications) {
          const { topic, values } = notification;
          if ("IsMotion" in values) {
            emitter.emit("motion", { host, active: values.IsMotion === "true" });
          }
          if ("IsPeople" in values) {
            emitter.emit("person", { host, active: values.IsPeople === "true" });
          }
          if ("IsTamper" in values) {
            emitter.emit("tamper", { host, active: values.IsTamper === "true" });
          }
          emitter.emit("event", { host, topic, ...values });
        }
      } catch (ex) {
        subscriptionUrl = undefined;
        options?.onError?.(ex);
      }
      if (!stopped) timer = setTimeout(() => void poll(), ONVIF_EVENTS_POLL_INTERVAL_MS);
    };

    void poll();
    this.#pollStop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  /** Stop the poll loop started by startEvents(). */
  stopEvents(): void {
    this.#pollStop?.();
    this.#pollStop = null;
  }
}

declare module "../../smartcam/modules/camera.ts" {
  interface Camera {
    /** Real ONVIF support: device info/capabilities/events, layered on onvifUrl(). */
    readonly onvif: CameraOnvif;
  }
}

const onvifMap = new WeakMap<Camera, CameraOnvif>();

Object.defineProperty(Camera.prototype, "onvif", {
  configurable: true,
  get(this: Camera): CameraOnvif {
    let instance = onvifMap.get(this);
    if (!instance) {
      instance = new CameraOnvif(this);
      onvifMap.set(this, instance);
    }
    return instance;
  },
});
