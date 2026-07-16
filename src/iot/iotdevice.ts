import { Device, type DeviceInfo, type WifiNetwork } from "../core/device.ts";
import { DeviceType } from "../core/device_type.ts";
import { KasaException, UnsupportedDeviceError } from "../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import { ModuleMapping } from "../core/modulemapping.ts";
import { CommonModules } from "../core/modulenames.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import type { IotModule } from "./iotmodule.ts";
import { merge } from "./iotmodule.ts";
import { IotModules } from "./modulenames.ts";
import { Emeter, HomeKit } from "./modules/index.ts";

const MAX_DEVICE_RESPONSE_SIZE = 16 * 1024;

function parseFeatureFlags(features: string): Set<string> {
  return new Set(features.split(":"));
}

/** Return the `system.get_sysinfo` structure, unwrapping the nested `system` key some devices use. */
export function extractSysInfo(info: Record<string, unknown>): Record<string, unknown> {
  const system = info.system as Record<string, unknown> | undefined;
  const sysinfoDefault = (system?.get_sysinfo as Record<string, unknown>) ?? {};
  const sysinfoNest = (sysinfoDefault.system as Record<string, unknown>) ?? {};
  if (Object.keys(sysinfoNest).length > Object.keys(sysinfoDefault).length) {
    return sysinfoNest;
  }
  return sysinfoDefault;
}

export function getDeviceTypeFromSysInfo(info: Record<string, unknown>): DeviceType {
  const system = info.system as Record<string, unknown> | undefined;
  const nestedSystem = (system?.get_sysinfo as Record<string, unknown> | undefined)
    ?.system;
  if (nestedSystem) return DeviceType.Camera;

  if (!system || !("get_sysinfo" in system)) {
    throw new KasaException("No 'system' or 'get_sysinfo' in response");
  }

  const sysinfo = extractSysInfo(info);
  const type = (sysinfo.type ?? sysinfo.mic_type) as string | undefined;
  if (type === undefined)
    throw new KasaException("Unable to find the device type field!");

  const devName = sysinfo.dev_name as string | undefined;
  if (devName?.includes("Dimmer")) return DeviceType.Dimmer;

  if (type.toLowerCase().includes("smartplug")) {
    if ("children" in sysinfo) return DeviceType.Strip;
    if (devName?.toLowerCase().includes("light")) return DeviceType.WallSwitch;
    return DeviceType.Plug;
  }

  if (type.toLowerCase().includes("smartbulb")) {
    if ("length" in sysinfo) return DeviceType.LightStrip;
    return DeviceType.Bulb;
  }

  return DeviceType.Plug;
}

/**
 * Base class for all legacy ("IOT"/Kasa) supported device types.
 *
 * To initialize, you must await {@link update} at least once before accessing
 * properties.
 */
export abstract class IotDevice extends Device {
  emeterType = "emeter";

  protected sysInfoRaw: Record<string, unknown> | undefined;
  protected legacyFeatures = new Set<string>();
  protected iotModules = new Map<string, IotModule>();
  protected supportedModules: ModuleMapping<IotModule> | undefined;

  constructor(_host: string, protocol: BaseProtocol) {
    super(protocol);
  }

  override get modules(): ModuleMapping<IotModule> {
    if (!this.supportedModules) {
      throw new KasaException("You need to await update() to access the data");
    }
    return this.supportedModules;
  }

  /** Register a module (called from `initializeModules`). */
  addModule(name: string, module: IotModule): void {
    if (this.iotModules.has(name)) return;
    this.iotModules.set(name, module);
  }

  createRequest(
    target: string,
    cmd: string,
    arg?: Record<string, unknown>,
    childIds?: string[],
  ): Record<string, unknown> {
    const request: Record<string, unknown> = { [target]: { [cmd]: arg ?? {} } };
    if (childIds !== undefined) {
      return { context: { child_ids: childIds }, [target]: { [cmd]: arg ?? {} } };
    }
    return request;
  }

  protected verifyEmeter(): void {
    if (!this.hasEmeter) throw new KasaException("Device has no emeter");
    if (!this.hasLastUpdateKey(this.emeterType)) {
      throw new KasaException("update() required prior accessing emeter");
    }
  }

  async queryHelper(
    target: string,
    cmd: string,
    arg?: Record<string, unknown>,
    childIds?: string[],
  ): Promise<Record<string, unknown>> {
    const request = this.createRequest(target, cmd, arg, childIds);

    let response: Record<string, unknown>;
    try {
      response = await this.rawQuery(request);
    } catch (ex) {
      throw new KasaException(`Communication error on ${target}:${cmd}`);
    }

    if (!(target in response)) {
      throw new KasaException(
        `No required ${target} in response: ${JSON.stringify(response)}`,
      );
    }

    let result = response[target] as Record<string, unknown>;
    if ("err_code" in result && result.err_code !== 0) {
      throw new KasaException(`Error on ${target}.${cmd}: ${JSON.stringify(result)}`);
    }

    if (!(cmd in result)) {
      throw new KasaException(`No command in response: ${JSON.stringify(response)}`);
    }
    result = result[cmd] as Record<string, unknown>;
    if ("err_code" in result && result.err_code !== 0) {
      throw new KasaException(`Error on ${target} ${cmd}: ${JSON.stringify(result)}`);
    }
    const { err_code: _errCode, ...resultWithoutErrCode } = result;

    return resultWithoutErrCode;
  }

  override get hasEmeter(): boolean {
    return this.legacyFeatures.has("ENE");
  }

  async getSysInfo(): Promise<Record<string, unknown>> {
    return this.queryHelper("system", "get_sysinfo");
  }

  hasLastUpdateKey(key: string): boolean {
    return key in this.lastUpdate;
  }

  getLastUpdateValue(key: string): unknown {
    return this.lastUpdate[key];
  }

  override async update(updateChildren = true): Promise<void> {
    let req: Record<string, unknown> = {};
    req = merge(req, this.createRequest("system", "get_sysinfo"));

    if (Object.keys(this.lastUpdate).length === 0) {
      const response = await this.protocolRef.query(req);
      this.lastUpdate = response;
      this.setSysInfo(extractSysInfo(response));
    }

    if (this.iotModules.size === 0) {
      await this.initializeModules();
    }

    await this.modularUpdate(req);

    this.setSysInfo(extractSysInfo(this.lastUpdate));
    for (const module of this.iotModules.values()) {
      await module.postUpdateHook();
    }

    if (this.featureMap.size === 0) {
      await this.initializeFeatures();
    }
  }

  async initializeModules(): Promise<void> {
    this.addModule(IotModules.IotHomeKit, new HomeKit(this, "smartlife.iot.homekit"));
    if (this.hasEmeter) {
      this.addModule(CommonModules.Energy, new Emeter(this, this.emeterType));
    }
  }

  protected async initializeFeatures(): Promise<void> {
    this.addFeature(
      new Feature(this, {
        id: "state",
        name: "State",
        attributeGetter: "isOn",
        attributeSetter: "setState",
        type: FeatureType.Switch,
        category: FeatureCategory.Primary,
      }),
    );
    this.addFeature(
      new Feature(this, {
        id: "rssi",
        name: "RSSI",
        attributeGetter: "rssi",
        icon: "mdi:signal",
        unitGetter: () => "dBm",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    if (
      this.sysInfoRaw &&
      ("on_time" in this.sysInfoRaw || this.deviceType === DeviceType.Strip)
    ) {
      this.addFeature(
        new Feature(this, {
          id: "on_since",
          name: "On since",
          attributeGetter: "onSince",
          icon: "mdi:clock",
          category: FeatureCategory.Info,
          type: FeatureType.Sensor,
        }),
      );
    }
    this.addFeature(
      new Feature(this, {
        id: "reboot",
        name: "Reboot",
        attributeSetter: "reboot",
        icon: "mdi:restart",
        category: FeatureCategory.Debug,
        type: FeatureType.Action,
      }),
    );

    for (const module of this.modules.values()) {
      module.initializeFeatures();
      for (const feature of module.allFeatures.values()) {
        this.addFeature(feature);
      }
    }
  }

  protected async modularUpdate(initialReq: Record<string, unknown>): Promise<void> {
    let req = initialReq;
    const requestList: Record<string, unknown>[] = [];
    let estResponseSize = "system" in req ? 1024 : 0;

    for (const module of this.iotModules.values()) {
      if (!module.isSupported) continue;

      estResponseSize += module.estimatedQueryResponseSize;
      if (estResponseSize > this.maxDeviceResponseSize) {
        requestList.push(req);
        req = {};
        estResponseSize = module.estimatedQueryResponseSize;
      }

      const q = module.query();
      req = merge(req, q);
    }
    requestList.push(req);

    const responses: Record<string, unknown>[] = [];
    for (const request of requestList) {
      if (Object.keys(request).length > 0) {
        responses.push(await this.protocolRef.query(request));
      }
    }

    const update: Record<string, unknown> = { ...this.lastUpdate };
    for (const response of responses) {
      for (const [k, v] of Object.entries(response)) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          const existing = (update[k] as Record<string, unknown>) ?? {};
          update[k] = { ...existing, ...v };
        }
      }
    }
    this.lastUpdate = update;

    if (!this.supportedModules) {
      const supported = new ModuleMapping<IotModule>();
      for (const [name, module] of this.iotModules) {
        if (module.isSupported) supported.set(name, module);
      }
      this.supportedModules = supported;
    }
  }

  override updateFromDiscoverInfo(info: Record<string, unknown>): void {
    this.discoveryInfo = info;
    const system = info.system as Record<string, unknown> | undefined;
    const sysInfo = system?.get_sysinfo as Record<string, unknown> | undefined;
    if (system && sysInfo) {
      this.lastUpdate = info;
      this.setSysInfo(sysInfo);
    } else {
      const discoveryModel = info.device_model as string;
      const noRegionModel = discoveryModel.split("(")[0] as string;
      this.setSysInfo({ ...info, model: noRegionModel });
    }
  }

  protected setSysInfo(sysInfo: Record<string, unknown>): void {
    this.sysInfoRaw = sysInfo;
    const features = sysInfo.feature as string | undefined;
    if (features) this.legacyFeatures = parseFeatureFlags(features);
  }

  override get sysInfo(): Record<string, unknown> {
    if (!this.sysInfoRaw)
      throw new KasaException("You need to await update() to access the data");
    return this.sysInfoRaw;
  }

  override get model(): string {
    if (Object.keys(this.lastUpdate).length > 0) return this.deviceInfo.shortName;
    return this.sysInfo.model as string;
  }

  override get alias(): string | undefined {
    return this.sysInfoRaw?.alias as string | undefined;
  }

  override async setAlias(alias: string): Promise<Record<string, unknown>> {
    return this.queryHelper("system", "set_dev_alias", { alias });
  }

  override get time(): Date {
    return this.modules.getRequired(CommonModules.Time).time;
  }

  override get timezone(): string {
    return this.modules.getRequired(CommonModules.Time).timezone;
  }

  override get hwInfo(): Record<string, unknown> {
    const keys = [
      "sw_ver",
      "hw_ver",
      "mac",
      "mic_mac",
      "type",
      "mic_type",
      "hwId",
      "fwId",
      "oemId",
      "dev_name",
    ];
    const sysInfo = this.sysInfo;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in sysInfo) result[key] = sysInfo[key];
    }
    return result;
  }

  override get location(): Record<string, unknown> {
    const sysInfo = this.sysInfo;
    const loc: { latitude: number | null; longitude: number | null } = {
      latitude: null,
      longitude: null,
    };
    if ("latitude" in sysInfo && "longitude" in sysInfo) {
      loc.latitude = sysInfo.latitude as number;
      loc.longitude = sysInfo.longitude as number;
    } else if ("latitude_i" in sysInfo && "longitude_i" in sysInfo) {
      loc.latitude = (sysInfo.latitude_i as number) / 10000;
      loc.longitude = (sysInfo.longitude_i as number) / 10000;
    }
    return loc;
  }

  override get rssi(): number | undefined {
    const rssi = this.sysInfo.rssi as number | undefined;
    return rssi === undefined ? undefined : Number(rssi);
  }

  override get mac(): string {
    const sysInfo = this.sysInfo;
    let mac = (sysInfo.mac ?? sysInfo.mic_mac) as string | undefined;
    if (!mac)
      throw new KasaException(
        "Unknown mac, please submit a bug report with sys_info output.",
      );
    mac = mac.replace(/-/g, ":");
    if (!mac.includes(":")) {
      mac = (mac.match(/.{2}/g) ?? []).join(":");
    }
    return mac;
  }

  async setMac(mac: string): Promise<Record<string, unknown>> {
    return this.queryHelper("system", "set_mac_addr", { mac });
  }

  override async reboot(delay = 1): Promise<void> {
    await this.queryHelper("system", "reboot", { delay });
  }

  override async factoryReset(): Promise<void> {
    await this.queryHelper("system", "reset");
  }

  override async turnOff(): Promise<Record<string, unknown>> {
    throw new KasaException("Device subclass needs to implement this.");
  }

  override async turnOn(): Promise<Record<string, unknown>> {
    throw new KasaException("Device subclass needs to implement this.");
  }

  override get isOn(): boolean {
    throw new KasaException("Device subclass needs to implement this.");
  }

  override async setState(on: boolean): Promise<Record<string, unknown>> {
    return on ? this.turnOn() : this.turnOff();
  }

  protected onSinceCache: Date | undefined;

  override get onSince(): Date | undefined {
    if (this.isOff || !this.sysInfoRaw || !("on_time" in this.sysInfoRaw)) {
      this.onSinceCache = undefined;
      return undefined;
    }
    const onTimeSec = this.sysInfoRaw.on_time as number;
    const onSince = new Date(this.time.getTime() - onTimeSec * 1000);
    if (
      !this.onSinceCache ||
      Math.abs(onSince.getTime() - this.onSinceCache.getTime()) > 5000
    ) {
      this.onSinceCache = onSince;
    }
    return this.onSinceCache;
  }

  override get deviceId(): string {
    return this.mac;
  }

  override async wifiScan(): Promise<WifiNetwork[]> {
    const scan = async (target: string) =>
      this.queryHelper(target, "get_scaninfo", { refresh: 1 });
    let info: Record<string, unknown>;
    try {
      info = await scan("netif");
    } catch {
      info = await scan("smartlife.iot.common.softaponboarding");
    }
    if (!("ap_list" in info))
      throw new KasaException(`Invalid response for wifi scan: ${JSON.stringify(info)}`);
    return (info.ap_list as Record<string, unknown>[]).map((entry) => ({
      ssid: entry.ssid as string,
      keyType: entry.key_type as number | undefined,
      cipherType: entry.cipher_type as number | undefined,
      channel: entry.channel as number | undefined,
      bssid: entry.bssid as string | undefined,
      rssi: entry.rssi as number | undefined,
      signalLevel: entry.signal_level as number | undefined,
      auth: entry.auth as number | undefined,
      encryption: entry.encryption as number | undefined,
    }));
  }

  override async wifiJoin(
    ssid: string,
    password: string,
    keytype = "3",
  ): Promise<Record<string, unknown>> {
    const join = async (target: string, payload: Record<string, unknown>) =>
      this.queryHelper(target, "set_stainfo", payload);
    if (!keytype) throw new KasaException("KeyType is required for this device.");
    const payload = { ssid, password, key_type: Number(keytype) };
    try {
      return await join("netif", payload);
    } catch {
      return join("smartlife.iot.common.softaponboarding", payload);
    }
  }

  get maxDeviceResponseSize(): number {
    return MAX_DEVICE_RESPONSE_SIZE;
  }

  override get internalState(): unknown {
    return Object.keys(this.lastUpdate).length > 0 ? this.lastUpdate : this.discoveryInfo;
  }

  protected static getDeviceTypeFromSysInfo(info: Record<string, unknown>): DeviceType {
    return getDeviceTypeFromSysInfo(info);
  }

  protected override getDeviceInfo(
    info: Record<string, unknown>,
    discoveryInfo: Record<string, unknown> | undefined,
  ): DeviceInfo {
    const sysInfo = extractSysInfo(info);
    const deviceModel = sysInfo.model as string;
    const [longName, regionPart] = deviceModel.split("(");
    const region = regionPart ? regionPart.replace(")", "") : undefined;

    const deviceFamily = (sysInfo.type ?? sysInfo.mic_type) as string | undefined;
    if (deviceFamily === undefined) {
      throw new UnsupportedDeviceError("type nor mic_type found in sysinfo response");
    }

    const deviceType = getDeviceTypeFromSysInfo(info);
    const fwVersionFull = sysInfo.sw_ver as string;
    const spaceIndex = fwVersionFull.indexOf(" ");
    const firmwareVersion =
      spaceIndex === -1 ? fwVersionFull : fwVersionFull.slice(0, spaceIndex);
    const firmwareBuild =
      spaceIndex === -1 ? undefined : fwVersionFull.slice(spaceIndex + 1);
    const auth = Boolean(discoveryInfo && "mgt_encrypt_schm" in discoveryInfo);

    return {
      shortName: longName as string,
      longName: longName as string,
      brand: "kasa",
      deviceFamily,
      deviceType,
      hardwareVersion: sysInfo.hw_ver as string,
      firmwareVersion,
      firmwareBuild,
      requiresAuth: auth,
      region,
    };
  }
}
