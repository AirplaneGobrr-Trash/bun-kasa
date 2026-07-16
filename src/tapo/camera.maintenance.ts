import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: device-maintenance commands (reboot, SD-card format, firmware
 * check/upgrade), ported from ref/pytapo/pytapo/__init__.py's reboot()/format()/
 * isUpdateAvailable()/startFirmwareUpgrade()/getFirmwareUpdateStatus(). pytapo talks a
 * broader camera RPC surface than python-kasa's smartcam component set exposes, so
 * these methods have no python-kasa equivalent to port from ref/python-kasa/. Doesn't
 * touch src/smartcam/modules/camera.ts.
 */

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** Reboot the camera. Resolves once the device accepts the command, not once it's back up. */
    reboot(): Promise<Record<string, unknown>>;
    /** Format the camera's SD card. Destructive — erases all recordings. */
    formatSdCard(): Promise<Record<string, unknown>>;
    /** Ask the cloud whether a newer firmware version is available. */
    checkFirmwareUpdate(): Promise<Record<string, unknown>>;
    /** Poll the in-progress firmware download/install status. */
    getFirmwareUpdateStatus(): Promise<Record<string, unknown>>;
    /** Start downloading and installing the firmware update found by checkFirmwareUpdate(). */
    startFirmwareUpgrade(): Promise<Record<string, unknown>>;
  }
}

Camera.prototype.reboot = function (this: Camera): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ rebootDevice: { system: { reboot: "null" } } });
};

Camera.prototype.formatSdCard = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    formatSdCard: { harddisk_manage: { format_hd: "1" } },
  });
};

Camera.prototype.checkFirmwareUpdate = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    checkFirmwareVersionByCloud: { cloud_config: { check_fw_version: "null" } },
    getCloudConfig: { cloud_config: { name: ["upgrade_info"] } },
  });
};

Camera.prototype.getFirmwareUpdateStatus = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({
    getFirmwareUpdateStatus: { cloud_config: { name: "upgrade_status" } },
  });
};

Camera.prototype.startFirmwareUpgrade = function (
  this: Camera,
): Promise<Record<string, unknown>> {
  return this.smartCamDevice.rawQuery({ do: { cloud_config: { fw_download: "null" } } });
};
