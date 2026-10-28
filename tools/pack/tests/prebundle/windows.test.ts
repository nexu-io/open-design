import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
} from "@/win/prebundle.js";

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
    for (const packageName of [
      "@open-design/contracts",
      "@open-design/platform",
      "@open-design/sidecar",
    ]) {
      expect(
        shouldInstallInternalPackageForWinPrebundle({ packageName, webOutputMode: "standalone" }),
      ).toBe(true);
    }
  });

  it("documents the explicit code-level bundle boundaries", () => {
    expect(WIN_PREBUNDLE_ESBUILD_TARGET).toBe("node24");
    expect(WIN_PREBUNDLE_POLICIES.packagedMain.externals).toEqual(["@open-design/sidecar", "electron"]);
    expect(WIN_PREBUNDLE_POLICIES.daemonCli.externals).toEqual([
      "@ffmpeg-installer/ffmpeg",
      "@open-design/sidecar",
      "better-sqlite3",
      "blake3-wasm",
      "hyperframes",
      "gsap",
      "node-pty",
    ]);
    expect(WIN_PREBUNDLE_POLICIES.daemonSidecar.externals).toEqual([
      "@ffmpeg-installer/ffmpeg",
      "@open-design/sidecar",
      "better-sqlite3",
      "blake3-wasm",
      "hyperframes",
      "gsap",
      "node-pty",
    ]);
    expect(WIN_PREBUNDLE_POLICIES.webSidecar.externals).toEqual(["@open-design/sidecar"]);
    expect(WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER).toContain("createRequire");
    // Must match apps/daemon/package.json / the pnpm lockfile, or
    // electron-builder's collector drops the module from the shipped app and
    // the daemon dies at boot with ERR_MODULE_NOT_FOUND (issue #4638).
    expect(WIN_PREBUNDLE_RUNTIME_DEPENDENCIES).toEqual({
      "@ffmpeg-installer/ffmpeg": "1.1.0",
      "better-sqlite3": "12.10.0",
      "blake3-wasm": "2.1.5",
      "hyperframes": "0.8.1",
      "gsap": "3.14.2",
      "node-pty": "1.1.0",
      "sharp": "0.35.5",
    });
    expect(WIN_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH).toBe("app/prebundled/daemon/daemon-cli.mjs");
    expect(WIN_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH).toBe("app/prebundled/daemon/daemon-sidecar.mjs");
    expect(WIN_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH).toBe("app/prebundled/web-sidecar.mjs");
  });

  it("pins sharp to the patched workspace override", () => {
    // The packaged app installs these pins with npm outside the pnpm
    // workspace, so the workspace `sharp` override does not reach them. Keep
    // the packaged Sharp in lockstep with the patched workspace version.
    const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const rootManifest = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")) as {
      pnpm: { overrides: Record<string, string> };
    };
    const workspaceYaml = readFileSync(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
    const releaseManifest = JSON.parse(readFileSync(join(workspaceRoot, "tools", "release", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const workspaceSharp = rootManifest.pnpm.overrides.sharp;

    expect(workspaceSharp).toBeDefined();
    expect(WIN_PREBUNDLE_RUNTIME_DEPENDENCIES.sharp).toBe(workspaceSharp);
    expect(workspaceYaml).toMatch(new RegExp(`^\\s+sharp: ${workspaceSharp.replaceAll(".", "\\.")}$`, "m"));
    expect(releaseManifest.dependencies?.sharp ?? releaseManifest.devDependencies?.sharp).toBe(workspaceSharp);
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

  it("rejects a daemon metafile that bundled node-pty", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-prebundle-"));
    const metafilePath = join(root, "unsafe-native-daemon.json");

    try {
      await writeFile(
        metafilePath,
        JSON.stringify({ inputs: { "/repo/node_modules/node-pty/lib/index.js": {} } }),
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
