import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { IotModule, merge } from "../iotmodule.ts";

/** Range for motion detection. */
export enum MotionRange {
  Far = 0,
  Mid = 1,
  Near = 2,
  Custom = 3,
}

const RANGE_NAMES: Record<MotionRange, string> = {
  [MotionRange.Far]: "Far",
  [MotionRange.Mid]: "Mid",
  [MotionRange.Near]: "Near",
  [MotionRange.Custom]: "Custom",
};

/** PIR sensor configuration. */
export interface PIRConfig {
  enabled: boolean;
  adcMin: number;
  adcMax: number;
  range: MotionRange;
  threshold: number;
}

function pirConfigAdcMid(config: PIRConfig): number {
  return Math.floor(Math.abs(config.adcMax - config.adcMin) / 2);
}

/** Current trigger state of an ADC PIR sensor. */
export interface PIRStatus {
  pirConfig: PIRConfig;
  adcValue: number;
}

function pirValue(status: PIRStatus): number {
  return pirConfigAdcMid(status.pirConfig) - status.adcValue;
}

function pirPercent(status: PIRStatus): number {
  const value = pirValue(status);
  const mid = pirConfigAdcMid(status.pirConfig);
  const divisor =
    value < 0 ? mid - status.pirConfig.adcMin : status.pirConfig.adcMax - mid;
  return (value / divisor) * 100;
}

function pirTriggered(status: PIRStatus): boolean {
  return (
    status.pirConfig.enabled &&
    Math.abs(pirPercent(status)) > 100 - status.pirConfig.threshold
  );
}

/** Implements the motion detection (PIR) module found in some dimmers. */
export class Motion extends IotModule {
  override initializeFeatures(): void {
    if (!("get_config" in this.data)) return;
    if (!("get_adc_value" in this.data)) return;
    if (!("enable" in this.config)) return;

    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_enabled",
        name: "PIR enabled",
        icon: "mdi:motion-sensor",
        attributeGetter: "enabled",
        attributeSetter: "setEnabled",
        type: FeatureType.Switch,
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_range",
        name: "Motion Sensor Range",
        icon: "mdi:motion-sensor",
        attributeGetter: "rangeName",
        attributeSetter: "setRangeFromStr",
        type: FeatureType.Choice,
        choicesGetter: "ranges",
        category: FeatureCategory.Config,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_threshold",
        name: "Motion Sensor Threshold",
        icon: "mdi:motion-sensor",
        attributeGetter: "threshold",
        attributeSetter: "setThreshold",
        type: FeatureType.Number,
        category: FeatureCategory.Config,
        rangeGetter: () => [0, 100],
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_triggered",
        name: "PIR Triggered",
        icon: "mdi:motion-sensor",
        attributeGetter: "pirTriggered",
        type: FeatureType.Sensor,
        category: FeatureCategory.Primary,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_value",
        name: "PIR Value",
        icon: "mdi:motion-sensor",
        attributeGetter: "pirValue",
        type: FeatureType.Sensor,
        category: FeatureCategory.Info,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_adc_value",
        name: "PIR ADC Value",
        icon: "mdi:motion-sensor",
        attributeGetter: "adcValue",
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_adc_min",
        name: "PIR ADC Min",
        icon: "mdi:motion-sensor",
        attributeGetter: "adcMin",
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_adc_mid",
        name: "PIR ADC Mid",
        icon: "mdi:motion-sensor",
        attributeGetter: "adcMid",
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_adc_max",
        name: "PIR ADC Max",
        icon: "mdi:motion-sensor",
        attributeGetter: "adcMax",
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "pir_percent",
        name: "PIR Percentile",
        icon: "mdi:motion-sensor",
        attributeGetter: "pirPercent",
        type: FeatureType.Sensor,
        category: FeatureCategory.Debug,
        unitGetter: () => "%",
      }),
    );
  }

  override query(): Record<string, unknown> {
    return merge(
      this.queryForCommand("get_config"),
      this.queryForCommand("get_adc_value"),
    );
  }

  get config(): Record<string, unknown> {
    return this.data.get_config as Record<string, unknown>;
  }

  get pirConfig(): PIRConfig {
    const range = this.config.trigger_index as MotionRange;
    return {
      enabled: Boolean(this.config.enable),
      adcMin: Number(this.config.min_adc),
      adcMax: Number(this.config.max_adc),
      range,
      threshold: this.getRangeThreshold(range),
    };
  }

  get enabled(): boolean {
    return this.pirConfig.enabled;
  }

  get adcMin(): number {
    return this.pirConfig.adcMin;
  }

  get adcMax(): number {
    return this.pirConfig.adcMax;
  }

  get adcMid(): number {
    return pirConfigAdcMid(this.pirConfig);
  }

  async setEnabled(state: boolean): Promise<Record<string, unknown>> {
    return this.call("set_enable", { enable: state ? 1 : 0 });
  }

  get ranges(): string[] {
    const rangeMax = (this.config.array as unknown[]).length;
    const valid: string[] = [];
    for (const value of [
      MotionRange.Far,
      MotionRange.Mid,
      MotionRange.Near,
      MotionRange.Custom,
    ]) {
      if (value >= 0 && value < rangeMax) valid.push(RANGE_NAMES[value]);
    }
    return valid;
  }

  get range(): MotionRange {
    return this.pirConfig.range;
  }

  get rangeName(): string {
    return RANGE_NAMES[this.range];
  }

  async setRange(range: MotionRange): Promise<Record<string, unknown>> {
    return this.call("set_trigger_sens", { index: range });
  }

  private parseRangeValue(value: string): MotionRange {
    const normalized = value.trim().toLowerCase();
    const entry = Object.entries(RANGE_NAMES).find(
      ([, name]) => name.toLowerCase() === normalized,
    );
    if (!entry) {
      throw new KasaException(
        `Invalid range value: '${value}'. Valid options are: ${Object.values(RANGE_NAMES).join(", ")}`,
      );
    }
    return Number(entry[0]) as MotionRange;
  }

  async setRangeFromStr(input: string): Promise<Record<string, unknown>> {
    return this.setRange(this.parseRangeValue(input));
  }

  getRangeThreshold(rangeType: MotionRange): number {
    const array = this.config.array as number[];
    if (rangeType < 0 || rangeType >= array.length) {
      throw new KasaException(
        "Range type is outside the bounds of the configured device ranges.",
      );
    }
    return Number(array[rangeType]);
  }

  get threshold(): number {
    return this.pirConfig.threshold;
  }

  async setThreshold(value: number): Promise<Record<string, unknown>> {
    return this.call("set_trigger_sens", { index: MotionRange.Custom, value });
  }

  get inactivityTimeout(): number {
    return this.config.cold_time as number;
  }

  async setInactivityTimeout(timeoutMs: number): Promise<Record<string, unknown>> {
    return this.call("set_cold_time", { cold_time: timeoutMs });
  }

  get pirState(): PIRStatus {
    return {
      pirConfig: this.pirConfig,
      adcValue: (this.data.get_adc_value as { value: number }).value,
    };
  }

  async getPirState(): Promise<PIRStatus> {
    const latest = await this.call("get_adc_value");
    (this.data.get_adc_value as Record<string, unknown>).value = latest.value;
    return { pirConfig: this.pirConfig, adcValue: latest.value as number };
  }

  get adcValue(): number {
    return this.pirState.adcValue;
  }

  get pirValue(): number {
    return pirValue(this.pirState);
  }

  get pirPercent(): number {
    return pirPercent(this.pirState);
  }

  get pirTriggered(): boolean {
    return pirTriggered(this.pirState);
  }
}
