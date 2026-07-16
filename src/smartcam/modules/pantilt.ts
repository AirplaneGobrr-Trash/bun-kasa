import { Feature, FeatureType } from "../../core/feature.ts";
import { SmartCamModule } from "../smartcammodule.ts";

const DEFAULT_PAN_STEP = 30;
const DEFAULT_TILT_STEP = 10;

/** Implementation of the pan/tilt module for PTZ cameras. */
export class PanTilt extends SmartCamModule {
  static override readonly requiredComponent = "ptz";
  static override readonly queryGetterName = "getPresetConfig";
  static override readonly queryModuleName = "preset";
  static override readonly querySectionNames = ["preset"];

  private panStep = DEFAULT_PAN_STEP;
  private tiltStep = DEFAULT_TILT_STEP;

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "pan_right",
        name: "Pan right",
        container: this,
        attributeSetter: () => this.pan(this.panStep * -1),
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "pan_left",
        name: "Pan left",
        container: this,
        attributeSetter: () => this.pan(this.panStep),
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "pan_step",
        name: "Pan step",
        container: this,
        attributeGetter: () => this.panStep,
        attributeSetter: (_container, value) => {
          this.panStep = value as number;
          return Promise.resolve();
        },
        type: FeatureType.Number,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "tilt_up",
        name: "Tilt up",
        container: this,
        attributeSetter: () => this.tilt(this.tiltStep),
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "tilt_down",
        name: "Tilt down",
        container: this,
        attributeSetter: () => this.tilt(this.tiltStep * -1),
        type: FeatureType.Action,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "tilt_step",
        name: "Tilt step",
        container: this,
        attributeGetter: () => this.tiltStep,
        attributeSetter: (_container, value) => {
          this.tiltStep = value as number;
          return Promise.resolve();
        },
        type: FeatureType.Number,
      }),
    );

    if (Object.keys(this.presetsMap).length > 0) {
      this.addFeature(
        new Feature(this.device, {
          id: "ptz_preset",
          name: "PTZ Preset",
          container: this,
          attributeGetter: "preset",
          attributeSetter: "setPreset",
          choicesGetter: () => Object.keys(this.presetsMap),
          type: FeatureType.Choice,
        }),
      );
    }
  }

  private get presetsMap(): Record<string, string> {
    if (!("preset" in this.data)) return {};
    const presetInfo = this.data.preset as { id?: string[]; name?: string[] };
    const ids = presetInfo.id ?? [];
    const names = presetInfo.name ?? [];
    const result: Record<string, string> = {};
    names.forEach((name, index) => {
      const id = ids[index];
      if (id !== undefined) result[name] = id;
    });
    return result;
  }

  get preset(): string | undefined {
    return Object.keys(this.presetsMap)[0];
  }

  async setPreset(preset: string): Promise<Record<string, unknown>> {
    const presetId = this.presetsMap[preset];
    if (presetId) return this.gotoPreset(presetId);
    if (Object.values(this.presetsMap).includes(preset)) return this.gotoPreset(preset);
    return {};
  }

  get presets(): Record<string, string> {
    return this.presetsMap;
  }

  async pan(pan: number): Promise<Record<string, unknown>> {
    return this.move(pan, 0);
  }

  async tilt(tilt: number): Promise<Record<string, unknown>> {
    return this.move(0, tilt);
  }

  async move(pan: number, tilt: number): Promise<Record<string, unknown>> {
    return this.smartCamDevice.rawQuery({
      do: { motor: { move: { x_coord: String(pan), y_coord: String(tilt) } } },
    });
  }

  async getPresets(): Promise<Record<string, unknown>> {
    return this.smartCamDevice.rawQuery({
      getPresetConfig: { preset: { name: ["preset"] } },
    });
  }

  async gotoPreset(presetId: string): Promise<Record<string, unknown>> {
    return this.smartCamDevice.rawQuery({
      motorMoveToPreset: { preset: { goto_preset: { id: presetId } } },
    });
  }

  async savePreset(name: string): Promise<Record<string, unknown>> {
    // Note: the device API has a typo in this method name.
    return this.smartCamDevice.rawQuery({
      addMotorPostion: { preset: { set_preset: { name, save_ptz: "1" } } },
    });
  }
}
