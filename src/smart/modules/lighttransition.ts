import { KasaException } from "../../core/exceptions.ts";
import { Feature, FeatureType } from "../../core/feature.ts";
import { SmartModule } from "../smartmodule.ts";

interface TransitionState {
  durationSecs: number;
  enable: boolean;
  maxDurationSecs: number;
}

const SYS_INFO_STATE_KEYS = [
  "gradually_on_mode",
  "gradually_off_mode",
  "fade_on_time",
  "fade_off_time",
];
const DEFAULT_MAX_DURATION_SECS = 60;

/** Implementation of gradual on/off (smooth transitions). */
export class LightTransition extends SmartModule {
  static override readonly requiredComponent = "on_off_gradually";
  static override readonly queryGetterName = "get_on_off_gradually_info";
  override minimumUpdateIntervalSecs = 60;

  private stateInSysinfo = false;
  private supportsOnAndOff = false;
  private onState: TransitionState = {
    durationSecs: 0,
    enable: false,
    maxDurationSecs: DEFAULT_MAX_DURATION_SECS,
  };
  private offState: TransitionState = {
    durationSecs: 0,
    enable: false,
    maxDurationSecs: DEFAULT_MAX_DURATION_SECS,
  };
  private enabledValue = false;

  private ensureInit(): void {
    const sysInfo = this.smartDevice.sysInfo;
    this.stateInSysinfo = SYS_INFO_STATE_KEYS.every((key) => key in sysInfo);
    this.supportsOnAndOff = this.supportedVersion > 1;
  }

  override initializeFeatures(): void {
    this.ensureInit();
    const icon = "mdi:transition";
    if (!this.supportsOnAndOff) {
      this.addFeature(
        new Feature(this.device, {
          container: this,
          id: "smooth_transitions",
          name: "Smooth transitions",
          icon,
          attributeGetter: "enabled",
          attributeSetter: "setEnabled",
          type: FeatureType.Switch,
        }),
      );
      return;
    }
    this.addFeature(
      new Feature(this.device, {
        id: "smooth_transition_on",
        name: "Smooth transition on",
        container: this,
        attributeGetter: "turnOnTransition",
        attributeSetter: "setTurnOnTransition",
        icon,
        type: FeatureType.Number,
        rangeGetter: () => [0, this.onState.maxDurationSecs],
      }),
    );
    this.addFeature(
      new Feature(this.device, {
        id: "smooth_transition_off",
        name: "Smooth transition off",
        container: this,
        attributeGetter: "turnOffTransition",
        attributeSetter: "setTurnOffTransition",
        icon,
        type: FeatureType.Number,
        rangeGetter: () => [0, this.offState.maxDurationSecs],
      }),
    );
  }

  override async postUpdateHook(): Promise<void> {
    this.ensureInit();
    if (!this.supportsOnAndOff) {
      this.enabledValue = Boolean(this.data.enable);
      return;
    }

    const sysInfo = this.smartDevice.sysInfo;
    let onMax: number;
    let offMax: number;
    let onEnabled: boolean;
    let offEnabled: boolean;
    let onDuration: number;
    let offDuration: number;

    if (this.stateInSysinfo) {
      onMax = (sysInfo.max_fade_on_time as number) ?? DEFAULT_MAX_DURATION_SECS;
      offMax = (sysInfo.max_fade_off_time as number) ?? DEFAULT_MAX_DURATION_SECS;
      onEnabled = Boolean(sysInfo.gradually_on_mode);
      offEnabled = Boolean(sysInfo.gradually_off_mode);
      onDuration = sysInfo.fade_on_time as number;
      offDuration = sysInfo.fade_off_time as number;
    } else {
      const onStateRaw = this.data.on_state as Record<string, unknown> | undefined;
      const offStateRaw = this.data.off_state as Record<string, unknown> | undefined;
      if (!onStateRaw || !offStateRaw) {
        throw new KasaException(
          `Unsupported for ${this.requiredComponent} v${this.supportedVersion}`,
        );
      }
      onMax = (onStateRaw.max_duration as number) ?? DEFAULT_MAX_DURATION_SECS;
      offMax = (offStateRaw.max_duration as number) ?? DEFAULT_MAX_DURATION_SECS;
      onEnabled = Boolean(onStateRaw.enable);
      offEnabled = Boolean(offStateRaw.enable);
      onDuration = onStateRaw.duration as number;
      offDuration = offStateRaw.duration as number;
    }

    this.enabledValue = onEnabled || offEnabled;
    this.onState = {
      durationSecs: onDuration,
      enable: onEnabled,
      maxDurationSecs: onMax,
    };
    this.offState = {
      durationSecs: offDuration,
      enable: offEnabled,
      maxDurationSecs: offMax,
    };
  }

  async setEnabled(enable: boolean): Promise<Record<string, unknown>> {
    try {
      if (!this.supportsOnAndOff) {
        return await this.call("set_on_off_gradually_info", { enable });
      }
      const on = await this.call("set_on_off_gradually_info", {
        on_state: { enable, duration: this.onState.durationSecs },
      });
      const off = await this.call("set_on_off_gradually_info", {
        off_state: { enable, duration: this.offState.durationSecs },
      });
      return { ...on, ...off };
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get turnOnTransition(): number {
    return this.onState.enable ? this.onState.durationSecs : 0;
  }

  async setTurnOnTransition(seconds: number): Promise<Record<string, unknown>> {
    try {
      if (seconds > this.onState.maxDurationSecs) {
        throw new RangeError(
          `Value ${seconds} out of range, max ${this.onState.maxDurationSecs}`,
        );
      }
      if (seconds <= 0) {
        return await this.call("set_on_off_gradually_info", {
          on_state: { enable: false, duration: this.onState.durationSecs },
        });
      }
      return await this.call("set_on_off_gradually_info", {
        on_state: { enable: true, duration: seconds },
      });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  get turnOffTransition(): number {
    return this.offState.enable ? this.offState.durationSecs : 0;
  }

  async setTurnOffTransition(seconds: number): Promise<Record<string, unknown>> {
    try {
      if (seconds > this.offState.maxDurationSecs) {
        throw new RangeError(
          `Value ${seconds} out of range, max ${this.offState.maxDurationSecs}`,
        );
      }
      if (seconds <= 0) {
        return await this.call("set_on_off_gradually_info", {
          off_state: { enable: false, duration: this.offState.durationSecs },
        });
      }
      return await this.call("set_on_off_gradually_info", {
        off_state: { enable: true, duration: seconds },
      });
    } finally {
      this.setLastUpdateTime(undefined);
    }
  }

  override query(): Record<string, unknown> {
    this.ensureInit();
    if (this.stateInSysinfo) return {};
    return { [this.queryGetterName]: null };
  }

  override async checkSupported(): Promise<boolean> {
    return "brightness" in this.smartDevice.sysInfo;
  }
}
