import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { materializeCachedUnpackedForInstaller } from "../src/win/builder.js";
import type { WinPaths } from "../src/win/types.js";

function createPaths(root: string): WinPaths {
  const namespaceRoot = join(root, "namespaces", "second");
  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot: join(namespaceRoot, "builder"),
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    blockmapPath: join(namespaceRoot, "builder", "Open Design-second-setup.exe.blockmap"),
    builtManifestPath: join(namespaceRoot, "built-app.json"),
    exePath: join(namespaceRoot, "builder", "Open Design-second.exe"),
    installDir: join(namespaceRoot, "runtime", "install", "Open Design"),
    installedExePath: join(namespaceRoot, "runtime", "install", "Open Design", "Open Design.exe"),
    installerPayloadPath: join(namespaceRoot, "installer", "payload.7z"),
    installerScriptPath: join(namespaceRoot, "installer", "installer.nsi"),
    publicDesktopShortcutPath: join(namespaceRoot, "desktop", "public.lnk"),
    latestYmlPath: join(namespaceRoot, "builder", "latest.yml"),
    installMarkerPath: join(namespaceRoot, "logs", "install.marker.json"),
    installTimingPath: join(namespaceRoot, "logs", "install.timing.json"),
    nsisLogPath: join(namespaceRoot, "logs", "nsis.log"),
    nsisIncludePath: join(namespaceRoot, "nsis", "installer.nsh"),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
    setupPath: join(namespaceRoot, "builder", "Open Design-second-setup.exe"),
    startMenuShortcutPath: join(namespaceRoot, "start-menu.lnk"),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userDesktopShortcutPath: join(namespaceRoot, "desktop", "user.lnk"),
    uninstallMarkerPath: join(namespaceRoot, "logs", "uninstall.marker.json"),
    uninstallTimingPath: join(namespaceRoot, "logs", "uninstall.timing.json"),
    uninstallerPath: join(namespaceRoot, "runtime", "install", "Open Design", "Uninstall.exe"),
    webStandaloneHookAuditPath: join(namespaceRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(namespaceRoot, "web-standalone-after-pack-config.json"),
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
      await writeFile(join(cachedUnpackedRoot, "Open Design.exe"), "exe\n", "utf8");
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
      await writeFile(paths.packagedConfigPath, `${JSON.stringify({ namespace: "second", version: 1 })}\n`, "utf8");

      const manifest = await materializeCachedUnpackedForInstaller(cachedUnpackedRoot, paths, "0.5.0-beta.2");

      expect(manifest.source).toBe("namespace");
      expect(manifest.unpackedRoot).toBe(paths.unpackedRoot);
      await expect(readFile(join(paths.unpackedRoot, "Open Design.exe"), "utf8")).resolves.toBe("exe\n");
      await expect(readFile(join(paths.unpackedRoot, "resources", "open-design-config.json"), "utf8")).resolves.toContain(
        '"namespace":"second"',
      );
      await expect(readFile(join(paths.unpackedRoot, "resources", "app", "package.json"), "utf8")).resolves.toContain(
        '"version": "0.5.0-beta.2"',
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
