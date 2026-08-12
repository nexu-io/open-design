import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  isDesktopUpdateAction,
  type DaemonStatusSnapshot,
  type DesktopEvalResult,
  type DesktopScreenshotResult,
  type DesktopStatusSnapshot,
  type DesktopUpdateAction,
  type SidecarStamp,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import { createSidecarLaunchEnv, requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import {
  collectProcessTreePids,
  createProcessStampArgs,
  isProcessAlive,
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail,
  spawnBackgroundProcess,
  stopProcesses,
} from "@open-design/platform";

import type { ToolPackConfig } from "../config.js";
import { resolveToolPackLauncherLayout } from "../launcher-layout.js";
import { readToolPackLauncherRuntimeSnapshot } from "../launcher-runtime-snapshot.js";
import { readToolPackUpdateCacheLifecycleSnapshot } from "../update-cache-lifecycle-snapshot.js";
import { requestDesktopUpdateAction } from "../update-action.js";
import { DESKTOP_LOG_ECHO_ENV } from "./constants.js";
import { listDirectories, pathExists, removeTree } from "./fs.js";
import { readBuiltAppManifest } from "./manifest.js";
import { invokeNsis, runTimed } from "./nsis.js";
import {
  createWinRemovalPlan,
  resolveWinPaths,
  resolveWinProductNamespaceRoot,
  resolveWinProductUserDataRoot,
} from "./paths.js";
import {
  cleanupWinRegistryResidues,
  queryPreferredWinRegistryEntries,
  queryWinNamespaceRegistryEntry,
  queryWinRegistryEntries,
  resolveWinRegisteredPaths,
} from "./registry.js";
import type {
  WinCleanupResult,
  WinIpcDiagnoseAttempt,
  WinIpcDiagnoseResult,
  WinInspectResult,
  WinInstallResult,
  WinInstallPayloadReport,
  WinInspectStatusPollResult,
  WinInspectStatusPollSample,
  WinLifecycleTiming,
  WinListResult,
  WinResetResult,
  WinResidueObservation,
  WinStartResult,
  WinStopResult,
  WinUninstallResult,
  WinWaitResult,
  WinPaths,
} from "./types.js";

const PACKAGED_CONFIG_PATH_ENV = "OD_PACKAGED_CONFIG_PATH";

function withWinRuntimeBaseRoot(config: ToolPackConfig, runtimeBaseRoot: string | undefined): ToolPackConfig {
  if (runtimeBaseRoot == null) return config;
  const namespaceBaseRoot = resolve(runtimeBaseRoot);
  return {
    ...config,
    roots: {
      ...config.roots,
      runtime: {
        namespaceBaseRoot,
        namespaceRoot: join(namespaceBaseRoot, config.namespace),
      },
    },
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

function appIpcPath(config: ToolPackConfig, app: SidecarStamp["app"]): string {
  return resolveAppIpcPath({ app, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: config.namespace });
}

function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

function desktopIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
}

async function waitForDesktopStatus(
  config: ToolPackConfig,
  pid: number,
  timeoutMs = 45_000,
): Promise<{
  durationMs: number;
  pollCount: number;
  processExited: boolean;
  status: DesktopStatusSnapshot | null;
}> {
  const stamp = desktopStamp(config);
  const startedAt = Date.now();
  let pollCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    pollCount += 1;
    try {
      const status = await requestJsonIpc<DesktopStatusSnapshot>(stamp.ipc, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 1000 });
      return { durationMs: Date.now() - startedAt, pollCount, processExited: false, status };
    } catch {
      if (!isProcessAlive(pid)) {
        return { durationMs: Date.now() - startedAt, pollCount, processExited: true, status: null };
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    }
  }
  return { durationMs: Date.now() - startedAt, pollCount, processExited: false, status: null };
}

function installArgs(config: ToolPackConfig, paths: WinPaths): string[] {
  return [...(config.silent ? ["/S"] : []), `/D=${paths.installDir}`];
}

async function writeJsonMarker(filePath: string, payload: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function collectFileTreeStats(root: string): Promise<{ fileCount: number; totalBytes: number }> {
  const metadata = await stat(root).catch(() => null);
  if (metadata == null) return { fileCount: 0, totalBytes: 0 };
  if (!metadata.isDirectory()) return { fileCount: 1, totalBytes: metadata.size };

  const children = await readdir(root, { withFileTypes: true }).catch(() => []);
  const childStats = await Promise.all(children.map((child) => collectFileTreeStats(join(root, child.name))));
  return childStats.reduce(
    (total, entry) => ({
      fileCount: total.fileCount + entry.fileCount,
      totalBytes: total.totalBytes + entry.totalBytes,
    }),
    { fileCount: 0, totalBytes: 0 },
  );
}

async function collectInstallPayloadReport(paths: WinPaths): Promise<WinInstallPayloadReport> {
  const topLevelEntries = await readdir(paths.installDir, { withFileTypes: true }).catch(() => []);
  const topLevel = await Promise.all(
    topLevelEntries.map(async (entry) => {
      const entryPath = join(paths.installDir, entry.name);
      const stats = await collectFileTreeStats(entryPath);
      return { bytes: stats.totalBytes, fileCount: stats.fileCount, path: entry.name };
    }),
  );
  const totals = topLevel.reduce(
    (total, entry) => ({
      fileCount: total.fileCount + entry.fileCount,
      totalBytes: total.totalBytes + entry.bytes,
    }),
    { fileCount: 0, totalBytes: 0 },
  );
  return {
    ...totals,
    topLevel: topLevel.sort((left, right) => right.bytes - left.bytes || right.fileCount - left.fileCount),
  };
}

async function measureLifecycleStep<T>(timings: WinLifecycleTiming[], step: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    timings.push({ durationMs: Date.now() - startedAt, step });
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
    registryResidues: (await queryWinRegistryEntries(paths, config)).map((entry) => entry.keyPath),
    runtimeNamespaceRootExists: await pathExists(config.roots.runtime.namespaceRoot),
    startMenuShortcutExists: await pathExists(paths.startMenuShortcutPath),
    uninstallerExists: await pathExists(paths.uninstallerPath),
    userDesktopShortcutExists: await pathExists(paths.userDesktopShortcutPath),
  };
}

async function waitForNativeUninstallSettlement(
  config: ToolPackConfig,
  paths: WinPaths,
  timeoutMs = 10_000,
): Promise<void> {
  const startedAt = Date.now();
  let pending: string[] = [];
  do {
    const [publicDesktop, registryEntry, startMenu, userDesktop] = await Promise.all([
      pathExists(paths.publicDesktopShortcutPath),
      queryWinNamespaceRegistryEntry(config, paths),
      pathExists(paths.startMenuShortcutPath),
      pathExists(paths.userDesktopShortcutPath),
    ]);
    pending = [
      ...(publicDesktop ? [paths.publicDesktopShortcutPath] : []),
      ...(registryEntry == null ? [] : [registryEntry.keyPath]),
      ...(startMenu ? [paths.startMenuShortcutPath] : []),
      ...(userDesktop ? [paths.userDesktopShortcutPath] : []),
    ];
    if (pending.length === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  } while (Date.now() - startedAt < timeoutMs);

  throw new Error(
    `native Windows uninstaller returned before its lifecycle mutations settled: ${pending.join(", ")}`,
  );
}

export async function installPackedWinApp(
  config: ToolPackConfig,
  options: { runtimeBaseRoot?: string } = {},
): Promise<WinInstallResult> {
  const lifecycleTimings: WinLifecycleTiming[] = [];
  const paths = resolveWinPaths(config);
  const runtimeConfig = withWinRuntimeBaseRoot(config, options.runtimeBaseRoot);
  const registeredPaths = await measureLifecycleStep(lifecycleTimings, "resolve registered paths", async () => resolveWinRegisteredPaths(config, paths));
  if (!(await pathExists(paths.setupPath))) throw new Error(`no windows installer found at ${paths.setupPath}; run tools-pack win build first`);
  if (await pathExists(registeredPaths.uninstallerPath)) {
    await measureLifecycleStep(lifecycleTimings, "pre-install uninstall", async () => uninstallPackedWinApp(config));
  } else {
    await measureLifecycleStep(lifecycleTimings, "pre-install remove install dir", async () => removeTree(registeredPaths.installDir));
  }
  await measureLifecycleStep(lifecycleTimings, "ensure install directory", async () => mkdir(paths.installDir, { recursive: true }));
  await measureLifecycleStep(lifecycleTimings, "nsis install", async () => runTimed(paths.installTimingPath, "install", async () => {
    await invokeNsis(paths, paths.setupPath, installArgs(config, paths), "install");
  }));
  if (!(await pathExists(paths.installedExePath))) throw new Error(`installer completed but executable is missing at ${paths.installedExePath}`);
  // Portable shipping builds omit namespaceBaseRoot so end users fall back to
  // Electron userData. Pin the root selected by this lifecycle invocation so
  // ordinary tools-pack installs retain isolation while public acceptance can
  // deliberately prove a native AppData OS-protocol cold launch.
  await measureLifecycleStep(lifecycleTimings, "pin installed packaged namespace", async () => {
    await pinInstalledPackagedConfigNamespace(runtimeConfig, paths.installedExePath);
  });
  const registryEntries = await measureLifecycleStep(lifecycleTimings, "query registry", async () => queryPreferredWinRegistryEntries(config, paths));
  const installPayload = await measureLifecycleStep(lifecycleTimings, "collect payload report", async () => collectInstallPayloadReport(paths));
  await measureLifecycleStep(lifecycleTimings, "write install marker", async () => writeJsonMarker(paths.installMarkerPath, {
    installedAt: new Date().toISOString(),
    installDir: paths.installDir,
    installPayload,
    namespace: config.namespace,
    registryEntries: registryEntries.map((entry) => entry.keyPath),
  }));
  return {
    desktopShortcutExists: await pathExists(paths.userDesktopShortcutPath),
    desktopShortcutPath: paths.userDesktopShortcutPath,
    installDir: paths.installDir,
    lifecycleTimings,
    installerPath: paths.setupPath,
    installPayload,
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

/**
 * Pin the tools-pack runtime namespace into the installed app's packaged config
 * and write the launch override used by `tools-pack win start`.
 *
 * The installed config is the only source available to a bare executable
 * launched through the Windows protocol registry. Keeping both copies
 * identical prevents that cold launch from resolving a different daemon data
 * root than the process started by tools-pack.
 */
async function pinInstalledPackagedConfigNamespace(
  config: ToolPackConfig,
  executablePath: string,
): Promise<{ installedConfigPath: string; launchConfigPath: string }> {
  const installedConfigPath = join(dirname(executablePath), "resources", "open-design-config.json");
  if (!(await pathExists(installedConfigPath))) {
    throw new Error(`installed packaged config missing at ${installedConfigPath}`);
  }
  const raw = JSON.parse(await readFile(installedConfigPath, "utf8")) as Record<string, unknown>;
  if (typeof raw !== "object" || raw == null || Array.isArray(raw)) {
    throw new Error(`installed packaged config must be a JSON object: ${installedConfigPath}`);
  }
  const pinned = {
    ...raw,
    namespace: config.namespace,
    namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot,
    releaseVersion: config.releaseVersion
      ?? (typeof raw.releaseVersion === "string" ? raw.releaseVersion : undefined)
      ?? (typeof raw.shellVersion === "string" ? raw.shellVersion : undefined),
  };
  const body = `${JSON.stringify(pinned, null, 2)}\n`;
  await writeFile(installedConfigPath, body, "utf8");
  const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "launch-open-design-config.json");
  await mkdir(dirname(launchConfigPath), { recursive: true });
  await writeFile(launchConfigPath, body, "utf8");
  return { installedConfigPath, launchConfigPath };
}

async function writeInstalledLaunchPackagedConfig(config: ToolPackConfig, executablePath: string): Promise<string> {
  const { launchConfigPath } = await pinInstalledPackagedConfigNamespace(config, executablePath);
  return launchConfigPath;
}

async function resolveStartTarget(config: ToolPackConfig): Promise<{ configPath: string | null; executablePath: string; source: "built" | "installed" }> {
  const paths = resolveWinPaths(config);
  if (await pathExists(paths.installedExePath)) {
    return {
      configPath: await writeInstalledLaunchPackagedConfig(config, paths.installedExePath),
      executablePath: paths.installedExePath,
      source: "installed",
    };
  }
  const builtManifest = await readBuiltAppManifest(paths, { requireExecutable: true });
  if (builtManifest != null) return { configPath: builtManifest.configPath, executablePath: builtManifest.executablePath, source: "built" };
  if (await pathExists(paths.unpackedExePath)) return { configPath: null, executablePath: paths.unpackedExePath, source: "built" };
  throw new Error(`no windows app executable found for namespace=${config.namespace}; run tools-pack win build first or tools-pack win install after building an NSIS installer`);
}

export async function startPackedWinApp(
  config: ToolPackConfig,
  options: { runtimeBaseRoot?: string; waitForStatus?: boolean } = {},
): Promise<WinStartResult> {
  const resolvedTarget = await resolveStartTarget(config);
  const runtimeConfig = withWinRuntimeBaseRoot(config, options.runtimeBaseRoot);
  const target = options.runtimeBaseRoot == null || resolvedTarget.source !== "installed"
    ? resolvedTarget
    : {
        ...resolvedTarget,
        configPath: await writeInstalledLaunchPackagedConfig(runtimeConfig, resolvedTarget.executablePath),
      };
  const stamp = desktopStamp(runtimeConfig);
  const logPath = desktopLogPath(runtimeConfig);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");
  const logHandle = await open(logPath, "a");
  let spawned: Awaited<ReturnType<typeof spawnBackgroundProcess>>;
  try {
    spawned = await spawnBackgroundProcess({
      args: createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
      command: target.executablePath,
      cwd: dirname(target.executablePath),
      env: createSidecarLaunchEnv({
        base: join(runtimeConfig.roots.runtime.namespaceRoot, "runtime"),
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        extraEnv: {
          ...process.env,
          [DESKTOP_LOG_ECHO_ENV]: "0",
          ...(target.configPath == null ? {} : { [PACKAGED_CONFIG_PATH_ENV]: target.configPath }),
        },
        stamp,
      }),
      logFd: logHandle.fd,
    });
  } finally {
    await logHandle.close().catch(() => undefined);
  }
  const statusWait = options.waitForStatus === false
    ? { durationMs: 0, pollCount: 0, processExited: false, status: null }
    : await waitForDesktopStatus(runtimeConfig, spawned.pid);
  return {
    executablePath: target.executablePath,
    logPath,
    namespace: config.namespace,
    pid: spawned.pid,
    processExitedBeforeStatus: statusWait.processExited,
    source: target.source,
    status: statusWait.status,
    statusPollCount: statusWait.pollCount,
    statusWaitDurationMs: statusWait.durationMs,
  };
}

async function findManagedDesktopProcessTree(config: ToolPackConfig): Promise<number[]> {
  const processes = await listProcessSnapshots();
  const stampedRootPids = processes
    .filter((processInfo) =>
      [SIDECAR_SOURCES.TOOLS_PACK, SIDECAR_SOURCES.PACKAGED].some((source) =>
        matchesStampedProcess(
          processInfo,
          { mode: SIDECAR_MODES.RUNTIME, namespace: config.namespace, source },
          OPEN_DESIGN_SIDECAR_CONTRACT,
        )
      ),
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

export async function stopPackedWinApp(
  config: ToolPackConfig,
  options: { runtimeBaseRoot?: string } = {},
): Promise<WinStopResult> {
  const runtimeConfig = withWinRuntimeBaseRoot(config, options.runtimeBaseRoot);
  const stamp = desktopStamp(runtimeConfig);
  const before = await findManagedDesktopProcessTree(runtimeConfig);
  let gracefulRequested = false;
  try {
    await requestJsonIpc(stamp.ipc, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1500 });
    gracefulRequested = true;
  } catch {
    gracefulRequested = false;
  }
  const remainingAfterGraceful = gracefulRequested ? await waitForNoManagedDesktopProcesses(runtimeConfig) : before;
  if (remainingAfterGraceful.length === 0) {
    await rm(desktopIdentityPath(runtimeConfig), { force: true }).catch(() => undefined);
    return { gracefulRequested, namespace: config.namespace, remainingPids: [], status: before.length === 0 ? "not-running" : "stopped", stoppedPids: before };
  }
  const stopped = await stopProcesses(remainingAfterGraceful);
  if (stopped.remainingPids.length === 0) await rm(desktopIdentityPath(runtimeConfig), { force: true }).catch(() => undefined);
  return {
    gracefulRequested,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length === 0 ? "stopped" : "partial",
    stoppedPids: stopped.stoppedPids,
  };
}

export async function readPackedWinLogs(config: ToolPackConfig, options: { runtimeBaseRoot?: string } = {}) {
  const runtimeConfig = withWinRuntimeBaseRoot(config, options.runtimeBaseRoot);
  const paths = resolveWinPaths(config);
  const entries = await Promise.all(
    [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON].map(async (app) => {
      const logPath = join(runtimeConfig.roots.runtime.namespaceRoot, "logs", app, "latest.log");
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
  const lifecycleTimings: WinLifecycleTiming[] = [];
  const paths = resolveWinPaths(config);
  const registeredPaths = await measureLifecycleStep(lifecycleTimings, "resolve registered paths", async () => resolveWinRegisteredPaths(config, paths));
  const stop = await measureLifecycleStep(lifecycleTimings, "stop", async () => stopPackedWinApp(config));
  if (await pathExists(registeredPaths.uninstallerPath)) {
    await measureLifecycleStep(lifecycleTimings, "nsis uninstall", async () => runTimed(paths.uninstallTimingPath, "uninstall", async () => {
      await invokeNsis(paths, registeredPaths.uninstallerPath, config.silent ? ["/S"] : [], "uninstall");
    }));
    // NSIS first launches a temporary self-copy. On Windows the original
    // uninstaller process can return while that child is still deleting
    // shortcuts and registry keys. Do not let callers observe that transient
    // state as the result of a completed uninstall.
    await measureLifecycleStep(lifecycleTimings, "wait for native uninstall settlement", async () => {
      await waitForNativeUninstallSettlement(config, registeredPaths);
    });
  }
  await measureLifecycleStep(lifecycleTimings, "remove install dir", async () => removeTree(registeredPaths.installDir));
  const registryResiduesRemoved = await measureLifecycleStep(lifecycleTimings, "cleanup registry residues", async () => cleanupWinRegistryResidues(registeredPaths, config));
  const removalPlan = await measureLifecycleStep(lifecycleTimings, "create removal plan", async () => createWinRemovalPlan(config));
  await measureLifecycleStep(lifecycleTimings, "write uninstall marker", async () => writeJsonMarker(paths.uninstallMarkerPath, {
    namespace: config.namespace,
    removalPlan,
    registryResiduesRemoved,
    uninstalledAt: new Date().toISOString(),
  }).catch(() => undefined));
  const removedCacheRoot = removalPlan.some((target) => target.scope === "cache" && target.willRemove && target.exists);
  const removedDataRoot = removalPlan.some((target) => target.scope === "data" && target.willRemove && target.exists);
  const removedLogsRoot = removalPlan.some((target) => target.scope === "logs" && target.willRemove && target.exists);
  const removedSidecarRoot = removalPlan.some((target) => target.scope === "sidecars" && target.willRemove && target.exists);
  const removedProductUserDataRoot = removalPlan.some((target) => target.scope === "product-user-data" && target.willRemove && target.exists);
  for (const target of removalPlan) {
    if (target.willRemove) await measureLifecycleStep(lifecycleTimings, `remove ${target.scope} root`, async () => removeTree(target.path));
  }
  return {
    lifecycleTimings,
    markerPath: paths.uninstallMarkerPath,
    namespace: config.namespace,
    nsisLogPath: paths.nsisLogPath,
    removedCacheRoot,
    registryResiduesRemoved,
    removedDataRoot,
    removedLogsRoot,
    removedProductUserDataRoot,
    removedSidecarRoot,
    removalPlan,
    residueObservation: await measureLifecycleStep(lifecycleTimings, "observe residues", async () => observeWinResidues(config, registeredPaths)),
    stop,
    timingPath: paths.uninstallTimingPath,
    uninstallerPath: registeredPaths.uninstallerPath,
  };
}

export async function cleanupPackedWinNamespace(config: ToolPackConfig): Promise<WinCleanupResult> {
  const paths = resolveWinPaths(config);
  const launcher = resolveToolPackLauncherLayout(config);
  const registeredPaths = await resolveWinRegisteredPaths(config, paths);
  const removalPlan = await createWinRemovalPlan(config);
  if (await pathExists(registeredPaths.uninstallerPath)) {
    await uninstallPackedWinApp(config);
  }
  const stop = await stopPackedWinApp(config);
  const removedOutputRoot = await pathExists(config.roots.output.namespaceRoot);
  const removedRuntimeNamespaceRoot = await pathExists(config.roots.runtime.namespaceRoot);
  const removedLauncherNamespaceRoot = await pathExists(launcher.paths.namespaceRoot);
  const removedCacheRoot = removalPlan.some((target) => target.scope === "cache" && target.willRemove && target.exists);
  const removedProductUserDataRoot = removalPlan.some((target) => target.scope === "product-user-data" && target.willRemove && target.exists);
  await cleanupWinRegistryResidues(registeredPaths, config);
  for (const target of removalPlan) {
    if (target.scope === "product-user-data" && target.willRemove) await removeTree(target.path);
  }
  await removeTree(config.roots.output.namespaceRoot);
  await removeTree(config.roots.runtime.namespaceRoot);
  await removeTree(launcher.paths.namespaceRoot);
  return {
    namespace: config.namespace,
    removedLauncherNamespaceRoot,
    removedCacheRoot,
    removedOutputRoot,
    removedProductUserDataRoot,
    removedRuntimeNamespaceRoot,
    removalPlan,
    residueObservation: await observeWinResidues(config, registeredPaths),
    stop,
  };
}

export async function listPackedWinNamespaces(config: ToolPackConfig): Promise<WinListResult> {
  const paths = resolveWinPaths(config);
  const registeredPaths = await resolveWinRegisteredPaths(config, paths);
  const registryEntries = await queryWinRegistryEntries(registeredPaths, config);
  const productNamespaceRoot = resolveWinProductNamespaceRoot(config);
  const productUserDataRoot = resolveWinProductUserDataRoot();
  const builtManifest = await readBuiltAppManifest(paths, { requireExecutable: true });
  return {
    current: {
      builtExecutableExists: builtManifest != null || await pathExists(paths.unpackedExePath),
      builtExecutablePath: builtManifest?.executablePath ?? ((await pathExists(paths.unpackedExePath)) ? paths.unpackedExePath : null),
      builtManifestPath: paths.builtManifestPath,
      installDir: registeredPaths.installDir,
      installedExeExists: await pathExists(registeredPaths.installedExePath),
      installedExePath: registeredPaths.installedExePath,
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
      uninstallerExists: await pathExists(registeredPaths.uninstallerPath),
      uninstallerPath: registeredPaths.uninstallerPath,
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

function resolveUpdateAction(value: string | undefined): DesktopUpdateAction | null {
  if (value == null) return null;
  if (isDesktopUpdateAction(value)) return value;
  throw new Error("--update-action must be status, check, clear-cache, download, or install");
}

async function requestDesktopEval(
  ipc: string,
  expression: string,
): Promise<DesktopEvalResult> {
  try {
    return await requestJsonIpc<DesktopEvalResult>(
      ipc,
      { input: { expression }, type: SIDECAR_MESSAGES.EVAL },
      // Packaged acceptance uses eval for intentionally expensive first-use
      // operations (project creation and PPTX export). The desktop capability
      // contract already allows ten minutes; keep the CLI probe below that
      // ceiling while avoiding a false sidecar failure on a cold Windows disk.
      { timeoutMs: 120_000 },
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

async function requestStatusSnapshot<T>(ipc: string): Promise<{ error?: string; status: T | null }> {
  try {
    return { status: await requestJsonIpc<T>(ipc, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 2000 }) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      status: null,
    };
  }
}

function resolveOptionalPositiveInteger(value: string | number | undefined, label: string): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function pollWinInspectStatus(config: ToolPackConfig, count: number, intervalMs: number): Promise<WinInspectStatusPollResult> {
  const samples: WinInspectStatusPollSample[] = [];
  const desktopIpc = desktopStamp(config).ipc;
  const daemonIpc = appIpcPath(config, APP_KEYS.DAEMON);
  const webIpc = appIpcPath(config, APP_KEYS.WEB);
  for (let attempt = 1; attempt <= count; attempt += 1) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const [desktopSnapshot, daemonSnapshot, webSnapshot] = await Promise.all([
      requestStatusSnapshot<DesktopStatusSnapshot>(desktopIpc),
      requestStatusSnapshot<DaemonStatusSnapshot>(daemonIpc),
      requestStatusSnapshot<WebStatusSnapshot>(webIpc),
    ]);
    samples.push({
      attempt,
      daemonStatus: daemonSnapshot.status,
      ...(daemonSnapshot.error == null ? {} : { daemonStatusError: daemonSnapshot.error }),
      durationMs: Date.now() - startedAtMs,
      startedAt,
      status: desktopSnapshot.status,
      ...(desktopSnapshot.error == null ? {} : { statusError: desktopSnapshot.error }),
      webStatus: webSnapshot.status,
      ...(webSnapshot.error == null ? {} : { webStatusError: webSnapshot.error }),
    });
    if (attempt < count) await delay(intervalMs);
  }
  return { count, intervalMs, samples };
}

const PACKAGED_HEALTH_EXPRESSION = `
  (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('/api/health', { signal: controller.signal });
      return {
        health: await response.json(),
        href: location.href,
        status: response.status,
        title: document.title,
      };
    } finally {
      clearTimeout(timeout);
    }
  })()
`;

type PackagedHealthValue = {
  health: { ok?: unknown; version?: unknown };
  href: string;
  status: number;
  title: string;
};

function asHealthyPackagedValue(value: unknown): PackagedHealthValue | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return null;
  const candidate = value as Partial<PackagedHealthValue>;
  if (candidate.status !== 200 || typeof candidate.href !== "string" || typeof candidate.title !== "string") return null;
  if (typeof candidate.health !== "object" || candidate.health == null || candidate.health.ok !== true) return null;
  if (typeof candidate.health.version !== "string") return null;
  return candidate as PackagedHealthValue;
}

async function requestDaemonHealth(daemonUrl: string): Promise<PackagedHealthValue | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(new URL("/api/health", daemonUrl), { signal: controller.signal });
    return asHealthyPackagedValue({
      health: await response.json(),
      href: daemonUrl,
      status: response.status,
      title: "Open Design",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectPackedWinApp(
  config: ToolPackConfig,
  options: { expr?: string; includeManagedProcesses?: boolean; path?: string; runtimeBaseRoot?: string; statusPollCount?: string | number; statusPollIntervalMs?: string | number; updateAction?: string },
): Promise<WinInspectResult> {
  const runtimeConfig = withWinRuntimeBaseRoot(config, options.runtimeBaseRoot);
  const stamp = desktopStamp(runtimeConfig);
  const [desktopSnapshot, daemonSnapshot, webSnapshot, managedProcessPids] = await Promise.all([
    requestStatusSnapshot<DesktopStatusSnapshot>(stamp.ipc),
    requestStatusSnapshot<DaemonStatusSnapshot>(appIpcPath(runtimeConfig, APP_KEYS.DAEMON)),
    requestStatusSnapshot<WebStatusSnapshot>(appIpcPath(runtimeConfig, APP_KEYS.WEB)),
    options.includeManagedProcesses === true
      ? findManagedDesktopProcessTree(runtimeConfig)
      : Promise.resolve(null),
  ]);
  const updateAction = resolveUpdateAction(options.updateAction);
  const statusPollCount = resolveOptionalPositiveInteger(options.statusPollCount, "--status-poll-count");
  const statusPollIntervalMs = resolveOptionalPositiveInteger(options.statusPollIntervalMs, "--status-poll-interval-ms") ?? 500;
  const launcher = await readToolPackLauncherRuntimeSnapshot(runtimeConfig);
  const updateCache = await readToolPackUpdateCacheLifecycleSnapshot(runtimeConfig);
  return {
    daemonStatus: daemonSnapshot.status,
    ...(daemonSnapshot.error == null ? {} : { daemonStatusError: daemonSnapshot.error }),
    ...(options.expr == null ? {} : {
      eval: await requestDesktopEval(stamp.ipc, options.expr),
    }),
    launcher,
    launcherSource: {
      kind: "tools-pack-runtime",
      note: "launcher snapshot is read from the tools-pack runtime root; user-installed launcher state is reported by the running desktop status and its AppData paths",
      root: launcher.root,
    },
    ...(managedProcessPids == null ? {} : { managedProcessPids }),
    updateCache,
    updateCacheSource: {
      kind: "tools-pack-runtime",
      note: "update cache snapshot is read from the tools-pack runtime root; user-installed update cache is reported by status.update.paths",
      root: updateCache.updateRoot,
    },
    ...(options.path == null ? {} : {
      screenshot: await requestJsonIpc<DesktopScreenshotResult>(
        stamp.ipc,
        { input: { path: options.path }, type: SIDECAR_MESSAGES.SCREENSHOT },
        { timeoutMs: 10000 },
      ),
    }),
    ...(updateAction == null ? {} : {
      update: await requestDesktopUpdateAction(stamp, updateAction),
    }),
    status: desktopSnapshot.status,
    ...(desktopSnapshot.error == null ? {} : { statusError: desktopSnapshot.error }),
    ...(statusPollCount == null ? {} : {
      statusPoll: await pollWinInspectStatus(runtimeConfig, statusPollCount, statusPollIntervalMs),
    }),
    webStatus: webSnapshot.status,
    ...(webSnapshot.error == null ? {} : { webStatusError: webSnapshot.error }),
  };
}

export async function waitForHealthyPackedWinApp(
  config: ToolPackConfig,
  options: {
    allowDaemonFallback?: boolean;
    runtimeBaseRoot?: string;
    statusPollIntervalMs?: string | number;
    timeoutMs?: string | number;
  } = {},
): Promise<WinWaitResult> {
  const runtimeConfig = withWinRuntimeBaseRoot(config, options.runtimeBaseRoot);
  const timeoutMs = resolveOptionalPositiveInteger(options.timeoutMs, "--timeout-ms") ?? 90_000;
  const intervalMs = resolveOptionalPositiveInteger(options.statusPollIntervalMs, "--status-poll-interval-ms") ?? 1000;
  const startedAt = Date.now();
  let attempts = 0;
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1;
    const stamp = desktopStamp(runtimeConfig);
    const [desktopSnapshot, daemonSnapshot, webSnapshot] = await Promise.all([
      requestStatusSnapshot<DesktopStatusSnapshot>(stamp.ipc),
      requestStatusSnapshot<DaemonStatusSnapshot>(appIpcPath(runtimeConfig, APP_KEYS.DAEMON)),
      requestStatusSnapshot<WebStatusSnapshot>(appIpcPath(runtimeConfig, APP_KEYS.WEB)),
    ]);
    lastResult = { daemonSnapshot, desktopSnapshot, webSnapshot };

    if (desktopSnapshot.status?.state === "running") {
      const evalResult = await requestDesktopEval(stamp.ipc, PACKAGED_HEALTH_EXPRESSION);
      lastResult = { evalResult, snapshots: lastResult };
      if (evalResult.ok === true && asHealthyPackagedValue(evalResult.value) != null) {
        const inspect = await inspectPackedWinApp(runtimeConfig, {});
        return {
          ...inspect,
          eval: evalResult,
          status: desktopSnapshot.status,
          wait: { attempts, durationMs: Date.now() - startedAt, intervalMs },
        };
      }
    } else if (
      options.allowDaemonFallback === true
      && daemonSnapshot.status?.state === "running"
      && daemonSnapshot.status.url != null
      && webSnapshot.status?.state === "running"
      && webSnapshot.status.url != null
    ) {
      const health = await requestDaemonHealth(daemonSnapshot.status.url);
      lastResult = { health, snapshots: lastResult };
      if (health != null) {
        const inspect = await inspectPackedWinApp(runtimeConfig, {});
        return {
          ...inspect,
          desktopIpcUnavailable: true,
          eval: { ok: true, value: health },
          status: {
            ...(daemonSnapshot.status.pid == null ? {} : { pid: daemonSnapshot.status.pid }),
            state: "running",
            title: null,
            url: webSnapshot.status.url,
            windowVisible: false,
          },
          wait: { attempts, durationMs: Date.now() - startedAt, intervalMs },
        };
      }
    }

    await delay(intervalMs);
  }

  throw new Error(`packaged Windows runtime did not become healthy within ${timeoutMs}ms: ${JSON.stringify(lastResult)}`);
}

export async function diagnosePackedWinIpc(
  config: ToolPackConfig,
  options: { diagnoseAttempts?: string | number; statusPollCount?: string | number; statusPollIntervalMs?: string | number },
): Promise<WinIpcDiagnoseResult> {
  const attempts = resolveOptionalPositiveInteger(options.diagnoseAttempts, "--diagnose-attempts") ?? 10;
  const statusPollCount = resolveOptionalPositiveInteger(options.statusPollCount, "--status-poll-count") ?? 20;
  const statusPollIntervalMs = resolveOptionalPositiveInteger(options.statusPollIntervalMs, "--status-poll-interval-ms") ?? 250;
  const previousTrace = process.env.OD_JSON_IPC_TRACE;
  process.env.OD_JSON_IPC_TRACE = "1";
  const results: WinIpcDiagnoseAttempt[] = [];
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await stopPackedWinApp(config);
      const startedAt = Date.now();
      const start = await startPackedWinApp(config, { waitForStatus: false });
      const statusPoll = await pollWinInspectStatus(config, statusPollCount, statusPollIntervalMs);
      const stop = await stopPackedWinApp(config);
      results.push({
        attempt,
        durationMs: Date.now() - startedAt,
        start,
        statusPoll,
        stop,
      });
    }
  } finally {
    if (previousTrace == null) {
      delete process.env.OD_JSON_IPC_TRACE;
    } else {
      process.env.OD_JSON_IPC_TRACE = previousTrace;
    }
  }
  return {
    attempts: results,
    namespace: config.namespace,
    statusPollCount,
    statusPollIntervalMs,
    traceEnabled: true,
  };
}
