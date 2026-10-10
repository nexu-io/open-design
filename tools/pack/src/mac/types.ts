import type { DesktopEvalResult, DesktopScreenshotResult, DesktopStatusSnapshot, DesktopUpdateResult } from "@open-design/sidecar-proto";
import type { CacheReport } from "../cache/index.js";
import type { ToolPackBuildOutput, ToolPackConfig } from "../config/index.js";
import type { ToolPackLauncherRuntimeSnapshot } from "../launcher/runtime-snapshot.js";
import type { ToolPackUpdateCacheLifecycleSnapshot } from "../updates/cache-lifecycle-snapshot.js";
import type { INTERNAL_PACKAGES } from "./constants.js";

export type PackedTarballInfo = {
  fileName: string;
  packageName: (typeof INTERNAL_PACKAGES)[number]["name"];
};

export type MacPaths = {
  appBuilderConfigPath: string;
  appBuilderOutputRoot: string;
  appPath: string;
  assembledAppRoot: string;
  assembledMainEntryPath: string;
  assembledPackageJsonPath: string;
  assembledPrebundledRoot: string;
  daemonCliPrebundleEntrypointPath: string;
  daemonCliPrebundlePath: string;
  daemonPrebundleMetaPath: string;
  daemonPrebundleRoot: string;
  daemonSidecarPrebundleEntrypointPath: string;
  daemonSidecarPrebundlePath: string;
  dmgPath: string;
  installApplicationsRoot: string;
  installedAppPath: string;
  latestMacYmlPath: string;
  mountPoint: string;
  packagedMainPrebundleMetaPath: string;
  packagedMainPrebundlePath: string;
  packagedConfigPath: string;
  payloadZipPath: string;
  resourceRoot: string;
  systemApplicationsAppPath: string;
  tarballsRoot: string;
  userApplicationsAppPath: string;
  webStandaloneHookAuditPath: string;
  webStandaloneHookConfigPath: string;
  webSidecarPrebundleMetaPath: string;
  webSidecarPrebundlePath: string;
  zipPath: string;
};

export type SeededAppConfigPaths = {
  sourcePath: string;
  targetPath: string;
};

export type MacPackResult = {
  appPath: string;
  cacheReport: CacheReport;
  dmgPath: string | null;
  latestMacYmlPath: string | null;
  outputRoot: string;
  payloadPath: string | null;
  resourceRoot: string;
  runtimeNamespaceRoot: string;
  sizeReport: MacSizeReport;
  timings: MacPackTiming[];
  to: ToolPackBuildOutput;
  zipPath: string | null;
};

export type MacPackTiming = {
  durationMs: number;
  phase: string;
};

export type MacStartSource = "built" | "installed" | "system-applications" | "user-applications";

export type MacStartResult = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: MacStartSource;
  status: DesktopStatusSnapshot | null;
};

export type MacInspectResult = {
  eval?: DesktopEvalResult;
  launcher: ToolPackLauncherRuntimeSnapshot;
  screenshot?: DesktopScreenshotResult;
  status: DesktopStatusSnapshot | null;
  updateCache: ToolPackUpdateCacheLifecycleSnapshot;
  update?: DesktopUpdateResult;
};

export type MacStopResult = {
  gracefulRequested: boolean;
  namespace: string;
  remainingPids: number[];
  status: "not-running" | "partial" | "stopped";
  stoppedPids: number[];
};

export type MacInstallResult = {
  detached: boolean;
  dmgPath: string;
  installedAppPath: string;
  mountPoint: string;
  namespace: string;
};

export type MacUninstallResult = {
  installedAppPath: string;
  namespace: string;
  removed: boolean;
  stop: MacStopResult;
};

export type MacCleanupResult = {
  detachedMount: boolean;
  namespace: string;
  outputRoot: string;
  removedLauncherNamespaceRoot: boolean;
  removedOutputRoot: boolean;
  removedRuntimeNamespaceRoot: boolean;
  runtimeNamespaceRoot: string;
  stop: MacStopResult;
};

export type ElectronBuilderTarget = "dir" | "dmg" | "zip";

export type MacSizeReport = {
  appBytes: number;
  builder: {
    asar: boolean;
    compression: ToolPackConfig["macCompression"];
    electronLanguages: readonly string[];
    filePatterns: readonly string[];
    nativeRebuild: {
      buildFromSource: boolean;
      mode: "parallel" | "sequential";
      modules: readonly string[];
    };
    targets: ElectronBuilderTarget[];
    webOutputMode: ToolPackConfig["webOutputMode"];
  };
  dmgBytes: number | null;
  generatedAt: string;
  outputRootBytes: number;
  resourceRootBytes: number;
  runtimeNamespaceRoot: string;
  topLevel: {
    appResourcesBytes: number;
    electronFrameworksBytes: number;
    resourcesBytes: number;
  };
  tracked: {
    appNodeModulesBytes: number;
    betterSqlite3Bytes: number;
    betterSqlite3SourceResidueBytes: number;
    bundledNodeBytes: number;
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
    webPackageBytes: number;
    webPackageStandaloneBytes: number;
  };
  zipBytes: number | null;
};

export type MacBuildOutput = Extract<ToolPackBuildOutput, "all" | "app" | "dmg" | "zip">;
