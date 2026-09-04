import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "@/cache/index.js";
import type { ToolPackConfig } from "@/config/index.js";
import {
  createWorkspaceBuildCacheKey,
  createWorkspaceBuildCacheKeyFromInputs,
  ensureWorkspaceBuildArtifacts,
  runWorkspaceBuild,
  WORKSPACE_BUILD_COMMANDS,
  WORKSPACE_BUILD_CACHE_SCHEMA_VERSION,
  WORKSPACE_BUILD_PACKAGES,
  type WorkspaceBuildRunner,
} from "@/workspace-build.js";

const PACKAGE_DIRS = [
  "packages/release",
  "packages/components",
  "packages/contracts",
  "packages/registry-protocol",
  "packages/sidecar-proto",
  "packages/launcher-proto",
  "packages/platform",
  "packages/sidecar",
  "packages/download",
  "packages/host",
  "packages/agui-adapter",
  "packages/plugin-runtime",
  "packages/diagnostics",
  "packages/dsh-runtime",
  "apps/daemon",
  "apps/web",
  "apps/desktop",
  "apps/packaged",
] as const;

const OUTPUT_FILES = [
  "packages/release/dist/index.mjs",
  "packages/release/dist/index.d.ts",
  "packages/components/dist/index.mjs",
  "packages/components/dist/index.d.ts",
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
  "packages/sidecar/dist/index.d.ts",
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
  "packages/dsh-runtime/dist/index.js",
  "packages/dsh-runtime/dist/types/index.d.ts",
  "apps/daemon/dist/cli.js",
  "apps/daemon/dist/cli.d.ts",
  "apps/daemon/dist/sidecar/index.js",
  "apps/web/dist/sidecar/index.js",
  "apps/web/dist/sidecar/index.d.ts",
  "apps/web/.next/standalone/apps/web/server.js",
  "apps/web/.next/static/chunk.js",
  "apps/desktop/dist/main/index.js",
  "apps/desktop/dist/main/index.d.ts",
  "apps/packaged/dist/index.mjs",
  "apps/packaged/dist/index.d.ts",
] as const;

async function writeWorkspace(root: string): Promise<void> {
  await writeFile(join(root, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.33.2" }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n  - apps/*\n", "utf8");
  for (const directory of PACKAGE_DIRS) {
    await mkdir(join(root, directory, "src"), { recursive: true });
    await writeFile(join(root, directory, "package.json"), `${JSON.stringify({ name: directory }, null, 2)}\n`, "utf8");
    await writeFile(join(root, directory, "src", "index.ts"), "export const value = 1;\n", "utf8");
  }
}

function buildRunner(build: () => Promise<void>): WorkspaceBuildRunner {
  return async (args) => {
    if (args[0] === "--filter" && args[1] === "@open-design/packaged") await build();
  };
}

async function writeOutputs(root: string, value: string): Promise<void> {
  for (const file of OUTPUT_FILES) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), `${value}\n`, "utf8");
  }
}

async function writeStandalonePeerDeps(root: string): Promise<void> {
  const pnpmRoot = join(root, "apps/web/.next/standalone/node_modules/.pnpm");
  for (const directory of ["react@18.3.1", "react-dom@18.3.1_react@18.3.1", "styled-jsx@5.1.6_react@18.3.1"]) {
    const packageName = directory.split("@")[0]!;
    const packageRoot = join(pnpmRoot, directory, "node_modules", packageName);
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), `${JSON.stringify({ name: packageName }, null, 2)}\n`, "utf8");
  }
}

function createConfig(root: string, cacheRoot: string): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "electron-builder",
    electronDistPath: "electron-dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "test",
    platform: "win",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      cacheRoot,
      output: {
        appBuilderRoot: join(root, ".tmp", "builder"),
        namespaceRoot: join(root, ".tmp", "out", "win", "namespaces", "test"),
        platformRoot: join(root, ".tmp", "out", "win"),
        root: join(root, ".tmp", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "runtime", "win", "namespaces"),
        namespaceRoot: join(root, ".tmp", "runtime", "win", "namespaces", "test"),
      },
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dir",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

describe("ensureWorkspaceBuildArtifacts", () => {
  it("builds once and skips when the key and outputs are still valid", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const config = createConfig(root, cache.root);
    let builds = 0;

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      }));
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      }));

      expect(builds).toBe(1);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
      expect(cache.report().entries.map((entry) => entry.nodeId)).toEqual([
        "win.workspace-build",
        "win.workspace-build",
      ]);
      expect(await readFile(join(root, "apps/packaged/dist/index.mjs"), "utf8")).toBe("build-1\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("processes sourcemaps after both a credentialless fill and a credentialed hit", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-sourcemaps-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const initialConfig = createConfig(root, cache.root);
    const releaseConfig: ToolPackConfig = {
      ...initialConfig,
      appVersion: "1.2.3-beta.4",
      posthogCliApiKey: "test-api-key",
      posthogCliProjectId: "test-project",
    };
    const processing: Array<{ hadMap: boolean; injected: boolean; uploaded: boolean; version?: string }> = [];
    let builds = 0;
    const processMaterialized = async (config: ToolPackConfig) => {
      const chunks = join(root, "apps/web/.next/static");
      const mapPath = join(chunks, "chunk.js.map");
      const hadMap = await readFile(mapPath, "utf8").then(() => true, () => false);
      const hasCredentials = Boolean(config.posthogCliApiKey && config.posthogCliProjectId);
      if (hasCredentials) {
        await writeFile(join(chunks, "chunk.js"), `chunk\n//# chunkId=${config.appVersion}\n`, "utf8");
      }
      processing.push({ hadMap, injected: hasCredentials, uploaded: hasCredentials, version: config.appVersion });
      await rm(mapPath, { force: true });
    };

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(initialConfig, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, "build");
        await writeFile(join(root, "apps/web/.next/static/chunk.js.map"), "map\n", "utf8");
      }), processMaterialized);
      await expect(readFile(join(root, "apps/web/.next/static/chunk.js.map"), "utf8")).rejects.toThrow();

      await ensureWorkspaceBuildArtifacts(releaseConfig, cache, buildRunner(async () => {
        builds += 1;
      }), processMaterialized);

      expect(builds).toBe(1);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
      expect(processing).toEqual([
        { hadMap: true, injected: false, uploaded: false, version: undefined },
        { hadMap: true, injected: true, uploaded: true, version: "1.2.3-beta.4" },
      ]);
      expect(await readFile(join(root, "apps/web/.next/static/chunk.js"), "utf8"))
        .toContain("//# chunkId=1.2.3-beta.4");
      await expect(readFile(join(root, "apps/web/.next/static/chunk.js.map"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("writes a Windows version-family alias after a successful build", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-alias-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const config: ToolPackConfig = { ...createConfig(root, cache.root), appVersion: "0.9.1-beta.1" };

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        await writeOutputs(root, "build");
      }));

      const aliasesRoot = join(cache.root, "aliases", "win.workspace-build");
      const aliasBuckets = await readdir(aliasesRoot);
      expect(aliasBuckets).toHaveLength(1);
      expect(await readFile(join(aliasesRoot, aliasBuckets[0]!, "alias.json"), "utf8")).toContain("win.workspace-build");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("hoists standalone web peer deps with Windows-compatible directory links", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-peer-deps-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const config = createConfig(root, cache.root);

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        await writeOutputs(root, "build");
        await writeStandalonePeerDeps(root);
      }));

      expect(await readFile(join(root, "apps/web/.next/standalone/apps/web/node_modules/react/package.json"), "utf8"))
        .toContain('"name": "react"');
      expect(await readFile(join(root, "apps/web/.next/standalone/apps/web/node_modules/react-dom/package.json"), "utf8"))
        .toContain('"name": "react-dom"');
      expect(await readFile(join(root, "apps/web/.next/standalone/apps/web/node_modules/styled-jsx/package.json"), "utf8"))
        .toContain('"name": "styled-jsx"');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not write a version-family alias for mac workspace builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-mac-alias-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const config: ToolPackConfig = { ...createConfig(root, cache.root), appVersion: "0.9.1-beta.1", platform: "mac" };

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        await writeOutputs(root, "build");
      }));

      await expect(readdir(join(cache.root, "aliases", "mac.workspace-build"))).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("materializes cached outputs when an expected workspace output is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-stale-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const config = createConfig(root, cache.root);
    let builds = 0;

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      }));
      await rm(join(root, "apps/web/dist/sidecar/index.js"), { force: true });
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      }));

      expect(builds).toBe(1);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
      expect(await readFile(join(root, "apps/web/dist/sidecar/index.js"), "utf8")).toBe("build-1\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("materializes cached internal package outputs for pack tarballs", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-package-cache-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const config = createConfig(root, cache.root);
    let builds = 0;

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      }));
      await rm(join(root, "packages/host/dist/index.mjs"), { force: true });
      await ensureWorkspaceBuildArtifacts(config, cache, buildRunner(async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      }));

      expect(builds).toBe(1);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
      expect(await readFile(join(root, "packages/host/dist/index.mjs"), "utf8")).toBe("build-1\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("keeps platform-specific workspace build cache nodes separate", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-build-platform-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    const winConfig = createConfig(root, cache.root);
    const macConfig: ToolPackConfig = {
      ...winConfig,
      platform: "mac",
      roots: {
        ...winConfig.roots,
        output: {
          ...winConfig.roots.output,
          namespaceRoot: join(root, ".tmp", "out", "mac", "namespaces", "test"),
          platformRoot: join(root, ".tmp", "out", "mac"),
        },
        runtime: {
          namespaceBaseRoot: join(root, ".tmp", "runtime", "mac", "namespaces"),
          namespaceRoot: join(root, ".tmp", "runtime", "mac", "namespaces", "test"),
        },
      },
    };

    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(winConfig, cache, buildRunner(async () => {
        await writeOutputs(root, "win-build");
      }));
      await ensureWorkspaceBuildArtifacts(macConfig, cache, buildRunner(async () => {
        await writeOutputs(root, "mac-build");
      }));

      expect(cache.report().entries.map((entry) => entry.nodeId)).toEqual([
        "win.workspace-build",
        "mac.workspace-build",
      ]);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "miss"]);
      expect(await readFile(join(root, "apps/packaged/dist/index.mjs"), "utf8")).toBe("mac-build\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("runWorkspaceBuild", () => {
  it("keeps the cache/artifact contract aligned with the packaged dependency closure", async () => {
    const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const packages = new Map<string, { dependencies: Record<string, string> }>();
    for (const scope of ["packages", "apps"]) {
      for (const entry of await readdir(join(workspaceRoot, scope), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifest = JSON.parse(
          await readFile(join(workspaceRoot, scope, entry.name, "package.json"), "utf8"),
        ) as { name?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
        if (manifest.name != null) {
          packages.set(manifest.name, {
            dependencies: { ...manifest.dependencies, ...manifest.optionalDependencies },
          });
        }
      }
    }
    const closure = new Set<string>();
    const pending = ["@open-design/packaged"];
    while (pending.length > 0) {
      const name = pending.pop()!;
      if (closure.has(name)) continue;
      closure.add(name);
      for (const dependency of Object.keys(packages.get(name)?.dependencies ?? {})) {
        if (packages.has(dependency)) pending.push(dependency);
      }
    }
    closure.add("@open-design/dsh-runtime");

    expect(WORKSPACE_BUILD_PACKAGES.map(({ name }) => name).sort()).toEqual([...closure].sort());
  });

  it("leaves dependency order to pnpm while retaining packaging stages", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-runner-"));
    const config = createConfig(root, join(root, ".cache"));
    const calls: Array<{ args: string[]; env?: NodeJS.ProcessEnv }> = [];

    try {
      await mkdir(join(root, "apps/web"), { recursive: true });
      await writeFile(join(root, "apps/web/next-env.d.ts"), "original\n", "utf8");
      await runWorkspaceBuild(config, async (args, env) => {
        calls.push({ args, env });
        await writeFile(join(root, "apps/web/next-env.d.ts"), "generated\n", "utf8");
      });

      expect(calls.map((call) => call.args)).toEqual(WORKSPACE_BUILD_COMMANDS.map((command) => [...command.args]));
      expect(calls[1]?.env).toMatchObject({ OD_WEB_OUTPUT_MODE: "standalone" });
      expect(await readFile(join(root, "apps/web/next-env.d.ts"), "utf8")).toBe("original\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("restores generated Next typings when a build stage fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-runner-failure-"));
    const config = createConfig(root, join(root, ".cache"));

    try {
      await mkdir(join(root, "apps/web"), { recursive: true });
      await expect(runWorkspaceBuild(config, async () => {
        await writeFile(join(root, "apps/web/next-env.d.ts"), "generated\n", "utf8");
        throw new Error("build failed");
      })).rejects.toThrow("build failed");
      await expect(readFile(join(root, "apps/web/next-env.d.ts"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("createWorkspaceBuildCacheKey", () => {
  it("witnesses every declared package source and ignores generated outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-workspace-key-"));
    const config = createConfig(root, join(root, ".cache"));

    try {
      await writeWorkspace(root);
      const baseline = await createWorkspaceBuildCacheKey(config);
      await mkdir(join(root, "packages/sidecar/dist"), { recursive: true });
      await writeFile(join(root, "packages/sidecar/dist/generated.js"), "generated\n", "utf8");
      expect(await createWorkspaceBuildCacheKey(config)).toBe(baseline);

      for (const packageInfo of WORKSPACE_BUILD_PACKAGES) {
        const sourcePath = join(root, packageInfo.directory, "src/index.ts");
        await writeFile(sourcePath, `export const value = ${JSON.stringify(packageInfo.name)};\n`, "utf8");
        expect(await createWorkspaceBuildCacheKey(config), packageInfo.name).not.toBe(baseline);
        await writeFile(sourcePath, "export const value = 1;\n", "utf8");
      }

      expect(await createWorkspaceBuildCacheKey(config)).toBe(baseline);

      await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
      const topologyKey = await createWorkspaceBuildCacheKey(config);
      expect(topologyKey).not.toBe(baseline);

      await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.1'\n", "utf8");
      const lockKey = await createWorkspaceBuildCacheKey(config);
      expect(lockKey).not.toBe(topologyKey);

      await writeFile(join(root, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.34.0" })}\n`, "utf8");
      const packageManagerKey = await createWorkspaceBuildCacheKey(config);
      expect(packageManagerKey).not.toBe(lockKey);
      expect(await createWorkspaceBuildCacheKey({ ...config, webOutputMode: "server" })).not.toBe(packageManagerKey);
      expect(await createWorkspaceBuildCacheKey({ ...config, platform: "mac" })).not.toBe(packageManagerKey);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("witnesses every pure command, runtime, and schema determinant", () => {
    const inputs = {
      buildCommands: WORKSPACE_BUILD_COMMANDS,
      node: "win.workspace-build",
      nodeVersion: "v24.0.0",
      packageHashes: Object.fromEntries(WORKSPACE_BUILD_PACKAGES.map(({ name }) => [name, `hash:${name}`])),
      packageManager: "pnpm@10.33.2",
      platform: "win" as const,
      pnpmLock: "lock-hash",
      pnpmWorkspace: "workspace-hash",
      schemaVersion: WORKSPACE_BUILD_CACHE_SCHEMA_VERSION,
      webOutputMode: "standalone" as const,
    };
    const baseline = createWorkspaceBuildCacheKeyFromInputs(inputs);

    for (const [index, command] of WORKSPACE_BUILD_COMMANDS.entries()) {
      const buildCommands = WORKSPACE_BUILD_COMMANDS.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, args: [...entry.args, "--witness"] } : entry,
      );
      expect(
        createWorkspaceBuildCacheKeyFromInputs({ ...inputs, buildCommands }),
        `build command ${JSON.stringify(command.args)}`,
      ).not.toBe(baseline);
      for (const envName of "env" in command ? command.env : []) {
        const envCommands = WORKSPACE_BUILD_COMMANDS.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, env: [...("env" in entry ? entry.env : []), `${envName}_WITNESS`] }
            : entry,
        );
        expect(
          createWorkspaceBuildCacheKeyFromInputs({ ...inputs, buildCommands: envCommands }),
          `build command env ${envName}`,
        ).not.toBe(baseline);
      }
    }

    expect(createWorkspaceBuildCacheKeyFromInputs({ ...inputs, node: "mac.workspace-build" })).not.toBe(baseline);
    expect(createWorkspaceBuildCacheKeyFromInputs({ ...inputs, nodeVersion: "v24.0.1" })).not.toBe(baseline);
    expect(createWorkspaceBuildCacheKeyFromInputs({ ...inputs, schemaVersion: inputs.schemaVersion + 1 })).not.toBe(baseline);
  });
});
