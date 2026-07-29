import { dirname, join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  type LauncherChannel,
  type LauncherPaths,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPaths,
} from "@open-design/launcher-proto";
import { SIDECAR_DEFAULTS } from "@open-design/sidecar-proto";

import type { ToolPackConfig, ToolPackPlatform } from "./config.js";

export type ToolPackLauncherLayout = {
  channel: LauncherChannel;
  paths: LauncherPaths;
  root: string;
};

export type ToolPackLauncherPayloadLayout = {
  archivePath: string;
  archiveRootName: string;
  channel: LauncherChannel;
  manifestPath: string;
  payloadRoot: string;
  version: string;
  versionRoot: string;
  versionPaths: LauncherVersionPaths;
};

function channelFromVersion(version: string | undefined): LauncherChannel | null {
  if (version == null || version.length === 0) return null;
  if (/(?:^|[-.])beta(?:[-.]|$)/i.test(version)) return "beta";
  if (/(?:^|[-.])preview(?:[-.]|$)/i.test(version)) return "preview";
  if (/(?:^|[-.])nightly(?:[-.]|$)/i.test(version)) return "nightly";
  return null;
}

function channelFromNamespace(namespace: string): LauncherChannel | null {
  const lower = namespace.toLowerCase();
  if (namespace === SIDECAR_DEFAULTS.namespace || /^release-stable(?:-|$)/.test(lower)) return "stable";
  if (/^release-beta(?:-|$)/.test(lower)) return "beta";
  if (/^release-preview(?:-|$)/.test(lower)) return "preview";
  if (/^release-nightly(?:-|$)/.test(lower)) return "nightly";
  return null;
}

export function resolveToolPackLauncherChannel(
  config: Pick<ToolPackConfig, "appVersion" | "namespace">,
): LauncherChannel {
  return channelFromVersion(config.appVersion) ?? channelFromNamespace(config.namespace) ?? "stable";
}

export function resolveToolPackLauncherRoot(
  config: Pick<ToolPackConfig, "roots">,
): string {
  return dirname(config.roots.runtime.namespaceBaseRoot);
}

export function resolveToolPackLauncherLayout(
  config: Pick<ToolPackConfig, "appVersion" | "namespace" | "roots">,
): ToolPackLauncherLayout {
  const root = resolveToolPackLauncherRoot(config);
  const channel = resolveToolPackLauncherChannel(config);
  return {
    channel,
    paths: resolveLauncherPaths({ channel, namespace: config.namespace, root }),
    root,
  };
}

function sanitizeArtifactSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function payloadArchiveExtension(platform: ToolPackPlatform): "7z" | "zip" {
  return platform === "win" ? "7z" : "zip";
}

export function resolveToolPackLauncherPayloadLayout(
  config: Pick<ToolPackConfig, "appVersion" | "namespace" | "platform" | "roots">,
  version: string,
): ToolPackLauncherPayloadLayout {
  const launcher = resolveToolPackLauncherLayout(config);
  const versionPaths = resolveLauncherVersionPaths({
    channel: launcher.channel,
    namespace: config.namespace,
    root: launcher.root,
    version,
  });
  const namespaceToken = sanitizeArtifactSegment(config.namespace);
  const archiveRootName = `payload-${sanitizeArtifactSegment(version)}`;
  const archivePath = join(
    config.roots.output.namespaceRoot,
    "payload",
    `Open Design-${namespaceToken}-payload.${payloadArchiveExtension(config.platform)}`,
  );
  return {
    archivePath,
    archiveRootName,
    channel: launcher.channel,
    manifestPath: versionPaths.manifestPath,
    payloadRoot: versionPaths.payloadRoot,
    version: versionPaths.version,
    versionRoot: versionPaths.versionRoot,
    versionPaths,
  };
}

export function buildInitialLauncherRuntimeDescriptor(
  config: Pick<ToolPackConfig, "appVersion" | "namespace" | "roots">,
  version: string,
): LauncherRuntimeDescriptor {
  const launcher = resolveToolPackLauncherLayout(config);
  const pointer = { generation: 0, version };
  return {
    active: pointer,
    channel: launcher.channel,
    lastSuccessful: pointer,
    namespace: config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  };
}
