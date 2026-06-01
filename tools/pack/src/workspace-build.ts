import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, readdir, readFile, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "./cache.js";
import type { ToolPackConfig } from "./config.js";
import { hashPackageSourcePath } from "./package-source-hash.js";

const WORKSPACE_BUILD_PACKAGES = [
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/registry-protocol", name: "@open-design/registry-protocol" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "packages/download", name: "@open-design/download" },
  { directory: "packages/host", name: "@open-design/host" },
  { directory: "packages/agui-adapter", name: "@open-design/agui-adapter" },
  { directory: "packages/plugin-runtime", name: "@open-design/plugin-runtime" },
  { directory: "packages/diagnostics", name: "@open-design/diagnostics" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

const BUILD_COMMANDS = [
  { args: ["--filter", "@open-design/contracts", "build"] },
  { args: ["--filter", "@open-design/registry-protocol", "build"] },
  { args: ["--filter", "@open-design/sidecar-proto", "build"] },
  { args: ["--filter", "@open-design/sidecar", "build"] },
  { args: ["--filter", "@open-design/platform", "build"] },
  { args: ["--filter", "@open-design/download", "build"] },
  { args: ["--filter", "@open-design/host", "build"] },
  { args: ["--filter", "@open-design/agui-adapter", "build"] },
  { args: ["--filter", "@open-design/plugin-runtime", "build"] },
  { args: ["--filter", "@open-design/diagnostics", "build"] },
  { args: ["--filter", "@open-design/daemon", "build"] },
  { args: ["--filter", "@open-design/web", "build"], env: ["OD_WEB_OUTPUT_MODE"] },
  { args: ["--filter", "@open-design/web", "build:sidecar"] },
  { args: ["--filter", "@open-design/desktop", "build"] },
  { args: ["--filter", "@open-design/packaged", "build"] },
] as const;

type WorkspaceBuildMetadata = {
  builtAt: string;
  outputFiles: string[];
};

type WorkspaceBuildArtifact = {
  cachePath: string;
  workspacePath: string;
};

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

async function createWorkspaceBuildCacheKey(config: ToolPackConfig): Promise<string> {
  const packageHashes: Record<string, string> = {};
  for (const packageInfo of WORKSPACE_BUILD_PACKAGES) {
    packageHashes[packageInfo.name] = await hashPackageSourcePath(join(config.workspaceRoot, packageInfo.directory));
  }
  const nodeId = `${config.platform}.workspace-build`;

  return hashJson({
    buildCommands: BUILD_COMMANDS,
    node: nodeId,
    nodeVersion: process.version,
    packageHashes,
    packageManager: await readPackageManager(config.workspaceRoot),
    platform: config.platform,
    pnpmLock: await hashPath(join(config.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 6,
    webOutputMode: config.webOutputMode,
  });
}

function workspaceBuildOutputFiles(config: ToolPackConfig): string[] {
  const webStandaloneServerCandidates = [
    "apps/web/.next/standalone/apps/web/server.js",
    "apps/web/.next/standalone/server.js",
  ];
  return [
    "packages/contracts/dist/index.mjs",
    "packages/contracts/dist/index.d.ts",
    "packages/registry-protocol/dist/index.mjs",
    "packages/registry-protocol/dist/index.d.ts",
    "packages/sidecar-proto/dist/index.mjs",
    "packages/sidecar-proto/dist/index.d.ts",
    "packages/sidecar/dist/index.mjs",
    "packages/sidecar/dist/index.d.ts",
    "packages/platform/dist/index.mjs",
    "packages/platform/dist/index.d.ts",
    "packages/download/dist/index.mjs",
    "packages/download/dist/index.d.ts",
    "packages/host/dist/index.mjs",
    "packages/host/dist/index.d.ts",
    "packages/agui-adapter/dist/index.mjs",
    "packages/agui-adapter/dist/index.d.ts",
    "packages/plugin-runtime/dist/index.mjs",
    "packages/plugin-runtime/dist/index.d.ts",
    "packages/diagnostics/dist/index.mjs",
    "packages/diagnostics/dist/index.d.ts",
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

function workspaceBuildArtifacts(config: ToolPackConfig): WorkspaceBuildArtifact[] {
  const artifacts = [
    "packages/contracts/dist",
    "packages/registry-protocol/dist",
    "packages/sidecar-proto/dist",
    "packages/sidecar/dist",
    "packages/platform/dist",
    "packages/download/dist",
    "packages/host/dist",
    "packages/agui-adapter/dist",
    "packages/plugin-runtime/dist",
    "packages/diagnostics/dist",
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
  return artifacts.map((workspacePath) => ({
    cachePath: join("outputs", ...workspacePath.split("/")),
    workspacePath,
  }));
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
const WEB_STANDALONE_APP_NODE_MODULES = "apps/web/node_modules";
// Peer deps the web-standalone after-pack audit looks up through
// `createRequire(server.js).resolve(<pkg>/package.json)`. Next 16
// standalone build under pnpm workspaces does not hoist them into
// `<standalone>/apps/web/node_modules`, so the require walk falls out
// of the standalone tree and the audit aborts the packaged build.
const STANDALONE_HOISTED_PEER_DEPS = ["react", "react-dom", "styled-jsx"];

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
    const relativeTarget = relative(dirname(linkPath), target);
    // Idempotent re-run: drop any pre-existing entry (stale symlink
    // from a previous build with different react/react-dom versions)
    // before recreating, so repeated invocations don't EEXIST.
    if (existing) await unlink(linkPath).catch(() => undefined);
    await symlink(relativeTarget, linkPath);
  }
}

async function copyWorkspaceBuildArtifactsToCache(config: ToolPackConfig, entryRoot: string): Promise<void> {
  for (const artifact of workspaceBuildArtifacts(config)) {
    const sourcePath = join(config.workspaceRoot, artifact.workspacePath);
    // Strip dangling symlinks first: that clears any leftover from a
    // previous build whose target moved (e.g. a renamed `.pnpm/<pkg>@<ver>`
    // after a dependency bump), so the subsequent hoist step starts
    // from a clean slot and can safely (re-)create its symlinks.
    await stripBrokenSymlinks(sourcePath);
    if (artifact.workspacePath === WEB_STANDALONE_ARTIFACT) {
      await hoistStandaloneNextPeerDeps(sourcePath);
    }
    const targetPath = join(entryRoot, artifact.cachePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { dereference: true, recursive: true });
  }
}

async function missingWorkspaceBuildOutput(config: ToolPackConfig): Promise<string | null> {
  for (const output of workspaceBuildOutputFiles(config)) {
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

export async function ensureWorkspaceBuildArtifacts(
  config: ToolPackConfig,
  cache: ToolPackCache,
  build: () => Promise<void>,
): Promise<void> {
  const key = await createWorkspaceBuildCacheKey(config);
  const nodeId = `${config.platform}.workspace-build`;
  const artifacts = workspaceBuildArtifacts(config);
  await cache.acquire<WorkspaceBuildMetadata>({
    materialize: artifacts.map((artifact) => ({
      from: artifact.cachePath,
      to: join(config.workspaceRoot, artifact.workspacePath),
    })),
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
  });
}
