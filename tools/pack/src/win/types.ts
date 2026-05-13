import type { DesktopEvalResult, DesktopScreenshotResult, DesktopStatusSnapshot } from "@open-design/sidecar-proto";
import type { CacheReport } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import type { INTERNAL_PACKAGES } from "./constants.js";

export type PackedTarballInfo = {
  fileName: string;
  packageName: (typeof INTERNAL_PACKAGES)[number]["name"];
};

export type PackedTarballsCacheMetadata = {
  tarballs: PackedTarballInfo[];
};

export type PackedTarballsCacheResult = PackedTarballsCacheMetadata & {
  key: string;
};

export type PackagedAppCacheMetadata = {
  packagedVersion: string;
};

export type PackagedAppCacheResult = PackagedAppCacheMetadata & {
  appRoot: string;
  key: string;
};

export type ElectronBuilderDirCacheMetadata = {
  packagedAppKey: string;
  packagedVersion: string;
};

export type ResourceTreeCacheMetadata = {
  resourceName: "open-design";
};

export type WinBuiltAppManifest = {
  appBuilderOutputRoot: string;
  cacheEntryPath: string | null;
  configPath: string;
  executablePath: string;
  source: "cache" | "namespace";
  unpackedRoot: string;
  version: 1;
  webStandaloneHookAuditPath: string | null;
};

export type WinPaths = {
  appBuilderConfigPath: string;
  appBuilderOutputRoot: string;
  assembledAppRoot: string;
  assembledMainEntryPath: string;
  assembledPackageJsonPath: string;
  assembledPrebundledRoot: string;
  blockmapPath: string;
  builtManifestPath: string;
  daemonCliPrebundleEntrypointPath: string;
  daemonCliPrebundlePath: string;
  daemonPrebundleMetaPath: string;
  daemonPrebundleRoot: string;
  daemonSidecarPrebundleEntrypointPath: string;
  daemonSidecarPrebundlePath: string;
  exePath: string;
  installDir: string;
  installedExePath: string;
  installerPayloadPath: string;
  installerScriptPath: string;
  publicDesktopShortcutPath: string;
  latestYmlPath: string;
  installMarkerPath: string;
  installTimingPath: string;
  nsisLogPath: string;
  nsisIncludePath: string;
  packagedConfigPath: string;
  packagedMainPrebundleMetaPath: string;
  packagedMainPrebundlePath: string;
  resourceRoot: string;
  setupPath: string;
  startMenuShortcutPath: string;
  tarballsRoot: string;
  userDesktopShortcutPath: string;
  uninstallMarkerPath: string;
  uninstallTimingPath: string;
  uninstallerPath: string;
  webStandaloneHookAuditPath: string;
  webStandaloneHookConfigPath: string;
  webSidecarPrebundleMetaPath: string;
  webSidecarPrebundlePath: string;
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
  cacheReport: CacheReport;
  sizeReport: WinSizeReport;
  timings: WinPackTiming[];
  to: ToolPackConfig["to"];
  unpackedPath: string | null;
  webStandaloneHookAuditPath: string | null;
};

export type WinPackTiming = {
  durationMs: number;
  phase: string;
};

export type WinSizeReport = {
  builder: {
    asar: boolean;
    buildDependenciesFromSource: boolean;
    filePatterns: readonly string[];
    nativeRebuild: {
      buildFromSource: boolean;
      mode: "parallel" | "sequential";
      modules: readonly string[];
    };
    nodeGypRebuild: boolean;
    npmRebuild: boolean;
    targets: Array<"dir" | "nsis">;
    webOutputMode: ToolPackConfig["webOutputMode"];
  };
  generatedAt: string;
  installerBytes: number | null;
  outputRootBytes: number;
  resourceRootBytes: number;
  runtimeNamespaceRoot: string;
  topLevel: {
    appResourcesBytes: number;
    copiedStandaloneBytes: number;
    electronLocalesBytes: number;
    resourcesBytes: number;
  };
  tracked: {
    appNodeModulesBytes: number;
    betterSqlite3Bytes: number;
    betterSqlite3SourceResidueBytes: number;
    bundledNodeBytes: number;
    copiedStandaloneNextBytes: number;
    copiedStandaloneNextSwcBytes: number;
    copiedStandaloneNodeModulesBytes: number;
    copiedStandalonePnpmHoistedNextBytes: number;
    copiedStandaloneSharpLibvipsBytes: number;
    copiedStandaloneSourcemapBytes: number;
    copiedStandaloneTsbuildInfoBytes: number;
    copiedStandaloneWebNextBytes: number;
    copiedStandaloneWebNodeModulesBytes: number;
    electronLocalesBytes: number;
    markdownBytes: number;
    nextBytes: number;
    nextSwcBytes: number;
    prebundledRuntimeBytes: number;
    sharpLibvipsBytes: number;
    sourcemapBytes: number;
    tsbuildInfoBytes: number;
    webCopiedStandaloneBytes: number;
    webNextCacheBytes: number;
    webPackageAppBytes: number;
    webPackageBytes: number;
    webPackageDistBytes: number;
    webPackagePublicBytes: number;
    webPackageSrcBytes: number;
    webPackageStandaloneBytes: number;
  };
  unpackedBytes: number | null;
};

export type WinInstallResult = {
  desktopShortcutExists: boolean;
  desktopShortcutPath: string;
  installDir: string;
  installerPath: string;
  installPayload: WinInstallPayloadReport;
  markerPath: string;
  namespace: string;
  nsisLogPath: string;
  registryEntries: WindowsUninstallRegistryEntry[];
  startMenuShortcutExists: boolean;
  startMenuShortcutPath: string;
  timingPath: string;
  uninstallerPath: string;
};

export type WinInstallPayloadReport = {
  fileCount: number;
  totalBytes: number;
  topLevel: Array<{
    bytes: number;
    fileCount: number;
    path: string;
  }>;
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

export type WindowsUninstallRegistryEntry = {
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
    builtExecutableExists: boolean;
    builtExecutablePath: string | null;
    builtManifestPath: string;
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
