import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { IotModule } from "../iotmodule.ts";

/** Implementation of the HomeKit module for IOT devices that natively support HomeKit. */
export class HomeKit extends IotModule {
  override query(): Record<string, unknown> {
    return { "smartlife.iot.homekit": { setup_info_get: {} } };
  }

  get info(): Record<string, unknown> {
    if (!this.iotDevice.hasLastUpdateKey(this.moduleKey)) return {};
    return (this.data.setup_info_get as Record<string, unknown>) ?? {};
  }

  get setupCode(): string {
    return this.info.setup_code as string;
  }

  get setupPayload(): string {
    return this.info.setup_payload as string;
  }

  override initializeFeatures(): void {
    const data = this.iotDevice.getLastUpdateValue(this.moduleKey) as
      | Record<string, unknown>
      | undefined;
    if (!data || !("setup_info_get" in data)) return;

    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "homekit_setup_code",
        name: "HomeKit setup code",
        attributeGetter: "setupCode",
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
  }
}
