import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: device-maintenance commands (reboot, SD-card format, firmware
 * check/upgrade), ported from ref/pytapo/pytapo/__init__.py's reboot()/format()/
 * isUpdateAvailable()/startFirmwareUpgrade()/getFirmwareUpdateStatus(). pytapo talks a
 * broader camera RPC surface than python-kasa's smartcam component set exposes, so
 * these methods have no python-kasa equivalent to port from ref/python-kasa/. Doesn't
 * touch src/smartcam/modules/camera.ts.
 */

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class CameraMaintenance {
  readonly #rawQuery: RawQuery;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  /** Reboot the camera. Resolves once the device accepts the command, not once it's back up. */
  reboot(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ rebootDevice: { system: { reboot: "null" } } });
  }

  /** Format the camera's SD card. Destructive — erases all recordings. */
  formatSdCard(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ formatSdCard: { harddisk_manage: { format_hd: "1" } } });
  }

  /** Ask the cloud whether a newer firmware version is available. */
  checkFirmwareUpdate(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      checkFirmwareVersionByCloud: { cloud_config: { check_fw_version: "null" } },
      getCloudConfig: { cloud_config: { name: ["upgrade_info"] } },
    });
  }

  /** Poll the in-progress firmware download/install status. */
  getFirmwareUpdateStatus(): Promise<Record<string, unknown>> {
    return this.#rawQuery({
      getFirmwareUpdateStatus: { cloud_config: { name: "upgrade_status" } },
    });
  }

  /** Start downloading and installing the firmware update found by checkFirmwareUpdate(). */
  startFirmwareUpgrade(): Promise<Record<string, unknown>> {
    return this.#rawQuery({ do: { cloud_config: { fw_download: "null" } } });
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Device maintenance: reboot, SD-card format, firmware check/upgrade. */
    readonly maintenance: CameraMaintenance;
  }
}

const maintenanceMap = new WeakMap<Camera, CameraMaintenance>();

Object.defineProperty(Camera.prototype, "maintenance", {
  configurable: true,
  get(this: Camera): CameraMaintenance {
    let instance = maintenanceMap.get(this);
    if (!instance) {
      instance = new CameraMaintenance(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      maintenanceMap.set(this, instance);
    }
    return instance;
  },
});
