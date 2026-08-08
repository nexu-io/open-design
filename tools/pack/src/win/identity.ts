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
import { requireBrandAppId } from "../brand.js";
import { PRODUCT_NAME } from "./constants.js";

export type WinInstallIdentity = {
  appId: string;
  appPathsKey: string;
  displayName: string;
  exeName: string;
  productName: string;
  registryKey: string;
  shortcutName: string;
  uninstallerName: string;
};

/**
 * Product name stamped into win build-artifact filenames (setup exe, portable
 * zip, unpacked exe, payload, blockmap) and the electron-builder `artifactName`.
 * Mirrors `macArtifactProductName`: a branded build names its artifacts after
 * the brand; an unbranded build keeps the upstream PRODUCT_NAME so upstream
 * artifact naming is byte-for-byte unchanged. Centralized so builder.ts,
 * paths.ts, and custom-installer.ts cannot drift apart (a branded build's
 * produced setup.exe must match the path install/finalize expect).
 */
export function winArtifactProductName(config: Pick<ToolPackConfig, "brand">): string {
  return config.brand?.productName ?? PRODUCT_NAME;
}

const UNINSTALL_REGISTRY_PREFIX = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\";

export function resolveWinInstallIdentity(
  config: Pick<ToolPackConfig, "namespace" | "appVersion" | "brand">,
): WinInstallIdentity {
  const namespaceToken = resolveWindowsReleaseNamespaceToken(config.namespace);
  const channel = releaseChannelFromVersion(config.appVersion)
    ?? releaseChannelFromNamespace(config.namespace, SIDECAR_DEFAULTS.namespace);
  // A fork brand overlay is an app identity of its own — it takes precedence
  // over any channel derived from version/namespace, because a branded build
  // (e.g. xDesign) must never leak the upstream "Open Design <Channel>" name
  // even when it carries a channel-shaped version. A distinct appId and
  // registry key are mandatory: falling back to the upstream stable id/key
  // would collide with an Open Design install on the same machine (Windows
  // Add/Remove Programs overwrite + shared $APPDATA data root).
  const brand = config.brand;
  let appId: string;
  let productName: string;
  let displayName: string;
  let registryKey: string;
  if (brand != null) {
    appId = requireBrandAppId(brand);
    productName = brand.productName;
    displayName = brand.productName;
    registryKey = `${UNINSTALL_REGISTRY_PREFIX}${brand.productName}-${namespaceToken}`;
  } else {
    appId = "io.open-design.desktop";
    productName = PRODUCT_NAME;
    displayName = channel == null
      ? `${PRODUCT_NAME} ${namespaceToken}`
      : releaseInstallIdentity(channel).productName;
    registryKey = resolveWindowsUninstallRegistryKey(config.namespace);
  }

  return {
    appId,
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${displayName}.exe`,
    displayName,
    exeName: `${productName}.exe`,
    productName,
    registryKey,
    shortcutName: `${displayName}.lnk`,
    uninstallerName: `Uninstall ${displayName}.exe`,
  };
}
