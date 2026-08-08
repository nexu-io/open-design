import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "./cache.js";
import type { ToolPackConfig } from "./config.js";
import { hashPackageSourcePath } from "./package-source-hash.js";
import { readRuntimeShellVersion, versionFamilyForShellVersion } from "./versions.js";

/** The dependency closure selected by `pnpm --filter @open-design/shell-electron...`. */
const SHELL_BUILD_PACKAGES = [
  { directory: "packages/release", name: "@open-design/release" },
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/launcher-proto", name: "@open-design/launcher-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "packages/download", name: "@open-design/download" },
  { directory: "packages/host", name: "@open-design/host" },
  { directory: "packages/diagnostics", name: "@open-design/diagnostics" },
  { directory: "packages/standalone-runtime", name: "@open-design/standalone-runtime" },
  { directory: "packages/standalone-proto", name: "@open-design/standalone-proto" },
  { directory: "packages/closure-proto", name: "@open-design/closure-proto" },
  { directory: "packages/closure-store", name: "@open-design/closure-store" },
  { directory: "packages/closure-update", name: "@open-design/closure-update" },
  { directory: "shells/electron", name: "@open-design/shell-electron" },
] as const;

const SHELL_BUILD_COMMAND = ["--filter", "@open-design/shell-electron...", "build"] as const;

type WorkspaceBuildMetadata = {
  builtAt: string;
  outputFiles: string[];
};

type WorkspaceBuildArtifact = {
  cachePath: string;
  requiredPathGroups: string[][];
  workspacePath: string;
};

async function resolveWorkspaceBuildVersionFamily(config: ToolPackConfig): Promise<string | null> {
  if (config.platform !== "win") return null;
  const releaseVersion = await readRuntimeShellVersion(config).catch(() => null);
  return releaseVersion == null ? null : versionFamilyForShellVersion(releaseVersion);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readPackageManager(workspaceRoot: string): Promise<unknown> {
  const rootPackageJson = JSON.parse(await readFile(join(workspaceRoot, "package.json"), "utf8")) as {
    packageManager?: unknown;
  };
  return rootPackageJson.packageManager;
}

export async function resolveShellSourceDigest(config: ToolPackConfig): Promise<`sha256:${string}`> {
  const packageHashes: Record<string, string> = {};
  for (const packageInfo of SHELL_BUILD_PACKAGES) {
    packageHashes[packageInfo.name] = await hashPackageSourcePath(join(config.workspaceRoot, packageInfo.directory));
  }
  return `sha256:${hashJson({
    buildCommand: SHELL_BUILD_COMMAND,
    node: `${config.platform}.workspace-build`,
    nodeVersion: process.version,
    packageHashes,
    packageManager: await readPackageManager(config.workspaceRoot),
    platform: config.platform,
    pnpmLock: await hashPath(join(config.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 11,
    shell: config.shell,
  })}`;
}

function workspaceBuildOutputFiles(): string[] {
  return SHELL_BUILD_PACKAGES.flatMap((entry) => entry.directory === "shells/electron"
    ? [
        `${entry.directory}/dist/index.mjs`,
        `${entry.directory}/dist/index.d.ts`,
        `${entry.directory}/dist/main/preload.cjs`,
      ]
    : [
        `${entry.directory}/dist/index.mjs`,
        `${entry.directory}/dist/index.d.ts`,
      ]);
}

function workspaceBuildArtifacts(): WorkspaceBuildArtifact[] {
  const outputFiles = workspaceBuildOutputFiles();
  return SHELL_BUILD_PACKAGES.map((entry) => {
    const workspacePath = `${entry.directory}/dist`;
    return {
      cachePath: join("outputs", ...workspacePath.split("/")),
      requiredPathGroups: outputFiles
        .filter((output) => output.startsWith(`${workspacePath}/`))
        .map((output) => [relative(workspacePath, output)]),
      workspacePath,
    };
  });
}

async function copyWorkspaceBuildArtifactsToCache(config: ToolPackConfig, entryRoot: string): Promise<void> {
  for (const artifact of workspaceBuildArtifacts()) {
    const targetPath = join(entryRoot, artifact.cachePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(join(config.workspaceRoot, artifact.workspacePath), targetPath, {
      dereference: true,
      recursive: true,
    });
  }
}

async function missingWorkspaceBuildOutput(config: ToolPackConfig): Promise<string | null> {
  for (const output of workspaceBuildOutputFiles()) {
    if (!(await pathExists(join(config.workspaceRoot, output)))) return output;
  }
  return null;
}

export async function ensureWorkspaceBuildArtifacts(
  config: ToolPackConfig,
  cache: ToolPackCache,
  build: () => Promise<void>,
): Promise<`sha256:${string}`> {
  const key = await resolveShellSourceDigest(config);
  const nodeId = `${config.platform}.workspace-build`;
  const artifacts = workspaceBuildArtifacts();
  const versionFamily = await resolveWorkspaceBuildVersionFamily(config);
  const versionFamilyAlias = versionFamily == null
    ? null
    : hashJson({
        node: nodeId,
        nodeVersion: process.version,
        platform: config.platform,
        schemaVersion: 2,
        scope: "version-family",
        versionFamily,
      });
  const materialize = artifacts.map((artifact) => ({
    from: artifact.cachePath,
    reuse: true,
    reuseRequiredPaths: artifact.requiredPathGroups,
    to: join(config.workspaceRoot, artifact.workspacePath),
  }));
  await cache.acquire<WorkspaceBuildMetadata>({
    aliases: versionFamilyAlias == null ? [] : [versionFamilyAlias],
    materialize,
    node: {
      id: nodeId,
      key,
      outputs: ["stamp.json", ...artifacts.map((artifact) => artifact.cachePath)],
      invalidate: async () => null,
      build: async ({ entryRoot }) => {
        await build();
        const missingOutput = await missingWorkspaceBuildOutput(config);
        if (missingOutput != null) {
          throw new Error(`workspace build completed but output is missing: ${missingOutput}`);
        }
        await copyWorkspaceBuildArtifactsToCache(config, entryRoot);
        const outputFiles = workspaceBuildOutputFiles();
        await writeFile(
          join(entryRoot, "stamp.json"),
          `${JSON.stringify({
            builtAt: new Date().toISOString(),
            keyHash: hashText(key),
            outputFiles,
            shell: config.shell,
          }, null, 2)}\n`,
          "utf8",
        );
        return { builtAt: new Date().toISOString(), outputFiles };
      },
    },
    seedFrom: versionFamilyAlias == null ? [] : [{ aliasKey: versionFamilyAlias, materialize }],
  });
  return key;
}
