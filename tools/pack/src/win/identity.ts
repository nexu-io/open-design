import { SIDECAR_DEFAULTS } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";

export type WinInstallIdentity = {
  appPathsKey: string;
  displayName: string;
  exeName: string;
  registryKey: string;
  shortcutName: string;
  uninstallerName: string;
};

type ReleaseChannelIdentity = "stable" | "beta" | "nightly" | "preview";

function isChannelNamespace(namespace: string, channel: ReleaseChannelIdentity): boolean {
  return namespace.toLowerCase() === `release-${channel}-win`;
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

function displayNameForChannel(channel: ReleaseChannelIdentity): string {
  if (channel === "beta") return `${PRODUCT_NAME} Beta`;
  if (channel === "nightly") return `${PRODUCT_NAME} Nightly`;
  if (channel === "preview") return `${PRODUCT_NAME} Preview`;
  return PRODUCT_NAME;
}

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveWinInstallIdentity(config: Pick<ToolPackConfig, "namespace" | "appVersion">): WinInstallIdentity {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const channel = channelFromVersion(config.appVersion) ?? channelFromNamespace(config.namespace);
  const displayName = channel == null ? `${PRODUCT_NAME} ${namespaceToken}` : displayNameForChannel(channel);

  return {
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${displayName}.exe`,
    displayName,
    exeName: `${PRODUCT_NAME}.exe`,
    registryKey: `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${PRODUCT_NAME}-${namespaceToken}`,
    shortcutName: `${displayName}.lnk`,
    uninstallerName: `Uninstall ${displayName}.exe`,
  };
}
