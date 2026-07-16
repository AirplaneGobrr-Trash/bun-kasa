import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { IotModule, merge } from "../iotmodule.ts";

const THRESHOLD_ABS_MIN = 0;
// Strange value, but verified against hardware (KS220).
const THRESHOLD_ABS_MAX = 51;
const FADE_TIME_ABS_MIN_MS = 0;
// Arbitrary, but set low intending GENTLE FADE for longer fades.
const FADE_TIME_ABS_MAX_MS = 10_000;
const GENTLE_TIME_ABS_MIN_MS = 0;
// Arbitrary, but reasonable default.
const GENTLE_TIME_ABS_MAX_MS = 120_000;
// Verified against KS220.
const RAMP_RATE_ABS_MIN = 10;
// Verified against KS220.
const RAMP_RATE_ABS_MAX = 50;

/** Implements the dimmer config module found in dimmers. */
export class Dimmer extends IotModule {
  static readonly THRESHOLD_ABS_MIN = THRESHOLD_ABS_MIN;
  static readonly THRESHOLD_ABS_MAX = THRESHOLD_ABS_MAX;
  static readonly FADE_TIME_ABS_MIN_MS = FADE_TIME_ABS_MIN_MS;
  static readonly FADE_TIME_ABS_MAX_MS = FADE_TIME_ABS_MAX_MS;
  static readonly GENTLE_TIME_ABS_MIN_MS = GENTLE_TIME_ABS_MIN_MS;
  static readonly GENTLE_TIME_ABS_MAX_MS = GENTLE_TIME_ABS_MAX_MS;
  static readonly RAMP_RATE_ABS_MIN = RAMP_RATE_ABS_MIN;
  static readonly RAMP_RATE_ABS_MAX = RAMP_RATE_ABS_MAX;

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "dimmer_threshold_min",
        name: "Minimum dimming level",
        icon: "mdi:lightbulb-on-20",
        attributeGetter: "thresholdMin",
        attributeSetter: "setThresholdMin",
        rangeGetter: () => [THRESHOLD_ABS_MIN, THRESHOLD_ABS_MAX],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "dimmer_fade_off_time",
        name: "Dimmer fade off time",
        icon: "mdi:clock-in",
        attributeGetter: "fadeOffTimeMs",
        attributeSetter: "setFadeOffTime",
        rangeGetter: () => [FADE_TIME_ABS_MIN_MS, FADE_TIME_ABS_MAX_MS],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "dimmer_fade_on_time",
        name: "Dimmer fade on time",
        icon: "mdi:clock-out",
        attributeGetter: "fadeOnTimeMs",
        attributeSetter: "setFadeOnTime",
        rangeGetter: () => [FADE_TIME_ABS_MIN_MS, FADE_TIME_ABS_MAX_MS],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "dimmer_gentle_off_time",
        name: "Dimmer gentle off time",
        icon: "mdi:clock-in",
        attributeGetter: "gentleOffTimeMs",
        attributeSetter: "setGentleOffTime",
        rangeGetter: () => [GENTLE_TIME_ABS_MIN_MS, GENTLE_TIME_ABS_MAX_MS],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "dimmer_gentle_on_time",
        name: "Dimmer gentle on time",
        icon: "mdi:clock-out",
        attributeGetter: "gentleOnTimeMs",
        attributeSetter: "setGentleOnTime",
        rangeGetter: () => [GENTLE_TIME_ABS_MIN_MS, GENTLE_TIME_ABS_MAX_MS],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "dimmer_ramp_rate",
        name: "Dimmer ramp rate",
        icon: "mdi:clock-fast",
        attributeGetter: "rampRate",
        attributeSetter: "setRampRate",
        rangeGetter: () => [RAMP_RATE_ABS_MIN, RAMP_RATE_ABS_MAX],
        type: FeatureType.Number,
        category: FeatureCategory.Config,
      }),
    );
  }

  override query(): Record<string, unknown> {
    return merge(
      this.queryForCommand("get_dimmer_parameters"),
      this.queryForCommand("get_default_behavior"),
    );
  }

  get config(): Record<string, unknown> {
    return this.data.get_dimmer_parameters as Record<string, unknown>;
  }

  get thresholdMin(): number {
    return this.config.minThreshold as number;
  }

  async setThresholdMin(min: number): Promise<Record<string, unknown>> {
    if (min < THRESHOLD_ABS_MIN || min > THRESHOLD_ABS_MAX) {
      throw new KasaException(
        `Minimum dimming threshold is outside the supported range: ${THRESHOLD_ABS_MIN}-${THRESHOLD_ABS_MAX}`,
      );
    }
    return this.call("calibrate_brightness", { minThreshold: min });
  }

  get fadeOffTimeMs(): number {
    return this.config.fadeOffTime as number;
  }

  async setFadeOffTime(timeMs: number): Promise<Record<string, unknown>> {
    if (timeMs < FADE_TIME_ABS_MIN_MS || timeMs > FADE_TIME_ABS_MAX_MS) {
      throw new KasaException(
        `Fade time is outside the bounds of the supported range:${FADE_TIME_ABS_MIN_MS}-${FADE_TIME_ABS_MAX_MS}`,
      );
    }
    return this.call("set_fade_off_time", { fadeTime: timeMs });
  }

  get fadeOnTimeMs(): number {
    return this.config.fadeOnTime as number;
  }

  async setFadeOnTime(timeMs: number): Promise<Record<string, unknown>> {
    if (timeMs < FADE_TIME_ABS_MIN_MS || timeMs > FADE_TIME_ABS_MAX_MS) {
      throw new KasaException(
        `Fade time is outside the bounds of the supported range:${FADE_TIME_ABS_MIN_MS}-${FADE_TIME_ABS_MAX_MS}`,
      );
    }
    return this.call("set_fade_on_time", { fadeTime: timeMs });
  }

  get gentleOffTimeMs(): number {
    return this.config.gentleOffTime as number;
  }

  async setGentleOffTime(timeMs: number): Promise<Record<string, unknown>> {
    if (timeMs < GENTLE_TIME_ABS_MIN_MS || timeMs > GENTLE_TIME_ABS_MAX_MS) {
      throw new KasaException(
        `Gentle off time is outside the bounds of the supported range: ${GENTLE_TIME_ABS_MIN_MS}-${GENTLE_TIME_ABS_MAX_MS}.`,
      );
    }
    return this.call("set_gentle_off_time", { duration: timeMs });
  }

  get gentleOnTimeMs(): number {
    return this.config.gentleOnTime as number;
  }

  async setGentleOnTime(timeMs: number): Promise<Record<string, unknown>> {
    if (timeMs < GENTLE_TIME_ABS_MIN_MS || timeMs > GENTLE_TIME_ABS_MAX_MS) {
      throw new KasaException(
        `Gentle off time is outside the bounds of the supported range: ${GENTLE_TIME_ABS_MIN_MS}-${GENTLE_TIME_ABS_MAX_MS}.`,
      );
    }
    return this.call("set_gentle_on_time", { duration: timeMs });
  }

  get rampRate(): number {
    return this.config.rampRate as number;
  }

  async setRampRate(rate: number): Promise<Record<string, unknown>> {
    if (rate < RAMP_RATE_ABS_MIN || rate > RAMP_RATE_ABS_MAX) {
      throw new KasaException(
        `Gentle off time is outside the bounds of the supported range:${RAMP_RATE_ABS_MIN}-${RAMP_RATE_ABS_MAX}`,
      );
    }
    return this.call("set_button_ramp_rate", { rampRate: rate });
  }
}
