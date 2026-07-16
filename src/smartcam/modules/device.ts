import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of the SMARTCAM device module. */
export class DeviceModule extends SmartCamModule {
  override get name(): string {
    return "devicemodule";
  }
  static override readonly queryGetterName = "getDeviceInfo";
  static override readonly queryModuleName = "device_info";
  static override readonly querySectionNames = ["basic_info", "info"];

  override query(): Record<string, unknown> {
    if (this.smartCamDevice.isHubChild) {
      // Child devices get their device info updated by the parent device, and
      // generally don't support connection type since they're not network-connected.
      return {};
    }
    const q = super.query();
    q.getConnectionType = { network: { get_connection_type: [] } };
    return q;
  }

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "device_id",
        name: "Device ID",
        attributeGetter: "deviceId",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    if (this.rssi !== undefined) {
      this.addFeature(
        new Feature(this.device, {
          container: this,
          id: "rssi",
          name: "RSSI",
          attributeGetter: "rssi",
          icon: "mdi:signal",
          unitGetter: () => "dBm",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
      this.addFeature(
        new Feature(this.device, {
          container: this,
          id: "signal_level",
          name: "Signal Level",
          attributeGetter: "signalLevel",
          icon: "mdi:signal",
          category: FeatureCategory.Info,
          type: FeatureType.Sensor,
        }),
      );
    }
  }

  /** Critical module — never disable it based on query errors. */
  override async postUpdateHook(): Promise<void> {}

  get deviceId(): string {
    return this.smartCamDevice.info.device_id as string;
  }

  get rssi(): number | undefined {
    const connType = this.data.getConnectionType as Record<string, unknown> | undefined;
    return connType?.rssiValue as number | undefined;
  }

  get signalLevel(): number | undefined {
    const connType = this.data.getConnectionType as Record<string, unknown> | undefined;
    return connType?.rssi as number | undefined;
  }
}
