import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "./cache.js";
import type { ToolPackConfig } from "./config.js";
import { hashPackageSourcePath } from "./package-source-hash.js";
import { toolPackShellDefinition } from "./shells.js";
import { readRuntimeShellVersion, versionFamilyForShellVersion } from "./versions.js";

type WorkspaceBuildMetadata = {
  builtAt: string;
  outputFiles: string[];
};

type WorkspaceBuildArtifact = {
  cachePath: string;
  requiredPathGroups: string[][];
  workspacePath: string;
};

export const SHELL_BUILD_EPOCH = 1 as const;

export type ToolPackShellBuildIdentity = Readonly<{
  buildDigest: `sha256:${string}`;
  depsDigest: `sha256:${string}`;
  sourceDigest: `sha256:${string}`;
}>;

const STANDALONE_NATIVE_DEPENDENCIES = [
  "better-sqlite3",
  "blake3-wasm",
  "node-pty",
] as const;

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
  const definition = toolPackShellDefinition(config.shell);
  const packageHashes: Record<string, string> = {};
  for (const packageInfo of definition.buildPackages) {
    packageHashes[packageInfo.name] = await hashPackageSourcePath(join(config.workspaceRoot, packageInfo.directory));
  }
  packageHashes["@open-design/tools-pack"] = await hashPackageSourcePath(join(config.workspaceRoot, "tools/pack"));
  return `sha256:${hashJson({
    buildCommand: definition.buildCommand,
    packageHashes,
    schemaVersion: 13,
    shell: config.shell,
  })}`;
}

export async function resolveShellDepsDigest(config: ToolPackConfig): Promise<`sha256:${string}`> {
  const daemonManifest = JSON.parse(
    await readFile(join(config.workspaceRoot, "apps/daemon/package.json"), "utf8"),
  ) as { dependencies?: Record<string, unknown> };
  const nativeDependencies = Object.fromEntries(STANDALONE_NATIVE_DEPENDENCIES.map((name) => {
    const version = daemonManifest.dependencies?.[name];
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
      throw new Error(`Shell dependency ${name} must use an exact version`);
    }
    return [name, version];
  }));
  const nodeVersion = process.versions.node;
  const modules = process.versions.modules;
  const napi = process.versions.napi;
  if (modules == null || napi == null) throw new Error("Shell Node ABI identity is unavailable");
  return `sha256:${hashJson({
    electron: { version: config.electronVersion },
    nativeDependencies,
    node: { modules, napi, version: nodeVersion },
    packageManager: await readPackageManager(config.workspaceRoot),
    pnpmLock: await hashPath(join(config.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 1,
  })}`;
}

export async function resolveShellBuildIdentity(config: ToolPackConfig): Promise<ToolPackShellBuildIdentity> {
  const [sourceDigest, depsDigest] = await Promise.all([
    resolveShellSourceDigest(config),
    resolveShellDepsDigest(config),
  ]);
  return Object.freeze({
    buildDigest: `sha256:${hashJson({
      buildEpoch: SHELL_BUILD_EPOCH,
      depsDigest,
      shell: config.shell,
      sourceDigest,
    })}`,
    depsDigest,
    sourceDigest,
  });
}

function workspaceBuildOutputFiles(): string[] {
  return toolPackShellDefinition("electron").buildPackages.flatMap((entry) => entry.directory === "shells/electron"
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
  return toolPackShellDefinition("electron").buildPackages.map((entry) => {
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
): Promise<ToolPackShellBuildIdentity> {
  const identity = await resolveShellBuildIdentity(config);
  const key = identity.buildDigest;
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
  return identity;
}
