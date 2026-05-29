import { SIDECAR_DEFAULTS } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";

export type MacInstallIdentity = {
  appId: string;
  executableName: string;
  installerTitle: string;
  productName: string;
  publicAppBundleName: string;
  systemAppBundleName: string;
};

type ReleaseChannelIdentity = "stable" | "beta" | "nightly" | "preview";

function isChannelNamespace(namespace: string, channel: ReleaseChannelIdentity): boolean {
  return new RegExp(`(^|[-_.])${channel}($|[-_.])`, "i").test(namespace);
}

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function channelFromVersion(version: string | null | undefined): ReleaseChannelIdentity | null {
  if (version == null || version.length === 0) return null;
  if (/(?:^|[-.])beta(?:[-.]|$)/i.test(version)) return "beta";
  if (/(?:^|[-.])preview(?:[-.]|$)/i.test(version)) return "preview";
  if (/(?:^|[-.])nightly(?:[-.]|$)/i.test(version)) return "nightly";
  return null;
}

function channelFromNamespace(namespace: string): ReleaseChannelIdentity | null {
  if (namespace === SIDECAR_DEFAULTS.namespace || isChannelNamespace(namespace, "stable")) return "stable";
  if (isChannelNamespace(namespace, "beta")) return "beta";
  if (isChannelNamespace(namespace, "nightly")) return "nightly";
  if (isChannelNamespace(namespace, "preview")) return "preview";
  return null;
}

function productNameForChannel(channel: ReleaseChannelIdentity): string {
  if (channel === "beta") return `${PRODUCT_NAME} Beta`;
  if (channel === "nightly") return `${PRODUCT_NAME} Nightly`;
  if (channel === "preview") return `${PRODUCT_NAME} Preview`;
  return PRODUCT_NAME;
}

function appIdForChannel(channel: ReleaseChannelIdentity): string {
  if (channel === "beta") return "io.open-design.desktop.beta";
  if (channel === "nightly") return "io.open-design.desktop.nightly";
  if (channel === "preview") return "io.open-design.desktop.preview";
  return "io.open-design.desktop";
}

export function resolveMacInstallIdentity(config: Pick<ToolPackConfig, "namespace" | "appVersion">): MacInstallIdentity {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const channel = channelFromVersion(config.appVersion) ?? channelFromNamespace(config.namespace);
  const channelIdentity = channel == null
    ? { appId: "io.open-design.desktop", productName: PRODUCT_NAME }
    : { appId: appIdForChannel(channel), productName: productNameForChannel(channel) };
  const publicAppBundleName = `${channelIdentity.productName}.app`;
  const systemAppBundleName = channel != null
    ? publicAppBundleName
    : `${PRODUCT_NAME}.${namespaceToken}.app`;

  return {
    ...channelIdentity,
    executableName: channelIdentity.productName,
    installerTitle: channel == null ? `${PRODUCT_NAME}-${namespaceToken}` : channelIdentity.productName,
    publicAppBundleName,
    systemAppBundleName,
  };
}
