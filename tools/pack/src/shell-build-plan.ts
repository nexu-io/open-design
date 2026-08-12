import type { ToolPackConfig } from "./config.js";
import { hashJson } from "./cache.js";
import { resolveMacPaths } from "./mac/paths.js";
import { resolveWinPaths } from "./win/paths.js";
import { readRuntimeShellVersion } from "./versions.js";
import { resolveShellBuildIdentity } from "./workspace-build.js";

export type ToolPackShellBuildPlan = Readonly<{
  artifacts: Readonly<Record<string, string | null>>;
  outputRoot: string;
  profileDigest: `sha256:${string}`;
  releaseVersion: string | null;
  runtimeNamespaceRoot: string;
  schemaVersion: 2;
  shell: Readonly<{
    buildDigest: `sha256:${string}`;
    depsDigest: `sha256:${string}`;
    sourceDigest: `sha256:${string}`;
    type: ToolPackConfig["shell"];
    version: string;
  }>;
  target: "darwin-arm64" | "darwin-x64" | "win32-x64";
  to: ToolPackConfig["to"];
}>;

export async function resolveToolPackShellBuildPlan(config: ToolPackConfig): Promise<ToolPackShellBuildPlan> {
  const shell = {
    ...await resolveShellBuildIdentity(config),
    type: config.shell,
    version: await readRuntimeShellVersion(config),
  } as const;
  const profileDigest = `sha256:${hashJson({
    amrProfile: config.amrProfile ?? null,
    macCompression: config.platform === "mac" ? config.macCompression : null,
    macNotarize: config.platform === "mac" ? config.macNotarize === true : null,
    namespace: config.namespace,
    portable: config.portable,
    posthogHost: config.posthogHost ?? null,
    posthogKey: config.posthogKey ?? null,
    schemaVersion: 1,
    signed: config.signed,
    telemetryRelayUrl: config.telemetryRelayUrl ?? null,
    updateMetadataUrl: config.updateMetadataUrl ?? null,
    velaWebUrl: config.velaWebUrl ?? null,
    webOutputMode: config.webOutputMode,
  })}` as const;
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
      profileDigest,
      releaseVersion: config.releaseVersion ?? null,
      runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
      schemaVersion: 2,
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
    profileDigest,
    releaseVersion: config.releaseVersion ?? null,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    schemaVersion: 2,
    shell,
    target: "win32-x64",
    to: config.to,
  });
}
