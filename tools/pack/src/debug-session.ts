import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  PACKAGED_LAUNCH_CONTEXT_FILE,
  beginPackagedLaunchContext,
  markPackagedLaunchContextRelaunchable,
  restorePackagedLaunchContext,
  type PackagedLaunchContext,
} from "@open-design/shell/launch-context";
import {
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  releaseInstallIdentity,
  type ReleaseChannel,
} from "@open-design/release";
import { OPEN_DESIGN_PRODUCT_NAME, SIDECAR_DEFAULTS } from "@open-design/sidecar/protocol";

import type { ToolPackConfig } from "./config.js";

function releaseChannel(config: ToolPackConfig): ReleaseChannel | null {
  return releaseChannelFromVersion(config.releaseVersion)
    ?? releaseChannelFromNamespace(config.namespace, SIDECAR_DEFAULTS.namespace);
}

export function resolveToolPackProductUserDataRoot(config: ToolPackConfig): string {
  if (config.debugProductUserDataRoot != null) return config.debugProductUserDataRoot;
  const channel = releaseChannel(config);
  if (channel == null) throw new Error("a local runtime does not use a release-profile launch context");
  const productName = releaseInstallIdentity(channel).productName;
  if (config.platform === "mac") {
    return join(homedir(), "Library", "Application Support", productName);
  }
  const appDataRoot = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  // The reusable Windows Electron Shell deliberately keeps the executable's
  // productName channel-neutral. Electron therefore resolves userData below
  // `%APPDATA%/Open Design` before it can read the channel-specific packaged
  // config. The launch-context producer must use that same bootstrap root;
  // channel/namespace isolation begins inside the claimed transaction target.
  return join(appDataRoot, OPEN_DESIGN_PRODUCT_NAME);
}

export function resolveToolPackLaunchContextPath(config: ToolPackConfig): string {
  return join(resolveToolPackProductUserDataRoot(config), PACKAGED_LAUNCH_CONTEXT_FILE);
}

export async function beginToolPackDebugSession(config: ToolPackConfig): Promise<PackagedLaunchContext | null> {
  const channel = releaseChannel(config);
  if (channel == null) return null;
  if (config.debugChannel !== channel) {
    const expected = channel === "stable" || channel === "prerelease" ? channel : `exact:${channel}`;
    throw new Error(
      `starting the ${channel} product identity requires explicit --debug-channel ${expected}; default local debugging never mutates a release profile`,
    );
  }
  await mkdir(config.roots.runtime.namespaceBaseRoot, { recursive: true });
  return await beginPackagedLaunchContext({
    path: resolveToolPackLaunchContextPath(config),
    target: {
      namespace: config.namespace,
      namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot,
    },
  });
}

export async function restoreToolPackDebugSession(
  config: ToolPackConfig,
  sessionId?: string,
): Promise<boolean> {
  if (releaseChannel(config) == null) return false;
  return await restorePackagedLaunchContext({
    path: resolveToolPackLaunchContextPath(config),
    ...(sessionId == null ? {} : { sessionId }),
  });
}

export async function parkToolPackDebugSession(config: ToolPackConfig): Promise<boolean> {
  if (releaseChannel(config) == null) return false;
  return await markPackagedLaunchContextRelaunchable({
    path: resolveToolPackLaunchContextPath(config),
  });
}
