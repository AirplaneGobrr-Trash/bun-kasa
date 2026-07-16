import { DeviceType } from "../../core/device_type.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation for parent devices exposing child devices. */
export class ChildDevice extends SmartModule {
  static override readonly requiredComponent = "child_device";
  static override readonly queryGetterName = "get_child_device_list";

  override query(): Record<string, unknown> {
    const q = super.query();
    if (this.smartDevice.deviceType === DeviceType.Hub) {
      q.get_child_device_component_list = null;
    }
    return q;
  }
}
