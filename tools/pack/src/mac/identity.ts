import { SIDECAR_DEFAULTS } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";

export type MacInstallIdentity = {
  appId: string;
  executableName: string;
  productName: string;
  publicAppBundleName: string;
  systemAppBundleName: string;
};

function isChannelNamespace(namespace: string, channel: "beta" | "preview"): boolean {
  return new RegExp(`(^|[-_.])${channel}($|[-_.])`, "i").test(namespace);
}

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveMacInstallIdentity(config: Pick<ToolPackConfig, "namespace">): MacInstallIdentity {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const channelIdentity = isChannelNamespace(config.namespace, "beta")
    ? { appId: "io.open-design.desktop.beta", productName: `${PRODUCT_NAME} Beta` }
    : isChannelNamespace(config.namespace, "preview")
      ? { appId: "io.open-design.desktop.preview", productName: `${PRODUCT_NAME} Preview` }
      : { appId: "io.open-design.desktop", productName: PRODUCT_NAME };
  const publicAppBundleName = `${channelIdentity.productName}.app`;
  const systemAppBundleName = (
    config.namespace === SIDECAR_DEFAULTS.namespace ||
    isChannelNamespace(config.namespace, "beta") ||
    isChannelNamespace(config.namespace, "preview")
  )
    ? publicAppBundleName
    : `${PRODUCT_NAME}.${namespaceToken}.app`;

  return {
    ...channelIdentity,
    executableName: channelIdentity.productName,
    publicAppBundleName,
    systemAppBundleName,
  };
}
