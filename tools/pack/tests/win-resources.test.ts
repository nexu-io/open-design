import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";
import type { ToolPackConfig } from "../src/config.js";
import { prepareResourceTree } from "../src/win/resources.js";
import type { WinPaths } from "../src/win/types.js";

const RESOURCE_TREE_CACHE_TEST_TIMEOUT_MS = 15_000;

async function writeFakeOpenCodeCompanion(
  source: string,
  content = "#!/bin/sh\nexit 0\n",
): Promise<string> {
  const companion = join(dirname(source), "libexec", "opencode", "opencode");
  await mkdir(dirname(companion), { recursive: true });
  await writeFile(companion, content, "utf8");
  await chmod(companion, 0o755);
  return companion;
}

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
  await mkdir(join(workspaceRoot, "data", "plugin-previews"), {
    recursive: true,
  });
  await writeFile(
    join(workspaceRoot, "data", "plugin-previews", "manifest.json"),
    "{\"previews\":{}}\n",
    "utf8",
  );
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
  }, RESOURCE_TREE_CACHE_TEST_TIMEOUT_MS);

  it("invalidates the Windows resource tree cache when the plugin-preview manifest changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-previews-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const manifestPath = join(
      workspaceRoot,
      "data",
      "plugin-previews",
      "manifest.json",
    );
    const materializedManifestPath = join(
      resourceRoot,
      "data",
      "plugin-previews",
      "manifest.json",
    );

    try {
      await createWorkspaceFixture(workspaceRoot);
      await writeFile(manifestPath, "{\"previews\":{\"a\":1}}\n", "utf8");

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(materializedManifestPath, "utf8")).resolves.toBe(
        "{\"previews\":{\"a\":1}}\n",
      );

      await writeFile(manifestPath, "{\"previews\":{\"a\":2}}\n", "utf8");

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(materializedManifestPath, "utf8")).resolves.toBe(
        "{\"previews\":{\"a\":2}}\n",
      );
      expect(cache.report().entries.map((entry) => entry.status)).toEqual([
        "miss",
        "miss",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, RESOURCE_TREE_CACHE_TEST_TIMEOUT_MS);

  it("copies a configured Vela CLI binary into the Windows resource tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-vela-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const source = join(root, "source", "vela.exe");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalVelaBin = process.env.OPEN_DESIGN_VELA_CLI_BIN;

    try {
      await createWorkspaceFixture(workspaceRoot);
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake vela exe\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "fake opencode\n");
      process.env.OPEN_DESIGN_VELA_CLI_BIN = source;

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(join(resourceRoot, "bin", "vela.exe"), "utf8")).resolves.toBe(
        "fake vela exe\n",
      );
      await expect(
        readFile(join(resourceRoot, "bin", "libexec", "opencode", "opencode"), "utf8"),
      ).resolves.toBe("fake opencode\n");
    } finally {
      if (originalVelaBin == null) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = originalVelaBin;
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails strict Windows resource preparation when configured Vela CLI is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-vela-strict-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = {
      workspaceRoot,
      requireVelaCli: true,
    } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalVelaBin = process.env.OPEN_DESIGN_VELA_CLI_BIN;

    try {
      await createWorkspaceFixture(workspaceRoot);
      process.env.OPEN_DESIGN_VELA_CLI_BIN = join(root, "missing", "vela.exe");
      await expect(
        prepareResourceTree(config, paths, cache, { materialize: true }),
      ).rejects.toThrow();
    } finally {
      if (originalVelaBin == null) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = originalVelaBin;
      await rm(root, { force: true, recursive: true });
    }
  });

  it("invalidates the Windows resource tree cache when the Vela companion changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-vela-companion-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "materialized", "open-design");
    const source = join(root, "source", "vela.exe");
    const cache = new ToolPackCache(join(root, "cache"));
    const config = { workspaceRoot } as ToolPackConfig;
    const paths = { resourceRoot } as WinPaths;
    const originalVelaBin = process.env.OPEN_DESIGN_VELA_CLI_BIN;
    const materializedCompanion = join(
      resourceRoot,
      "bin",
      "libexec",
      "opencode",
      "opencode",
    );

    try {
      await createWorkspaceFixture(workspaceRoot);
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake vela exe\n", "utf8");
      const sourceCompanion = await writeFakeOpenCodeCompanion(source, "companion one\n");
      process.env.OPEN_DESIGN_VELA_CLI_BIN = source;

      await prepareResourceTree(config, paths, cache, { materialize: true });
      await expect(readFile(materializedCompanion, "utf8")).resolves.toBe(
        "companion one\n",
      );

      await writeFile(sourceCompanion, "companion two\n", "utf8");

      await prepareResourceTree(config, paths, cache, { materialize: true });

      await expect(readFile(materializedCompanion, "utf8")).resolves.toBe(
        "companion two\n",
      );
      expect(cache.report().entries.map((entry) => entry.status)).toEqual([
        "miss",
        "miss",
      ]);
    } finally {
      if (originalVelaBin == null) delete process.env.OPEN_DESIGN_VELA_CLI_BIN;
      else process.env.OPEN_DESIGN_VELA_CLI_BIN = originalVelaBin;
      await rm(root, { force: true, recursive: true });
    }
  }, RESOURCE_TREE_CACHE_TEST_TIMEOUT_MS);
});
