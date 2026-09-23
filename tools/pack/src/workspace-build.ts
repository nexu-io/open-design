import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "./cache/index.js";
import type { ToolPackConfig } from "./config/index.js";
import { hashPackageSourcePath } from "./package-source-hash.js";
import { readRuntimeAppVersion, versionFamilyForAppVersion } from "./versioning/index.js";
import { processWebSourcemaps } from "./web-sourcemaps.js";

import {
  WORKSPACE_BUILD_COMMANDS, WORKSPACE_BUILD_COMMANDS_BY_UNIT, WORKSPACE_BUILD_PACKAGES,
  WORKSPACE_BUILD_UNITS, parseWorkspaceBuildUnit, workspaceUnitPackages, type WorkspaceBuildUnit,
} from "./workspace/units.js";
export { WORKSPACE_BUILD_COMMANDS, WORKSPACE_BUILD_PACKAGES } from "./workspace/units.js";

export const WORKSPACE_BUILD_CACHE_SCHEMA_VERSION = 13;

/**
 * V8 old-space ceiling (MB) for the packaged closure build, the stage that runs
 * `next build` for apps/web. Next type-checks apps/web in-process against the
 * app tsconfig (src and tests alike), and since the Home entry refresh (#8208)
 * that pass needs more than Node's 2 GB default: on GitHub's macos-14 and
 * macos-15-intel runners it dies deterministically with "JavaScript heap out of
 * memory" during "Running TypeScript". 4 GB fits the 7 GB runners. The ceiling
 * changes how much memory the build may use, never what it emits, so it is not
 * a cache-key determinant and does not bump the schema version.
 */
export const WORKSPACE_BUILD_MAX_OLD_SPACE_MB = 4096;

/**
 * NODE_OPTIONS handed to the closure build: our heap ceiling first, then whatever
 * the caller already had, so a caller's own `--max-old-space-size` still wins
 * (Node honours the last occurrence).
 */
export function workspaceBuildNodeOptions(inherited: string | undefined): string {
  return [`--max-old-space-size=${WORKSPACE_BUILD_MAX_OLD_SPACE_MB}`, inherited?.trim()]
    .filter((part) => part)
    .join(" ");
}

export type WorkspaceBuildCacheKeyInputs = {
  buildCommands: unknown;
  node: string;
  nodeVersion: string;
  packageHashes: Readonly<Record<string, string>>;
  packageManager: unknown;
  platform: ToolPackConfig["platform"];
  pnpmLock: string;
  pnpmWorkspace: string;
  schemaVersion: number;
  webOutputMode: ToolPackConfig["webOutputMode"];
};

export function createWorkspaceBuildCacheKeyFromInputs(inputs: WorkspaceBuildCacheKeyInputs): string {
  return hashJson(inputs);
}

export type WorkspaceBuildRunner = (
  args: string[],
  extraEnv?: NodeJS.ProcessEnv,
) => Promise<void>;

export type WorkspaceBuildConfig = Pick<ToolPackConfig, "workspaceRoot" | "webOutputMode">;

export type WorkspaceBuildMaterializer = (config: ToolPackConfig) => Promise<void>;

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
  const appVersion = await readRuntimeAppVersion(config).catch(() => null);
  return appVersion == null ? null : versionFamilyForAppVersion(appVersion);
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

export async function createWorkspaceBuildCacheKey(config: ToolPackConfig): Promise<string> {
  const packageHashes: Record<string, string> = {};
  for (const packageInfo of WORKSPACE_BUILD_PACKAGES) {
    packageHashes[packageInfo.name] = await hashPackageSourcePath(join(config.workspaceRoot, packageInfo.directory));
  }
  const nodeId = `${config.platform}.workspace-build`;

  return createWorkspaceBuildCacheKeyFromInputs({
    buildCommands: WORKSPACE_BUILD_COMMANDS,
    node: nodeId,
    nodeVersion: process.version,
    packageHashes,
    packageManager: await readPackageManager(config.workspaceRoot),
    platform: config.platform,
    pnpmLock: await hashPath(join(config.workspaceRoot, "pnpm-lock.yaml")),
    pnpmWorkspace: await hashPath(join(config.workspaceRoot, "pnpm-workspace.yaml")),
    schemaVersion: WORKSPACE_BUILD_CACHE_SCHEMA_VERSION,
    webOutputMode: config.webOutputMode,
  });
}

/**
 * Local full build uses the same independently executable units as workflows.
 * pnpm orders the public-package group; callers of one unit supply its already
 * built dependencies. Executors never infer workflow skip/cache decisions.
 */
export async function runWorkspaceBuild(
  config: WorkspaceBuildConfig,
  runPnpm: WorkspaceBuildRunner,
): Promise<void> {
  for (const unit of WORKSPACE_BUILD_UNITS) await runWorkspaceBuildUnit(config, unit, runPnpm);
}

export async function runWorkspaceBuildUnit(
  config: WorkspaceBuildConfig,
  unit: WorkspaceBuildUnit,
  runPnpm: WorkspaceBuildRunner,
): Promise<void> {
  parseWorkspaceBuildUnit(unit);
  const execute = async () => {
    for (const command of WORKSPACE_BUILD_COMMANDS_BY_UNIT[unit]) {
      await runPnpm([...command.args], command.env?.includes("OD_WEB_OUTPUT_MODE")
        ? {
            NODE_OPTIONS: workspaceBuildNodeOptions(process.env.NODE_OPTIONS),
            OD_WEB_OUTPUT_MODE: config.webOutputMode,
          }
        : undefined);
    }
  };
  if (unit !== "web") return await execute();
  // Only Web owns Next's generated source declaration. Other units may run
  // concurrently and must never restore/delete a file in Web's output boundary.
  const webNextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousWebNextEnv = await readFile(webNextEnvPath, "utf8").catch(() => null);
  try {
    await execute();
    if (config.webOutputMode === "standalone") {
      const standaloneRoot = join(config.workspaceRoot, WEB_STANDALONE_ARTIFACT);
      await stripBrokenSymlinks(standaloneRoot);
      await hoistStandaloneNextPeerDeps(standaloneRoot);
    }
  } finally {
    if (previousWebNextEnv == null) await rm(webNextEnvPath, { force: true });
    else await writeFile(webNextEnvPath, previousWebNextEnv, "utf8");
  }
}

function workspaceBuildOutputFiles(config: WorkspaceBuildConfig): string[] {
  const webStandaloneServerCandidates = [
    "apps/web/.next/standalone/apps/web/server.js",
    "apps/web/.next/standalone/server.js",
  ];
  return [
    "packages/components/dist/index.mjs",
    "packages/components/dist/index.d.ts",
    "packages/release/dist/index.mjs",
    "packages/release/dist/index.d.ts",
    "packages/contracts/dist/index.mjs",
    "packages/contracts/dist/index.d.ts",
    "packages/registry-protocol/dist/index.mjs",
    "packages/registry-protocol/dist/index.d.ts",
    "packages/sidecar-proto/dist/index.mjs",
    "packages/sidecar-proto/dist/index.d.ts",
    "packages/launcher-proto/dist/index.mjs",
    "packages/launcher-proto/dist/index.d.ts",
    "packages/platform/dist/index.mjs",
    "packages/platform/dist/index.d.ts",
    "packages/sidecar/dist/index.mjs",
    "packages/sidecar/dist/supervisor.mjs",
    "packages/sidecar/dist/index.d.ts",
    "packages/download/dist/index.mjs",
    "packages/download/dist/index.d.ts",
    "packages/standalone/dist/index.mjs",
    "packages/standalone/dist/index.d.ts",
    "packages/host/dist/index.mjs",
    "packages/host/dist/index.d.ts",
    "packages/agui-adapter/dist/index.mjs",
    "packages/agui-adapter/dist/index.d.ts",
    "packages/plugin-runtime/dist/index.mjs",
    "packages/plugin-runtime/dist/index.d.ts",
    "packages/diagnostics/dist/index.mjs",
    "packages/diagnostics/dist/index.d.ts",
    "packages/dsh-runtime/dist/index.js",
    "packages/dsh-runtime/dist/types/index.d.ts",
    "apps/daemon/dist/cli.js",
    "apps/daemon/dist/cli.d.ts",
    "apps/daemon/dist/sidecar/index.js",
    "apps/web/dist/sidecar/index.js",
    "apps/web/dist/sidecar/index.d.ts",
    ...(config.webOutputMode === "standalone" ? [webStandaloneServerCandidates.join("|")] : ["apps/web/.next/BUILD_ID"]),
    "apps/desktop/dist/main/index.js",
    "apps/desktop/dist/main/index.d.ts",
    "apps/packaged/dist/index.mjs",
    "apps/packaged/dist/index.d.ts",
  ];
}

function workspaceBuildArtifacts(config: WorkspaceBuildConfig): WorkspaceBuildArtifact[] {
  const artifacts = [
    "packages/components/dist",
    "packages/release/dist",
    "packages/contracts/dist",
    "packages/registry-protocol/dist",
    "packages/sidecar-proto/dist",
    "packages/launcher-proto/dist",
    "packages/platform/dist",
    "packages/sidecar/dist",
    "packages/download/dist",
    "packages/standalone/dist",
    "packages/host/dist",
    "packages/agui-adapter/dist",
    "packages/plugin-runtime/dist",
    "packages/diagnostics/dist",
    "packages/dsh-runtime/dist",
    "apps/daemon/dist",
    "apps/web/dist",
    "apps/desktop/dist",
    "apps/packaged/dist",
  ];
  if (config.webOutputMode === "standalone") {
    artifacts.push("apps/web/.next/standalone", "apps/web/.next/static");
  } else {
    artifacts.push("apps/web/.next/BUILD_ID");
  }
  const outputFiles = workspaceBuildOutputFiles(config);
  return artifacts.map((workspacePath) => {
    const requiredPathGroups = outputFiles.flatMap((output) => {
      const candidates = output.split("|")
        .filter((candidate) => candidate === workspacePath || candidate.startsWith(`${workspacePath}/`))
        .map((candidate) => relative(workspacePath, candidate));
      return candidates.length === 0 ? [] : [candidates];
    });
    return {
      cachePath: join("outputs", ...workspacePath.split("/")),
      requiredPathGroups,
      workspacePath,
    };
  });
}

async function stripBrokenSymlinks(rootPath: string): Promise<void> {
  // Recursively walk `rootPath` and delete symlinks whose target does
  // not resolve. Next standalone's nft trace occasionally leaves
  // dangling entries (e.g. .next/standalone/node_modules/.pnpm/node_modules/<pkg>
  // pointing at a `.pnpm/<pkg>@<version>` directory pnpm never created
  // because the runtime resolution picked a different version). The
  // `cp { dereference: true }` call below would `stat()` through these
  // links and abort the whole packaged pipeline with ENOENT.
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const childPath = join(rootPath, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        await stat(childPath);
      } catch {
        await unlink(childPath).catch(() => undefined);
      }
    } else if (entry.isDirectory()) {
      await stripBrokenSymlinks(childPath);
    }
  }
}

const WEB_STANDALONE_ARTIFACT = "apps/web/.next/standalone";
const WEB_STATIC_ARTIFACT = "apps/web/.next/static";
const WEB_STANDALONE_APP_NODE_MODULES = "apps/web/node_modules";
// Peer deps the web-standalone after-pack audit looks up through
// `createRequire(server.js).resolve(<pkg>/package.json)`. Next 16
// standalone build under pnpm workspaces does not hoist them into
// `<standalone>/apps/web/node_modules`, so the require walk falls out
// of the standalone tree and the audit aborts the packaged build.
const STANDALONE_HOISTED_PEER_DEPS = ["react", "react-dom", "styled-jsx"];

async function symlinkDirectoryForWorkspaceBuild(target: string, linkPath: string): Promise<void> {
  if (process.platform === "win32") {
    await symlink(target, linkPath, "junction");
    return;
  }
  await symlink(relative(dirname(linkPath), target), linkPath, "dir");
}

async function hoistStandaloneNextPeerDeps(standaloneRoot: string): Promise<void> {
  const appNodeModules = join(standaloneRoot, WEB_STANDALONE_APP_NODE_MODULES);
  const pnpmRoot = join(standaloneRoot, "node_modules", ".pnpm");
  let pnpmEntries: string[];
  try {
    pnpmEntries = await readdir(pnpmRoot);
  } catch {
    return;
  }
  await mkdir(appNodeModules, { recursive: true });
  for (const pkg of STANDALONE_HOISTED_PEER_DEPS) {
    const linkPath = join(appNodeModules, pkg);
    // `lstat` does not follow symlinks: this lets us distinguish a
    // stale dangling link (which `access`/`pathExists` would falsely
    // report as missing, and then `symlink()` would later reject with
    // EEXIST) from a fresh slot. If Next genuinely hoisted a real
    // directory, leave it alone.
    const existing = await lstat(linkPath).catch(() => null);
    if (existing && existing.isDirectory() && !existing.isSymbolicLink()) continue;
    // pnpm dirs look like `react@18.3.1` or
    // `react-dom@18.3.1_react@18.3.1` — pick the bare version, not a
    // peer-resolved sibling. The leading `${pkg}@` requirement
    // distinguishes `react` from `react-dom`.
    const match = pnpmEntries.find((entry) => entry.startsWith(`${pkg}@`));
    if (!match) continue;
    const target = join(pnpmRoot, match, "node_modules", pkg);
    if (!(await pathExists(target))) continue;
    // Idempotent re-run: drop any pre-existing entry (stale symlink
    // from a previous build with different react/react-dom versions)
    // before recreating, so repeated invocations don't EEXIST.
    if (existing) await unlink(linkPath).catch(() => undefined);
    await symlinkDirectoryForWorkspaceBuild(target, linkPath);
  }
}

async function copyWorkspaceBuildArtifactsToCache(config: ToolPackConfig, entryRoot: string): Promise<void> {
  for (const artifact of workspaceBuildArtifacts(config)) {
    const sourcePath = join(config.workspaceRoot, artifact.workspacePath);
    // Cache copies must not dereference stale dangling links. Standalone peer
    // normalization belongs to the Web producer, not this storage operation.
    await stripBrokenSymlinks(sourcePath);
    const targetPath = join(entryRoot, artifact.cachePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { dereference: true, recursive: true });
  }
}

async function missingWorkspaceBuildOutput(config: WorkspaceBuildConfig, unit?: WorkspaceBuildUnit): Promise<string | null> {
  for (const output of workspaceBuildOutputFiles(config)) {
    if (unit && !workspaceUnitPackages(unit).some(({ directory }) => output.startsWith(`${directory}/`))) continue;
    const candidates = output.split("|");
    const exists = await Promise.any(
      candidates.map(async (candidate) => {
        if (!(await pathExists(join(config.workspaceRoot, candidate)))) throw new Error(candidate);
        return true;
      }),
    ).catch(() => false);
    if (!exists) return output;
  }
  return null;
}

export async function workspaceBuildUnitResult(config: WorkspaceBuildConfig, unit: WorkspaceBuildUnit) {
  parseWorkspaceBuildUnit(unit);
  const missing = await missingWorkspaceBuildOutput(config, unit);
  if (missing) throw new Error(`workspace ${unit} completed but output is missing: ${missing}`);
  const outputPaths = workspaceBuildArtifacts(config)
    .filter(({ workspacePath }) => workspaceUnitPackages(unit).some(({ directory }) => workspacePath.startsWith(`${directory}/`)))
    .map(({ workspacePath }) => workspacePath);
  for (const output of outputPaths) {
    if (!(await pathExists(join(config.workspaceRoot, output)))) {
      throw new Error(`workspace ${unit} completed but output is missing: ${output}`);
    }
  }
  // These units emit JavaScript and declarations only. Native runtime
  // dependencies are installed/materialized by the consumer, never archived
  // with dist. Next standalone is intentionally NOT part of this contract.
  if (unit !== "web") {
    return { schemaVersion: 2, unit, kind: "javascript" as const, outputPaths };
  }
  return {
    schemaVersion: 1,
    unit,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    webOutputMode: config.webOutputMode,
    outputPaths,
  };
}

export async function ensureWorkspaceBuildArtifacts(
  config: ToolPackConfig,
  cache: ToolPackCache,
  runPnpm: WorkspaceBuildRunner,
  materializeWebSourcemaps: WorkspaceBuildMaterializer = processWebSourcemaps,
): Promise<string> {
  const key = await createWorkspaceBuildCacheKey(config);
  const nodeId = `${config.platform}.workspace-build`;
  const artifacts = workspaceBuildArtifacts(config);
  const versionFamily = await resolveWorkspaceBuildVersionFamily(config);
  const versionFamilyAlias = versionFamily == null
    ? null
    : hashJson({
        node: nodeId,
        nodeVersion: process.version,
        platform: config.platform,
        schemaVersion: 1,
        scope: "version-family",
        versionFamily,
        webOutputMode: config.webOutputMode,
      });
  const materialize = artifacts.map((artifact) => ({
    from: artifact.cachePath,
    // Sourcemap processing removes maps from the workspace copy. Restore the
    // pristine cached static tree before every materialization-time pass.
    reuse: artifact.workspacePath !== WEB_STATIC_ARTIFACT,
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
        await runWorkspaceBuild(config, runPnpm);
        const missingOutput = await missingWorkspaceBuildOutput(config);
        if (missingOutput != null) {
          throw new Error(`workspace build completed but output is missing: ${missingOutput}`);
        }
        await copyWorkspaceBuildArtifactsToCache(config, entryRoot);
        const outputFiles = workspaceBuildOutputFiles(config);
        await mkdir(entryRoot, { recursive: true });
        await writeFile(
          join(entryRoot, "stamp.json"),
          `${JSON.stringify(
            {
              builtAt: new Date().toISOString(),
              keyHash: hashText(key),
              outputFiles,
              webOutputMode: config.webOutputMode,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
        return { builtAt: new Date().toISOString(), outputFiles };
      },
    },
    seedFrom: versionFamilyAlias == null ? [] : [{ aliasKey: versionFamilyAlias, materialize }],
  });
  // Sourcemap injection/upload depends on release credentials and appVersion,
  // and upload is a materialization side effect. Keep pristine JS/map pairs in
  // the internal cache, then process the materialized copy on every hit/miss.
  await materializeWebSourcemaps(config);
  return key;
}
