import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER,
  WIN_PREBUNDLE_ESBUILD_TARGET,
  WIN_PREBUNDLE_POLICIES,
  WIN_PREBUNDLE_RUNTIME_DEPENDENCIES,
  WIN_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH,
  WIN_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH,
  WIN_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH,
  assertWinPrebundleMetafile,
  findForbiddenWinPrebundleInputs,
  renderWinPackagedMainEntry,
  shouldInstallInternalPackageForWinPrebundle,
  shouldUseWinStandalonePrebundle,
} from "../src/win-prebundle.js";

describe("win standalone prebundle policy", () => {
  it("is enabled only for standalone web output", () => {
    expect(shouldUseWinStandalonePrebundle("standalone")).toBe(true);
    expect(shouldUseWinStandalonePrebundle("server")).toBe(false);
  });

  it("keeps server-mode package topology unchanged", () => {
    expect(
      shouldInstallInternalPackageForWinPrebundle({
        packageName: "@open-design/web",
        webOutputMode: "server",
      }),
    ).toBe(true);
    expect(
      shouldInstallInternalPackageForWinPrebundle({
        packageName: "@open-design/packaged",
        webOutputMode: "server",
      }),
    ).toBe(true);
  });

  it("excludes internal packages replaced by win standalone prebundles", () => {
    for (const packageName of [
      "@open-design/daemon",
      "@open-design/desktop",
      "@open-design/packaged",
      "@open-design/platform",
      "@open-design/sidecar",
      "@open-design/sidecar-proto",
      "@open-design/web",
    ]) {
      expect(
        shouldInstallInternalPackageForWinPrebundle({
          packageName,
          webOutputMode: "standalone",
        }),
      ).toBe(false);
    }
    expect(
      shouldInstallInternalPackageForWinPrebundle({
        packageName: "@open-design/contracts",
        webOutputMode: "standalone",
      }),
    ).toBe(true);
  });

  it("documents the explicit code-level bundle boundaries", () => {
    expect(WIN_PREBUNDLE_ESBUILD_TARGET).toBe("node24");
    expect(WIN_PREBUNDLE_POLICIES.packagedMain.externals).toEqual(["electron"]);
    expect(WIN_PREBUNDLE_POLICIES.daemonCli.externals).toEqual(["better-sqlite3", "blake3-wasm"]);
    expect(WIN_PREBUNDLE_POLICIES.daemonSidecar.externals).toEqual(["better-sqlite3", "blake3-wasm"]);
    expect(WIN_PREBUNDLE_POLICIES.webSidecar.externals).toEqual([]);
    expect(WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER).toContain("createRequire");
    expect(WIN_PREBUNDLE_RUNTIME_DEPENDENCIES).toEqual({
      "better-sqlite3": "12.9.0",
      "blake3-wasm": "2.1.5",
    });
    expect(WIN_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH).toBe("app/prebundled/daemon/daemon-cli.mjs");
    expect(WIN_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH).toBe("app/prebundled/daemon/daemon-sidecar.mjs");
    expect(WIN_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH).toBe("app/prebundled/web-sidecar.mjs");
  });
});

describe("findForbiddenWinPrebundleInputs", () => {
  it("matches forbidden dependency roots after path normalization", () => {
    expect(
      findForbiddenWinPrebundleInputs({
        forbiddenInputs: WIN_PREBUNDLE_POLICIES.webSidecar.forbiddenInputs,
        inputs: [
          "src/index.ts",
          "C:\\repo\\node_modules\\next\\dist\\server.js",
          "/repo/node_modules/openai/index.mjs",
        ],
      }),
    ).toEqual([
      "C:/repo/node_modules/next/dist/server.js",
      "/repo/node_modules/openai/index.mjs",
    ]);
  });
});

describe("assertWinPrebundleMetafile", () => {
  it("accepts a safe web sidecar metafile", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-prebundle-"));
    const metafilePath = join(root, "safe.json");

    try {
      await writeFile(
        metafilePath,
        JSON.stringify({ inputs: { "/repo/apps/web/sidecar/index.ts": {} } }),
        "utf8",
      );

      await expect(
        assertWinPrebundleMetafile({ metafilePath, policyName: "webSidecar" }),
      ).resolves.toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a packaged main metafile that pulled in web runtime closure", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-prebundle-"));
    const metafilePath = join(root, "unsafe.json");

    try {
      await writeFile(
        metafilePath,
        JSON.stringify({ inputs: { "/repo/node_modules/@open-design/web/dist/sidecar/index.js": {} } }),
        "utf8",
      );

      await expect(
        assertWinPrebundleMetafile({ metafilePath, policyName: "packagedMain" }),
      ).rejects.toThrow(/packaged main prebundle included forbidden inputs/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a daemon metafile that bundled wasm-backed runtime dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-prebundle-"));
    const metafilePath = join(root, "unsafe-daemon.json");

    try {
      await writeFile(
        metafilePath,
        JSON.stringify({ inputs: { "/repo/node_modules/blake3-wasm/dist/node/index.js": {} } }),
        "utf8",
      );

      await expect(
        assertWinPrebundleMetafile({ metafilePath, policyName: "daemonSidecar" }),
      ).rejects.toThrow(/daemon sidecar prebundle included forbidden inputs/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("renderWinPackagedMainEntry", () => {
  it("renders the prebundled runtime entry shim", () => {
    expect(renderWinPackagedMainEntry(true)).toContain("./prebundled/packaged-main.mjs");
    expect(renderWinPackagedMainEntry(true)).not.toContain("@open-design/packaged");
  });

  it("renders the package entry shim for non-prebundled mode", () => {
    expect(renderWinPackagedMainEntry(false)).toContain("@open-design/packaged");
    expect(renderWinPackagedMainEntry(false)).not.toContain("./prebundled/packaged-main.mjs");
  });
});
