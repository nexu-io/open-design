import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { INTERNAL_PACKAGES } from "../src/win/constants.js";
import { createWorkspaceTarballsCacheKey } from "../src/win/app.js";

const PACKAGE_DIRS = INTERNAL_PACKAGES.map((packageInfo) => packageInfo.directory);

async function writeWorkspace(root: string): Promise<void> {
  await writeFile(join(root, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.33.2" }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  for (const directory of PACKAGE_DIRS) {
    await mkdir(join(root, directory, "src"), { recursive: true });
    await writeFile(join(root, directory, "package.json"), `${JSON.stringify({ name: directory, version: "0.0.0" }, null, 2)}\n`, "utf8");
    await writeFile(join(root, directory, "src", "index.ts"), "export const value = 1;\n", "utf8");
  }
}

function createConfig(root: string, webOutputMode: ToolPackConfig["webOutputMode"]): ToolPackConfig {
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
      cacheRoot: join(root, ".cache"),
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
    webOutputMode,
    workspaceRoot: root,
  };
}

describe("createWorkspaceTarballsCacheKey", () => {
  it("invalidates when any packed package source changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-app-"));

    try {
      await writeWorkspace(root);
      const config = createConfig(root, "server");
      const baseline = await createWorkspaceTarballsCacheKey(config, "workspace-build");

      for (const directory of PACKAGE_DIRS) {
        const sourcePath = join(root, directory, "src", "index.ts");
        await writeFile(sourcePath, "export const value = 2;\n", "utf8");
        await expect(createWorkspaceTarballsCacheKey(config, "workspace-build")).resolves.not.toBe(baseline);
        await writeFile(sourcePath, "export const value = 1;\n", "utf8");
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("invalidates when package manager or lockfile inputs change", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-app-"));

    try {
      await writeWorkspace(root);
      const config = createConfig(root, "server");
      const baseline = await createWorkspaceTarballsCacheKey(config, "workspace-build");

      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ packageManager: "pnpm@10.34.0" }, null, 2)}\n`,
        "utf8",
      );
      await expect(createWorkspaceTarballsCacheKey(config, "workspace-build")).resolves.not.toBe(baseline);

      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ packageManager: "pnpm@10.33.2" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.1'\n", "utf8");
      await expect(createWorkspaceTarballsCacheKey(config, "workspace-build")).resolves.not.toBe(baseline);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("invalidates when the upstream workspace build key changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-app-"));

    try {
      await writeWorkspace(root);
      const config = createConfig(root, "server");
      const firstKey = await createWorkspaceTarballsCacheKey(config, "workspace-build-a");
      const secondKey = await createWorkspaceTarballsCacheKey(config, "workspace-build-b");

      expect(firstKey).not.toBe(secondKey);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("invalidates when the web output mode changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-app-"));

    try {
      await writeWorkspace(root);
      const serverKey = await createWorkspaceTarballsCacheKey(createConfig(root, "server"), "workspace-build");
      const standaloneKey = await createWorkspaceTarballsCacheKey(createConfig(root, "standalone"), "workspace-build");

      expect(serverKey).not.toBe(standaloneKey);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("ignores packed package build outputs because the upstream key carries their identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-app-"));

    try {
      await writeWorkspace(root);
      const config = createConfig(root, "server");
      const baseline = await createWorkspaceTarballsCacheKey(config, "workspace-build");

      await mkdir(join(root, PACKAGE_DIRS[0]!, "dist"), { recursive: true });
      await writeFile(join(root, PACKAGE_DIRS[0]!, "dist", "index.js"), "export const built = 1;\n", "utf8");

      await expect(createWorkspaceTarballsCacheKey(config, "workspace-build")).resolves.toBe(baseline);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
