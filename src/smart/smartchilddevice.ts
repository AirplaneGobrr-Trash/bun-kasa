import type { DeviceInfo } from "../core/device.ts";
import { DeviceType } from "../core/device_type.ts";
import { ChildProtocolWrapper, type SmartProtocol } from "../protocols/smartprotocol.ts";
import type { ComponentsRaw } from "./smartdevice.ts";
import { SmartDevice } from "./smartdevice.ts";
import type { SmartModule } from "./smartmodule.ts";

/** Presentation of a SMART child device, wrapping the parent's protocol/connection. */
export class SmartChildDevice extends SmartDevice {
  static readonly CHILD_DEVICE_TYPE_MAP: Record<string, DeviceType> = {
    "plug.powerstrip.sub-plug": DeviceType.Plug,
    "plug.powerstrip.sub-bulb": DeviceType.Bulb,
    "subg.plugswitch.switch": DeviceType.WallSwitch,
    "subg.trigger.contact-sensor": DeviceType.Sensor,
    "subg.trigger.temp-hmdt-sensor": DeviceType.Sensor,
    "subg.trigger.water-leak-sensor": DeviceType.Sensor,
    "subg.trigger.motion-sensor": DeviceType.Sensor,
    "kasa.switch.outlet.sub-fan": DeviceType.Fan,
    "kasa.switch.outlet.sub-dimmer": DeviceType.Dimmer,
    "subg.trv": DeviceType.Thermostat,
    "subg.trigger.button": DeviceType.Sensor,
  };

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
    this.componentsMap = SmartChildDevice.parseComponents(componentInfoRaw);
  }

  override get deviceInfo(): DeviceInfo {
    return this.getDeviceInfo(
      { get_device_info: this.info, component_nego: this.componentsRaw },
      undefined,
    );
  }

  /**
   * Update this child's module info.
   *
   * The parent already updates our internal sysinfo, so this just re-queries each
   * module directly (there's no `get_sysinfo`-style initial call for children).
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
    protocol?: SmartProtocol,
  ): Promise<SmartDevice> {
    const childProtocol =
      protocol ??
      (new ChildProtocolWrapper(
        childInfo.device_id as string,
        parent.protocol as SmartProtocol,
      ) as unknown as SmartProtocol);
    const child = new SmartChildDevice(
      parent,
      childInfo,
      childComponentsRaw,
      childProtocol,
    );
    await child.initializeModules();
    return child;
  }

  override get deviceType(): DeviceType {
    if (this.deviceTypeValue !== DeviceType.Unknown) return this.deviceTypeValue;

    const category = this.sysInfo.category as string | undefined;
    if (this.sysInfo && category) {
      this.deviceTypeValue =
        SmartChildDevice.CHILD_DEVICE_TYPE_MAP[category] ?? DeviceType.Unknown;
    }
    return this.deviceTypeValue;
  }

  override toString(): string {
    if (!this.parentSmartDevice) return `<${this.deviceType}(child) without parent>`;
    if (Object.keys(this.parentSmartDevice.lastUpdate).length === 0) {
      return `<${this.deviceType}(child) of ${this.parentSmartDevice}>`;
    }
    return `<${this.deviceType} ${this.alias} (${this.model}) of ${this.parentSmartDevice}>`;
  }
}
