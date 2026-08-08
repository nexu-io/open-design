import { SIDECAR_DEFAULTS } from "@open-design/sidecar-proto";
import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  releaseInstallIdentity,
} from "@open-design/release";

import type { ToolPackConfig } from "../config.js";
import { requireBrandAppId } from "../brand.js";
import { PRODUCT_NAME } from "./constants.js";

export type MacInstallIdentity = {
  appId: string;
  executableName: string;
  installerTitle: string;
  productName: string;
  publicAppBundleName: string;
  systemAppBundleName: string;
};

/**
 * Product name stamped into mac build-artifact filenames (dmg/zip/payload) and
 * the electron-builder `artifactName`. A branded build names its artifacts after
 * the brand; an unbranded build keeps the upstream PRODUCT_NAME so upstream
 * artifact naming is byte-for-byte unchanged. This is deliberately distinct from
 * the install-identity productName — that carries the channel suffix ("Open
 * Design Beta") for unbranded channel builds, while artifact filenames do not.
 * Centralized so builder.ts, artifacts.ts, and paths.ts cannot drift apart
 * (a branded build's produced dmg must match the path install/finalize expect).
 */
export function macArtifactProductName(config: Pick<ToolPackConfig, "brand">): string {
  return config.brand?.productName ?? PRODUCT_NAME;
}

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveMacInstallIdentity(
  config: Pick<ToolPackConfig, "namespace" | "appVersion" | "brand">,
): MacInstallIdentity {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const channel = releaseChannelFromVersion(config.appVersion)
    ?? releaseChannelFromNamespace(config.namespace, SIDECAR_DEFAULTS.namespace);
  // A fork brand overlay is an app identity of its own — it takes precedence
  // over any channel derived from version/namespace, because a branded build
  // (e.g. xDesign) must never leak the upstream "Open Design <Channel>" name
  // even when it carries a channel-shaped version. A distinct appId is
  // mandatory: falling back to the upstream stable id would collide with an
  // Open Design install on the same machine (macOS LaunchServices overwrite).
  const brand = config.brand;
  let channelIdentity: { appId: string; productName: string };
  let branded: boolean;
  if (brand != null) {
    channelIdentity = { appId: requireBrandAppId(brand), productName: brand.productName };
    branded = true;
  } else if (channel == null) {
    channelIdentity = { appId: "io.open-design.desktop", productName: PRODUCT_NAME };
    branded = false;
  } else {
    channelIdentity = releaseInstallIdentity(channel);
    branded = false;
  }
  const publicAppBundleName = `${channelIdentity.productName}.app`;
  // Branded and channel builds install under the stable public bundle name; only
  // unbranded local builds carry the namespace-suffixed bundle name.
  const systemAppBundleName = branded || channel != null
    ? publicAppBundleName
    : `${PRODUCT_NAME}.${namespaceToken}.app`;

  return {
    ...channelIdentity,
    executableName: channelIdentity.productName,
    installerTitle: branded || channel != null ? channelIdentity.productName : `${PRODUCT_NAME}-${namespaceToken}`,
    publicAppBundleName,
    systemAppBundleName,
  };
}
