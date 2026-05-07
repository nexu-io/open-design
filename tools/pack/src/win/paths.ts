import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";
import { pathExists } from "./fs.js";
import { resolveWinInstallIdentity } from "./identity.js";
import type { WinPaths, WinRemovalTarget } from "./types.js";

export function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveWinPaths(config: ToolPackConfig): WinPaths {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const namespaceRoot = config.roots.output.namespaceRoot;
  const installDir = join(config.roots.runtime.namespaceRoot, "install", PRODUCT_NAME);
  const identity = resolveWinInstallIdentity(config);
  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot: join(namespaceRoot, "builder"),
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    blockmapPath: join(namespaceRoot, "builder", `${PRODUCT_NAME}-${namespaceToken}-setup.exe.blockmap`),
    builtManifestPath: join(namespaceRoot, "built-app.json"),
    exePath: join(namespaceRoot, "builder", `${PRODUCT_NAME}-${namespaceToken}.exe`),
    installDir,
    installedExePath: join(installDir, `${PRODUCT_NAME}.exe`),
    installerPayloadPath: join(namespaceRoot, "installer", "payload.7z"),
    installerScriptPath: join(namespaceRoot, "installer", "installer.nsi"),
    publicDesktopShortcutPath: join(process.env.PUBLIC ?? join(dirname(homedir()), "Public"), "Desktop", identity.shortcutName),
    installMarkerPath: join(namespaceRoot, "logs", "install.marker.json"),
    installTimingPath: join(namespaceRoot, "logs", "install.timing.json"),
    latestYmlPath: join(namespaceRoot, "builder", "latest.yml"),
    nsisLogPath: join(namespaceRoot, "logs", "nsis.log"),
    nsisIncludePath: join(namespaceRoot, "nsis", "installer.nsh"),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
    setupPath: join(namespaceRoot, "builder", `${PRODUCT_NAME}-${namespaceToken}-setup.exe`),
    startMenuShortcutPath: join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", identity.shortcutName),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userDesktopShortcutPath: join(homedir(), "Desktop", identity.shortcutName),
    uninstallMarkerPath: join(namespaceRoot, "logs", "uninstall.marker.json"),
    uninstallTimingPath: join(namespaceRoot, "logs", "uninstall.timing.json"),
    uninstallerPath: join(installDir, identity.uninstallerName),
    webStandaloneHookAuditPath: join(namespaceRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(namespaceRoot, "web-standalone-after-pack-config.json"),
    winIconPath: join(namespaceRoot, "resources", "win", "icon.ico"),
    unpackedExePath: join(namespaceRoot, "builder", "win-unpacked", `${PRODUCT_NAME}.exe`),
    unpackedRoot: join(namespaceRoot, "builder", "win-unpacked"),
  };
}

export function resolveWinProductUserDataRoot(): string {
  return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), PRODUCT_NAME);
}

export function resolveWinUninstallLocalDataRoot(config: ToolPackConfig): string {
  return config.portable ? `$APPDATA\\${PRODUCT_NAME}` : config.roots.runtime.namespaceRoot;
}

export function resolveWinProductNamespaceRoot(config: ToolPackConfig): string {
  return join(resolveWinProductUserDataRoot(), "namespaces", config.namespace);
}

export function resolveWinLocalDataRoot(config: ToolPackConfig): string {
  return resolveWinProductNamespaceRoot(config);
}

export async function createWinRemovalPlan(config: ToolPackConfig): Promise<WinRemovalTarget[]> {
  const runtimeRoot = config.roots.runtime.namespaceRoot;
  const targets: Array<Omit<WinRemovalTarget, "exists">> = [
    { path: join(runtimeRoot, "data"), scope: "data", willRemove: config.removeData },
    { path: join(runtimeRoot, "logs"), scope: "logs", willRemove: config.removeLogs },
    { path: join(runtimeRoot, "runtime"), scope: "sidecars", willRemove: config.removeSidecars },
    {
      path: resolveWinLocalDataRoot(config),
      scope: "product-user-data",
      willRemove: config.removeProductUserData,
    },
  ];
  return await Promise.all(targets.map(async (target) => ({ ...target, exists: await pathExists(target.path) })));
}
