import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { NtExecutable, NtExecutableResource, Resource } from "resedit";
import { describe, expect, it } from "vitest";

import { materializeCachedUnpackedForInstaller } from "../src/win/builder.js";
import { createLauncherRuntimeSyncPowerShellScript } from "../src/win/custom-installer.js";
import type { WinPaths } from "../src/win/types.js";
import { readWinExecutableVersionSnapshot } from "../src/win/version-resource.js";

const execFileAsync = promisify(execFile);

function createPaths(root: string): WinPaths {
  const namespaceRoot = join(root, "namespaces", "second");
  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot: join(namespaceRoot, "builder"),
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    assembledPrebundledRoot: join(namespaceRoot, "assembled", "app", "prebundled"),
    blockmapPath: join(namespaceRoot, "builder", "Open Design-second-setup.exe.blockmap"),
    builtManifestPath: join(namespaceRoot, "built-app.json"),
    daemonCliPrebundleEntrypointPath: join(namespaceRoot, "prebundle-entrypoints", "daemon-cli.js"),
    daemonCliPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "daemon", "daemon-cli.mjs"),
    daemonPrebundleMetaPath: join(namespaceRoot, "prebundle-meta", "daemon.meta.json"),
    daemonPrebundleRoot: join(namespaceRoot, "assembled", "app", "prebundled", "daemon"),
    daemonSidecarPrebundleEntrypointPath: join(namespaceRoot, "prebundle-entrypoints", "daemon-sidecar.js"),
    daemonSidecarPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "daemon", "daemon-sidecar.mjs"),
    exePath: join(namespaceRoot, "builder", "Open Design-second.exe"),
    installDir: join(namespaceRoot, "runtime", "install", "Open Design"),
    installedExePath: join(namespaceRoot, "runtime", "install", "Open Design", "Open Design.exe"),
    installerBasePayloadPath: join(namespaceRoot, "installer", "payload-base.7z"),
    installerOverlayPayloadPath: join(namespaceRoot, "installer", "payload-overlay.7z"),
    installerScriptPath: join(namespaceRoot, "installer", "installer.nsi"),
    launcherPayloadPath: join(namespaceRoot, "payload", "Open Design-second-payload.7z"),
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
    setupPath: join(namespaceRoot, "builder", "Open Design-second-setup.exe"),
    setupZipPath: join(namespaceRoot, "builder", "Open Design-second-portable.zip"),
    startMenuShortcutPath: join(namespaceRoot, "start-menu.lnk"),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userDesktopShortcutPath: join(namespaceRoot, "desktop", "user.lnk"),
    uninstallMarkerPath: join(namespaceRoot, "logs", "uninstall.marker.json"),
    uninstallTimingPath: join(namespaceRoot, "logs", "uninstall.timing.json"),
    uninstallerPath: join(namespaceRoot, "runtime", "install", "Open Design", "Uninstall.exe"),
    webStandaloneHookAuditPath: join(namespaceRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(namespaceRoot, "web-standalone-after-pack-config.json"),
    webSidecarPrebundleMetaPath: join(namespaceRoot, "prebundle-meta", "web-sidecar.meta.json"),
    webSidecarPrebundlePath: join(namespaceRoot, "assembled", "app", "prebundled", "web-sidecar.mjs"),
    winIconPath: join(namespaceRoot, "resources", "win", "icon.ico"),
    unpackedExePath: join(namespaceRoot, "builder", "win-unpacked", "Open Design.exe"),
    unpackedRoot: join(namespaceRoot, "builder", "win-unpacked"),
  };
}

describe("materializeCachedUnpackedForInstaller", () => {
  it("overwrites cached packaged config and app package version", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-builder-"));
    const cachedUnpackedRoot = join(root, "cache", "builder", "win-unpacked");
    const paths = createPaths(root);

    try {
      await mkdir(join(cachedUnpackedRoot, "resources"), { recursive: true });
      await writeFile(join(cachedUnpackedRoot, "Open Design.exe"), await createVersionedExecutable("0.5.0-beta.1"));
      await writeFile(
        join(cachedUnpackedRoot, "resources", "open-design-config.json"),
        `${JSON.stringify({ namespace: "first", version: 1 })}\n`,
        "utf8",
      );
      await mkdir(join(cachedUnpackedRoot, "resources", "app"), { recursive: true });
      await writeFile(
        join(cachedUnpackedRoot, "resources", "app", "package.json"),
        `${JSON.stringify({ name: "open-design-packaged-app", version: "0.5.0-beta.1" })}\n`,
        "utf8",
      );
      await mkdir(join(paths.packagedConfigPath, ".."), { recursive: true });
      await writeFile(
        paths.packagedConfigPath,
        `${JSON.stringify({ appVersion: "0.5.0-beta.2", namespace: "second", version: 1 })}\n`,
        "utf8",
      );

      const manifest = await materializeCachedUnpackedForInstaller(cachedUnpackedRoot, paths, "0.5.0-beta.2");

      expect(manifest.source).toBe("namespace");
      expect(manifest.unpackedRoot).toBe(paths.unpackedRoot);
      await expect(readFile(join(paths.unpackedRoot, "resources", "open-design-config.json"), "utf8")).resolves.toContain(
        '"namespace":"second"',
      );
      await expect(readFile(join(paths.unpackedRoot, "resources", "app", "package.json"), "utf8")).resolves.toContain(
        '"version": "0.5.0-beta.2"',
      );
      await expect(readFile(join(paths.unpackedRoot, "resources", "open-design-config.json"), "utf8")).resolves.toContain(
        '"appVersion":"0.5.0-beta.2"',
      );
      await expect(readWinExecutableVersionSnapshot(join(paths.unpackedRoot, "Open Design.exe"))).resolves.toMatchObject({
        fixedFileVersion: "0.5.0.0",
        fixedProductVersion: "0.5.0.0",
        stringTables: [
          {
            values: expect.objectContaining({
              FileVersion: "0.5.0-beta.2",
              ProductVersion: "0.5.0.0",
            }),
          },
        ],
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("Windows pack artifact boundaries", () => {
  it("does not build launcher payload artifacts for a pure dir target", async () => {
    const source = await readFile(new URL("../src/win/build.ts", import.meta.url), "utf8");
    expect(source).toContain("const hasLauncherPayloadTarget = hasNsisTarget || hasZipTarget");
    expect(source).toContain("if (hasLauncherPayloadTarget)");
    expect(source.indexOf("const hasLauncherPayloadTarget = hasNsisTarget || hasZipTarget")).toBeLessThan(
      source.indexOf('runPhase("payload-artifact"'),
    );
  });

  it("uses the electron-builder cache identity instead of hashing the unpacked tree when possible", async () => {
    const source = await readFile(new URL("../src/win/builder.ts", import.meta.url), "utf8");
    expect(source).toContain("builtApp.cacheEntryPath == null");
    expect(source).toContain("hashWinNsisBasePayloadInputs(builtApp)");
    expect(source).toContain("cacheEntryPath: builtApp.cacheEntryPath");
    expect(source.indexOf("builtApp.cacheEntryPath == null")).toBeLessThan(
      source.indexOf("cacheEntryPath: builtApp.cacheEntryPath"),
    );
  });

  it("keeps NSIS payload archives on the fast LZMA2 path", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain('"nsis:payload-base-7z"');
    expect(source).toContain('"-m0=LZMA2"');
    expect(source).toContain('"-mf=off"');
    expect(source).not.toContain('"-ms=off"');
  });

  it("invalidates Windows payload caches when the archive method changes", async () => {
    const builderSource = await readFile(new URL("../src/win/builder.ts", import.meta.url), "utf8");
    const payloadSource = await readFile(new URL("../src/win/payload.ts", import.meta.url), "utf8");
    expect(builderSource).toContain("const WIN_NSIS_BASE_PAYLOAD_INPUT_HASH_CACHE_VERSION = 2");
    expect(payloadSource).toContain("const WIN_LAUNCHER_PAYLOAD_BASE_CACHE_VERSION = 2");
    expect(payloadSource).toContain("const WIN_LAUNCHER_PAYLOAD_ARCHIVE_CACHE_VERSION = 2");
  });

  it("invalidates the NSIS installer cache when installer helper code changes", async () => {
    const source = await readFile(new URL("../src/win/builder.ts", import.meta.url), "utf8");
    expect(source).toContain("hashWinNsisInstallerImplementation");
    expect(source).toContain("nsisInstallerImplementation");
    expect(source.indexOf("nsisInstallerImplementation")).toBeLessThan(source.indexOf('target: "nsis-installer"'));
  });
});

describe("launcher runtime sync helper", () => {
  it.runIf(process.platform === "win32")("writes cleanup.json for superseded launcher runtime pointers", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-launcher-sync-"));
    const runtimePath = join(root, "runtime.json");
    const attemptsPath = join(root, "state", "attempt.json");
    const cleanupPath = join(root, "state", "cleanup.json");
    const helperPath = join(root, "sync-launcher-runtime.ps1");

    try {
      await mkdir(join(root, "state"), { recursive: true });
      await writeFile(helperPath, createLauncherRuntimeSyncPowerShellScript(), "utf8");
      await writeFile(
        runtimePath,
        `${JSON.stringify({
          active: { generation: 3, version: "0.10.2-beta.11" },
          channel: "beta",
          lastSuccessful: { generation: 3, version: "0.10.2-beta.11" },
          namespace: "rr",
          schemaVersion: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }, null, 2)}\n`,
        "utf8",
      );

      await execFileAsync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-RuntimePath",
        runtimePath,
        "-AttemptsPath",
        attemptsPath,
        "-CleanupPath",
        cleanupPath,
        "-Channel",
        "beta",
        "-Namespace",
        "rr",
        "-Version",
        "0.10.2-beta.12",
      ]);

      const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as {
        active: { version: string };
        lastSuccessful: { version: string };
      };
      const cleanup = JSON.parse(await readFile(cleanupPath, "utf8")) as {
        currentVersion: string;
        versions: Array<{ reason: string; state: string; version: string }>;
      };
      expect(runtime.active.version).toBe("0.10.2-beta.12");
      expect(runtime.lastSuccessful.version).toBe("0.10.2-beta.12");
      expect(cleanup.currentVersion).toBe("0.10.2-beta.12");
      expect(cleanup.versions).toEqual([
        expect.objectContaining({
          reason: "older-than-bound-package",
          state: "deprecated",
          version: "0.10.2-beta.11",
        }),
        expect.objectContaining({
          reason: "current-bound-package",
          state: "retained",
          version: "0.10.2-beta.12",
        }),
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

async function createVersionedExecutable(packagedVersion: string): Promise<Buffer> {
  const executable = NtExecutable.createEmpty(false, false);
  const resource = NtExecutableResource.from(executable);
  const version = Resource.VersionInfo.createEmpty();
  version.lang = 1033;
  version.setFileVersion("0.5.0.0", 1033);
  version.setProductVersion("0.5.0.0", 1033);
  version.setStringValues(
    { codepage: 1200, lang: 1033 },
    {
      FileDescription: "Open Design",
      FileVersion: packagedVersion,
      ProductName: "Open Design",
      ProductVersion: "0.5.0.0",
    },
  );
  version.outputToResourceEntries(resource.entries);
  resource.outputResource(executable);
  return Buffer.from(executable.generate());
}
