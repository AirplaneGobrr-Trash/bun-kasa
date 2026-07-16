import type { Credentials } from "../../core/credentials.ts";
import { createCredentials } from "../../core/credentials.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartCamModules } from "../modulenames.ts";
import { SmartCamModule } from "../smartcammodule.ts";

const LOCAL_STREAMING_PORT = 554;
const ONVIF_PORT = 2020;

export enum StreamResolution {
  HD = "HD",
  SD = "SD",
}

/** Implementation of the SMARTCAM device module (video streaming). */
export class Camera extends SmartCamModule {
  static override readonly requiredComponent = "video";

  override initializeFeatures(): void {
    if (this.smartCamDevice.modules.has(SmartCamModules.LensMask)) {
      this.addFeature(
        new Feature(this.device, {
          id: "state",
          name: "State",
          container: this,
          attributeGetter: "isOn",
          attributeSetter: "setState",
          type: FeatureType.Switch,
          category: FeatureCategory.Primary,
        }),
      );
    }
  }

  get isOn(): boolean {
    const lensMask = this.smartCamDevice.modules.get(SmartCamModules.LensMask);
    if (lensMask) return !lensMask.enabled;
    return true;
  }

  async setState(on: boolean): Promise<Record<string, unknown>> {
    const lensMask = this.smartCamDevice.modules.get(SmartCamModules.LensMask);
    if (lensMask) {
      // Turning off enables the privacy mask, hence the inversion.
      return lensMask.setEnabled(!on);
    }
    return {};
  }

  private getCredentials(): Credentials | undefined {
    const config = this.smartCamDevice.config;
    if (config.credentials) return config.credentials;

    if (config.credentialsHash) {
      try {
        const decoded = JSON.parse(
          Buffer.from(config.credentialsHash, "base64").toString("utf-8"),
        );
        if (decoded.un && decoded.pwd) return createCredentials(decoded.un, decoded.pwd);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Return the local RTSP streaming url, or undefined if no credentials or the
   * camera is off.
   */
  streamRtspUrl(
    credentials?: Credentials,
    options?: { streamResolution?: StreamResolution },
  ): string | undefined {
    if (this.smartCamDevice.isHubChild) return undefined;

    const streams: Record<StreamResolution, string> = {
      [StreamResolution.HD]: "stream1",
      [StreamResolution.SD]: "stream2",
    };
    const stream = streams[options?.streamResolution ?? StreamResolution.HD];
    if (!stream) return undefined;

    const creds = credentials ?? this.getCredentials();
    if (!creds?.username || !creds.password) return undefined;

    const username = encodeURIComponent(creds.username);
    const password = encodeURIComponent(creds.password);

    return `rtsp://${username}:${password}@${this.smartCamDevice.host}:${LOCAL_STREAMING_PORT}/${stream}`;
  }

  onvifUrl(): string | undefined {
    if (this.smartCamDevice.isHubChild) return undefined;
    return `http://${this.smartCamDevice.host}:${ONVIF_PORT}/onvif/device_service`;
  }
}
