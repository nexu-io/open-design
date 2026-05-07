import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import { ensureWorkspaceBuildArtifacts } from "../src/workspace-build.js";

const PACKAGE_DIRS = [
  "packages/contracts",
  "packages/sidecar-proto",
  "packages/sidecar",
  "packages/platform",
  "apps/daemon",
  "apps/web",
  "apps/desktop",
  "apps/packaged",
] as const;

const OUTPUT_FILES = [
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
  for (const directory of PACKAGE_DIRS) {
    await mkdir(join(root, directory, "src"), { recursive: true });
    await writeFile(join(root, directory, "package.json"), `${JSON.stringify({ name: directory }, null, 2)}\n`, "utf8");
    await writeFile(join(root, directory, "src", "index.ts"), "export const value = 1;\n", "utf8");
  }
}

async function writeOutputs(root: string, value: string): Promise<void> {
  for (const file of OUTPUT_FILES) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), `${value}\n`, "utf8");
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
      await ensureWorkspaceBuildArtifacts(config, cache, async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      });
      await ensureWorkspaceBuildArtifacts(config, cache, async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      });

      expect(builds).toBe(1);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
      expect(await readFile(join(root, "apps/packaged/dist/index.mjs"), "utf8")).toBe("build-1\n");
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
      await ensureWorkspaceBuildArtifacts(config, cache, async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      });
      await rm(join(root, "apps/web/dist/sidecar/index.js"), { force: true });
      await ensureWorkspaceBuildArtifacts(config, cache, async () => {
        builds += 1;
        await writeOutputs(root, `build-${builds}`);
      });

      expect(builds).toBe(1);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
      expect(await readFile(join(root, "apps/web/dist/sidecar/index.js"), "utf8")).toBe("build-1\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
