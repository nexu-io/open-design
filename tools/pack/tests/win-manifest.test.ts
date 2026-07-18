import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { readBuiltAppManifest, writePackagedConfigFile } from "../src/win/manifest.js";
import type { WinBuiltAppManifest, WinPaths } from "../src/win/types.js";

function makePaths(root: string): Pick<WinPaths, "builtManifestPath"> {
  return { builtManifestPath: join(root, "manifest.json") };
}

function makeConfig(overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/unused",
    electronDistPath: "/unused",
    electronVersion: "0.0.0",
    macCompression: "normal",
    namespace: "test-namespace",
    platform: "win",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: "/unused/builder",
        namespaceRoot: "/unused/ns",
        platformRoot: "/unused/platform",
        root: "/unused/root",
      },
      runtime: {
        namespaceBaseRoot: "C:/users/test/AppData/Local/open-design/runtime/win/namespaces",
        namespaceRoot: "C:/users/test/AppData/Local/open-design/runtime/win/namespaces/test-namespace",
      },
      cacheRoot: "/unused/cache",
      toolPackRoot: "/unused/tools-pack",
    },
    signed: false,
    silent: true,
    to: "nsis",
    webOutputMode: "standalone",
    workspaceRoot: "/unused/workspace",
    ...overrides,
  };
}

describe("readBuiltAppManifest", () => {
  it("returns null when the manifest file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-manifest-"));
    try {
      const paths = makePaths(root) as WinPaths;
      await expect(readBuiltAppManifest(paths)).resolves.toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects manifests whose version is not 1", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-manifest-"));
    try {
      const paths = makePaths(root) as WinPaths;
      await writeFile(paths.builtManifestPath, JSON.stringify({ version: 2, executablePath: "/x" }), "utf8");
      await expect(readBuiltAppManifest(paths)).resolves.toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("returns the parsed manifest when the version matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-manifest-"));
    try {
      const paths = makePaths(root) as WinPaths;
      const manifest: WinBuiltAppManifest = {
        appBuilderOutputRoot: join(root, "builder"),
        cacheEntryPath: null,
        configPath: join(root, "config.json"),
        executablePath: join(root, "Open Design.exe"),
        source: "namespace",
        unpackedRoot: join(root, "unpacked"),
        version: 1,
        webStandaloneHookAuditPath: null,
      };
      await writeFile(paths.builtManifestPath, JSON.stringify(manifest), "utf8");
      await expect(readBuiltAppManifest(paths)).resolves.toEqual(manifest);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("returns null when requireExecutable is set and the executable is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-manifest-"));
    try {
      const paths = makePaths(root) as WinPaths;
      const manifest: WinBuiltAppManifest = {
        appBuilderOutputRoot: join(root, "builder"),
        cacheEntryPath: null,
        configPath: join(root, "config.json"),
        executablePath: join(root, "missing.exe"),
        source: "namespace",
        unpackedRoot: join(root, "unpacked"),
        version: 1,
        webStandaloneHookAuditPath: null,
      };
      await writeFile(paths.builtManifestPath, JSON.stringify(manifest), "utf8");
      await expect(readBuiltAppManifest(paths, { requireExecutable: true })).resolves.toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("writePackagedConfigFile", () => {
  it("omits namespaceBaseRoot for portable builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-config-"));
    try {
      const filePath = join(root, "config", "open-design-config.json");
      await writePackagedConfigFile(filePath, makeConfig({ portable: true }), "1.2.3");
      const written = JSON.parse(await readFile(filePath, "utf8"));
      expect(written.namespace).toBe("test-namespace");
      expect(written.appVersion).toBe("1.2.3");
      expect(written).not.toHaveProperty("namespaceBaseRoot");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("includes namespaceBaseRoot for non-portable builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-config-"));
    try {
      const filePath = join(root, "config", "open-design-config.json");
      await writePackagedConfigFile(filePath, makeConfig({ portable: false }), "1.2.3");
      const written = JSON.parse(await readFile(filePath, "utf8"));
      expect(written.namespaceBaseRoot).toBe(
        "C:/users/test/AppData/Local/open-design/runtime/win/namespaces",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
