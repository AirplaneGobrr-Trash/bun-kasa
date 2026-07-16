import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

/** Firmware download state. */
export interface DownloadState {
  status: number;
  progress: number;
  rebootTime: number;
  upgradeTime: number;
  autoUpgrade: boolean;
}

function parseDownloadState(raw: Record<string, unknown>): DownloadState {
  return {
    status: raw.status as number,
    progress: raw.download_progress as number,
    rebootTime: raw.reboot_time as number,
    upgradeTime: raw.upgrade_time as number,
    autoUpgrade: Boolean(raw.auto_upgrade),
  };
}

/** Update info status object. */
export interface UpdateInfo {
  status: number;
  needsUpgrade: boolean;
  version?: string;
  releaseDate?: Date;
  releaseNotes?: string;
  fwSize?: number;
  oemId?: string;
}

function parseUpdateInfo(raw: Record<string, unknown>): UpdateInfo {
  const releaseDateRaw = raw.release_date as string | undefined;
  return {
    status: raw.type as number,
    needsUpgrade: Boolean(raw.need_to_upgrade),
    version: raw.fw_ver as string | undefined,
    releaseDate: releaseDateRaw ? new Date(releaseDateRaw) : undefined,
    releaseNotes: raw.release_note as string | undefined,
    fwSize: raw.fw_size as number | undefined,
    oemId: raw.oem_id as string | undefined,
  };
}

function updateAvailable(info: UpdateInfo): boolean {
  return info.status !== 0;
}

const UPDATE_POLL_INTERVAL_MS = 500;
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;

/** Implementation of the firmware module. */
export class Firmware extends SmartModule {
  static override readonly requiredComponent = "firmware";
  override minimumUpdateIntervalSecs = 60 * 60 * 24;

  private firmwareUpdateInfo: UpdateInfo | undefined;

  override initializeFeatures(): void {
    const device = this.device;
    if (this.supportedVersion > 1) {
      this.addFeature(
        new Feature(device, {
          id: "auto_update_enabled",
          name: "Auto update enabled",
          container: this,
          attributeGetter: "autoUpdateEnabled",
          attributeSetter: "setAutoUpdateEnabled",
          type: FeatureType.Switch,
        }),
      );
    }
    this.addFeature(
      new Feature(device, {
        id: "update_available",
        name: "Update available",
        container: this,
        attributeGetter: "updateAvailable",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Info,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "current_firmware_version",
        name: "Current firmware version",
        container: this,
        attributeGetter: "currentFirmware",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "available_firmware_version",
        name: "Available firmware version",
        container: this,
        attributeGetter: "latestFirmware",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    this.addFeature(
      new Feature(device, {
        id: "check_latest_firmware",
        name: "Check latest firmware",
        container: this,
        attributeSetter: "checkLatestFirmware",
        category: FeatureCategory.Info,
        type: FeatureType.Action,
      }),
    );
  }

  override query(): Record<string, unknown> {
    if (this.supportedVersion > 1) return { get_auto_update_info: null };
    return {};
  }

  async checkLatestFirmware(): Promise<UpdateInfo | undefined> {
    try {
      const fw = await this.call("get_latest_fw");
      this.firmwareUpdateInfo = parseUpdateInfo(
        fw.get_latest_fw as Record<string, unknown>,
      );
      return this.firmwareUpdateInfo;
    } catch {
      this.firmwareUpdateInfo = undefined;
      return undefined;
    }
  }

  get currentFirmware(): string {
    return this.smartDevice.hwInfo.sw_ver as string;
  }

  get latestFirmware(): string | undefined {
    return this.firmwareUpdateInfo?.version;
  }

  get firmwareUpdateInfoValue(): UpdateInfo | undefined {
    return this.firmwareUpdateInfo;
  }

  get updateAvailable(): boolean | undefined {
    if (!this.smartDevice.isCloudConnected || !this.firmwareUpdateInfo) return undefined;
    return updateAvailable(this.firmwareUpdateInfo);
  }

  async getUpdateState(): Promise<DownloadState> {
    const resp = await this.call("get_fw_download_state");
    return parseDownloadState(resp.get_fw_download_state as Record<string, unknown>);
  }

  async update(
    progressCb?: (state: DownloadState) => void,
  ): Promise<Record<string, unknown>> {
    try {
      if (!this.firmwareUpdateInfo) {
        throw new KasaException(
          "You must call checkLatestFirmware before calling update",
        );
      }
      if (!this.updateAvailable) {
        throw new KasaException("A new update must be available to call update");
      }
      await this.call("fw_download");

      const deadline = Date.now() + UPDATE_TIMEOUT_MS;
      let state: DownloadState;
      for (;;) {
        if (Date.now() > deadline)
          throw new KasaException("Timed out waiting for firmware update");
        await new Promise((resolve) => setTimeout(resolve, UPDATE_POLL_INTERVAL_MS));
        try {
          state = await this.getUpdateState();
        } catch {
          continue;
        }
        progressCb?.(state);

        if (state.status === 0) break;
        if (state.status === 3) {
          await new Promise((resolve) => setTimeout(resolve, state.upgradeTime * 1000));
        } else if (state.status < 0) {
          break;
        }
      }
      return { status: state.status, progress: state.progress };
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get autoUpdateEnabled(): boolean {
    return "enable" in this.data && Boolean(this.data.enable);
  }

  async setAutoUpdateEnabled(enabled: boolean): Promise<Record<string, unknown>> {
    try {
      const data = { ...this.data, enable: enabled };
      return await this.call("set_auto_update_info", data);
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }
}
