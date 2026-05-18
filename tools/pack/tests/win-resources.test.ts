import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import { prepareResourceTree } from "../src/win/resources.js";
import type { WinPaths } from "../src/win/types.js";

async function createWorkspaceFixture(workspaceRoot: string): Promise<void> {
  await mkdir(join(workspaceRoot, "skills", "sample"), { recursive: true });
  await mkdir(join(workspaceRoot, "design-templates", "orbit-general"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "design-systems", "sample"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "craft", "sample"), { recursive: true });
  await mkdir(join(workspaceRoot, "plugins", "_official", "sample"), {
    recursive: true,
  });
  await writeFile(
    join(workspaceRoot, "plugins", "_official", "sample", "open-design.json"),
    "{\"id\":\"sample\"}\n",
    "utf8",
  );
  await mkdir(join(workspaceRoot, "plugins", "registry", "community"), {
    recursive: true,
  });
  await writeFile(
    join(workspaceRoot, "plugins", "registry", "community", "open-design-marketplace.json"),
    "{\"plugins\":[]}\n",
    "utf8",
  );
  await mkdir(join(workspaceRoot, "assets", "frames"), { recursive: true });
  await mkdir(join(workspaceRoot, "assets", "community-pets", "sample"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "prompt-templates", "image"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "plugins", "registry", "official"), {
    recursive: true,
  });
}

describe("prepareResourceTree", () => {
  it("invalidates the Windows resource tree cache when design templates change", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-resources-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const templatePath = join(
      workspaceRoot,
      "design-templates",
      "orbit-general",
      "SKILL.md",
    );
    const materializedTemplatePath = join(
      resourceRoot,
      "design-templates",
      "orbit-general",
      "SKILL.md",
    );

    try {
      await createWorkspaceFixture(workspaceRoot);
      await writeFile(templatePath, "version one\n", "utf8");

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(materializedTemplatePath, "utf8")).resolves.toBe(
        "version one\n",
      );

      await writeFile(templatePath, "version two\n", "utf8");

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(materializedTemplatePath, "utf8")).resolves.toBe(
        "version two\n",
      );
      expect(cache.report().entries.map((entry) => entry.status)).toEqual([
        "miss",
        "miss",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
