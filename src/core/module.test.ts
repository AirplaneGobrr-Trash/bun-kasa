import { describe, expect, test } from "bun:test";
import { createCredentials } from "./credentials.ts";
import { Device } from "./device.ts";
import { DeviceType } from "./device_type.ts";
import { DeviceConfig } from "./deviceconfig.ts";
import { Feature, FeatureCategory, FeatureType } from "./feature.ts";
import { Module } from "./module.ts";
import { ModuleMapping, moduleName } from "./modulemapping.ts";
import type { BaseProtocol, DeviceTransport } from "./protocol.ts";

class FakeTransport implements DeviceTransport {
  readonly host = "127.0.0.1";
  readonly port = 9999;
  readonly credentials = createCredentials("user", "pass");
  readonly credentialsHash = undefined;
  readonly config = new DeviceConfig("127.0.0.1");
}

class FakeProtocol implements BaseProtocol {
  readonly transport = new FakeTransport();
  get config(): DeviceConfig {
    return this.transport.config;
  }
  async query(): Promise<Record<string, unknown>> {
    return {};
  }
  async close(): Promise<void> {}
}

class FakeBrightnessModule extends Module {
  private brightnessValue = 42;

  override query(): Record<string, unknown> {
    return {};
  }

  override get data(): unknown {
    return { brightness: this.brightnessValue };
  }

  get brightness(): number {
    return this.brightnessValue;
  }

  async setBrightness(value: number): Promise<Record<string, unknown>> {
    this.brightnessValue = value;
    return {};
  }

  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        id: "brightness",
        name: "Brightness",
        container: this,
        attributeGetter: "brightness",
        attributeSetter: "setBrightness",
        rangeGetter: () => [0, 100],
        type: FeatureType.Number,
        category: FeatureCategory.Primary,
      }),
    );
  }
}

class FakeDevice extends Device {
  readonly modules = new ModuleMapping<Module>();

  constructor(protocol: BaseProtocol) {
    super(protocol);
    this.deviceTypeValue = DeviceType.Plug;
    const brightness = new FakeBrightnessModule(this, "brightness");
    brightness.initializeFeatures();
    this.modules.set("Brightness", brightness);
    const feature = brightness.getFeature("brightness");
    if (feature) this.addFeature(feature);
  }

  async update(): Promise<void> {}
  get isOn(): boolean {
    return true;
  }
  async turnOn(): Promise<Record<string, unknown>> {
    return {};
  }
  async turnOff(): Promise<Record<string, unknown>> {
    return {};
  }
  async setState(): Promise<Record<string, unknown>> {
    return {};
  }
  updateFromDiscoverInfo(): void {}
  get model(): string {
    return "FAKE1";
  }
  protected getDeviceInfo() {
    return {
      shortName: "FAKE1",
      longName: "Fake Device",
      brand: "fake",
      deviceFamily: "FAKE",
      deviceType: DeviceType.Plug,
      hardwareVersion: "1.0",
      firmwareVersion: "1.0.0",
      requiresAuth: false,
    };
  }
  get alias(): string | undefined {
    return "Fake alias";
  }
  get sysInfo(): Record<string, unknown> {
    return {};
  }
  get time(): Date {
    return new Date(0);
  }
  get timezone(): string {
    return "UTC";
  }
  get hwInfo(): Record<string, unknown> {
    return {};
  }
  get location(): Record<string, unknown> {
    return {};
  }
  get rssi(): number | undefined {
    return undefined;
  }
  get mac(): string {
    return "00:00:00:00:00:00";
  }
  get deviceId(): string {
    return "fake-device-id";
  }
  get internalState(): unknown {
    return {};
  }
  get hasEmeter(): boolean {
    return false;
  }
  get onSince(): Date | undefined {
    return undefined;
  }
  async wifiScan() {
    return [];
  }
  async wifiJoin(): Promise<Record<string, unknown>> {
    return {};
  }
  async setAlias(): Promise<Record<string, unknown>> {
    return {};
  }
  async reboot(): Promise<void> {}
  async factoryReset(): Promise<void> {}
}

describe("Module + Feature", () => {
  test("a module can register a feature and it round-trips through get/set", async () => {
    const device = new FakeDevice(new FakeProtocol());
    const brightnessName = moduleName<FakeBrightnessModule>("Brightness");
    const brightnessModule = device.modules.getRequired(brightnessName);

    const feature = brightnessModule.getFeature("brightness");
    expect(feature).toBeDefined();
    expect(feature?.value).toBe(42);
    expect(feature?.minimumValue).toBe(0);
    expect(feature?.maximumValue).toBe(100);

    await feature?.setValue(75);
    expect(brightnessModule.brightness).toBe(75);
    expect(feature?.value).toBe(75);
  });

  test("device aggregates module features", () => {
    const device = new FakeDevice(new FakeProtocol());
    expect(device.features.get("brightness")?.name).toBe("Brightness");
    expect(device.stateInformation.Brightness).toBe(42);
  });
});
