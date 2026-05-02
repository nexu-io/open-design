import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, appendFile, chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type DesktopStatusSnapshot,
  type DesktopEvalResult,
  type DesktopScreenshotResult,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { createSidecarLaunchEnv, requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import {
  collectProcessTreePids,
  createCommandInvocation,
  createPackageManagerInvocation,
  createProcessStampArgs,
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail,
  spawnBackgroundProcess,
  stopProcesses,
} from "@open-design/platform";

import type { ToolPackConfig } from "./config.js";
import { winResources } from "./resources.js";

const execFileAsync = promisify(execFile);
const PRODUCT_NAME = "Open Design";
const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";
const NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE = {
  en: "en_US",
  fa: "fa_IR",
  "pt-BR": "pt_BR",
  ru: "ru_RU",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
} as const;

const INTERNAL_PACKAGES = [
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

type PackedTarballInfo = {
  fileName: string;
  packageName: (typeof INTERNAL_PACKAGES)[number]["name"];
};

type WinPaths = {
  appBuilderConfigPath: string;
  appBuilderOutputRoot: string;
  assembledAppRoot: string;
  assembledMainEntryPath: string;
  assembledPackageJsonPath: string;
  blockmapPath: string;
  exePath: string;
  installDir: string;
  installedExePath: string;
  publicDesktopShortcutPath: string;
  latestYmlPath: string;
  installMarkerPath: string;
  installTimingPath: string;
  nsisLogPath: string;
  nsisIncludePath: string;
  packagedConfigPath: string;
  resourceRoot: string;
  setupPath: string;
  startMenuShortcutPath: string;
  tarballsRoot: string;
  userDesktopShortcutPath: string;
  uninstallMarkerPath: string;
  uninstallTimingPath: string;
  uninstallerPath: string;
  winIconPath: string;
  unpackedExePath: string;
  unpackedRoot: string;
};

export type WinPackResult = {
  blockmapPath: string | null;
  installerPath: string | null;
  latestYmlPath: string | null;
  outputRoot: string;
  resourceRoot: string;
  runtimeNamespaceRoot: string;
  to: ToolPackConfig["to"];
  unpackedPath: string | null;
};

export type WinInstallResult = {
  desktopShortcutExists: boolean;
  desktopShortcutPath: string;
  installDir: string;
  installerPath: string;
  markerPath: string;
  namespace: string;
  nsisLogPath: string;
  registryEntries: WindowsUninstallRegistryEntry[];
  startMenuShortcutExists: boolean;
  startMenuShortcutPath: string;
  timingPath: string;
  uninstallerPath: string;
};

export type WinStartResult = {
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: "built" | "installed";
  status: DesktopStatusSnapshot | null;
};

export type WinStopResult = {
  gracefulRequested: boolean;
  namespace: string;
  remainingPids: number[];
  status: "not-running" | "partial" | "stopped";
  stoppedPids: number[];
};

export type WinUninstallResult = {
  markerPath: string;
  namespace: string;
  nsisLogPath: string;
  registryResiduesRemoved: string[];
  removedDataRoot: boolean;
  removedLogsRoot: boolean;
  removedProductUserDataRoot: boolean;
  removedSidecarRoot: boolean;
  removalPlan: WinRemovalTarget[];
  residueObservation: WinResidueObservation;
  stop: WinStopResult;
  timingPath: string;
  uninstallerPath: string;
};

export type WinCleanupResult = {
  namespace: string;
  removedOutputRoot: boolean;
  removedProductUserDataRoot: boolean;
  removedRuntimeNamespaceRoot: boolean;
  removalPlan: WinRemovalTarget[];
  residueObservation: WinResidueObservation;
  stop: WinStopResult;
};

type WindowsUninstallRegistryEntry = {
  displayIcon: string | null;
  displayName: string | null;
  displayVersion: string | null;
  installLocation: string | null;
  keyPath: string;
  publisher: string | null;
  quietUninstallString: string | null;
  uninstallString: string | null;
};

export type WinResidueObservation = {
  installDirExists: boolean;
  installedExeExists: boolean;
  managedProcessPids: number[];
  productNamespaceRootExists: boolean;
  productUserDataRootExists: boolean;
  publicDesktopShortcutExists: boolean;
  registryResidues: string[];
  runtimeNamespaceRootExists: boolean;
  startMenuShortcutExists: boolean;
  uninstallerExists: boolean;
  userDesktopShortcutExists: boolean;
};

export type WinRemovalTarget = {
  exists: boolean;
  path: string;
  scope: "data" | "logs" | "product-user-data" | "sidecars";
  willRemove: boolean;
};

export type WinListResult = {
  current: {
    installDir: string;
    publicDesktopShortcutExists: boolean;
    publicDesktopShortcutPath: string;
    installedExeExists: boolean;
    installedExePath: string;
    namespace: string;
    registryEntries: WindowsUninstallRegistryEntry[];
    registryResidues: string[];
    productNamespaceRoot: string;
    productNamespaceRootExists: boolean;
    productUserDataRoot: string;
    productUserDataRootExists: boolean;
    removalPlan: WinRemovalTarget[];
    runtimeNamespaceRoot: string;
    runtimeNamespaceRootExists: boolean;
    setupExists: boolean;
    setupPath: string;
    startMenuShortcutExists: boolean;
    startMenuShortcutPath: string;
    uninstallerExists: boolean;
    uninstallerPath: string;
    userDesktopShortcutExists: boolean;
    userDesktopShortcutPath: string;
  };
  outputNamespaces: string[];
  runtimeNamespaces: string[];
};

export type WinResetResult = {
  namespaces: string[];
  results: WinCleanupResult[];
};

export type WinInspectResult = {
  eval?: DesktopEvalResult;
  screenshot?: DesktopScreenshotResult;
  status: DesktopStatusSnapshot | null;
};

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function resolveWinPaths(config: ToolPackConfig): WinPaths {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const namespaceRoot = config.roots.output.namespaceRoot;
  const installDir = join(config.roots.runtime.namespaceRoot, "install", PRODUCT_NAME);
  const shortcutName = `${PRODUCT_NAME}.lnk`;
  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot: join(namespaceRoot, "builder"),
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    blockmapPath: join(namespaceRoot, "builder", `${PRODUCT_NAME}-${namespaceToken}-setup.exe.blockmap`),
    exePath: join(namespaceRoot, "builder", `${PRODUCT_NAME}-${namespaceToken}.exe`),
    installDir,
    installedExePath: join(installDir, `${PRODUCT_NAME}.exe`),
    publicDesktopShortcutPath: join(process.env.PUBLIC ?? join(dirname(homedir()), "Public"), "Desktop", shortcutName),
    installMarkerPath: join(namespaceRoot, "logs", "install.marker.json"),
    installTimingPath: join(namespaceRoot, "logs", "install.timing.json"),
    latestYmlPath: join(namespaceRoot, "builder", "latest.yml"),
    nsisLogPath: join(namespaceRoot, "logs", "nsis.log"),
    nsisIncludePath: join(namespaceRoot, "nsis", "installer.nsh"),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
    setupPath: join(namespaceRoot, "builder", `${PRODUCT_NAME}-${namespaceToken}-setup.exe`),
    startMenuShortcutPath: join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", shortcutName),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userDesktopShortcutPath: join(homedir(), "Desktop", shortcutName),
    uninstallMarkerPath: join(namespaceRoot, "logs", "uninstall.marker.json"),
    uninstallTimingPath: join(namespaceRoot, "logs", "uninstall.timing.json"),
    uninstallerPath: join(installDir, `Uninstall ${PRODUCT_NAME}.exe`),
    winIconPath: join(namespaceRoot, "resources", "win", "icon.ico"),
    unpackedExePath: join(namespaceRoot, "builder", "win-unpacked", `${PRODUCT_NAME}.exe`),
    unpackedRoot: join(namespaceRoot, "builder", "win-unpacked"),
  };
}

function resolveWinProductUserDataRoot(): string {
  return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), PRODUCT_NAME);
}

function resolveWinUninstallLocalDataRoot(config: ToolPackConfig): string {
  return config.portable ? `$APPDATA\\${PRODUCT_NAME}` : config.roots.runtime.namespaceRoot;
}

function escapeNsisString(value: string): string {
  return value.replace(/"/g, '$\\"').replace(/\r?\n/g, "$\\r$\\n");
}

async function writeNsisInclude(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  const localDataRoot = escapeNsisString(resolveWinUninstallLocalDataRoot(config));
  await mkdir(dirname(paths.nsisIncludePath), { recursive: true });
  await writeFile(
    paths.nsisIncludePath,
    `!include LogicLib.nsh
!include nsDialogs.nsh

Var /GLOBAL odRemoveLocalData
Var /GLOBAL odRemoveLocalDataCheckbox
Var /GLOBAL odLocalDataRoot

LangString OD_REMOVE_LOCAL_DATA_TITLE 1033 "Remove local data"
LangString OD_REMOVE_LOCAL_DATA_TITLE 2052 "删除本地数据"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1028 "刪除本機資料"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1046 "Remover dados locais"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1049 "Удалить локальные данные"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1065 "حذف داده‌های محلی"

LangString OD_REMOVE_LOCAL_DATA_HINT 1033 "Choose whether the uninstaller should remove Open Design data stored on this computer."
LangString OD_REMOVE_LOCAL_DATA_HINT 2052 "请选择卸载程序是否删除此电脑上保存的 Open Design 数据。"
LangString OD_REMOVE_LOCAL_DATA_HINT 1028 "請選擇解除安裝程式是否刪除此電腦上儲存的 Open Design 資料。"
LangString OD_REMOVE_LOCAL_DATA_HINT 1046 "Escolha se o desinstalador deve remover os dados do Open Design armazenados neste computador."
LangString OD_REMOVE_LOCAL_DATA_HINT 1049 "Выберите, должен ли деинсталлятор удалить данные Open Design, сохраненные на этом компьютере."
LangString OD_REMOVE_LOCAL_DATA_HINT 1065 "انتخاب کنید که حذف‌کننده داده‌های Open Design ذخیره‌شده در این رایانه را حذف کند یا نه."

LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1033 "Remove local Open Design data:"
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 2052 "删除本地 Open Design 数据："
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1028 "刪除本機 Open Design 資料："
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1046 "Remover dados locais do Open Design:"
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1049 "Удалить локальные данные Open Design:"
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1065 "حذف داده‌های محلی Open Design:"

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.OpenDesignLocalDataPage un.OpenDesignLocalDataPageLeave
!macroend

Function un.OpenDesignLocalDataPage
  StrCpy $odRemoveLocalData "1"
  StrCpy $odLocalDataRoot "${localDataRoot}"
  nsDialogs::Create 1018
  Pop $0
  \${If} $0 == error
    Abort
  \${EndIf}

  \${NSD_CreateLabel} 0 0 100% 24u "$(OD_REMOVE_LOCAL_DATA_HINT)"
  Pop $0
  \${NSD_CreateCheckbox} 0 34u 100% 36u "$(OD_REMOVE_LOCAL_DATA_CHECKBOX) $odLocalDataRoot"
  Pop $odRemoveLocalDataCheckbox
  \${NSD_Check} $odRemoveLocalDataCheckbox
  nsDialogs::Show
FunctionEnd

Function un.OpenDesignLocalDataPageLeave
  \${NSD_GetState} $odRemoveLocalDataCheckbox $0
  \${If} $0 == \${BST_CHECKED}
    StrCpy $odRemoveLocalData "1"
  \${Else}
    StrCpy $odRemoveLocalData "0"
  \${EndIf}
FunctionEnd

!macro customUnInstall
  \${If} $odLocalDataRoot == ""
    StrCpy $odLocalDataRoot "${localDataRoot}"
  \${EndIf}
  \${If} $odRemoveLocalData != "0"
    DetailPrint "Removing local Open Design data: $odLocalDataRoot"
    RMDir /r "$odLocalDataRoot"
  \${EndIf}
!macroend
`,
    "utf8",
  );
}

function resolveWinProductNamespaceRoot(config: ToolPackConfig): string {
  return join(resolveWinProductUserDataRoot(), "namespaces", config.namespace);
}

async function createWinRemovalPlan(config: ToolPackConfig): Promise<WinRemovalTarget[]> {
  const runtimeRoot = config.roots.runtime.namespaceRoot;
  const targets: Array<Omit<WinRemovalTarget, "exists">> = [
    { path: join(runtimeRoot, "data"), scope: "data", willRemove: config.removeData },
    { path: join(runtimeRoot, "logs"), scope: "logs", willRemove: config.removeLogs },
    { path: join(runtimeRoot, "runtime"), scope: "sidecars", willRemove: config.removeSidecars },
    {
      path: resolveWinProductUserDataRoot(),
      scope: "product-user-data",
      willRemove: config.removeProductUserData,
    },
  ];
  return await Promise.all(targets.map(async (target) => ({ ...target, exists: await pathExists(target.path) })));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listChildDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

async function findNsisLanguageDirectories(root: string, depth = 4): Promise<string[]> {
  const languageDir = join(root, "Contrib", "Language files");
  if (await pathExists(join(languageDir, "Farsi.nlf"))) return [languageDir];
  if (depth <= 0) return [];
  const children = await listChildDirectories(root);
  const nested = await Promise.all(children.map((child) => findNsisLanguageDirectories(child, depth - 1)));
  return nested.flat();
}

async function ensureNsisPersianLanguageAlias(config: ToolPackConfig): Promise<boolean> {
  const cacheRoots = [
    process.env.ELECTRON_BUILDER_CACHE,
    process.env.LOCALAPPDATA == null ? undefined : join(process.env.LOCALAPPDATA, "electron-builder", "Cache"),
    process.env.APPDATA == null ? undefined : join(process.env.APPDATA, "electron-builder", "Cache"),
    join(config.workspaceRoot, "node_modules", ".cache", "electron-builder"),
  ].filter((entry): entry is string => entry != null && entry.length > 0);
  let updated = false;
  for (const cacheRoot of cacheRoots) {
    for (const languageDir of await findNsisLanguageDirectories(cacheRoot)) {
      let updatedLanguageDir = false;
      const farsiNlf = join(languageDir, "Farsi.nlf");
      const farsiNsh = join(languageDir, "Farsi.nsh");
      const persianNlf = join(languageDir, "Persian.nlf");
      const persianNsh = join(languageDir, "Persian.nsh");
      if ((await pathExists(farsiNlf)) && !(await pathExists(persianNlf))) {
        await cp(farsiNlf, persianNlf);
        updatedLanguageDir = true;
        updated = true;
      }
      if (await pathExists(farsiNsh)) {
        const farsiMessages = await readFile(farsiNsh, "utf8");
        const persianMessages = farsiMessages.replace('LANGFILE "Farsi"', 'LANGFILE "Persian"');
        const existingPersianMessages = await readFile(persianNsh, "utf8").catch(() => null);
        if (existingPersianMessages !== persianMessages) {
          await writeFile(persianNsh, persianMessages, "utf8");
          updatedLanguageDir = true;
          updated = true;
        }
      }
      if (updatedLanguageDir) {
        process.stderr.write(`[tools-pack] added NSIS Persian language alias in ${languageDir}\n`);
      }
    }
  }
  return updated;
}

async function removeTree(filePath: string): Promise<void> {
  await rm(filePath, { force: true, maxRetries: 20, recursive: true, retryDelay: 250 });
}

async function appendNsisLog(paths: WinPaths, message: string, meta: Record<string, unknown> = {}): Promise<void> {
  await mkdir(dirname(paths.nsisLogPath), { recursive: true });
  await appendFile(paths.nsisLogPath, `${JSON.stringify({ message, meta, timestamp: new Date().toISOString() })}\n`, "utf8");
}

async function runTimed<T>(timingPath: string, action: string, task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await task();
    await mkdir(dirname(timingPath), { recursive: true });
    await writeFile(timingPath, `${JSON.stringify({ action, durationMs: Date.now() - startedAt, status: "success" }, null, 2)}\n`, "utf8");
    return result;
  } catch (error) {
    await mkdir(dirname(timingPath), { recursive: true });
    await writeFile(
      timingPath,
      `${JSON.stringify({ action, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), status: "failed" }, null, 2)}\n`,
      "utf8",
    );
    throw error;
  }
}

function normalizeRegistryPath(value: string | null | undefined): string {
  return (value ?? "").replace(/[\\/]+$/, "").toLowerCase();
}

function stripRegistryQuotedValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.startsWith('"')) {
    const closingQuote = trimmed.indexOf('"', 1);
    if (closingQuote > 0) return trimmed.slice(1, closingQuote);
  }
  return trimmed;
}

function createEmptyRegistryEntry(keyPath: string): WindowsUninstallRegistryEntry {
  return {
    displayIcon: null,
    displayName: null,
    displayVersion: null,
    installLocation: null,
    keyPath,
    publisher: null,
    quietUninstallString: null,
    uninstallString: null,
  };
}

async function execReg(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync("reg.exe", args, { cwd, env: process.env, windowsHide: true });
}

function registryEntryMatches(paths: WinPaths, entry: WindowsUninstallRegistryEntry): boolean {
  const targetInstallDir = normalizeRegistryPath(paths.installDir);
  const targetUninstaller = normalizeRegistryPath(paths.uninstallerPath);
  const installLocation = normalizeRegistryPath(entry.installLocation);
  const displayIcon = normalizeRegistryPath(stripRegistryQuotedValue(entry.displayIcon));
  const uninstallString = normalizeRegistryPath(stripRegistryQuotedValue(entry.uninstallString));
  const quietUninstallString = normalizeRegistryPath(stripRegistryQuotedValue(entry.quietUninstallString));
  return (
    installLocation === targetInstallDir ||
    displayIcon.includes(normalizeRegistryPath(paths.installedExePath)) ||
    uninstallString.includes(targetUninstaller) ||
    quietUninstallString.includes(targetUninstaller)
  );
}

async function queryWinRegistryEntries(paths: WinPaths): Promise<WindowsUninstallRegistryEntry[]> {
  const roots = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ];
  const entries: WindowsUninstallRegistryEntry[] = [];
  for (const root of roots) {
    let stdout = "";
    try {
      ({ stdout } = await execReg(["query", root, "/s"], await pathExists(paths.appBuilderOutputRoot) ? paths.appBuilderOutputRoot : process.cwd()));
    } catch {
      continue;
    }
    let current: WindowsUninstallRegistryEntry | null = null;
    const collect = () => {
      if (current != null && registryEntryMatches(paths, current)) entries.push(current);
    };
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (line.length === 0) continue;
      if (line.startsWith("HKEY_")) {
        collect();
        current = createEmptyRegistryEntry(line);
        continue;
      }
      if (current == null) continue;
      const [name, , ...valueParts] = line.trim().split(/\s{2,}/);
      if (name == null || valueParts.length === 0) continue;
      const value = valueParts.join("  ");
      if (name === "DisplayIcon") current.displayIcon = value;
      else if (name === "DisplayName") current.displayName = value;
      else if (name === "DisplayVersion") current.displayVersion = value;
      else if (name === "InstallLocation") current.installLocation = value;
      else if (name === "Publisher") current.publisher = value;
      else if (name === "QuietUninstallString") current.quietUninstallString = value;
      else if (name === "UninstallString") current.uninstallString = value;
    }
    collect();
  }
  return entries;
}

async function cleanupWinRegistryResidues(paths: WinPaths): Promise<string[]> {
  const entries = await queryWinRegistryEntries(paths);
  const removed: string[] = [];
  for (const entry of entries) {
    try {
      await execReg(["delete", entry.keyPath, "/f"], await pathExists(paths.appBuilderOutputRoot) ? paths.appBuilderOutputRoot : process.cwd());
      removed.push(entry.keyPath);
    } catch {
      // HKLM residues may require elevation; keep observing them instead of hiding failure.
    }
  }
  return removed;
}

async function runPnpm(config: ToolPackConfig, args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  const invocation = createPackageManagerInvocation(args, process.env);
  await execFileAsync(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function runNpmInstall(appRoot: string): Promise<void> {
  const invocation = createCommandInvocation({
    args: ["install", "--omit=dev", "--no-package-lock"],
    command: process.platform === "win32" ? "npm.cmd" : "npm",
  });
  await execFileAsync(invocation.command, invocation.args, { cwd: appRoot, env: process.env });
}

async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  const packageJsonPath = join(config.workspaceRoot, "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing apps/packaged package version in ${packageJsonPath}`);
  }
  return packageJson.version;
}

async function buildWorkspaceArtifacts(config: ToolPackConfig): Promise<void> {
  const webNextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousWebNextEnv = await readFile(webNextEnvPath, "utf8").catch(() => null);

  await runPnpm(config, ["--filter", "@open-design/sidecar-proto", "build"]);
  await runPnpm(config, ["--filter", "@open-design/sidecar", "build"]);
  await runPnpm(config, ["--filter", "@open-design/platform", "build"]);
  await runPnpm(config, ["--filter", "@open-design/daemon", "build"]);
  try {
    await runPnpm(config, ["--filter", "@open-design/web", "build"], { OD_WEB_OUTPUT_MODE: "server" });
    await runPnpm(config, ["--filter", "@open-design/web", "build:sidecar"]);
  } finally {
    if (previousWebNextEnv == null) await rm(webNextEnvPath, { force: true });
    else await writeFile(webNextEnvPath, previousWebNextEnv, "utf8");
  }
  await runPnpm(config, ["--filter", "@open-design/desktop", "build"]);
  await runPnpm(config, ["--filter", "@open-design/packaged", "build"]);
}

async function copyResourceTree(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  await removeTree(paths.resourceRoot);
  await mkdir(paths.resourceRoot, { recursive: true });
  await cp(join(config.workspaceRoot, "skills"), join(paths.resourceRoot, "skills"), { recursive: true });
  await cp(join(config.workspaceRoot, "design-systems"), join(paths.resourceRoot, "design-systems"), { recursive: true });
  await cp(join(config.workspaceRoot, "assets", "frames"), join(paths.resourceRoot, "frames"), { recursive: true });
  await mkdir(join(paths.resourceRoot, "bin"), { recursive: true });
  await cp(process.execPath, join(paths.resourceRoot, "bin", "node.exe"));
  await chmod(join(paths.resourceRoot, "bin", "node.exe"), 0o755).catch(() => undefined);
}

async function copyWinIcon(paths: WinPaths): Promise<void> {
  await mkdir(dirname(paths.winIconPath), { recursive: true });
  await cp(winResources.icon, paths.winIconPath);
}

async function collectWorkspaceTarballs(config: ToolPackConfig, paths: WinPaths): Promise<PackedTarballInfo[]> {
  await removeTree(paths.tarballsRoot);
  await mkdir(paths.tarballsRoot, { recursive: true });
  const packedTarballs: PackedTarballInfo[] = [];
  for (const packageInfo of INTERNAL_PACKAGES) {
    const beforeEntries = new Set(await readdir(paths.tarballsRoot));
    await runPnpm(config, ["-C", packageInfo.directory, "pack", "--pack-destination", paths.tarballsRoot]);
    const newEntries = (await readdir(paths.tarballsRoot)).filter((entry) => !beforeEntries.has(entry));
    if (newEntries.length !== 1 || newEntries[0] == null) {
      throw new Error(`expected one tarball for ${packageInfo.name}, got ${newEntries.length}`);
    }
    packedTarballs.push({ fileName: newEntries[0], packageName: packageInfo.name });
  }
  return packedTarballs;
}

async function writeAssembledApp(config: ToolPackConfig, paths: WinPaths, packedTarballs: PackedTarballInfo[]): Promise<void> {
  const packagedVersion = await readPackagedVersion(config);
  const tarballByPackage = Object.fromEntries(packedTarballs.map((entry) => [entry.packageName, entry.fileName] as const));
  const dependencies = Object.fromEntries(
    INTERNAL_PACKAGES.map((packageInfo) => {
      const tarball = tarballByPackage[packageInfo.name];
      if (tarball == null) throw new Error(`missing tarball for ${packageInfo.name}`);
      return [packageInfo.name, `file:${relative(paths.assembledAppRoot, join(paths.tarballsRoot, tarball))}`];
    }),
  );

  await removeTree(join(config.roots.output.namespaceRoot, "assembled"));
  await mkdir(paths.assembledAppRoot, { recursive: true });
  await writeFile(
    paths.assembledPackageJsonPath,
    `${JSON.stringify(
      {
        dependencies,
        description: "Open Design packaged runtime",
        main: "./main.cjs",
        name: "open-design-packaged-app",
        private: true,
        productName: PRODUCT_NAME,
        version: packagedVersion,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    paths.assembledMainEntryPath,
    'import("@open-design/packaged").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n',
    "utf8",
  );
  await writeFile(
    paths.packagedConfigPath,
    `${JSON.stringify(
      {
        namespace: config.namespace,
        nodeCommandRelative: join("open-design", "bin", "node.exe"),
        ...(config.portable ? {} : { namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot }),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await runNpmInstall(paths.assembledAppRoot);
}

function resolveWinTargets(to: ToolPackConfig["to"]): Array<"dir" | "nsis"> {
  switch (to) {
    case "dir":
      return ["dir"];
    case "all":
      return ["dir", "nsis"];
    case "nsis":
      return ["nsis"];
    default:
      throw new Error(`unsupported win target: ${to}`);
  }
}

async function runElectronBuilder(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const packagedVersion = await readPackagedVersion(config);
  const builderConfig = {
    appId: "io.open-design.desktop",
    asar: false,
    buildDependenciesFromSource: false,
    compression: "maximum",
    directories: { output: paths.appBuilderOutputRoot },
    electronDist: config.electronDistPath,
    electronVersion: config.electronVersion,
    executableName: PRODUCT_NAME,
    extraMetadata: {
      main: "./main.cjs",
      name: "open-design-packaged-app",
      productName: PRODUCT_NAME,
      version: packagedVersion,
    },
    extraResources: [
      { from: paths.resourceRoot, to: "open-design" },
      { from: paths.packagedConfigPath, to: "open-design-config.json" },
    ],
    files: ["**/*", "!**/node_modules/.bin", "!**/node_modules/electron{,/**/*}"],
    forceCodeSigning: false,
    icon: paths.winIconPath,
    nodeGypRebuild: false,
    npmRebuild: false,
    nsis: {
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      artifactName: `${PRODUCT_NAME}-${namespaceToken}-setup.\${ext}`,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      displayLanguageSelector: false,
      include: paths.nsisIncludePath,
      installerLanguages: Object.values(NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE),
      language: "1033",
      multiLanguageInstaller: true,
      oneClick: false,
      perMachine: false,
      shortcutName: PRODUCT_NAME,
      warningsAsErrors: false,
    },
    productName: PRODUCT_NAME,
    publish: [{ provider: "generic", url: "https://updates.invalid/open-design" }],
    win: {
      artifactName: `${PRODUCT_NAME}-${namespaceToken}.\${ext}`,
      icon: paths.winIconPath,
      target: resolveWinTargets(config.to).map((target) => ({ arch: ["x64"], target })),
    },
  };

  await removeTree(paths.appBuilderOutputRoot);
  await mkdir(dirname(paths.appBuilderConfigPath), { recursive: true });
  await writeNsisInclude(config, paths);
  await writeFile(paths.appBuilderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, "utf8");
  const build = async () => {
    await execFileAsync(process.execPath, [
      config.electronBuilderCliPath,
      "--win",
      "--projectDir",
      paths.assembledAppRoot,
      "--config",
      paths.appBuilderConfigPath,
      "--publish",
      "never",
    ], {
      cwd: config.workspaceRoot,
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    });
  };
  await ensureNsisPersianLanguageAlias(config);
  try {
    await build();
  } catch (error) {
    const output = `${(error as { stdout?: unknown }).stdout ?? ""}\n${(error as { stderr?: unknown }).stderr ?? ""}`;
    if (output.includes("Persian.nlf") && await ensureNsisPersianLanguageAlias(config)) {
      await build();
      return;
    }
    throw error;
  }
}

async function writeLocalLatestYml(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  if (!(await pathExists(paths.setupPath))) return;
  const packagedVersion = await readPackagedVersion(config);
  const setupPayload = await readFile(paths.setupPath);
  const setupMetadata = await stat(paths.setupPath);
  const sha512 = createHash("sha512").update(setupPayload).digest("base64");
  const setupName = basename(paths.setupPath);
  await writeFile(
    paths.latestYmlPath,
    [
      `version: ${JSON.stringify(packagedVersion)}`,
      "files:",
      `  - url: ${JSON.stringify(setupName)}`,
      `    sha512: ${JSON.stringify(sha512)}`,
      `    size: ${setupMetadata.size}`,
      `path: ${JSON.stringify(setupName)}`,
      `sha512: ${JSON.stringify(sha512)}`,
      `releaseDate: ${JSON.stringify(new Date().toISOString())}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function packWin(config: ToolPackConfig): Promise<WinPackResult> {
  const paths = resolveWinPaths(config);
  await buildWorkspaceArtifacts(config);
  await copyResourceTree(config, paths);
  await copyWinIcon(paths);
  const tarballs = await collectWorkspaceTarballs(config, paths);
  await writeAssembledApp(config, paths, tarballs);
  await runElectronBuilder(config, paths);
  await writeLocalLatestYml(config, paths);
  return {
    blockmapPath: (await pathExists(paths.blockmapPath)) ? paths.blockmapPath : null,
    installerPath: (await pathExists(paths.setupPath)) ? paths.setupPath : null,
    latestYmlPath: (await pathExists(paths.latestYmlPath)) ? paths.latestYmlPath : null,
    outputRoot: config.roots.output.namespaceRoot,
    resourceRoot: paths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    to: config.to,
    unpackedPath: (await pathExists(paths.unpackedRoot)) ? paths.unpackedRoot : null,
  };
}

function desktopStamp(config: ToolPackConfig): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({ app: APP_KEYS.DESKTOP, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: config.namespace }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace: config.namespace,
    source: SIDECAR_SOURCES.TOOLS_PACK,
  };
}

function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

function desktopIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
}

async function waitForDesktopStatus(config: ToolPackConfig, timeoutMs = 45_000): Promise<DesktopStatusSnapshot | null> {
  const stamp = desktopStamp(config);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await requestJsonIpc<DesktopStatusSnapshot>(stamp.ipc, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 1000 });
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    }
  }
  return null;
}

function installArgs(config: ToolPackConfig, paths: WinPaths): string[] {
  return [...(config.silent ? ["/S"] : []), `/D=${paths.installDir}`];
}

async function writeJsonMarker(filePath: string, payload: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function invokeNsis(paths: WinPaths, command: string, args: string[], action: "install" | "uninstall"): Promise<void> {
  await appendNsisLog(paths, `${action} started`, { args, command });
  try {
    await execFileAsync(command, args, { cwd: dirname(command), windowsHide: true });
    await appendNsisLog(paths, `${action} finished`, { code: 0, command });
  } catch (error) {
    const failure = error as { code?: unknown; stderr?: unknown; stdout?: unknown };
    await appendNsisLog(paths, `${action} failed`, {
      code: failure.code,
      command,
      stderr: typeof failure.stderr === "string" ? failure.stderr : undefined,
      stdout: typeof failure.stdout === "string" ? failure.stdout : undefined,
    });
    throw error;
  }
}

async function observeWinResidues(config: ToolPackConfig, paths = resolveWinPaths(config)): Promise<WinResidueObservation> {
  return {
    installDirExists: await pathExists(paths.installDir),
    installedExeExists: await pathExists(paths.installedExePath),
    managedProcessPids: await findManagedDesktopProcessTree(config),
    productNamespaceRootExists: await pathExists(resolveWinProductNamespaceRoot(config)),
    productUserDataRootExists: await pathExists(resolveWinProductUserDataRoot()),
    publicDesktopShortcutExists: await pathExists(paths.publicDesktopShortcutPath),
    registryResidues: (await queryWinRegistryEntries(paths)).map((entry) => entry.keyPath),
    runtimeNamespaceRootExists: await pathExists(config.roots.runtime.namespaceRoot),
    startMenuShortcutExists: await pathExists(paths.startMenuShortcutPath),
    uninstallerExists: await pathExists(paths.uninstallerPath),
    userDesktopShortcutExists: await pathExists(paths.userDesktopShortcutPath),
  };
}

export async function installPackedWinApp(config: ToolPackConfig): Promise<WinInstallResult> {
  const paths = resolveWinPaths(config);
  if (!(await pathExists(paths.setupPath))) throw new Error(`no windows installer found at ${paths.setupPath}; run tools-pack win build first`);
  if (await pathExists(paths.uninstallerPath)) {
    await uninstallPackedWinApp(config);
  } else {
    await removeTree(paths.installDir);
  }
  await mkdir(dirname(paths.installDir), { recursive: true });
  await runTimed(paths.installTimingPath, "install", async () => {
    await invokeNsis(paths, paths.setupPath, installArgs(config, paths), "install");
  });
  if (!(await pathExists(paths.installedExePath))) throw new Error(`installer completed but executable is missing at ${paths.installedExePath}`);
  const registryEntries = await queryWinRegistryEntries(paths);
  await writeJsonMarker(paths.installMarkerPath, {
    installedAt: new Date().toISOString(),
    installDir: paths.installDir,
    namespace: config.namespace,
    registryEntries: registryEntries.map((entry) => entry.keyPath),
  });
  return {
    desktopShortcutExists: await pathExists(paths.userDesktopShortcutPath),
    desktopShortcutPath: paths.userDesktopShortcutPath,
    installDir: paths.installDir,
    installerPath: paths.setupPath,
    markerPath: paths.installMarkerPath,
    namespace: config.namespace,
    nsisLogPath: paths.nsisLogPath,
    registryEntries,
    startMenuShortcutExists: await pathExists(paths.startMenuShortcutPath),
    startMenuShortcutPath: paths.startMenuShortcutPath,
    timingPath: paths.installTimingPath,
    uninstallerPath: paths.uninstallerPath,
  };
}

async function resolveStartTarget(config: ToolPackConfig): Promise<{ executablePath: string; source: "built" | "installed" }> {
  const paths = resolveWinPaths(config);
  if (await pathExists(paths.installedExePath)) return { executablePath: paths.installedExePath, source: "installed" };
  if (await pathExists(paths.unpackedExePath)) return { executablePath: paths.unpackedExePath, source: "built" };
  throw new Error(`no windows app executable found for namespace=${config.namespace}; run tools-pack win build first or tools-pack win install after building an NSIS installer`);
}

export async function startPackedWinApp(config: ToolPackConfig): Promise<WinStartResult> {
  const target = await resolveStartTarget(config);
  const stamp = desktopStamp(config);
  const logPath = desktopLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");
  const spawned = await spawnBackgroundProcess({
    args: createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
    command: target.executablePath,
    cwd: dirname(target.executablePath),
    env: createSidecarLaunchEnv({
      base: join(config.roots.runtime.namespaceRoot, "runtime"),
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      extraEnv: { ...process.env, [DESKTOP_LOG_ECHO_ENV]: "0" },
      stamp,
    }),
    logFd: null,
  });
  return { executablePath: target.executablePath, logPath, namespace: config.namespace, pid: spawned.pid, source: target.source, status: await waitForDesktopStatus(config) };
}

async function findManagedDesktopProcessTree(config: ToolPackConfig): Promise<number[]> {
  const processes = await listProcessSnapshots();
  const stampedRootPids = processes
    .filter((processInfo) =>
      matchesStampedProcess(processInfo, { mode: SIDECAR_MODES.RUNTIME, namespace: config.namespace, source: SIDECAR_SOURCES.TOOLS_PACK }, OPEN_DESIGN_SIDECAR_CONTRACT),
    )
    .map((processInfo) => processInfo.pid);
  return collectProcessTreePids(processes, stampedRootPids);
}

async function waitForNoManagedDesktopProcesses(config: ToolPackConfig, timeoutMs = 6000): Promise<number[]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const pids = await findManagedDesktopProcessTree(config);
    if (pids.length === 0) return [];
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  return await findManagedDesktopProcessTree(config);
}

export async function stopPackedWinApp(config: ToolPackConfig): Promise<WinStopResult> {
  const stamp = desktopStamp(config);
  const before = await findManagedDesktopProcessTree(config);
  let gracefulRequested = false;
  try {
    await requestJsonIpc(stamp.ipc, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1500 });
    gracefulRequested = true;
  } catch {
    gracefulRequested = false;
  }
  const remainingAfterGraceful = gracefulRequested ? await waitForNoManagedDesktopProcesses(config) : before;
  if (remainingAfterGraceful.length === 0) {
    await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
    return { gracefulRequested, namespace: config.namespace, remainingPids: [], status: before.length === 0 ? "not-running" : "stopped", stoppedPids: before };
  }
  const stopped = await stopProcesses(remainingAfterGraceful);
  if (stopped.remainingPids.length === 0) await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  return {
    gracefulRequested,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length === 0 ? "stopped" : "partial",
    stoppedPids: stopped.stoppedPids,
  };
}

export async function readPackedWinLogs(config: ToolPackConfig) {
  const paths = resolveWinPaths(config);
  const entries = await Promise.all(
    [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON].map(async (app) => {
      const logPath = join(config.roots.runtime.namespaceRoot, "logs", app, "latest.log");
      return [app, { lines: await readLogTail(logPath, 200), logPath }] as const;
    }),
  );
  return {
    logs: {
      ...Object.fromEntries(entries),
      nsis: { lines: await readLogTail(paths.nsisLogPath, 200), logPath: paths.nsisLogPath },
    },
    namespace: config.namespace,
  };
}

export async function uninstallPackedWinApp(config: ToolPackConfig): Promise<WinUninstallResult> {
  const paths = resolveWinPaths(config);
  const stop = await stopPackedWinApp(config);
  if (await pathExists(paths.uninstallerPath)) {
    await runTimed(paths.uninstallTimingPath, "uninstall", async () => {
      await invokeNsis(paths, paths.uninstallerPath, config.silent ? ["/S"] : [], "uninstall");
    });
  }
  await removeTree(paths.installDir);
  const registryResiduesRemoved = await cleanupWinRegistryResidues(paths);
  const removalPlan = await createWinRemovalPlan(config);
  await writeJsonMarker(paths.uninstallMarkerPath, {
    namespace: config.namespace,
    removalPlan,
    registryResiduesRemoved,
    uninstalledAt: new Date().toISOString(),
  }).catch(() => undefined);
  const removedDataRoot = removalPlan.some((target) => target.scope === "data" && target.willRemove && target.exists);
  const removedLogsRoot = removalPlan.some((target) => target.scope === "logs" && target.willRemove && target.exists);
  const removedSidecarRoot = removalPlan.some((target) => target.scope === "sidecars" && target.willRemove && target.exists);
  const removedProductUserDataRoot = removalPlan.some((target) => target.scope === "product-user-data" && target.willRemove && target.exists);
  for (const target of removalPlan) {
    if (target.willRemove) await removeTree(target.path);
  }
  return {
    markerPath: paths.uninstallMarkerPath,
    namespace: config.namespace,
    nsisLogPath: paths.nsisLogPath,
    registryResiduesRemoved,
    removedDataRoot,
    removedLogsRoot,
    removedProductUserDataRoot,
    removedSidecarRoot,
    removalPlan,
    residueObservation: await observeWinResidues(config, paths),
    stop,
    timingPath: paths.uninstallTimingPath,
    uninstallerPath: paths.uninstallerPath,
  };
}

export async function cleanupPackedWinNamespace(config: ToolPackConfig): Promise<WinCleanupResult> {
  const paths = resolveWinPaths(config);
  const removalPlan = await createWinRemovalPlan(config);
  if (await pathExists(paths.uninstallerPath)) {
    await uninstallPackedWinApp(config);
  }
  const stop = await stopPackedWinApp(config);
  const removedOutputRoot = await pathExists(config.roots.output.namespaceRoot);
  const removedRuntimeNamespaceRoot = await pathExists(config.roots.runtime.namespaceRoot);
  const removedProductUserDataRoot = removalPlan.some((target) => target.scope === "product-user-data" && target.willRemove && target.exists);
  await cleanupWinRegistryResidues(paths);
  for (const target of removalPlan) {
    if (target.scope === "product-user-data" && target.willRemove) await removeTree(target.path);
  }
  await removeTree(config.roots.output.namespaceRoot);
  await removeTree(config.roots.runtime.namespaceRoot);
  return {
    namespace: config.namespace,
    removedOutputRoot,
    removedProductUserDataRoot,
    removedRuntimeNamespaceRoot,
    removalPlan,
    residueObservation: await observeWinResidues(config, paths),
    stop,
  };
}

async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export async function listPackedWinNamespaces(config: ToolPackConfig): Promise<WinListResult> {
  const paths = resolveWinPaths(config);
  const registryEntries = await queryWinRegistryEntries(paths);
  const productNamespaceRoot = resolveWinProductNamespaceRoot(config);
  const productUserDataRoot = resolveWinProductUserDataRoot();
  return {
    current: {
      installDir: paths.installDir,
      installedExeExists: await pathExists(paths.installedExePath),
      installedExePath: paths.installedExePath,
      namespace: config.namespace,
      publicDesktopShortcutExists: await pathExists(paths.publicDesktopShortcutPath),
      publicDesktopShortcutPath: paths.publicDesktopShortcutPath,
      productNamespaceRoot,
      productNamespaceRootExists: await pathExists(productNamespaceRoot),
      productUserDataRoot,
      productUserDataRootExists: await pathExists(productUserDataRoot),
      registryEntries,
      registryResidues: registryEntries.map((entry) => entry.keyPath),
      removalPlan: await createWinRemovalPlan(config),
      runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
      runtimeNamespaceRootExists: await pathExists(config.roots.runtime.namespaceRoot),
      setupExists: await pathExists(paths.setupPath),
      setupPath: paths.setupPath,
      startMenuShortcutExists: await pathExists(paths.startMenuShortcutPath),
      startMenuShortcutPath: paths.startMenuShortcutPath,
      uninstallerExists: await pathExists(paths.uninstallerPath),
      uninstallerPath: paths.uninstallerPath,
      userDesktopShortcutExists: await pathExists(paths.userDesktopShortcutPath),
      userDesktopShortcutPath: paths.userDesktopShortcutPath,
    },
    outputNamespaces: await listDirectories(join(config.roots.output.platformRoot, "namespaces")),
    runtimeNamespaces: await listDirectories(config.roots.runtime.namespaceBaseRoot),
  };
}

export async function resetPackedWinNamespaces(config: ToolPackConfig): Promise<WinResetResult> {
  const namespaces = [...new Set([...(await listDirectories(join(config.roots.output.platformRoot, "namespaces"))), ...(await listDirectories(config.roots.runtime.namespaceBaseRoot))])].sort();
  const results: WinCleanupResult[] = [];
  for (const namespace of namespaces) {
    results.push(await cleanupPackedWinNamespace({ ...config, namespace, roots: {
      ...config.roots,
      output: { ...config.roots.output, namespaceRoot: join(config.roots.output.platformRoot, "namespaces", namespace) },
      runtime: { ...config.roots.runtime, namespaceRoot: join(config.roots.runtime.namespaceBaseRoot, namespace) },
    } }));
  }
  return { namespaces, results };
}

export async function inspectPackedWinApp(config: ToolPackConfig, options: { expr?: string; path?: string }): Promise<WinInspectResult> {
  const stamp = desktopStamp(config);
  const status = await requestJsonIpc<DesktopStatusSnapshot>(stamp.ipc, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 2000 }).catch(() => null);
  return {
    ...(options.expr == null ? {} : {
      eval: await requestJsonIpc<DesktopEvalResult>(
        stamp.ipc,
        { input: { expression: options.expr }, type: SIDECAR_MESSAGES.EVAL },
        { timeoutMs: 5000 },
      ),
    }),
    ...(options.path == null ? {} : {
      screenshot: await requestJsonIpc<DesktopScreenshotResult>(
        stamp.ipc,
        { input: { path: options.path }, type: SIDECAR_MESSAGES.SCREENSHOT },
        { timeoutMs: 10000 },
      ),
    }),
    status,
  };
}
