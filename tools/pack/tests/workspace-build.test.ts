import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import { ensureWorkspaceBuildArtifacts } from "../src/workspace-build.js";

const SHELL_PACKAGE_DIRS = [
  "packages/release",
  "packages/contracts",
  "packages/sidecar-proto",
  "packages/launcher-proto",
  "packages/sidecar",
  "packages/platform",
  "packages/download",
  "packages/host",
  "packages/diagnostics",
  "packages/standalone-runtime",
  "packages/standalone-proto",
  "packages/closure-proto",
  "packages/closure-store",
  "packages/closure-update",
  "shells/electron",
] as const;

const BODY_PACKAGE_DIRS = ["apps/daemon", "apps/standalone", "apps/web"] as const;

async function writeWorkspace(root: string): Promise<void> {
  await writeFile(join(root, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.33.2" })}\n`);
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const directory of [...SHELL_PACKAGE_DIRS, ...BODY_PACKAGE_DIRS]) {
    await mkdir(join(root, directory, "src"), { recursive: true });
    await writeFile(join(root, directory, "package.json"), `${JSON.stringify({ name: directory })}\n`);
    await writeFile(join(root, directory, "src", "index.ts"), "export const value = 1;\n");
  }
}

async function writeOutputs(root: string, value: string): Promise<void> {
  for (const directory of SHELL_PACKAGE_DIRS) {
    await mkdir(join(root, directory, "dist"), { recursive: true });
    await writeFile(join(root, directory, "dist", "index.mjs"), `${value}\n`);
    await writeFile(join(root, directory, "dist", "index.d.ts"), `${value}\n`);
  }
  await mkdir(join(root, "shells/electron/dist/main"), { recursive: true });
  await writeFile(join(root, "shells/electron/dist/main/preload.cjs"), `${value}\n`);
}

function createConfig(root: string, cacheRoot: string, platform: "mac" | "win" = "win"): ToolPackConfig {
  return {
    releaseVersion: "0.18.0-beta.4",
    electronBuilderCliPath: "electron-builder",
    electronDistPath: "electron-dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "release-beta",
    platform,
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
        namespaceRoot: join(root, ".tmp", "out", platform, "namespaces", "release-beta"),
        platformRoot: join(root, ".tmp", "out", platform),
        root: join(root, ".tmp", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "runtime", platform, "namespaces"),
        namespaceRoot: join(root, ".tmp", "runtime", platform, "namespaces", "release-beta"),
      },
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    shell: "electron",
    silent: true,
    to: "dir",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

describe("Electron Shell workspace build cache", () => {
  it("builds and materializes the shell dependency closure once", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-shell-build-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    let builds = 0;
    try {
      await writeWorkspace(root);
      const build = async () => writeOutputs(root, `build-${++builds}`);
      await ensureWorkspaceBuildArtifacts(createConfig(root, cache.root), cache, build);
      await rm(join(root, "shells/electron/dist/index.mjs"));
      await ensureWorkspaceBuildArtifacts(createConfig(root, cache.root), cache, build);

      expect(builds).toBe(1);
      expect(await readFile(join(root, "shells/electron/dist/index.mjs"), "utf8")).toBe("build-1\n");
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("ignores Standalone body changes but invalidates Shell dependency changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-shell-boundary-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    let builds = 0;
    try {
      await writeWorkspace(root);
      const config = createConfig(root, cache.root);
      const build = async () => writeOutputs(root, `build-${++builds}`);
      await ensureWorkspaceBuildArtifacts(config, cache, build);
      await writeFile(join(root, "apps/standalone/src/index.ts"), "export const value = 2;\n");
      await writeFile(join(root, "apps/web/src/index.ts"), "export const value = 2;\n");
      await ensureWorkspaceBuildArtifacts(config, cache, build);
      await writeFile(join(root, "packages/standalone-proto/src/index.ts"), "export const value = 2;\n");
      await ensureWorkspaceBuildArtifacts(config, cache, build);

      expect(builds).toBe(2);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit", "miss"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not key the Shell build by Standalone Web output mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-shell-mode-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    let builds = 0;
    try {
      await writeWorkspace(root);
      const config = createConfig(root, cache.root);
      const build = async () => writeOutputs(root, `build-${++builds}`);
      await ensureWorkspaceBuildArtifacts(config, cache, build);
      await ensureWorkspaceBuildArtifacts({ ...config, webOutputMode: "server" }, cache, build);
      expect(builds).toBe(1);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("keeps Windows version-family aliases while macOS stays content-addressed", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-shell-alias-"));
    const cache = new ToolPackCache(join(root, ".cache"));
    try {
      await writeWorkspace(root);
      await ensureWorkspaceBuildArtifacts(createConfig(root, cache.root), cache, async () => writeOutputs(root, "win"));
      expect(await readdir(join(cache.root, "aliases", "win.workspace-build"))).toHaveLength(1);
      await ensureWorkspaceBuildArtifacts(createConfig(root, cache.root, "mac"), cache, async () => writeOutputs(root, "mac"));
      await expect(readdir(join(cache.root, "aliases", "mac.workspace-build"))).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
