import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { createWorkspaceTarballsCacheKey } from "../src/win/app.js";

const PACKAGE_DIRS = [
  "packages/contracts",
  "packages/registry-protocol",
  "packages/sidecar-proto",
  "packages/sidecar",
  "packages/platform",
  "packages/agui-adapter",
  "packages/plugin-runtime",
  "apps/daemon",
  "apps/web",
  "apps/desktop",
  "apps/packaged",
] as const;

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
  it("invalidates when the web output mode changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-app-"));

    try {
      await writeWorkspace(root);

      await expect(createWorkspaceTarballsCacheKey(createConfig(root, "server"))).resolves.not.toBe(
        await createWorkspaceTarballsCacheKey(createConfig(root, "standalone")),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
