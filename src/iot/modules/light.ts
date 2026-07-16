import { DeviceType } from "../../core/device_type.ts";
import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import type {
  HSV,
  Light as LightInterface,
  LightState,
  RGB,
} from "../../interfaces/light.ts";
import { getRgbFromHsv, setRgbViaHsv } from "../../interfaces/light.ts";
import { IotModule } from "../iotmodule.ts";

const BRIGHTNESS_MIN = 0;
const BRIGHTNESS_MAX = 100;

/** Structural shape shared by IotBulb and IotDimmer for brightness control. */
interface DimmableIotDevice {
  isDimmable: boolean;
  isColor: boolean;
  isVariableColorTemp: boolean;
  brightness: number;
  setBrightnessRaw(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;
}

/** Structural shape exposed only by IotBulb (and IotLightStrip). */
interface BulbIotDevice extends DimmableIotDevice {
  hsv: HSV;
  colorTemp: number;
  validTemperatureRange: [number, number];
  setHsvRaw(
    hue: number,
    saturation: number,
    value?: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;
  setColorTempRaw(
    temp: number,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>>;
  setLightStateRaw(
    state: Record<string, unknown>,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>>;
}

/** Structural shape exposed only by IotDimmer. */
interface DimmerIotDevice extends DimmableIotDevice {
  setDimmerTransition(
    brightness: number,
    transitionMs: number,
  ): Promise<Record<string, unknown>>;
  turnOn(options?: { transition?: number }): Promise<Record<string, unknown>>;
  turnOff(options?: { transition?: number }): Promise<Record<string, unknown>>;
}

/** Implementation of the light (brightness/color/color-temp) module for IOT bulbs and dimmers. */
export class Light extends IotModule implements LightInterface {
  private lightState: LightState = {};

  private get dimmable(): DimmableIotDevice {
    return this.iotDevice as unknown as DimmableIotDevice;
  }

  /** Return the device cast to its bulb-specific shape, or undefined for dimmers. */
  private getBulbDevice(): BulbIotDevice | undefined {
    if (
      this.device.deviceType === DeviceType.Bulb ||
      this.device.deviceType === DeviceType.LightStrip
    ) {
      return this.iotDevice as unknown as BulbIotDevice;
    }
    return undefined;
  }

  override initializeFeatures(): void {
    const device = this.dimmable;
    if (device.isDimmable) {
      this.addFeature(
        new Feature(this.device, {
          id: "brightness",
          name: "Brightness",
          container: this,
          attributeGetter: "brightness",
          attributeSetter: "setBrightness",
          rangeGetter: () => [BRIGHTNESS_MIN, BRIGHTNESS_MAX],
          type: FeatureType.Number,
          category: FeatureCategory.Primary,
        }),
      );
    }
    if (device.isVariableColorTemp) {
      const bulb = this.getBulbDevice();
      if (bulb) {
        this.addFeature(
          new Feature(this.device, {
            id: "color_temperature",
            name: "Color temperature",
            container: this,
            attributeGetter: "colorTemp",
            attributeSetter: "setColorTemp",
            rangeGetter: () => bulb.validTemperatureRange,
            category: FeatureCategory.Primary,
            type: FeatureType.Number,
          }),
        );
      }
    }
    if (device.isColor) {
      this.addFeature(
        new Feature(this.device, {
          id: "hsv",
          name: "HSV",
          container: this,
          attributeGetter: "hsv",
          attributeSetter: "setHsv",
          type: FeatureType.Unknown,
        }),
      );
    }
  }

  override query(): Record<string, unknown> {
    return {};
  }

  get brightness(): number {
    return this.dimmable.brightness;
  }

  async setBrightness(
    brightness: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    return this.setState({ brightness, transition: options?.transition });
  }

  get hsv(): HSV {
    const bulb = this.getBulbDevice();
    if (!bulb || !bulb.isColor) throw new KasaException("Light does not support color.");
    return bulb.hsv;
  }

  get rgb(): RGB {
    return getRgbFromHsv(this);
  }

  async setHsv(
    hue: number,
    saturation: number,
    value?: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    const bulb = this.getBulbDevice();
    if (!bulb || !bulb.isColor) throw new KasaException("Light does not support color.");
    return bulb.setHsvRaw(hue, saturation, value, options);
  }

  setRgb(
    red: number,
    green: number,
    blue: number,
    options?: { transition?: number },
  ): Promise<Record<string, unknown>> {
    return setRgbViaHsv(this, red, green, blue, options);
  }

  get colorTemp(): number {
    const bulb = this.getBulbDevice();
    if (!bulb || !bulb.isVariableColorTemp)
      throw new KasaException("Light does not support colortemp.");
    return bulb.colorTemp;
  }

  async setColorTemp(
    temp: number,
    options?: { brightness?: number; transition?: number },
  ): Promise<Record<string, unknown>> {
    const bulb = this.getBulbDevice();
    if (!bulb || !bulb.isVariableColorTemp)
      throw new KasaException("Light does not support colortemp.");
    return bulb.setColorTempRaw(temp, options);
  }

  async setState(state: LightState): Promise<Record<string, unknown>> {
    const bulb = this.getBulbDevice();
    if (!bulb) {
      const dimmer = this.iotDevice as unknown as DimmerIotDevice;
      if (state.brightness === 0 || state.lightOn === false) {
        return dimmer.turnOff({ transition: state.transition });
      }
      if (state.brightness) {
        return dimmer.setDimmerTransition(state.brightness, state.transition ?? 0);
      }
      return dimmer.turnOn({ transition: state.transition });
    }

    const transition = state.transition;
    const stateDict: Record<string, unknown> = {};
    if (state.brightness !== undefined && state.brightness !== 0)
      stateDict.brightness = state.brightness;
    if (state.hue !== undefined) stateDict.hue = state.hue;
    if (state.saturation !== undefined) stateDict.saturation = state.saturation;
    if (state.colorTemp !== undefined) stateDict.color_temp = state.colorTemp;

    if (state.brightness === 0) {
      stateDict.on_off = 0;
    } else if (state.lightOn === undefined) {
      stateDict.on_off = 1;
    } else {
      stateDict.on_off = state.lightOn ? 1 : 0;
    }

    return bulb.setLightStateRaw(stateDict, { transition });
  }

  get state(): LightState {
    return this.lightState;
  }

  override async postUpdateHook(): Promise<void> {
    const device = this.dimmable;
    if (!this.device.isOn) {
      this.lightState = { lightOn: false };
      return;
    }
    const state: LightState = { lightOn: true };
    if (device.isDimmable) state.brightness = this.brightness;
    if (device.isColor) {
      const hsv = this.hsv;
      state.hue = hsv.hue;
      state.saturation = hsv.saturation;
    }
    if (device.isVariableColorTemp) state.colorTemp = this.colorTemp;
    this.lightState = state;
  }
}
