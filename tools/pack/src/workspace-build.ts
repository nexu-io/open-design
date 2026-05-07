import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "./cache.js";
import type { ToolPackConfig } from "./config.js";
import { hashPackageSourcePath } from "./package-source-hash.js";

const WORKSPACE_BUILD_PACKAGES = [
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

const BUILD_COMMANDS = [
  { args: ["--filter", "@open-design/contracts", "build"] },
  { args: ["--filter", "@open-design/sidecar-proto", "build"] },
  { args: ["--filter", "@open-design/sidecar", "build"] },
  { args: ["--filter", "@open-design/platform", "build"] },
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

  return hashJson({
    buildCommands: BUILD_COMMANDS,
    node: "win.workspace-build",
    nodeVersion: process.version,
    packageHashes,
    packageManager: await readPackageManager(config.workspaceRoot),
    platform: config.platform,
    pnpmLock: await hashPath(join(config.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 4,
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
    "packages/sidecar-proto/dist/index.mjs",
    "packages/sidecar-proto/dist/index.d.ts",
    "packages/sidecar/dist/index.mjs",
    "packages/sidecar/dist/index.d.ts",
    "packages/platform/dist/index.mjs",
    "packages/platform/dist/index.d.ts",
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
    "packages/sidecar-proto/dist",
    "packages/sidecar/dist",
    "packages/platform/dist",
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

async function copyWorkspaceBuildArtifactsToCache(config: ToolPackConfig, entryRoot: string): Promise<void> {
  for (const artifact of workspaceBuildArtifacts(config)) {
    const targetPath = join(entryRoot, artifact.cachePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(join(config.workspaceRoot, artifact.workspacePath), targetPath, { recursive: true });
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
  const artifacts = workspaceBuildArtifacts(config);
  await cache.acquire<WorkspaceBuildMetadata>({
    materialize: artifacts.map((artifact) => ({
      from: artifact.cachePath,
      to: join(config.workspaceRoot, artifact.workspacePath),
    })),
    node: {
      id: "win.workspace-build",
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
