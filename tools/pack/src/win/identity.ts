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

import type { ToolPackConfig } from "../config/index.js";
import { PRODUCT_NAME } from "./constants.js";

export type WinInstallIdentity = {
  appPathsKey: string;
  displayName: string;
  exeName: string;
  installDirectoryName: string;
  legacyShortcutName: string;
  registryKey: string;
  shortcutName: string;
  uninstallerName: string;
};

export function resolveWinInstallIdentity(config: Pick<ToolPackConfig, "namespace" | "appVersion">): WinInstallIdentity {
  const namespaceToken = resolveWindowsReleaseNamespaceToken(config.namespace);
  const channel = releaseChannelFromVersion(config.appVersion)
    ?? releaseChannelFromNamespace(config.namespace, SIDECAR_DEFAULTS.namespace);
  const releaseIdentity = channel == null ? null : releaseInstallIdentity(channel);
  const productName = releaseIdentity?.productName ?? `${PRODUCT_NAME} ${namespaceToken}`;
  const displayName = releaseIdentity?.displayName ?? productName;

  return {
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${productName}.exe`,
    displayName,
    exeName: `${PRODUCT_NAME}.exe`,
    installDirectoryName: productName,
    legacyShortcutName: `${productName}.lnk`,
    registryKey: resolveWindowsUninstallRegistryKey(config.namespace),
    shortcutName: `${displayName}.lnk`,
    uninstallerName: `Uninstall ${productName}.exe`,
  };
}
