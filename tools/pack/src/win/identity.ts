import {
  SIDECAR_DEFAULTS,
  resolveWindowsUninstallRegistryKey,
} from "@open-design/sidecar/protocol";
import {
  releaseInstallIdentity,
} from "@open-design/release";

import type { ToolPackConfig } from "../config.js";
import { resolveToolPackProductChannel } from "../local-runtime.js";
import { PRODUCT_NAME } from "./constants.js";

export type WinInstallIdentity = {
  appPathsKey: string;
  displayName: string;
  exeName: string;
  registryKey: string;
  shortcutName: string;
  uninstallerName: string;
};

export function resolveWinInstallIdentity(
  config: Pick<ToolPackConfig, "debugChannel" | "namespace" | "releaseVersion">,
): WinInstallIdentity {
  const channel = resolveToolPackProductChannel(config, SIDECAR_DEFAULTS.namespace);
  if (channel === "local") {
    const displayName = `${PRODUCT_NAME} Local`;
    return {
      appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${displayName}.exe`,
      displayName,
      exeName: `${PRODUCT_NAME}.exe`,
      registryKey: resolveWindowsUninstallRegistryKey(config.namespace),
      shortcutName: `${displayName}.lnk`,
      uninstallerName: `Uninstall ${displayName}.exe`,
    };
  }
  const displayName = releaseInstallIdentity(channel).productName;

  return {
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${displayName}.exe`,
    displayName,
    exeName: `${PRODUCT_NAME}.exe`,
    registryKey: resolveWindowsUninstallRegistryKey(config.namespace),
    shortcutName: `${displayName}.lnk`,
    uninstallerName: `Uninstall ${displayName}.exe`,
  };
}
