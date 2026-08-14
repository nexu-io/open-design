import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReleaseChannel } from "@open-design/release";

import { hashJson, hashPath } from "../cache.js";
import { hashPackageSourcePath } from "../package-source-hash.js";
import { resolveShellDepsDigestFromWorkspace } from "../workspace-build.js";
import type { ClosurePlatformTarget } from "./platform.js";

export const CLOSURE_BUILD_SOURCE_PATHS = [
  "apps/daemon", "apps/standalone", "apps/web",
  "packages/agui-adapter", "packages/components", "packages/contracts", "packages/diagnostics",
  "packages/host", "packages/platform", "packages/plugin-runtime", "packages/registry-protocol",
  "packages/release", "packages/sidecar",
  "tools/pack/package.json", "tools/pack/resources",
  "tools/pack/src/closure", "tools/pack/src/resources.ts",
  "assets/community-pets", "assets/frames", "craft", "data/plugin-previews",
  "design-systems", "design-templates", "plugins/_official", "plugins/registry",
  "prompt-templates", "skills",
] as const;

export async function createClosureBuildCacheKey(options: {
  artifactUrl: string;
  channel: ReleaseChannel;
  minShellVersion: string;
  platform: ClosurePlatformTarget;
  version: string;
  workspaceRoot: string;
}): Promise<string> {
  const sourceHashes: Record<string, string> = {};
  for (const sourcePath of CLOSURE_BUILD_SOURCE_PATHS) {
    sourceHashes[sourcePath] = await hashPackageSourcePath(join(options.workspaceRoot, sourcePath));
  }
  const rootPackage = JSON.parse(
    await readFile(join(options.workspaceRoot, "package.json"), "utf8"),
  ) as { packageManager?: unknown };
  const shellDepsDigest = await resolveShellDepsDigestFromWorkspace({
    workspaceRoot: options.workspaceRoot,
  });
  return hashJson({
    artifactUrl: options.artifactUrl,
    channel: options.channel,
    minShellVersion: options.minShellVersion,
    nodeVersion: process.version,
    packageManager: rootPackage.packageManager,
    platform: options.platform,
    pnpmLock: await hashPath(join(options.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 3,
    shellDepsDigest,
    sourceHashes,
    version: options.version,
  });
}
