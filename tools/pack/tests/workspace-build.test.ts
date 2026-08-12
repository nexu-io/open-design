import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import {
  ensureWorkspaceBuildArtifacts,
  resolveShellBuildIdentity,
  resolveShellSourceDigest,
} from "../src/workspace-build.js";

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
  "shells/electron",
] as const;

const STANDALONE_BOOTSTRAP_PACKAGE_DIRS = [
  "packages/closure-proto",
  "packages/closure-store",
  "packages/closure-update",
] as const;

const BODY_PACKAGE_DIRS = ["apps/daemon", "apps/standalone", "apps/web"] as const;

async function writeWorkspace(root: string): Promise<void> {
  await writeFile(join(root, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.33.2" })}\n`);
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const directory of [...SHELL_PACKAGE_DIRS, ...STANDALONE_BOOTSTRAP_PACKAGE_DIRS, ...BODY_PACKAGE_DIRS]) {
    await mkdir(join(root, directory, "src"), { recursive: true });
    await writeFile(join(root, directory, "package.json"), `${JSON.stringify({
      ...(directory === "apps/daemon" ? {
        dependencies: {
          "better-sqlite3": "12.10.0",
          "blake3-wasm": "2.1.5",
          "node-pty": "1.1.0",
        },
      } : {}),
      name: directory,
    })}\n`);
    await writeFile(join(root, directory, "src", "index.ts"), "export const value = 1;\n");
  }
  await writeFile(join(root, "apps/standalone/src/bootstrap.ts"), "export const bootstrap = 1;\n");
  await writeFile(join(root, "apps/standalone/src/bootstrap-entry.ts"), "export const entry = 1;\n");
  await writeFile(join(root, "apps/standalone/src/fossil-bootloader.ts"), "export const handoff = 1;\n");
  await mkdir(join(root, "tools/pack/resources/mac"), { recursive: true });
  await mkdir(join(root, "tools/pack/resources/win"), { recursive: true });
  await mkdir(join(root, "tools/pack/src/mac"), { recursive: true });
  await mkdir(join(root, "tools/pack/src/win"), { recursive: true });
  await writeFile(join(root, "tools/pack/package.json"), `${JSON.stringify({ name: "@open-design/tools-pack" })}\n`);
  await writeFile(join(root, "tools/pack/src/index.ts"), "export const pack = 1;\n");
  await writeFile(join(root, "tools/pack/src/mac/index.ts"), "export const mac = 1;\n");
  await writeFile(join(root, "tools/pack/src/win/index.ts"), "export const win = 1;\n");
  await writeFile(join(root, "tools/pack/resources/mac/entitlements.plist"), "mac-1\n");
  await writeFile(join(root, "tools/pack/resources/win/icon.ico"), "win-1\n");
}

async function writeOutputs(root: string, value: string): Promise<void> {
  for (const directory of SHELL_PACKAGE_DIRS) {
    await mkdir(join(root, directory, "dist"), { recursive: true });
    await writeFile(join(root, directory, "dist", "index.mjs"), `${value}\n`);
    await writeFile(join(root, directory, "dist", "index.d.ts"), `${value}\n`);
  }
  await mkdir(join(root, "shells/electron/dist/main"), { recursive: true });
  await writeFile(join(root, "shells/electron/dist/main/preload.cjs"), `${value}\n`);
  await mkdir(join(root, "apps/standalone/dist/bootstrap"), { recursive: true });
  await writeFile(join(root, "apps/standalone/dist/bootstrap/bootloader.mjs"), `${value}\n`);
  await mkdir(join(root, "apps/standalone/dist/bootstrap/baseline"), { recursive: true });
  await writeFile(join(root, "apps/standalone/dist/bootstrap/baseline/launcher.mjs"), `${value}\n`);
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
      expect(builds).toBe(1);
      await writeFile(join(root, "apps/standalone/src/bootstrap.ts"), "export const bootstrap = 2;\n");
      await ensureWorkspaceBuildArtifacts(config, cache, build);
      await writeFile(join(root, "packages/closure-update/src/index.ts"), "export const value = 2;\n");
      await ensureWorkspaceBuildArtifacts(config, cache, build);
      await writeFile(join(root, "packages/standalone-proto/src/index.ts"), "export const value = 2;\n");
      await ensureWorkspaceBuildArtifacts(config, cache, build);

      expect(builds).toBe(4);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit", "miss", "miss", "miss"]);
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

  it("keeps shared inputs coupled while scoping platform-owned sources and resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-shell-platform-"));
    try {
      await writeWorkspace(root);
      const mac = createConfig(root, join(root, ".cache-mac"), "mac");
      const win = createConfig(root, join(root, ".cache-win"), "win");
      const initialMac = await resolveShellSourceDigest(mac);
      const initialWin = await resolveShellSourceDigest(win);
      expect(initialMac).not.toBe(initialWin);

      await writeFile(join(root, "tools/pack/src/win/index.ts"), "export const win = 2;\n");
      await writeFile(join(root, "tools/pack/resources/win/icon.ico"), "win-2\n");
      expect(await resolveShellSourceDigest(mac)).toBe(initialMac);
      const winAfterWinChange = await resolveShellSourceDigest(win);
      expect(winAfterWinChange).not.toBe(initialWin);

      await writeFile(join(root, "tools/pack/src/mac/index.ts"), "export const mac = 2;\n");
      await writeFile(join(root, "tools/pack/resources/mac/entitlements.plist"), "mac-2\n");
      expect(await resolveShellSourceDigest(win)).toBe(winAfterWinChange);
      const macAfterMacChange = await resolveShellSourceDigest(mac);
      expect(macAfterMacChange).not.toBe(initialMac);

      await writeFile(join(root, "tools/pack/src/index.ts"), "export const pack = 2;\n");
      expect(await resolveShellSourceDigest(mac)).not.toBe(macAfterMacChange);
      expect(await resolveShellSourceDigest(win)).not.toBe(winAfterWinChange);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("separates Shell logic identity from Node and native dependency identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-shell-deps-"));
    try {
      await writeWorkspace(root);
      const config = createConfig(root, join(root, ".cache"));
      const before = await resolveShellBuildIdentity(config);
      const manifestPath = join(root, "apps/daemon/package.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.dependencies["better-sqlite3"] = "12.11.0";
      await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
      const after = await resolveShellBuildIdentity(config);

      expect(after.sourceDigest).toBe(before.sourceDigest);
      expect(after.depsDigest).not.toBe(before.depsDigest);
      expect(after.buildDigest).not.toBe(before.buildDigest);
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
