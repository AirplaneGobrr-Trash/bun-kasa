import { constants as cryptoConstants, publicEncrypt } from "node:crypto";
import type { DeviceInfo, WifiNetwork } from "../core/device.ts";
import { DeviceType } from "../core/device_type.ts";
import { AuthenticationError, DeviceError, KasaException } from "../core/exceptions.ts";
import { ChildProtocolWrapper } from "../protocols/smartprotocol.ts";
import { SmartChildDevice } from "../smart/smartchilddevice.ts";
import type { ComponentsRaw } from "../smart/smartdevice.ts";
import { SmartDevice } from "../smart/smartdevice.ts";
import { SmartCamModules } from "./modulenames.ts";
import { REGISTERED_SMARTCAM_MODULES } from "./registry.ts";
import type { SmartCamModule } from "./smartcammodule.ts";

const STATIC_PUBLIC_KEY_B64 =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4D6i0oD/Ga5qb//RfSe8MrPVI" +
  "rMIGecCxkcGWGj9kxxk74qQNq8XUuXoy2PczQ30BpiRHrlkbtBEPeWLpq85tfubT" +
  "UjhBz1NPNvWrC88uaYVGvzNpgzZOqDC35961uPTuvdUa8vztcUQjEZy16WbmetRj" +
  "URFIiWJgFCmemyYVbQIDAQAB";

/** Class for SMARTCAM (Tapo camera) devices. */
export class SmartCamDevice extends SmartDevice {
  private publicKeyB64: string | undefined;
  private networks: WifiNetwork[] = [];

  protected static getDeviceTypeFromSysinfo(
    sysinfo: Record<string, unknown>,
  ): DeviceType {
    const deviceType = sysinfo.device_type as string | undefined;
    if (!deviceType) return DeviceType.Unknown;
    if (deviceType.endsWith("HUB")) return DeviceType.Hub;
    if (deviceType.includes("DOORBELL")) return DeviceType.Doorbell;
    return DeviceType.Camera;
  }

  protected override getDeviceInfo(
    info: Record<string, unknown>,
    discoveryInfo: Record<string, unknown> | undefined,
  ): DeviceInfo {
    const deviceInfo = info.getDeviceInfo as {
      device_info: { basic_info: Record<string, unknown> };
    };
    const basicInfo = deviceInfo.device_info.basic_info;
    const shortName = basicInfo.device_model as string;
    const longName = discoveryInfo ? (discoveryInfo.device_model as string) : shortName;
    const deviceType = SmartCamDevice.getDeviceTypeFromSysinfo(basicInfo);
    const fwVersionFull = basicInfo.sw_version as string;
    const spaceIndex = fwVersionFull.indexOf(" ");
    const firmwareVersion =
      spaceIndex === -1 ? fwVersionFull : fwVersionFull.slice(0, spaceIndex);
    const firmwareBuild =
      spaceIndex === -1 ? undefined : fwVersionFull.slice(spaceIndex + 1);

    return {
      shortName,
      longName,
      brand: "tapo",
      deviceFamily: basicInfo.device_type as string,
      deviceType,
      hardwareVersion: basicInfo.hw_version as string,
      firmwareVersion,
      firmwareBuild,
      requiresAuth: true,
      region: basicInfo.region as string | undefined,
    };
  }

  private mapInfo(deviceInfo: Record<string, unknown>): Record<string, unknown> {
    const basicInfo = deviceInfo.basic_info as Record<string, unknown>;
    const mappings: Record<string, string> = {
      device_model: "model",
      device_alias: "alias",
      sw_version: "fw_ver",
      hw_version: "hw_ver",
      hw_id: "hwId",
      dev_id: "device_id",
    };
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(basicInfo)) {
      result[mappings[k] ?? k] = v;
    }
    return result;
  }

  protected updateInternalInfo(infoResp: Record<string, unknown>): void {
    const info = this.tryGetResponse(infoResp, "getDeviceInfo");
    this.info = this.mapInfo(info.device_info as Record<string, unknown>);
  }

  override updateInternalState(info: Record<string, unknown>): void {
    this.info = this.mapInfo(info);
  }

  protected override async updateChildrenInfo(): Promise<boolean> {
    let changed = false;
    const childInfo = this.tryGetResponse(this.lastUpdate, "getChildDeviceList", {});
    if (childInfo && "child_device_list" in childInfo) {
      changed = await this.createDeleteChildren(
        childInfo as { child_device_list: Record<string, unknown>[] },
        this.lastUpdate.getChildDeviceComponentList as {
          child_component_list: Record<string, unknown>[];
        },
      );
      for (const info of (childInfo as { child_device_list: Record<string, unknown>[] })
        .child_device_list) {
        const childId = info.device_id as string | undefined;
        if (!childId || !this.hasChild(childId)) continue;
        this.childrenById.get(childId)?.updateInternalState(info);
      }
    }
    return changed;
  }

  protected override async tryCreateChild(
    info: Record<string, unknown>,
    childComponents: ComponentsRaw,
  ): Promise<SmartDevice | undefined> {
    const category = info.category as string | undefined;
    if (!category) return undefined;

    if (category in SmartChildDevice.CHILD_DEVICE_TYPE_MAP) {
      return this.initializeSmartChild(info, childComponents);
    }
    const { SmartCamChild } = await import("./smartcamchild.ts");
    if (category in SmartCamChild.CHILD_DEVICE_TYPE_MAP) {
      return this.initializeSmartcamChild(info, childComponents);
    }
    return undefined;
  }

  private async initializeSmartChild(
    info: Record<string, unknown>,
    childComponentsRaw: ComponentsRaw,
  ): Promise<SmartDevice> {
    const childId = info.device_id as string;
    const childProtocol = new ChildProtocolWrapper(childId, this.protocol as never);
    return SmartChildDevice.create(
      this,
      info,
      childComponentsRaw,
      childProtocol as never,
    );
  }

  private async initializeSmartcamChild(
    info: Record<string, unknown>,
    childComponentsRaw: ComponentsRaw,
  ): Promise<SmartDevice> {
    const appComponentList = {
      app_component_list: childComponentsRaw.component_list,
    } as unknown as ComponentsRaw;
    const { SmartCamChild } = await import("./smartcamchild.ts");
    return SmartCamChild.create(this, info, appComponentList);
  }

  protected override async initializeChildren(): Promise<void> {
    const childInfoQuery = {
      getChildDeviceList: { childControl: { start_index: 0 } },
      getChildDeviceComponentList: { childControl: { start_index: 0 } },
    };
    const resp = await this.protocolRef.query(childInfoQuery);
    Object.assign(this.lastUpdate, resp);
  }

  override async initializeModules(): Promise<void> {
    for (const ModuleCls of REGISTERED_SMARTCAM_MODULES) {
      if (
        ModuleCls.requiredComponent &&
        !(ModuleCls.requiredComponent in this.components)
      )
        continue;
      const ModuleCtor = ModuleCls as unknown as new (
        device: SmartCamDevice,
        key: string,
      ) => SmartCamModule;
      const module = new ModuleCtor(this, ModuleCls.name);
      if (await module.checkSupported()) {
        this.smartModulesByName.set(module.name, module);
      }
    }
  }

  protected override async initializeFeatures(): Promise<void> {
    for (const module of this.modules.values()) {
      module.initializeFeatures();
      for (const feat of module.allFeatures.values()) {
        this.addFeature(feat);
      }
    }
  }

  async querySetterHelper(
    method: string,
    moduleName: string,
    section: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.protocolRef.query({ [method]: { [moduleName]: { [section]: params } } });
  }

  protected static override parseComponents(
    componentsRaw: ComponentsRaw,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    const appComponentList = (
      componentsRaw as unknown as { app_component_list: Record<string, unknown>[] }
    ).app_component_list;
    for (const comp of appComponentList ?? []) {
      result[String(comp.name)] = Number(comp.version);
    }
    return result;
  }

  protected override async negotiate(): Promise<void> {
    const initialQuery = {
      getDeviceInfo: { device_info: { name: ["basic_info", "info"] } },
      getAppComponentList: { app_component: { name: "app_component_list" } },
      getConnectionType: { network: { get_connection_type: {} } },
    };
    const resp = await this.protocolRef.query(initialQuery);
    Object.assign(this.lastUpdate, resp);
    this.updateInternalInfo(resp);

    const componentsRaw = (resp.getAppComponentList as { app_component: ComponentsRaw })
      .app_component;
    this.componentsRaw = componentsRaw;
    this.componentsMap = SmartCamDevice.parseComponents(componentsRaw);

    if ("childControl" in this.componentsMap && this.children.length === 0) {
      await this.initializeChildren();
    }
  }

  override get isOn(): boolean {
    const camera = this.modules.get(SmartCamModules.Camera);
    if (camera && !camera.disabled) return camera.isOn;
    return true;
  }

  override async setState(on: boolean): Promise<Record<string, unknown>> {
    const camera = this.modules.get(SmartCamModules.Camera);
    if (camera && !camera.disabled) return camera.setState(on);
    return {};
  }

  override get deviceType(): DeviceType {
    if (
      this.deviceTypeValue === DeviceType.Unknown &&
      Object.keys(this.info).length > 0
    ) {
      this.deviceTypeValue = SmartCamDevice.getDeviceTypeFromSysinfo(this.info);
    }
    return this.deviceTypeValue;
  }

  override get alias(): string | undefined {
    return this.info.alias as string | undefined;
  }

  override async setAlias(alias: string): Promise<Record<string, unknown>> {
    return this.protocolRef.query({
      setDeviceAlias: { system: { sys: { dev_alias: alias } } },
    });
  }

  override get hwInfo(): Record<string, unknown> {
    return {
      sw_ver: this.info.fw_ver,
      hw_ver: this.info.hw_ver,
      mac: this.info.mac,
      type: this.info.type,
      hwId: this.info.hwId,
      dev_name: this.alias,
      oemId: this.info.oem_id,
    };
  }

  override get rssi(): number | undefined {
    const deviceModule = this.modules.get(SmartCamModules.SmartCamDeviceModule);
    return deviceModule?.rssi;
  }

  override async wifiScan(): Promise<WifiNetwork[]> {
    const resp = await this.queryHelper("scanApList", { onboarding: { scan: {} } });
    const scanApList = resp.scanApList as {
      onboarding: { scan: Record<string, unknown> };
    };
    const scanData = scanApList.onboarding.scan;
    this.publicKeyB64 = (scanData.publicKey as string | undefined) ?? "";
    const apList = scanData.ap_list as Record<string, unknown>[];
    this.networks = apList.map((res) => ({
      ssid: res.ssid as string,
      auth: res.auth as number,
      encryption: res.encryption as number,
      rssi: res.rssi as number,
      bssid: res.bssid as string,
    }));
    return this.networks;
  }

  override async wifiJoin(
    ssid: string,
    password: string,
    _keytype = "wpa2_psk",
  ): Promise<Record<string, unknown>> {
    if (!this.credentials)
      throw new AuthenticationError("Device requires authentication.");

    if (this.networks.length === 0) await this.wifiScan();
    const net = this.networks.find((n) => n.ssid === ssid);
    if (!net) throw new DeviceError(`Network with SSID '${ssid}' not found.`);

    const publicKeyB64 = this.publicKeyB64 || STATIC_PUBLIC_KEY_B64;
    const keyBytes = Buffer.from(publicKeyB64, "base64");
    const publicKeyPem = derToPem(keyBytes, "PUBLIC KEY");
    const encrypted = publicEncrypt(
      { key: publicKeyPem, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(password, "utf-8"),
    );
    const encryptedPassword = encrypted.toString("base64");

    const payload = {
      onboarding: {
        connect: {
          auth: net.auth,
          bssid: net.bssid,
          encryption: net.encryption,
          password: encryptedPassword,
          rssi: net.rssi,
          ssid: net.ssid,
        },
      },
    };

    try {
      return await this.protocolRef.query({ connectAp: payload });
    } catch (ex) {
      if (ex instanceof KasaException) return {};
      throw ex;
    }
  }
}

function derToPem(der: Buffer, label: string): string {
  const base64 = der.toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
