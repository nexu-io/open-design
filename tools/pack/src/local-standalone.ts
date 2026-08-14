import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createClosureDistributionControl,
  resolveClosureDistributionTarget,
} from "@open-design/closure/protocol";

import type { ToolPackConfig } from "./config.js";
import {
  buildClosureDistributionShared,
  buildClosureDistributionTarget,
} from "./closure/index.js";
import { mergeClosureDistributionTargetContributions } from "./closure/distribution.js";
import { readRuntimeShellVersion } from "./versions.js";

export type LocalStandaloneSeedResult = Readonly<{
  manifestPath: string;
  seedRoot: string;
  target: string;
  version: string;
}>;

function localTarget(config: ToolPackConfig): string {
  if (config.platform === "win") return "win32-x64";
  if (process.arch === "arm64" || process.arch === "x64") return `darwin-${process.arch}`;
  throw new Error(`local Standalone is unsupported on macOS ${process.arch}`);
}

function localVersion(shellVersion: string): string {
  const match = /^(\d+\.\d+\.\d+)/u.exec(shellVersion);
  if (match?.[1] == null) throw new Error(`local Standalone cannot derive a version from Shell ${shellVersion}`);
  return `${match[1]}-local.${Date.now()}`;
}

async function existingPath(first: string, second: string): Promise<string> {
  if (await access(first).then(() => true, () => false)) return first;
  if (await access(second).then(() => true, () => false)) return second;
  throw new Error(`local Standalone blob is missing from both contribution roots: ${first}`);
}

/** Build and embed the current source Closure for the isolated local channel. */
export async function prepareLocalStandaloneSeed(
  config: ToolPackConfig,
): Promise<LocalStandaloneSeedResult | null> {
  if (
    config.debugChannel !== "local"
    || config.releaseVersion != null
    || config.standaloneSeedRoot != null
  ) {
    return null;
  }
  const shellVersion = await readRuntimeShellVersion(config);
  const version = localVersion(shellVersion);
  const target = localTarget(config);
  const buildRoot = join(config.roots.toolPackRoot, "local-standalone-build");
  const blobOrigin = "https://local.open-design.invalid/";
  const shared = await buildClosureDistributionShared({
    blobOrigin,
    channel: "local",
    dir: buildRoot,
    minShellVersion: shellVersion,
    version,
    workspaceRoot: config.workspaceRoot,
  });
  const native = await buildClosureDistributionTarget({
    blobOrigin,
    channel: "local",
    dir: buildRoot,
    platform: target,
    skipWorkspaceBuild: true,
    version,
    workspaceRoot: config.workspaceRoot,
  });
  const manifest = mergeClosureDistributionTargetContributions(
    shared.contribution,
    [native.contribution],
  );
  const seedRoot = join(config.roots.toolPackRoot, "local-standalone-seed", version);
  const channelRoot = join(seedRoot, "local");
  const blobsRoot = join(channelRoot, "blobs");
  const repositoryRoot = join(config.roots.toolPackRoot, "local-standalone-repository", version);
  const repositoryBlobsRoot = join(repositoryRoot, "local", "blobs");
  await mkdir(blobsRoot, { recursive: true });
  await mkdir(repositoryBlobsRoot, { recursive: true });
  const resolved = resolveClosureDistributionTarget(manifest, target);
  for (const artifact of resolved.requiredBlobs) {
    const name = artifact.digest.slice("sha256:".length);
    await copyFile(
      await existingPath(join(shared.blobRoot, name), join(native.blobRoot, name)),
      join(blobsRoot, name),
    );
  }
  for (const artifact of new Map(
    resolved.resources.map((resource) => [resource.artifact.digest, resource.artifact]),
  ).values()) {
    const name = artifact.digest.slice("sha256:".length);
    await copyFile(
      await existingPath(join(shared.blobRoot, name), join(native.blobRoot, name)),
      join(repositoryBlobsRoot, name),
    );
  }
  const manifestPath = join(channelRoot, "baseline.json");
  await writeFile(manifestPath, `${JSON.stringify({
    channel: "local",
    closure: manifest,
    closureControl: createClosureDistributionControl(manifest),
    releaseState: "complete",
    releaseVersion: version,
  }, null, 2)}\n`, "utf8");
  // Read back once so a truncated write cannot become a packaged authority.
  JSON.parse(await readFile(manifestPath, "utf8"));
  config.runtimeReleaseVersion = version;
  config.shellVersion = shellVersion;
  config.standaloneRepositorySeedRoot = repositoryRoot;
  config.standaloneSeedRoot = seedRoot;
  return Object.freeze({ manifestPath, seedRoot, target, version });
}
