import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { LAUNCHER_SCHEMA_VERSION } from "@open-design/launcher-proto";
import { describe, expect, it } from "vitest";

import type { ToolPackConfig, ToolPackPlatform } from "../src/config.js";
import { ToolPackCache } from "../src/cache.js";
import { resolveMacInstallIdentity } from "../src/mac/identity.js";
import {
  buildMacLauncherPayloadManifest,
  createMacLauncherPayloadArchive,
} from "../src/mac/payload.js";
import { resolveMacPaths } from "../src/mac/paths.js";
import { winResources } from "../src/resources.js";
import {
  buildWinLauncherPayloadArchive,
  buildWinLauncherPayloadManifest,
  validateWinLauncherPayloadArchive,
} from "../src/win/payload.js";
import type { WinBuiltAppManifest, WinPaths } from "../src/win/types.js";

const execFileAsync = promisify(execFile);

function makeConfig(root: string, platform: ToolPackPlatform, namespace: string, appVersion: string): ToolPackConfig {
  return {
    appVersion,
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform,
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", platform, "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", platform, "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", platform),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", platform, "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", platform, "namespaces", namespace),
      },
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: platform === "win" ? "nsis" : "app",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

async function expectPathExists(path: string): Promise<void> {
  await expect(access(path)).resolves.toBeUndefined();
}

async function writeFakeMacApp(config: ToolPackConfig): Promise<ReturnType<typeof resolveMacPaths>> {
  const paths = resolveMacPaths(config);
  const identity = resolveMacInstallIdentity(config);
  const resourcesRoot = join(paths.appPath, "Contents", "Resources");
  const executablePath = join(paths.appPath, "Contents", "MacOS", identity.executableName);
  await mkdir(join(paths.appPath, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design", "bin"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design", "prebundled", "daemon"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design", "prebundled", "web"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design-web-standalone"), { recursive: true });
  await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(executablePath, 0o755);
  await writeFile(join(resourcesRoot, "open-design", "bin", "node"), "#!/bin/sh\nexit 0\n", "utf8");
  await writeFile(join(resourcesRoot, "open-design", "prebundled", "daemon", "daemon-sidecar.mjs"), "export {};\n", "utf8");
  await writeFile(join(resourcesRoot, "open-design", "prebundled", "web", "web-sidecar.mjs"), "export {};\n", "utf8");
  await writeFile(
    join(resourcesRoot, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: config.appVersion,
      daemonSidecarEntryRelative: "open-design/prebundled/daemon/daemon-sidecar.mjs",
      namespace: config.namespace,
      nodeCommandRelative: "open-design/bin/node",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "open-design/prebundled/web/web-sidecar.mjs",
    }, null, 2)}\n`,
    "utf8",
  );
  return paths;
}

function createWinPaths(root: string, namespace: string): WinPaths {
  const namespaceRoot = join(root, ".tmp", "tools-pack", "out", "win", "namespaces", namespace);
  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot: join(namespaceRoot, "builder"),
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    assembledPrebundledRoot: join(namespaceRoot, "assembled", "app", "prebundled"),
    blockmapPath: join(namespaceRoot, "builder", "Open Design-release-beta-win-setup.exe.blockmap"),
    builtManifestPath: join(namespaceRoot, "built-app.json"),
    daemonCliPrebundleEntrypointPath: join(namespaceRoot, "prebundle-entrypoints", "daemon-cli.js"),
    daemonCliPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "daemon", "daemon-cli.mjs"),
    daemonPrebundleMetaPath: join(namespaceRoot, "prebundle-meta", "daemon.meta.json"),
    daemonPrebundleRoot: join(namespaceRoot, "assembled", "app", "prebundled", "daemon"),
    daemonSidecarPrebundleEntrypointPath: join(namespaceRoot, "prebundle-entrypoints", "daemon-sidecar.js"),
    daemonSidecarPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "daemon", "daemon-sidecar.mjs"),
    exePath: join(namespaceRoot, "builder", "Open Design-release-beta-win.exe"),
    installDir: join(namespaceRoot, "runtime", "install", "Open Design Beta"),
    installedExePath: join(namespaceRoot, "runtime", "install", "Open Design Beta", "Open Design.exe"),
    installerBasePayloadPath: join(namespaceRoot, "installer", "payload-base.7z"),
    installerOverlayPayloadPath: join(namespaceRoot, "installer", "payload-overlay.7z"),
    installerScriptPath: join(namespaceRoot, "installer", "installer.nsi"),
    launcherPayloadPath: join(namespaceRoot, "payload", "Open Design-release-beta-win-payload.7z"),
    publicDesktopShortcutPath: join(namespaceRoot, "desktop", "public.lnk"),
    latestYmlPath: join(namespaceRoot, "builder", "latest.yml"),
    installMarkerPath: join(namespaceRoot, "logs", "install.marker.json"),
    installTimingPath: join(namespaceRoot, "logs", "install.timing.json"),
    nsisLogPath: join(namespaceRoot, "logs", "nsis.log"),
    nsisIncludePath: join(namespaceRoot, "nsis", "installer.nsh"),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    packagedMainPrebundleMetaPath: join(namespaceRoot, "prebundle-meta", "packaged-main.meta.json"),
    packagedMainPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "packaged-main.mjs"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
    setupPath: join(namespaceRoot, "builder", "Open Design-release-beta-win-setup.exe"),
    setupZipPath: join(namespaceRoot, "builder", "Open Design-release-beta-win-portable.zip"),
    startMenuShortcutPath: join(namespaceRoot, "start-menu.lnk"),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userDesktopShortcutPath: join(namespaceRoot, "desktop", "user.lnk"),
    uninstallMarkerPath: join(namespaceRoot, "logs", "uninstall.marker.json"),
    uninstallTimingPath: join(namespaceRoot, "logs", "uninstall.timing.json"),
    uninstallerPath: join(namespaceRoot, "runtime", "install", "Open Design Beta", "Uninstall.exe"),
    webStandaloneHookAuditPath: join(namespaceRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(namespaceRoot, "web-standalone-after-pack-config.json"),
    webSidecarPrebundleMetaPath: join(namespaceRoot, "prebundle-meta", "web-sidecar.meta.json"),
    webSidecarPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "web-sidecar.mjs"),
    winIconPath: join(namespaceRoot, "resources", "win", "icon.ico"),
    unpackedExePath: join(namespaceRoot, "builder", "win-unpacked", "Open Design.exe"),
    unpackedRoot: join(namespaceRoot, "builder", "win-unpacked"),
  };
}

async function writeFakeWinUnpackedApp(root: string, namespace: string, version: string): Promise<{
  builtApp: WinBuiltAppManifest;
  paths: WinPaths;
}> {
  const paths = createWinPaths(root, namespace);
  await mkdir(join(paths.unpackedRoot, "resources"), { recursive: true });
  await writeFile(join(paths.unpackedRoot, "Open Design.exe"), "fake executable\n", "utf8");
  await writeFile(
    join(paths.unpackedRoot, "resources", "open-design-config.json"),
    `${JSON.stringify({
      appVersion: version,
      daemonSidecarEntryRelative: "open-design/prebundled/daemon/daemon-sidecar.mjs",
      namespace,
      nodeCommandRelative: "open-design/bin/node",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "open-design/prebundled/web/web-sidecar.mjs",
    }, null, 2)}\n`,
    "utf8",
  );
  await mkdir(join(paths.unpackedRoot, "resources", "app"), { recursive: true });
  await writeFile(
    join(paths.unpackedRoot, "resources", "app", "package.json"),
    `${JSON.stringify({ name: "open-design-packaged-app", version })}\n`,
    "utf8",
  );
  await mkdir(join(paths.packagedConfigPath, ".."), { recursive: true });
  await writeFile(
    paths.packagedConfigPath,
    `${JSON.stringify({
      appVersion: version,
      daemonSidecarEntryRelative: "open-design/prebundled/daemon/daemon-sidecar.mjs",
      namespace,
      nodeCommandRelative: "open-design/bin/node",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "open-design/prebundled/web/web-sidecar.mjs",
    }, null, 2)}\n`,
    "utf8",
  );
  return {
    builtApp: {
      appBuilderOutputRoot: paths.appBuilderOutputRoot,
      cacheEntryPath: null,
      configPath: paths.packagedConfigPath,
      executablePath: join(paths.unpackedRoot, "Open Design.exe"),
      source: "namespace",
      unpackedRoot: paths.unpackedRoot,
      version: 1,
      webStandaloneHookAuditPath: null,
    },
    paths,
  };
}

describe("tools-pack launcher payload archives", () => {
  it("builds channel and namespace scoped payload manifests for both desktop platforms", () => {
    const macIdentity = resolveMacInstallIdentity({ appVersion: "0.9.0-beta.2", namespace: "release-beta" });

    expect(buildMacLauncherPayloadManifest({
      channel: "beta",
      executableName: macIdentity.executableName,
      namespace: "release-beta",
      publicAppBundleName: macIdentity.publicAppBundleName,
      version: "0.9.0-beta.2",
    })).toEqual({
      appBundleName: "Open Design Beta.app",
      channel: "beta",
      entry: {
        cwd: "payload/Open Design Beta.app",
        executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
      },
      namespace: "release-beta",
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "0.9.0-beta.2",
    });

    expect(buildWinLauncherPayloadManifest({
      channel: "beta",
      namespace: "release-beta-win",
      version: "0.9.0-beta.2",
    })).toEqual({
      channel: "beta",
      entry: {
        cwd: "payload",
        executable: "payload/Open Design.exe",
      },
      namespace: "release-beta-win",
      payloadRoot: "payload",
      platform: "win32",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "0.9.0-beta.2",
    });
  });

  it.skipIf(process.platform !== "darwin")("creates a mac payload zip with bootstrap-readable contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-mac-payload-"));
    try {
      const config = makeConfig(root, "mac", "release-beta", "0.9.0-beta.2");
      const paths = await writeFakeMacApp(config);
      const archivePath = await createMacLauncherPayloadArchive(config, paths);
      const extractRoot = join(root, "extracted");
      await mkdir(extractRoot, { recursive: true });
      await execFileAsync("ditto", ["-x", "-k", archivePath, extractRoot]);

      const manifest = JSON.parse(await readFile(join(extractRoot, "manifest.json"), "utf8")) as {
        appBundleName: string;
        entry: { executable: string };
        version: string;
      };
      expect(manifest.appBundleName).toBe("Open Design Beta.app");
      expect(manifest.entry.executable).toBe("payload/Open Design Beta.app/Contents/MacOS/Open Design Beta");
      expect(manifest.version).toBe("0.9.0-beta.2");
      await expectPathExists(join(extractRoot, manifest.entry.executable));
      await expectPathExists(join(
        extractRoot,
        "payload",
        "Open Design Beta.app",
        "Contents",
        "Resources",
        "open-design-config.json",
      ));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.skipIf(process.platform !== "win32")("creates a Windows payload 7z with bootstrap-readable contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-win-payload-"));
    try {
      const namespace = "release-beta-win";
      const version = "0.9.0-beta.2";
      const config = makeConfig(root, "win", namespace, version);
      const { builtApp, paths } = await writeFakeWinUnpackedApp(root, namespace, version);
      await buildWinLauncherPayloadArchive(config, paths, builtApp);

      const extractRoot = join(root, "extracted");
      await mkdir(extractRoot, { recursive: true });
      await execFileAsync(winResources.sevenZipExe, ["x", paths.launcherPayloadPath, `-o${extractRoot}`, "-y"]);

      const manifest = JSON.parse(await readFile(join(extractRoot, "manifest.json"), "utf8")) as {
        entry: { executable: string };
        namespace: string;
        platform: string;
        version: string;
      };
      expect(manifest.namespace).toBe(namespace);
      expect(manifest.platform).toBe("win32");
      expect(manifest.entry.executable).toBe("payload/Open Design.exe");
      expect(manifest.version).toBe(version);
      await expectPathExists(join(extractRoot, "payload", "Open Design.exe"));
      await expectPathExists(join(extractRoot, "payload", "resources", "open-design-config.json"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.skipIf(process.platform !== "win32")("validates Windows launcher payload archives", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-win-payload-validate-"));
    try {
      const namespace = "release-beta-win";
      const version = "0.9.0-beta.2";
      const config = makeConfig(root, "win", namespace, version);
      const { builtApp, paths } = await writeFakeWinUnpackedApp(root, namespace, version);
      await buildWinLauncherPayloadArchive(config, paths, builtApp);

      await expect(validateWinLauncherPayloadArchive({
        expectedVersion: version,
        namespace,
        payloadPath: paths.launcherPayloadPath,
        workspaceRoot: root,
      })).resolves.toMatchObject({
        manifest: {
          namespace,
          version,
        },
        valid: true,
      });
      await expect(validateWinLauncherPayloadArchive({
        expectedVersion: "0.9.0-beta.3",
        namespace,
        payloadPath: paths.launcherPayloadPath,
        workspaceRoot: root,
      })).rejects.toThrow("launcher payload manifest version expected");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.skipIf(process.platform !== "win32")("reuses the Windows payload archive when base and overlay metadata are unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-win-payload-cache-"));
    try {
      const namespace = "release-beta-win";
      const initialVersion = "0.9.0-beta.0";
      const { builtApp, paths } = await writeFakeWinUnpackedApp(root, namespace, initialVersion);
      const cache = new ToolPackCache(join(root, "cache"));

      for (const version of ["0.9.0-beta.1", "0.9.0-beta.2", "0.9.0-beta.2"]) {
        const config = makeConfig(root, "win", namespace, version);
        await writeFile(
          paths.packagedConfigPath,
          `${JSON.stringify({
            appVersion: version,
            daemonSidecarEntryRelative: "open-design/prebundled/daemon/daemon-sidecar.mjs",
            namespace,
            nodeCommandRelative: "open-design/bin/node",
            webOutputMode: "standalone",
            webSidecarEntryRelative: "open-design/prebundled/web/web-sidecar.mjs",
          }, null, 2)}\n`,
          "utf8",
        );
        await buildWinLauncherPayloadArchive(config, paths, builtApp, cache);
      }

      const payloadCacheEntries = cache.report().entries.filter((entry) => entry.nodeId === "win.launcher-payload-base");
      expect(payloadCacheEntries.map((entry) => entry.status)).toEqual(["miss", "hit", "hit"]);
      const archiveCacheEntries = cache.report().entries.filter((entry) => entry.nodeId === "win.launcher-payload");
      expect(archiveCacheEntries.map((entry) => entry.status)).toEqual(["miss", "miss", "hit"]);
      expect(archiveCacheEntries.at(-1)?.materialized).toEqual([
        expect.objectContaining({ from: "payload.7z", to: paths.launcherPayloadPath }),
      ]);

      const extractRoot = join(root, "extracted");
      await mkdir(extractRoot, { recursive: true });
      await execFileAsync(winResources.sevenZipExe, ["x", paths.launcherPayloadPath, `-o${extractRoot}`, "-y"]);

      const manifest = JSON.parse(await readFile(join(extractRoot, "manifest.json"), "utf8")) as { version: string };
      const config = JSON.parse(
        await readFile(join(extractRoot, "payload", "resources", "open-design-config.json"), "utf8"),
      ) as { appVersion: string };
      const packageJson = JSON.parse(
        await readFile(join(extractRoot, "payload", "resources", "app", "package.json"), "utf8"),
      ) as { version: string };
      expect(manifest.version).toBe("0.9.0-beta.2");
      expect(config.appVersion).toBe("0.9.0-beta.2");
      expect(packageJson.version).toBe("0.9.0-beta.2");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.skipIf(process.platform !== "win32")("can seed the Windows launcher payload from the NSIS base archive", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-win-payload-nsis-seed-"));
    try {
      const namespace = "release-beta-win";
      const version = "0.9.0-beta.3";
      const config = makeConfig(root, "win", namespace, version);
      const { builtApp, paths } = await writeFakeWinUnpackedApp(root, namespace, version);
      const cache = new ToolPackCache(join(root, "cache"));

      await mkdir(join(paths.installerBasePayloadPath, ".."), { recursive: true });
      await execFileAsync(winResources.sevenZipExe, [
        "a",
        "-t7z",
        paths.installerBasePayloadPath,
        "resources",
      ], { cwd: paths.unpackedRoot, windowsHide: true });

      await buildWinLauncherPayloadArchive(config, paths, builtApp, cache, { seedFromInstallerPayload: true });

      expect(cache.report().entries.some((entry) => entry.nodeId === "win.launcher-payload-base")).toBe(false);
      expect(cache.report().entries.some((entry) => entry.nodeId === "win.launcher-payload")).toBe(true);

      const extractRoot = join(root, "extracted");
      await mkdir(extractRoot, { recursive: true });
      await execFileAsync(winResources.sevenZipExe, ["x", paths.launcherPayloadPath, `-o${extractRoot}`, "-y"]);

      const manifest = JSON.parse(await readFile(join(extractRoot, "manifest.json"), "utf8")) as { version: string };
      const configJson = JSON.parse(
        await readFile(join(extractRoot, "payload", "resources", "open-design-config.json"), "utf8"),
      ) as { appVersion: string };
      expect(manifest.version).toBe(version);
      expect(configJson.appVersion).toBe(version);
      await expectPathExists(join(extractRoot, "payload", "Open Design.exe"));
      await expectPathExists(join(extractRoot, "payload", "resources"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
