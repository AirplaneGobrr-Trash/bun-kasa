import type { DeviceInfo } from "../core/device.ts";
import { DeviceType } from "../core/device_type.ts";
import { ChildCameraProtocolWrapper } from "../protocols/smartcamprotocol.ts";
import type { SmartProtocol } from "../protocols/smartprotocol.ts";
import type { ComponentsRaw } from "../smart/smartdevice.ts";
import type { SmartDevice } from "../smart/smartdevice.ts";
import type { SmartModule } from "../smart/smartmodule.ts";
import { SmartCamDevice } from "./smartcamdevice.ts";

const CHILD_INFO_FROM_PARENT = "child_info_from_parent";

/**
 * Presentation of a SMARTCAM child device (e.g. a camera attached to a hub).
 *
 * Python's original multiply-inherits from `SmartChildDevice` and `SmartCamDevice`;
 * since TS classes support only single inheritance, this extends `SmartCamDevice`
 * directly and folds in the (small) amount of child-specific logic that
 * `SmartChildDevice` would otherwise have contributed.
 */
export class SmartCamChild extends SmartCamDevice {
  static readonly CHILD_DEVICE_TYPE_MAP: Record<string, DeviceType> = {
    camera: DeviceType.Camera,
  };

  private childInfoFromParent: Record<string, unknown> = {};

  private constructor(
    parent: SmartDevice,
    info: Record<string, unknown>,
    componentInfoRaw: ComponentsRaw,
    protocol: SmartProtocol,
  ) {
    super(parent.host, protocol);
    this.parentSmartDevice = parent;
    this.updateInternalState(info);
    this.componentsRaw = componentInfoRaw;
    this.componentsMap = SmartCamChild.parseComponentsForChild(componentInfoRaw);
  }

  private static parseComponentsForChild(
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

  override get deviceInfo(): DeviceInfo {
    return this.getDeviceInfo(
      { [CHILD_INFO_FROM_PARENT]: this.childInfoFromParent },
      undefined,
    );
  }

  protected override getDeviceInfo(
    info: Record<string, unknown>,
    discoveryInfo: Record<string, unknown> | undefined,
  ): DeviceInfo {
    const cifp = info[CHILD_INFO_FROM_PARENT] as Record<string, unknown> | undefined;
    if (!cifp) return super.getDeviceInfo(info, discoveryInfo);

    const model = cifp.device_model as string;
    const deviceType = SmartCamDevice.getDeviceTypeFromSysinfo(cifp);
    const fwVersionFull = cifp.sw_ver as string;
    const spaceIndex = fwVersionFull.indexOf(" ");
    const firmwareVersion =
      spaceIndex === -1 ? fwVersionFull : fwVersionFull.slice(0, spaceIndex);
    const firmwareBuild =
      spaceIndex === -1 ? undefined : fwVersionFull.slice(spaceIndex + 1);

    return {
      shortName: model,
      longName: model,
      brand: "tapo",
      deviceFamily: cifp.device_type as string,
      deviceType,
      hardwareVersion: cifp.hw_ver as string,
      firmwareVersion,
      firmwareBuild,
      requiresAuth: true,
      region: cifp.region as string | undefined,
    };
  }

  private static mapChildInfoFromParent(
    deviceInfo: Record<string, unknown>,
  ): Record<string, unknown> {
    const mappings: Record<string, string> = {
      device_model: "model",
      sw_ver: "fw_ver",
      hw_id: "hwId",
    };
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(deviceInfo)) {
      result[mappings[k] ?? k] = v;
    }
    return result;
  }

  override updateInternalState(info: Record<string, unknown>): void {
    // SMARTCAM children report info with different keys than their own
    // getDeviceInfo queries would; `info` maps the fields normalized across
    // both SMART and SMARTCAM devices.
    this.childInfoFromParent = info;
    this.info = SmartCamChild.mapChildInfoFromParent(info);
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

  /**
   * Update this child's module info.
   *
   * The parent already updates our internal sysinfo, so this just re-queries each
   * module directly.
   */
  override async update(_updateChildren = true): Promise<void> {
    const now = Date.now() / 1000;
    const moduleQueries: SmartModule[] = [];
    const req: Record<string, unknown> = {};

    for (const module of this.modules.values()) {
      if (module.disabled === false) {
        const modQuery = module.query();
        if (Object.keys(modQuery).length > 0 && module.shouldUpdate(now)) {
          moduleQueries.push(module);
          Object.assign(req, modQuery);
        }
      }
    }

    if (Object.keys(req).length > 0) {
      let resp: Record<string, unknown>;
      try {
        resp = await this.protocolRef.query(req);
      } catch (ex) {
        resp = await this.handleModularUpdateError(
          ex,
          Object.keys(this.lastUpdate).length === 0,
          req,
        );
      }
      this.lastUpdate = resp;
    }

    for (const module of this.modules.values()) {
      await this.handleModulePostUpdate(module, now, moduleQueries.includes(module));
    }

    if (this.featureMap.size === 0) {
      await this.initializeFeatures();
    }
  }

  static async create(
    parent: SmartDevice,
    childInfo: Record<string, unknown>,
    childComponentsRaw: ComponentsRaw,
  ): Promise<SmartCamChild> {
    const protocol = new ChildCameraProtocolWrapper(
      childInfo.device_id as string,
      parent.protocol as SmartProtocol,
    ) as unknown as SmartProtocol;
    const child = new SmartCamChild(parent, childInfo, childComponentsRaw, protocol);
    await child.initializeModules();
    return child;
  }
}
