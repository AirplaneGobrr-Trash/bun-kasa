import { Device, type DeviceInfo, type WifiNetwork } from "../core/device.ts";
import { DeviceType } from "../core/device_type.ts";
import {
  AuthenticationError,
  KasaException,
  SmartErrorCode,
} from "../core/exceptions.ts";
import { Feature, FeatureCategory, FeatureType } from "../core/feature.ts";
import type { ModuleMapping } from "../core/modulemapping.ts";
import { CommonModules } from "../core/modulenames.ts";
import type { BaseProtocol } from "../core/protocol.ts";
import { SmartModules } from "./modulenames.ts";
import { ChildDevice, Cloud, DeviceModule } from "./modules/index.ts";
import { Light, REGISTERED_SMART_MODULES, Thermostat } from "./registry.ts";
import type { SmartModule } from "./smartmodule.ts";

/** Modules that non-hub devices with children report on the child, but only work on the parent. */
const NON_HUB_PARENT_ONLY_MODULE_NAMES = new Set([
  "DeviceModule",
  "Time",
  "Firmware",
  "Cloud",
]);

export type ComponentsRaw = Record<string, Array<Record<string, number | string>>>;

/** Base class to represent a SMART protocol based device. */
export class SmartDevice extends Device {
  protected componentsRaw: ComponentsRaw | undefined;
  protected componentsMap: Record<string, number> = {};
  protected smartModulesByName = new Map<string, SmartModule>();
  protected lastUpdateTimeSecs: number | undefined;
  protected onSinceCache: Date | undefined;
  info: Record<string, unknown> = {};

  parentSmartDevice: SmartDevice | undefined;
  protected childrenById = new Map<string, SmartDevice>();

  constructor(_host: string, protocol: BaseProtocol) {
    super(protocol);
  }

  get components(): Readonly<Record<string, number>> {
    return this.componentsMap;
  }

  get isHubChild(): boolean {
    return (
      this.parentSmartDevice !== undefined &&
      this.parentSmartDevice.deviceType === DeviceType.Hub
    );
  }

  hasLastUpdateKey(key: string): boolean {
    return key in this.lastUpdate;
  }

  hasChild(deviceId: string): boolean {
    return this.childrenById.has(deviceId);
  }

  protected async initializeChildren(): Promise<void> {
    const childInfoQuery = {
      get_child_device_component_list: null,
      get_child_device_list: null,
    };
    const resp = await this.protocolRef.query(childInfoQuery);
    Object.assign(this.lastUpdate, resp);
  }

  protected async tryCreateChild(
    info: Record<string, unknown>,
    childComponents: ComponentsRaw,
  ): Promise<SmartDevice | undefined> {
    const { SmartChildDevice } = await import("./smartchilddevice.ts");
    return SmartChildDevice.create(this, info, childComponents);
  }

  protected async createDeleteChildren(
    childDeviceResp: { child_device_list: Record<string, unknown>[] },
    childDeviceComponentsResp: { child_component_list: Record<string, unknown>[] },
  ): Promise<boolean> {
    let changed = false;
    const smartChildrenComponents = new Map<string, Record<string, unknown>>();
    for (const child of childDeviceComponentsResp.child_component_list) {
      smartChildrenComponents.set(child.device_id as string, child);
    }

    const childIds = new Set<string>();
    const existingChildIds = new Set(this.childrenById.keys());

    for (const info of childDeviceResp.child_device_list) {
      const childId = info.device_id as string | undefined;
      const childComponents = childId ? smartChildrenComponents.get(childId) : undefined;

      if (childId && childComponents) {
        childIds.add(childId);
        if (existingChildIds.has(childId)) continue;

        const child = await this.tryCreateChild(
          info,
          childComponents as unknown as ComponentsRaw,
        );
        if (child) {
          changed = true;
          this.childrenById.set(childId, child);
        }
      }
    }

    for (const removedId of existingChildIds) {
      if (!childIds.has(removedId)) {
        changed = true;
        this.childrenById.delete(removedId);
      }
    }

    return changed;
  }

  override get children(): SmartDevice[] {
    return [...this.childrenById.values()];
  }

  override get modules(): ModuleMapping<SmartModule> {
    return this.smartModulesByName as unknown as ModuleMapping<SmartModule>;
  }

  protected tryGetResponse(
    responses: Record<string, unknown>,
    request: string,
    fallback?: Record<string, unknown>,
  ): Record<string, unknown> {
    let response = responses[request];
    if (typeof response === "number" && SmartErrorCode[response] !== undefined)
      response = undefined;
    if (response !== undefined) return response as Record<string, unknown>;
    if (fallback !== undefined) return fallback;
    throw new KasaException(
      `${request} not found in ${JSON.stringify(responses)} for device ${this.host}`,
    );
  }

  protected static parseComponents(componentsRaw: ComponentsRaw): Record<string, number> {
    const result: Record<string, number> = {};
    for (const comp of componentsRaw.component_list ?? []) {
      result[String(comp.id)] = Number(comp.ver_code);
    }
    return result;
  }

  protected async negotiate(): Promise<void> {
    const initialQuery = {
      component_nego: null,
      get_device_info: null,
      get_connect_cloud_state: null,
    };
    const resp = await this.protocolRef.query(initialQuery);

    Object.assign(this.lastUpdate, resp);
    this.info = this.tryGetResponse(resp, "get_device_info");

    this.componentsRaw = resp.component_nego as ComponentsRaw;
    this.componentsMap = SmartDevice.parseComponents(this.componentsRaw);

    if ("child_device" in this.componentsMap && this.children.length === 0) {
      await this.initializeChildren();
    }
  }

  protected async updateChildrenInfo(): Promise<boolean> {
    let changed = false;
    const childInfo = this.tryGetResponse(this.lastUpdate, "get_child_device_list", {});
    if (childInfo && "child_device_list" in childInfo) {
      changed = await this.createDeleteChildren(
        childInfo as { child_device_list: Record<string, unknown>[] },
        this.lastUpdate.get_child_device_component_list as {
          child_component_list: Record<string, unknown>[];
        },
      );

      for (const info of (childInfo as { child_device_list: Record<string, unknown>[] })
        .child_device_list) {
        const childId = info.device_id as string | undefined;
        if (!childId || !this.childrenById.has(childId)) continue;
        this.childrenById.get(childId)?.updateInternalState(info);
      }
    }
    return changed;
  }

  updateInternalState(info: Record<string, unknown>): void {
    this.info = info;
  }

  override async update(updateChildren = true): Promise<void> {
    if (this.credentials === undefined && this.credentialsHash === undefined) {
      throw new AuthenticationError("Tapo plug requires authentication.");
    }

    const firstUpdate = this.lastUpdateTimeSecs === undefined;
    const now = Date.now() / 1000;
    this.lastUpdateTimeSecs = now;

    if (firstUpdate) {
      await this.negotiate();
      await this.initializeModules();
      const cloudMod = this.smartModulesByName.get(SmartModules.Cloud);
      if (cloudMod) await this.handleModulePostUpdate(cloudMod, now, true);
    }

    await this.modularUpdate(firstUpdate, now);

    const childrenChanged = await this.updateChildrenInfo();
    if (childrenChanged || updateChildren || this.deviceType !== DeviceType.Hub) {
      for (const child of this.childrenById.values()) {
        await child.update(updateChildren);
      }
    }

    if (this.featureMap.size === 0) {
      await this.initializeFeatures();
    }
  }

  protected async handleModulePostUpdate(
    module: SmartModule,
    updateTime: number,
    hadQuery: boolean,
  ): Promise<void> {
    if (module.disabled) return;
    if (hadQuery) module.setLastUpdateTime(updateTime);
    try {
      await module.postUpdateHook();
      module.setError(undefined);
    } catch (ex) {
      if (hadQuery) module.setError(ex);
    }
  }

  protected async modularUpdate(firstUpdate: boolean, updateTime: number): Promise<void> {
    const req: Record<string, unknown> = {};
    const moduleQueries: SmartModule[] = [];

    for (const module of this.smartModulesByName.values()) {
      if (!(firstUpdate || module.disabled === false)) continue;
      const query = module.query();
      if (Object.keys(query).length === 0) continue;

      if (firstUpdate && this.isFirstUpdateModule(module)) {
        module.setLastUpdateTime(updateTime);
        continue;
      }
      if (module.shouldUpdate(updateTime)) {
        moduleQueries.push(module);
        Object.assign(req, query);
      }
    }

    let resp: Record<string, unknown>;
    try {
      resp = await this.protocolRef.query(req);
    } catch (ex) {
      resp = await this.handleModularUpdateError(ex, firstUpdate, req);
    }

    Object.assign(this.lastUpdate, resp);
    this.info = this.tryGetResponse(
      firstUpdate ? this.lastUpdate : resp,
      "get_device_info",
      this.info,
    );

    for (const module of this.smartModulesByName.values()) {
      await this.handleModulePostUpdate(
        module,
        updateTime,
        moduleQueries.includes(module),
      );
    }
  }

  private isFirstUpdateModule(module: SmartModule): boolean {
    return (
      module instanceof DeviceModule ||
      module instanceof ChildDevice ||
      module instanceof Cloud
    );
  }

  protected async handleModularUpdateError(
    ex: unknown,
    _firstUpdate: boolean,
    requests: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    void ex;
    const responses: Record<string, unknown> = {};
    for (const [method, params] of Object.entries(requests)) {
      try {
        const resp = await this.protocolRef.query({ [method]: params });
        responses[method] = resp[method];
      } catch {
        responses[method] = SmartErrorCode.INTERNAL_QUERY_ERROR;
      }
    }
    return responses;
  }

  async initializeModules(): Promise<void> {
    const skipParentOnlyModules =
      this.parentSmartDevice !== undefined &&
      this.parentSmartDevice.deviceType !== DeviceType.Hub;

    for (const ModuleCls of REGISTERED_SMART_MODULES) {
      if (skipParentOnlyModules && NON_HUB_PARENT_ONLY_MODULE_NAMES.has(ModuleCls.name))
        continue;

      const requiredComponent = ModuleCls.requiredComponent;
      const matchesComponent =
        requiredComponent !== null && requiredComponent in this.componentsMap;
      const matchesSysinfo = ModuleCls.sysinfoLookupKeys.some(
        (key) => this.sysInfo[key] !== undefined,
      );

      if (matchesComponent || matchesSysinfo) {
        const moduleKey = requiredComponent ?? "";
        const ModuleCtor = ModuleCls as unknown as new (
          device: SmartDevice,
          key: string,
        ) => SmartModule;
        const module = new ModuleCtor(this, moduleKey);
        if (await module.checkSupported()) {
          this.smartModulesByName.set(module.name, module);
        }
      }
    }

    if (
      this.smartModulesByName.has(SmartModules.Brightness) ||
      this.smartModulesByName.has(SmartModules.Color) ||
      this.smartModulesByName.has(SmartModules.ColorTemperature)
    ) {
      this.smartModulesByName.set(CommonModules.Light, new Light(this, "light"));
    }
    if (
      this.smartModulesByName.has(SmartModules.TemperatureControl) &&
      this.smartModulesByName.has(SmartModules.TemperatureSensor)
    ) {
      this.smartModulesByName.set(
        CommonModules.Thermostat,
        new Thermostat(this, "thermostat"),
      );
    }

    // Move Time to the beginning so other modules can access time/timezone after update.
    const timeModule = this.smartModulesByName.get(CommonModules.Time);
    if (timeModule) {
      this.smartModulesByName.delete(CommonModules.Time);
      const reordered = new Map<string, SmartModule>();
      reordered.set(CommonModules.Time, timeModule);
      for (const [k, v] of this.smartModulesByName) reordered.set(k, v);
      this.smartModulesByName = reordered;
    }
  }

  protected async initializeFeatures(): Promise<void> {
    this.addFeature(
      new Feature(this, {
        id: "device_id",
        name: "Device ID",
        attributeGetter: "deviceId",
        category: FeatureCategory.Debug,
        type: FeatureType.Sensor,
      }),
    );
    if ("device_on" in this.info) {
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
    }
    if ("signal_level" in this.info) {
      this.addFeature(
        new Feature(this, {
          id: "signal_level",
          name: "Signal Level",
          attributeGetter: () => this.info.signal_level as number,
          icon: "mdi:signal",
          category: FeatureCategory.Info,
          type: FeatureType.Sensor,
        }),
      );
    }
    if ("rssi" in this.info) {
      this.addFeature(
        new Feature(this, {
          id: "rssi",
          name: "RSSI",
          attributeGetter: () => this.info.rssi as number,
          icon: "mdi:signal",
          unitGetter: () => "dBm",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
    }
    if ("ssid" in this.info) {
      this.addFeature(
        new Feature(this, {
          id: "ssid",
          name: "SSID",
          attributeGetter: "ssid",
          icon: "mdi:wifi",
          category: FeatureCategory.Debug,
          type: FeatureType.Sensor,
        }),
      );
    }
    if ("on_time" in this.info) {
      this.addFeature(
        new Feature(this, {
          id: "on_since",
          name: "On since",
          attributeGetter: "onSince",
          icon: "mdi:clock",
          category: FeatureCategory.Debug,
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

    const parent = this.parentSmartDevice;
    if (parent) {
      const cs = parent.modules.get(CommonModules.ChildSetup);
      if (cs) {
        this.addFeature(
          new Feature(this, {
            id: "unpair",
            name: "Unpair device",
            container: cs as unknown as SmartModule,
            attributeSetter: () => cs.unpair(this.deviceId),
            category: FeatureCategory.Debug,
            type: FeatureType.Action,
          }),
        );
      }
    }

    for (const module of this.modules.values()) {
      module.initializeFeatures();
      for (const feat of module.allFeatures.values()) {
        this.addFeature(feat);
      }
    }
  }

  get isCloudConnected(): boolean {
    const cloud = this.modules.get(SmartModules.Cloud);
    if (!cloud) return false;
    return (cloud as unknown as { isConnected: boolean }).isConnected;
  }

  override get sysInfo(): Record<string, unknown> {
    return this.info;
  }

  override get model(): string {
    if (Object.keys(this.lastUpdate).length > 0) return this.deviceInfo.shortName;
    const discoModel = String(this.info.device_model ?? "");
    return discoModel.split("(")[0] as string;
  }

  override get alias(): string | undefined {
    const nickname = this.info.nickname as string | undefined;
    if (this.info && nickname) return Buffer.from(nickname, "base64").toString("utf-8");
    return undefined;
  }

  override get time(): Date {
    const timeMod =
      this.modules.get(CommonModules.Time) ??
      this.parentSmartDevice?.modules.get(CommonModules.Time);
    if (timeMod) return timeMod.time;
    return new Date();
  }

  override get onSince(): Date | undefined {
    if (!this.info.device_on || this.info.on_time === undefined) {
      this.onSinceCache = undefined;
      return undefined;
    }
    const onTimeSecs = this.info.on_time as number;
    const onSince = new Date(this.time.getTime() - onTimeSecs * 1000);
    if (
      !this.onSinceCache ||
      Math.abs(onSince.getTime() - this.onSinceCache.getTime()) > 5000
    ) {
      this.onSinceCache = onSince;
    }
    return this.onSinceCache;
  }

  override get timezone(): string {
    // JS Dates don't carry an IANA zone; SMART devices expose this via the Time module.
    const timeMod = this.modules.get(CommonModules.Time);
    return timeMod?.timezone ?? "Etc/UTC";
  }

  override get hwInfo(): Record<string, unknown> {
    return {
      sw_ver: this.info.fw_ver,
      hw_ver: this.info.hw_ver,
      mac: this.info.mac,
      type: this.info.type,
      hwId: this.info.device_id,
      dev_name: this.alias,
      oemId: this.info.oem_id,
    };
  }

  override get location(): Record<string, unknown> {
    return {
      latitude: ((this.info.latitude as number) ?? 0) / 10_000,
      longitude: ((this.info.longitude as number) ?? 0) / 10_000,
    };
  }

  override get rssi(): number | undefined {
    const rssi = this.info.rssi as number | undefined;
    return rssi ? Number(rssi) : undefined;
  }

  override get mac(): string {
    return String(this.info.mac).replace(/-/g, ":");
  }

  override get deviceId(): string {
    return String(this.info.device_id);
  }

  override get internalState(): unknown {
    return this.lastUpdate;
  }

  async queryHelper(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.protocolRef.query({ [method]: params ?? null });
  }

  get ssid(): string {
    const ssid = this.info.ssid as string | undefined;
    return ssid ? Buffer.from(ssid, "base64").toString("utf-8") : "No SSID";
  }

  override get hasEmeter(): boolean {
    return this.modules.has(CommonModules.Energy);
  }

  override get isOn(): boolean {
    return Boolean(this.info.device_on);
  }

  override async setState(on: boolean): Promise<Record<string, unknown>> {
    return this.protocolRef.query({ set_device_info: { device_on: on } });
  }

  override async turnOn(): Promise<Record<string, unknown>> {
    return this.setState(true);
  }

  override async turnOff(): Promise<Record<string, unknown>> {
    return this.setState(false);
  }

  override updateFromDiscoverInfo(info: Record<string, unknown>): void {
    this.discoveryInfo = info;
    this.info = info;
  }

  override async wifiScan(): Promise<WifiNetwork[]> {
    const resp = await this.protocolRef.query({
      get_wireless_scan_info: { start_index: 0 },
    });
    const apList = (resp.get_wireless_scan_info as { ap_list: Record<string, unknown>[] })
      .ap_list;
    return apList.map((res) => ({
      ssid: Buffer.from(res.ssid as string, "base64").toString("utf-8"),
      cipherType: res.cipher_type as number,
      keyType: res.key_type as number,
      channel: res.channel as number,
      signalLevel: res.signal_level as number,
      bssid: res.bssid as string,
    }));
  }

  override async wifiJoin(
    ssid: string,
    password: string,
    keytype = "wpa2_psk",
  ): Promise<Record<string, unknown>> {
    if (!this.credentials)
      throw new AuthenticationError("Device requires authentication.");
    if (!keytype) throw new KasaException("KeyType is required for this device.");

    const payload = {
      account: {
        username: Buffer.from(this.credentials.username).toString("base64"),
        password: Buffer.from(this.credentials.password).toString("base64"),
      },
      wireless: {
        key_type: keytype,
        password: Buffer.from(password).toString("base64"),
        ssid: Buffer.from(ssid).toString("base64"),
      },
      time:
        this.internalState &&
        (this.internalState as Record<string, unknown>).get_device_time,
    };

    try {
      return await this.protocolRef.query({ set_qs_info: payload });
    } catch (ex) {
      if (ex instanceof KasaException) return {};
      throw ex;
    }
  }

  async updateCredentials(
    username: string,
    password: string,
  ): Promise<Record<string, unknown>> {
    const timeData = (this.internalState as Record<string, unknown>).get_device_time;
    const payload = {
      account: {
        username: Buffer.from(username).toString("base64"),
        password: Buffer.from(password).toString("base64"),
      },
      time: timeData,
    };
    return this.protocolRef.query({ set_qs_info: payload });
  }

  override async setAlias(alias: string): Promise<Record<string, unknown>> {
    return this.protocolRef.query({
      set_device_info: { nickname: Buffer.from(alias).toString("base64") },
    });
  }

  override async reboot(delay = 1): Promise<void> {
    await this.protocolRef.query({ device_reboot: { delay } });
  }

  override async factoryReset(): Promise<void> {
    await this.protocolRef.query("device_reset");
  }

  override get deviceType(): DeviceType {
    if (this.deviceTypeValue !== DeviceType.Unknown) return this.deviceTypeValue;

    const typeStr = (this.info.type ?? this.info.device_type) as string | undefined;
    if (!typeStr || Object.keys(this.componentsMap).length === 0)
      return this.deviceTypeValue;

    this.deviceTypeValue = SmartDevice.getDeviceTypeFromComponents(
      Object.keys(this.componentsMap),
      typeStr,
    );
    return this.deviceTypeValue;
  }

  protected static getDeviceTypeFromComponents(
    components: string[],
    deviceType: string,
  ): DeviceType {
    if (deviceType.includes("HUB")) return DeviceType.Hub;
    if (deviceType.includes("PLUG")) {
      if (components.includes("child_device")) return DeviceType.Strip;
      return DeviceType.Plug;
    }
    if (components.includes("light_strip")) return DeviceType.LightStrip;
    if (deviceType.includes("SWITCH") && components.includes("child_device"))
      return DeviceType.WallSwitch;
    if (components.includes("dimmer_calibration")) return DeviceType.Dimmer;
    if (components.includes("brightness")) return DeviceType.Bulb;
    if (deviceType.includes("SWITCH")) return DeviceType.WallSwitch;
    if (deviceType.includes("SENSOR")) return DeviceType.Sensor;
    if (deviceType.includes("ENERGY")) return DeviceType.Thermostat;
    if (deviceType.includes("ROBOVAC")) return DeviceType.Vacuum;
    if (deviceType.includes("TAPOCHIME")) return DeviceType.Chime;
    return DeviceType.Plug;
  }

  protected override getDeviceInfo(
    info: Record<string, unknown>,
    discoveryInfo: Record<string, unknown> | undefined,
  ): DeviceInfo {
    const di = info.get_device_info as Record<string, unknown>;
    const components = ((info.component_nego as ComponentsRaw).component_list ?? []).map(
      (c) => String(c.id),
    );

    const shortName = di.model as string;
    let region: string | undefined;
    let longName: string;
    if (discoveryInfo) {
      const deviceModel = discoveryInfo.device_model as string;
      const [ln, regionPart] = deviceModel.split("(");
      longName = ln as string;
      region = regionPart ? regionPart.replace(")", "") : undefined;
    } else {
      longName = shortName;
    }
    if (!region) region = di.specs as string | undefined;

    const deviceFamily = di.type as string;
    const deviceType = SmartDevice.getDeviceTypeFromComponents(components, deviceFamily);
    const fwVersionFull = di.fw_ver as string;
    const spaceIndex = fwVersionFull.indexOf(" ");
    const firmwareVersion =
      spaceIndex === -1 ? fwVersionFull : fwVersionFull.slice(0, spaceIndex);
    const firmwareBuild =
      spaceIndex === -1 ? undefined : fwVersionFull.slice(spaceIndex + 1);
    const devicetype = deviceFamily.split(".")[1] ?? "";
    const brand = devicetype.slice(0, 4).toLowerCase();

    return {
      shortName,
      longName,
      brand,
      deviceFamily,
      deviceType,
      hardwareVersion: di.hw_ver as string,
      firmwareVersion,
      firmwareBuild,
      requiresAuth: true,
      region,
    };
  }
}
