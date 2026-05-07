import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveSeededAppConfigPaths, seedPackagedAppConfig } from "../src/mac/index.js";

function makeConfig(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "local-test",
    platform: "mac",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", "local-test", "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", "local-test"),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test"),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    silent: true,
    signed: false,
    to: "app",
    webOutputMode: "standalone",
    workspaceRoot: root,
    ...overrides,
  };
}

const envState = { odDataDir: process.env.OD_DATA_DIR };

afterEach(() => {
  if (envState.odDataDir == null) {
    delete process.env.OD_DATA_DIR;
  } else {
    process.env.OD_DATA_DIR = envState.odDataDir;
  }
});

describe("resolveSeededAppConfigPaths", () => {
  it("uses workspace .od by default", () => {
    const config = makeConfig("/work");
    expect(resolveSeededAppConfigPaths(config)).toEqual({
      sourcePath: join("/work", ".od", "app-config.json"),
      targetPath: join("/work", ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test", "data", "app-config.json"),
    });
  });

  it("prefers OD_DATA_DIR when provided", () => {
    process.env.OD_DATA_DIR = "/custom/data";
    const config = makeConfig("/work");
    expect(resolveSeededAppConfigPaths(config)).toEqual({
      sourcePath: join("/custom/data", "app-config.json"),
      targetPath: join("/work", ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test", "data", "app-config.json"),
    });
  });

  it("resolves relative OD_DATA_DIR against the workspace root", () => {
    process.env.OD_DATA_DIR = "e2e/ui/.od-data";
    const config = makeConfig("/work");
    expect(resolveSeededAppConfigPaths(config)).toEqual({
      sourcePath: resolve("/work", "e2e", "ui", ".od-data", "app-config.json"),
      targetPath: join("/work", ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test", "data", "app-config.json"),
    });
  });

  it("expands $HOME-style OD_DATA_DIR values", () => {
    process.env.OD_DATA_DIR = "$HOME/.open-design";
    const config = makeConfig("/work");
    expect(resolveSeededAppConfigPaths(config)).toEqual({
      sourcePath: join(os.homedir(), ".open-design", "app-config.json"),
      targetPath: join("/work", ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test", "data", "app-config.json"),
    });
  });
});

describe("seedPackagedAppConfig", () => {
  it("copies the current app-config into the packaged runtime namespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-"));
    try {
      const config = makeConfig(root);
      const sourceDir = join(root, ".od");
      await mkdir(sourceDir, { recursive: true });
      await writeFile(
        join(sourceDir, "app-config.json"),
        `${JSON.stringify({ onboardingCompleted: true, agentId: "codex", agentCliEnv: { codex: { CODEX_BIN: "/Applications/Codex.app/Contents/Resources/codex" } } }, null, 2)}\n`,
        "utf8",
      );

      await seedPackagedAppConfig(config);

      await expect(
        readFile(join(config.roots.runtime.namespaceRoot, "data", "app-config.json"), "utf8"),
      ).resolves.toContain('"agentId": "codex"');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("skips seeding for portable builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-"));
    try {
      const config = makeConfig(root, { portable: true });
      const sourceDir = join(root, ".od");
      await mkdir(sourceDir, { recursive: true });
      await writeFile(join(sourceDir, "app-config.json"), "{\n  \"agentId\": \"codex\"\n}\n", "utf8");

      await seedPackagedAppConfig(config);

      await expect(
        readFile(join(config.roots.runtime.namespaceRoot, "data", "app-config.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
