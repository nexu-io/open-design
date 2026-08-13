import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "./cache.js";
import type { ToolPackConfig } from "./config.js";
import { hashText } from "./lib/hash.js";
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

export const SHELL_BUILD_EPOCH = 2 as const;

export type ToolPackShellBuildIdentity = Readonly<{
  buildDigest: `sha256:${string}`;
  capabilityDigest: `sha256:${string}`;
  carrierDigest: `sha256:${string}`;
  depsDigest: `sha256:${string}`;
  sourceDigest: `sha256:${string}`;
}>;

type ShellBuildPackage = Readonly<{
  directory: string;
  name: string;
  requiredDistPaths?: readonly string[];
  sourcePaths?: readonly string[];
}>;

const STANDALONE_NATIVE_DEPENDENCIES = [
  "better-sqlite3",
  "blake3-wasm",
  "node-pty",
] as const;

// The Shell carries this baseline as a resource, not as Shell policy. Its
// complete source closure must still invalidate the signed Shell bytes when it
// changes; otherwise the workspace cache could materialize an older baseline.
const STANDALONE_BOOTSTRAP_PACKAGES = [
  { directory: "packages/closure", name: "@open-design/closure" },
] as const;

const STANDALONE_CAPABILITY_SOURCE_PATHS = [
  "apps/standalone/package.json",
  "apps/standalone/src/bootloader.ts",
  "apps/standalone/src/bootstrap-entry.ts",
  "apps/standalone/src/launcher-bootstrap.ts",
  "apps/standalone/src/process-bridge.ts",
  "apps/standalone/src/protocol",
  "shells/electron/src/desktop-capability-adapter.ts",
  "shells/electron/src/shell-capabilities.ts",
  "shells/electron/src/standalone-bootstrap.ts",
  "shells/electron/src/standalone-commands.ts",
  "shells/electron/src/standalone-handoff.ts",
  "shells/electron/src/standalone-launcher-entry.ts",
  "shells/electron/src/standalone-launcher.ts",
  "tools/pack/src/closure/components.ts",
  "tools/pack/src/closure/distribution.ts",
  "tools/pack/src/shell-build-plan.ts",
  "tools/pack/src/standalone-seed.ts",
] as const;

const STANDALONE_CARRIER_SOURCE_PATHS = [
  ".node-version",
  "apps/standalone/src/bootstrap-entry.ts",
  "apps/standalone/src/fossil-bootloader.ts",
  "apps/standalone/src/generation-bootloader.ts",
  "apps/standalone/src/launcher.ts",
  "apps/standalone/src/native-loader.ts",
  "packages/closure/src/store",
  "packages/closure/src/update",
  "packages/shell/src/update",
  "tools/pack/src/closure/components.ts",
  "tools/pack/src/closure/platform.ts",
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

async function readPackageManager(workspaceRoot: string): Promise<unknown> {
  const rootPackageJson = JSON.parse(await readFile(join(workspaceRoot, "package.json"), "utf8")) as {
    packageManager?: unknown;
  };
  return rootPackageJson.packageManager;
}

async function digestSourcePaths(
  workspaceRoot: string,
  paths: readonly string[],
): Promise<`sha256:${string}`> {
  const entries = await Promise.all(paths.map(async (sourcePath) => [
    sourcePath,
    await hashPath(join(workspaceRoot, sourcePath)),
  ] as const));
  return `sha256:${hashJson(Object.fromEntries(entries))}`;
}

export async function resolveStandaloneCapabilityDigest(
  workspaceRoot: string,
): Promise<`sha256:${string}`> {
  return await digestSourcePaths(workspaceRoot, STANDALONE_CAPABILITY_SOURCE_PATHS);
}

export async function resolveStandaloneCarrierDigest(
  config: Pick<ToolPackConfig, "platform" | "workspaceRoot">,
): Promise<`sha256:${string}`> {
  return await digestSourcePaths(config.workspaceRoot, [
    ...STANDALONE_CARRIER_SOURCE_PATHS,
    `tools/pack/src/${config.platform}/payload.ts`,
    `tools/pack/src/${config.platform}/paths.ts`,
  ]);
}

async function hashShellBuildPackageSource(
  workspaceRoot: string,
  packageInfo: ShellBuildPackage,
): Promise<string> {
  const packageRoot = join(workspaceRoot, packageInfo.directory);
  if (packageInfo.sourcePaths == null) return await hashPackageSourcePath(packageRoot);

  const hashes = await Promise.all(packageInfo.sourcePaths.map(async (sourcePath) => [
    sourcePath,
    await hashPath(join(packageRoot, sourcePath)),
  ] as const));
  return hashText(JSON.stringify(Object.fromEntries(hashes)));
}

export async function resolveShellSourceDigest(config: ToolPackConfig): Promise<`sha256:${string}`> {
  const definition = toolPackShellDefinition(config.shell);
  const packageHashes: Record<string, string> = {};
  for (const packageInfo of definition.buildPackages) {
    packageHashes[packageInfo.name] = await hashShellBuildPackageSource(config.workspaceRoot, packageInfo);
  }
  for (const packageInfo of STANDALONE_BOOTSTRAP_PACKAGES) {
    packageHashes[packageInfo.name] = await hashPackageSourcePath(join(config.workspaceRoot, packageInfo.directory));
  }
  const toolsPackRoot = join(config.workspaceRoot, "tools/pack");
  packageHashes["@open-design/tools-pack/common"] = await hashPackageSourcePath(toolsPackRoot, {
    ignoredRelativePaths: ["resources/mac", "resources/win", "src/mac", "src/win"],
  });
  packageHashes[`@open-design/tools-pack/${config.platform}`] = await hashPackageSourcePath(toolsPackRoot, {
    ignoredRelativePaths: config.platform === "mac"
      ? ["resources/win", "src/win"]
      : ["resources/mac", "src/mac"],
  });
  const standaloneBootstrapSources = await Promise.all([
    "apps/standalone/src/bootstrap.ts",
    "apps/standalone/src/bootstrap-entry.ts",
    "apps/standalone/src/fossil-bootloader.ts",
  ].map(async (path) => [path, await hashPath(join(config.workspaceRoot, path))] as const));
  return `sha256:${hashJson({
    buildCommand: definition.buildCommand,
    packageHashes,
    standaloneBootstrapSources: Object.fromEntries(standaloneBootstrapSources),
    schemaVersion: 15,
    shell: config.shell,
  })}`;
}

export async function resolveShellDepsDigestFromWorkspace(input: Readonly<{
  workspaceRoot: string;
}>): Promise<`sha256:${string}`> {
  const pinnedNodeVersion = (await readFile(join(input.workspaceRoot, ".node-version"), "utf8")).trim();
  if (pinnedNodeVersion !== "24.18.0") {
    throw new Error(`Shell carrier requires .node-version 24.18.0; got ${pinnedNodeVersion || "empty"}`);
  }
  if (process.versions.node !== pinnedNodeVersion) {
    throw new Error(`Shell carrier requires Node ${pinnedNodeVersion}; running ${process.versions.node}`);
  }
  const daemonManifest = JSON.parse(
    await readFile(join(input.workspaceRoot, "apps/daemon/package.json"), "utf8"),
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
    nativeDependencies,
    node: { modules, napi, version: nodeVersion },
    packageManager: await readPackageManager(input.workspaceRoot),
    pnpmLock: await hashPath(join(input.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 1,
  })}`;
}

export async function resolveShellDepsDigest(config: ToolPackConfig): Promise<`sha256:${string}`> {
  return await resolveShellDepsDigestFromWorkspace({
    workspaceRoot: config.workspaceRoot,
  });
}

export async function resolveShellBuildIdentity(config: ToolPackConfig): Promise<ToolPackShellBuildIdentity> {
  const [sourceDigest, depsDigest, capabilityDigest, carrierDigest] = await Promise.all([
    resolveShellSourceDigest(config),
    resolveShellDepsDigest(config),
    resolveStandaloneCapabilityDigest(config.workspaceRoot),
    resolveStandaloneCarrierDigest(config),
  ]);
  return Object.freeze({
    buildDigest: `sha256:${hashJson({
      buildEpoch: SHELL_BUILD_EPOCH,
      capabilityDigest,
      carrierDigest,
      depsDigest,
      electronVersion: config.electronVersion,
      shell: config.shell,
      sourceDigest,
    })}`,
    capabilityDigest,
    carrierDigest,
    depsDigest,
    sourceDigest,
  });
}

function workspaceBuildOutputFiles(): string[] {
  return [...toolPackShellDefinition("electron").buildPackages.flatMap((entry: ShellBuildPackage) => entry.directory === "shells/electron"
    ? [
        `${entry.directory}/dist/index.mjs`,
        `${entry.directory}/dist/index.d.ts`,
        `${entry.directory}/dist/main/preload.cjs`,
      ]
    : (entry.requiredDistPaths ?? [
        "index.mjs",
        "index.d.ts",
      ]).map((output) => `${entry.directory}/dist/${output}`)),
    "apps/standalone/dist/bootstrap/bootloader.mjs",
    "apps/standalone/dist/bootstrap/baseline/launcher.mjs",
  ];
}

function workspaceBuildArtifacts(): WorkspaceBuildArtifact[] {
  const outputFiles = workspaceBuildOutputFiles();
  return [...toolPackShellDefinition("electron").buildPackages.map((entry) => {
    const workspacePath = `${entry.directory}/dist`;
    return {
      cachePath: join("outputs", ...workspacePath.split("/")),
      requiredPathGroups: outputFiles
        .filter((output) => output.startsWith(`${workspacePath}/`))
        .map((output) => [relative(workspacePath, output)]),
      workspacePath,
    };
  }), {
    cachePath: join("outputs", "apps", "standalone", "dist", "bootstrap"),
    requiredPathGroups: [["bootloader.mjs"], ["baseline", "launcher.mjs"]],
    workspacePath: "apps/standalone/dist/bootstrap",
  }];
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
