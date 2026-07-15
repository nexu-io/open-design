import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { writeNsisInclude } from "../src/win/nsis.js";
import type { WinPaths } from "../src/win/types.js";

function makeConfig(namespaceRoot: string): ToolPackConfig {
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
        namespaceBaseRoot: "/unused/base",
        namespaceRoot,
      },
      cacheRoot: "/unused/cache",
      toolPackRoot: "/unused/tools-pack",
    },
    signed: false,
    silent: true,
    to: "nsis",
    webOutputMode: "standalone",
    workspaceRoot: "/unused/workspace",
  };
}

describe("writeNsisInclude", () => {
  it("escapes double quotes and newlines in the local-data root", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-nsis-"));
    try {
      const includePath = join(root, "include", "open-design.nsh");
      const paths = { nsisIncludePath: includePath } as WinPaths;
      const config = makeConfig('C:\\Open "Design"\nbeta');

      await writeNsisInclude(config, paths);
      const written = await readFile(includePath, "utf8");

      expect(written).toContain('C:\\Open $\\"Design$\\"$\\r$\\nbeta');
      expect(written).not.toContain('C:\\Open "Design"\n');
      expect(written).toContain('$EXEPATH:Zone.Identifier');
      expect(written).toContain('HostUrl=');
      expect(written).toContain('data\\observations\\installer');
      expect(written).toContain('download-attribution.json');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("writes portable installer observations under the Electron namespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-nsis-"));
    try {
      const includePath = join(root, "include", "open-design.nsh");
      const paths = { nsisIncludePath: includePath } as WinPaths;
      const config = { ...makeConfig("C:\\ignored"), portable: true };

      await writeNsisInclude(config, paths);
      const written = await readFile(includePath, "utf8");

      expect(written).toContain('$APPDATA\\Open Design\\namespaces\\test-namespace\\data\\observations\\installer');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
