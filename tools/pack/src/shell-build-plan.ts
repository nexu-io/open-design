import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { SIDECAR_DEFAULTS } from "@open-design/sidecar/protocol";

import type { ToolPackConfig } from "./config.js";
import { hashJson } from "./cache.js";
import { resolveToolPackProductChannel, type ToolPackProductChannel } from "./local-runtime.js";
import { resolveMacPaths } from "./mac/paths.js";
import { resolveWinPaths } from "./win/paths.js";
import { readRuntimeShellVersion } from "./versions.js";
import { resolveShellBuildIdentity } from "./workspace-build.js";
import { inspectStandaloneSeed } from "./standalone-seed.js";
import { resolvePackagedUpdateEnabled } from "./local-runtime.js";
import { resolveWinSigningCacheKey } from "./win/sign.js";

type ShellSigningIdentity = Readonly<{
  certificateDigest?: `sha256:${string}`;
  certificateSha1?: string;
  digestAlgorithm?: string;
  enabled: boolean;
  mode?: ToolPackConfig["signMode"];
  teamId?: string;
  timestampAlgorithm?: string;
  timestampUrl?: string;
}>;

export type ToolPackShellBuildProfile = Readonly<{
  amrProfile: string | null;
  channel: ToolPackProductChannel;
  electronVersion: string;
  macCompression: string | null;
  namespace: string;
  portable: boolean;
  posthogHost: string | null;
  posthogKey: string | null;
  schemaVersion: 1;
  signing: ShellSigningIdentity;
  standaloneSeedDigest: `sha256:${string}` | null;
  telemetryRelayUrl: string | null;
  to: ToolPackConfig["to"];
  updateEnabled: boolean | null;
  updateMetadataUrl: string | null;
  velaWebUrl: string | null;
  webOutputMode: ToolPackConfig["webOutputMode"];
}>;

export type ToolPackShellBuildPlan = Readonly<{
  artifacts: Readonly<Record<string, string | null>>;
  outputRoot: string;
  profile: ToolPackShellBuildProfile;
  profileDigest: `sha256:${string}`;
  releaseVersion: string | null;
  runtimeNamespaceRoot: string;
  schemaVersion: 4;
  shell: Readonly<{
    buildDigest: `sha256:${string}`;
    capabilityDigest: `sha256:${string}`;
    carrierDigest: `sha256:${string}`;
    depsDigest: `sha256:${string}`;
    sourceDigest: `sha256:${string}`;
    type: ToolPackConfig["shell"];
    version: string;
  }>;
  target: "darwin-arm64" | "darwin-x64" | "win32-x64";
  to: ToolPackConfig["to"];
}>;

async function resolveMacSigningIdentity(config: ToolPackConfig): Promise<ShellSigningIdentity> {
  if (config.signMode === "unsigned") return { enabled: false };
  const encoded = process.env.APPLE_SIGNING_CERTIFICATE_BASE64?.replace(/\s+/gu, "");
  const certificate = encoded == null || encoded.length === 0
    ? await readFile(process.env.CSC_LINK ?? "").catch(() => null)
    : Buffer.from(encoded, "base64");
  if (certificate == null || certificate.byteLength === 0) {
    throw new Error("signed macOS Shell identity requires APPLE_SIGNING_CERTIFICATE_BASE64 or CSC_LINK");
  }
  return {
    certificateDigest: `sha256:${createHash("sha256").update(certificate).digest("hex")}`,
    enabled: true,
    mode: config.signMode,
    teamId: process.env.APPLE_TEAM_ID ?? "",
  };
}

async function resolveSigningIdentity(config: ToolPackConfig): Promise<ShellSigningIdentity> {
  if (config.platform === "mac") return await resolveMacSigningIdentity(config);
  const signing = resolveWinSigningCacheKey(config);
  return signing.enabled ? { ...signing, mode: config.signMode } : signing;
}

export async function resolveToolPackShellBuildPlan(config: ToolPackConfig): Promise<ToolPackShellBuildPlan> {
  const standaloneSeedDigest = (await inspectStandaloneSeed(config))?.digest ?? null;
  const shell = {
    ...await resolveShellBuildIdentity(config),
    type: config.shell,
    version: await readRuntimeShellVersion(config),
  } as const;
  const profile = Object.freeze({
    amrProfile: config.amrProfile ?? null,
    // Channel and namespace are independent Shell identity inputs. Keep both
    // explicit even for stable: release-version/namespace inference is a
    // validation convenience, not an artifact-identity boundary.
    channel: resolveToolPackProductChannel(config, SIDECAR_DEFAULTS.namespace),
    electronVersion: config.electronVersion,
    macCompression: config.platform === "mac" ? config.macCompression : null,
    namespace: config.namespace,
    portable: config.portable,
    posthogHost: config.posthogHost ?? null,
    posthogKey: config.posthogKey ?? null,
    schemaVersion: 1 as const,
    signing: await resolveSigningIdentity(config),
    standaloneSeedDigest,
    telemetryRelayUrl: config.telemetryRelayUrl ?? null,
    to: config.to,
    updateMetadataUrl: config.updateMetadataUrl ?? null,
    updateEnabled: resolvePackagedUpdateEnabled(config) ?? null,
    velaWebUrl: config.velaWebUrl ?? null,
    webOutputMode: config.webOutputMode,
  }) satisfies ToolPackShellBuildProfile;
  const profileDigest = `sha256:${hashJson(profile)}` as const;
  if (config.platform === "mac") {
    const paths = resolveMacPaths(config);
    return Object.freeze({
      artifacts: Object.freeze({
        app: paths.appPath,
        dmg: config.to === "dmg" || config.to === "all" ? paths.dmgPath : null,
        payload: config.to === "app" ? null : paths.payloadZipPath,
        zip: config.to === "zip" || config.to === "all" ? paths.zipPath : null,
      }),
      outputRoot: config.roots.output.namespaceRoot,
      profile,
      profileDigest,
      releaseVersion: config.releaseVersion ?? null,
      runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
      schemaVersion: 4,
      shell,
      target: process.arch === "arm64" ? "darwin-arm64" : "darwin-x64",
      to: config.to,
    });
  }

  const paths = resolveWinPaths(config);
  return Object.freeze({
    artifacts: Object.freeze({
      installer: config.to === "nsis" || config.to === "all" ? paths.setupPath : null,
      payload: config.to === "dir" ? null : paths.launcherPayloadPath,
      portableZip: config.to === "zip" || config.to === "all" ? paths.setupZipPath : null,
      unpacked: paths.unpackedRoot,
    }),
    outputRoot: config.roots.output.namespaceRoot,
    profile,
    profileDigest,
    releaseVersion: config.releaseVersion ?? null,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    schemaVersion: 4,
    shell,
    target: "win32-x64",
    to: config.to,
  });
}
