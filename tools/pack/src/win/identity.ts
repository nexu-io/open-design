import {
  SIDECAR_DEFAULTS,
  resolveWindowsReleaseNamespaceToken,
  resolveWindowsUninstallRegistryKey,
} from "@open-design/sidecar-proto";
import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  releaseInstallIdentity,
} from "@open-design/release";

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

export function resolveWinInstallIdentity(config: Pick<ToolPackConfig, "namespace" | "appVersion">): WinInstallIdentity {
  const namespaceToken = resolveWindowsReleaseNamespaceToken(config.namespace);
  const channel = releaseChannelFromVersion(config.appVersion)
    ?? releaseChannelFromNamespace(config.namespace, SIDECAR_DEFAULTS.namespace);
  const displayName = channel == null ? `${PRODUCT_NAME} ${namespaceToken}` : releaseInstallIdentity(channel).productName;

  return {
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${displayName}.exe`,
    displayName,
    exeName: `${PRODUCT_NAME}.exe`,
    registryKey: resolveWindowsUninstallRegistryKey(config.namespace),
    shortcutName: `${displayName}.lnk`,
    uninstallerName: `Uninstall ${displayName}.exe`,
  };
}
