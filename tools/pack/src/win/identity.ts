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

function isBetaNamespace(namespace: string): boolean {
  return /(^|[-_.])beta($|[-_.])/i.test(namespace);
}

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveWinInstallIdentity(config: Pick<ToolPackConfig, "namespace">): WinInstallIdentity {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const displayName = isBetaNamespace(config.namespace)
    ? `${PRODUCT_NAME} Beta`
    : config.namespace === SIDECAR_DEFAULTS.namespace
      ? PRODUCT_NAME
      : `${PRODUCT_NAME} ${namespaceToken}`;

  return {
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${displayName}.exe`,
    displayName,
    exeName: `${PRODUCT_NAME}.exe`,
    registryKey: `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${PRODUCT_NAME}-${namespaceToken}`,
    shortcutName: `${displayName}.lnk`,
    uninstallerName: `Uninstall ${displayName}.exe`,
  };
}
