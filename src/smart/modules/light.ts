import { KasaException } from "../../core/exceptions.ts";
import type { Feature } from "../../core/feature.ts";
import type {
  HSV,
  Light as LightInterface,
  LightState,
  RGB,
} from "../../interfaces/light.ts";
import { getRgbFromHsv, setRgbViaHsv } from "../../interfaces/light.ts";
import { SmartModules } from "../modulenames.ts";
import { SmartModule } from "../smartmodule.ts";

/** Implementation of a SMART light (delegates to Brightness/Color/ColorTemperature modules). */
export class Light extends SmartModule implements LightInterface {
  private lightState: LightState = {};

  override get allFeatures(): ReadonlyMap<string, Feature> {
    const ret = new Map<string, Feature>();
    const brightness = this.smartDevice.modules.get(SmartModules.Brightness);
    const color = this.smartDevice.modules.get(SmartModules.Color);
    const temp = this.smartDevice.modules.get(SmartModules.ColorTemperature);
    for (const feature of brightness?.allFeatures.values() ?? [])
      ret.set(feature.id, feature);
    for (const feature of color?.allFeatures.values() ?? []) ret.set(feature.id, feature);
    for (const feature of temp?.allFeatures.values() ?? []) ret.set(feature.id, feature);
    return ret;
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get hsv(): HSV {
    const color = this.smartDevice.modules.get(SmartModules.Color);
    if (!color) throw new KasaException("Bulb does not support color.");
    return color.hsv;
  }

  get rgb(): RGB {
    return getRgbFromHsv(this);
  }

  get colorTemp(): number {
    const temp = this.smartDevice.modules.get(SmartModules.ColorTemperature);
    if (!temp) throw new KasaException("Bulb does not support colortemp.");
    return temp.colorTemp;
  }

  get brightness(): number {
    const brightness = this.smartDevice.modules.get(SmartModules.Brightness);
    if (!brightness) throw new KasaException("Bulb is not dimmable.");
    return brightness.brightness;
  }

  async setHsv(
    hue: number,
    saturation: number,
    value?: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    void options;
    const color = this.smartDevice.modules.get(SmartModules.Color);
    if (!color) throw new KasaException("Bulb does not support color.");
    return color.setHsv(hue, saturation, value);
  }

  setRgb(
    red: number,
    green: number,
    blue: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    return setRgbViaHsv(this, red, green, blue, options);
  }

  async setColorTemp(
    temp: number,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>> {
    void options?.transition;
    const colorTempModule = this.smartDevice.modules.get(SmartModules.ColorTemperature);
    if (!colorTempModule) throw new KasaException("Bulb does not support colortemp.");
    return colorTempModule.setColorTemp(temp, { brightness: options?.brightness });
  }

  async setBrightness(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    void options;
    const brightnessModule = this.smartDevice.modules.get(SmartModules.Brightness);
    if (!brightnessModule) throw new KasaException("Bulb is not dimmable.");
    return brightnessModule.setBrightness(brightness);
  }

  async setState(state: LightState): Promise<Record<string, unknown>> {
    const stateDict: Record<string, unknown> = {};
    if (state.brightness !== undefined && state.brightness !== 0)
      stateDict.brightness = state.brightness;
    if (state.hue !== undefined) stateDict.hue = state.hue;
    if (state.saturation !== undefined) stateDict.saturation = state.saturation;
    if (state.colorTemp !== undefined) stateDict.color_temp = state.colorTemp;

    if (state.brightness === 0) {
      stateDict.device_on = false;
    } else if (state.lightOn !== undefined) {
      stateDict.device_on = state.lightOn;
    } else {
      stateDict.device_on = true;
    }

    return this.call("set_device_info", stateDict);
  }

  get state(): LightState {
    return this.lightState;
  }

  override async postUpdateHook(): Promise<void> {
    const device = this.smartDevice;
    if (!device.isOn) {
      this.lightState = { lightOn: false };
      return;
    }
    const state: LightState = { lightOn: true };
    if (device.modules.has(SmartModules.Brightness)) state.brightness = this.brightness;
    if (device.modules.has(SmartModules.Color)) {
      const hsv = this.hsv;
      state.hue = hsv.hue;
      state.saturation = hsv.saturation;
    }
    if (device.modules.has(SmartModules.ColorTemperature))
      state.colorTemp = this.colorTemp;
    this.lightState = state;
  }
}
