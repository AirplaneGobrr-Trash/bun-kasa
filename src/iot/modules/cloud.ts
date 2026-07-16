import { Feature, FeatureCategory, FeatureType } from "../../core/feature.ts";
import { IotModule } from "../iotmodule.ts";

/** Cloud connectivity information. */
export interface CloudInfo {
  provisioned: number;
  cloudConnected: number;
  firmwareDownloadPage: string;
  firmwareNotifyType: number;
  illegalType: number;
  server: string;
  stopConnect: number;
  tcspInfo: string;
  tcspStatus: number;
  username: string;
}

function parseCloudInfo(raw: Record<string, unknown>): CloudInfo {
  return {
    provisioned: raw.binded as number,
    cloudConnected: raw.cld_connection as number,
    firmwareDownloadPage: raw.fwDlPage as string,
    firmwareNotifyType: raw.fwNotifyType as number,
    illegalType: raw.illegalType as number,
    server: raw.server as string,
    stopConnect: raw.stopConnect as number,
    tcspInfo: raw.tcspInfo as string,
    tcspStatus: raw.tcspStatus as number,
    username: raw.username as string,
  };
}

/** Module implementing support for cloud services. */
export class Cloud extends IotModule {
  override initializeFeatures(): void {
    this.addFeature(
      new Feature(this.device, {
        container: this,
        id: "cloud_connection",
        name: "Cloud connection",
        icon: "mdi:cloud",
        attributeGetter: "isConnected",
        type: FeatureType.BinarySensor,
        category: FeatureCategory.Info,
      }),
    );
  }

  get isConnected(): boolean {
    return Boolean(this.info.cloudConnected);
  }

  override query(): Record<string, unknown> {
    return this.queryForCommand("get_info");
  }

  get info(): CloudInfo {
    return parseCloudInfo(this.data.get_info as Record<string, unknown>);
  }

  getAvailableFirmwares(): Record<string, unknown> {
    return this.queryForCommand("get_intl_fw_list");
  }

  setServer(url: string): Record<string, unknown> {
    return this.queryForCommand("set_server_url", { server: url });
  }

  connect(username: string, password: string): Record<string, unknown> {
    return this.queryForCommand("bind", { username, password });
  }

  disconnect(): Record<string, unknown> {
    return this.queryForCommand("unbind");
  }
}
