import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { createWinRemovalPlan } from "../src/win/paths.js";

function createConfig(root: string, removeCache: boolean): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "electron-builder",
    electronDistPath: "electron-dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "cache-test",
    platform: "win",
    portable: false,
    removeCache,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      cacheRoot: join(root, ".cache"),
      output: {
        appBuilderRoot: join(root, "out", "builder"),
        namespaceRoot: join(root, "out", "win", "namespaces", "cache-test"),
        platformRoot: join(root, "out", "win"),
        root: join(root, "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, "runtime", "win", "namespaces"),
        namespaceRoot: join(root, "runtime", "win", "namespaces", "cache-test"),
      },
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dir",
    webOutputMode: "server",
    workspaceRoot: root,
  };
}

describe("createWinRemovalPlan", () => {
  it("models download/cache directories separately from user data", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-win-removal-plan-"));
    try {
      const config = createConfig(root, true);
      const runtimeRoot = config.roots.runtime.namespaceRoot;
      await mkdir(join(runtimeRoot, "cache"), { recursive: true });
      await mkdir(join(runtimeRoot, "updates", "downloads"), { recursive: true });
      await mkdir(join(runtimeRoot, "updates", "releases"), { recursive: true });
      await mkdir(join(runtimeRoot, "updates", "staging"), { recursive: true });
      await mkdir(join(runtimeRoot, "data"), { recursive: true });

      const plan = await createWinRemovalPlan(config);

      expect(plan.filter((target) => target.scope === "cache")).toEqual([
        expect.objectContaining({ exists: true, path: join(runtimeRoot, "cache"), willRemove: true }),
        expect.objectContaining({ exists: true, path: join(runtimeRoot, "updates", "downloads"), willRemove: true }),
        expect.objectContaining({ exists: true, path: join(runtimeRoot, "updates", "releases"), willRemove: true }),
        expect.objectContaining({ exists: true, path: join(runtimeRoot, "updates", "staging"), willRemove: true }),
      ]);
      expect(plan.find((target) => target.scope === "data")).toEqual(
        expect.objectContaining({ exists: true, path: join(runtimeRoot, "data"), willRemove: false }),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
