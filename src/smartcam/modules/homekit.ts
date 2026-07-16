import { SmartCamModule } from "../smartcammodule.ts";

/** Implementation of the HomeKit module (SMARTCAM). Not fully supported by the API. */
export class HomeKit extends SmartCamModule {
  static override readonly requiredComponent = "homekit";

  get info(): Record<string, string> {
    return {};
  }
}
