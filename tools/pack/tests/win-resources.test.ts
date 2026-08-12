import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import { prepareResourceTree } from "../src/win/resources.js";
import type { WinPaths } from "../src/win/types.js";

describe("Windows Electron Shell resource tree", () => {
  it("contains the materializers and official Node required to enter Standalone", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-shell-resources-"));
    const resourceRoot = join(root, "materialized", "open-design");
    try {
      await prepareResourceTree(
        { workspaceRoot: join(root, "workspace") } as ToolPackConfig,
        { resourceRoot } as WinPaths,
        new ToolPackCache(join(root, "cache")),
        { materialize: true },
      );

      expect((await readFile(join(resourceRoot, "bin", "7z.exe"))).byteLength).toBeGreaterThan(0);
      expect((await readFile(join(resourceRoot, "bin", "7z.dll"))).byteLength).toBeGreaterThan(0);
      expect((await readFile(join(resourceRoot, "bin", "node.exe"))).byteLength).toBeGreaterThan(0);
      expect((await readdir(resourceRoot)).sort()).toEqual(["bin"]);
      expect((await readdir(join(resourceRoot, "bin"))).sort()).toEqual(["7z.dll", "7z.exe", "node.exe"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not invalidate the Shell cache when Standalone body resources change", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-shell-cache-"));
    const workspaceRoot = join(root, "workspace");
    const cache = new ToolPackCache(join(root, "cache"));
    try {
      await mkdir(join(workspaceRoot, "design-templates"), { recursive: true });
      const bodyFile = join(workspaceRoot, "design-templates", "body.txt");
      await writeFile(bodyFile, "one\n", "utf8");
      const config = { workspaceRoot } as ToolPackConfig;
      const paths = { resourceRoot: join(root, "materialized", "open-design") } as WinPaths;
      const first = await prepareResourceTree(config, paths, cache, { materialize: false });
      await writeFile(bodyFile, "two\n", "utf8");
      const second = await prepareResourceTree(config, paths, cache, { materialize: false });

      expect(second.key).toBe(first.key);
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
