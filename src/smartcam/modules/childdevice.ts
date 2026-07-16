import { DeviceType } from "../../core/device_type.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation for SMARTCAM parent devices (hubs) exposing child devices. */
export class ChildDevice extends SmartCamModule {
  static override readonly requiredComponent = "childControl";
  override get name(): string {
    return "childdevice";
  }
  static override readonly queryGetterName = "getChildDeviceList";
  // This module is unusual in that the response's module name isn't the same
  // one used in the request.
  static override readonly queryModuleName = "child_device_list";

  override query(): Record<string, unknown> {
    const q: Record<string, unknown> = {
      [this.queryGetterName]: { childControl: { start_index: 0 } },
    };
    if (this.smartCamDevice.deviceType === DeviceType.Hub) {
      q.getChildDeviceComponentList = { childControl: { start_index: 0 } };
    }
    return q;
  }

  override async checkSupported(): Promise<boolean> {
    return this.smartCamDevice.deviceType === DeviceType.Hub;
  }
}
