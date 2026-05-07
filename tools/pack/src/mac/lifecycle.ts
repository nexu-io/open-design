import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type DesktopEvalResult,
  type DesktopScreenshotResult,
  type DesktopStatusSnapshot,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { createSidecarLaunchEnv, requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import {
  collectProcessTreePids,
  createProcessStampArgs,
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail,
  spawnBackgroundProcess,
  stopProcesses,
} from "@open-design/platform";
import type { ToolPackConfig } from "../config.js";
import { DESKTOP_LOG_ECHO_ENV, PRODUCT_NAME } from "./constants.js";
import { clearQuarantine, pathExists } from "./fs.js";
import { desktopIdentityPath, desktopLogPath, macAppExecutablePath, resolveMacPaths } from "./paths.js";
import type { DesktopRootIdentityFallback, DesktopRootIdentityMarker, MacCleanupResult, MacInspectResult, MacInstallResult, MacStartResult, MacStartSource, MacStopResult, MacUninstallResult } from "./types.js";

const execFileAsync = promisify(execFile);

function desktopStamp(config: ToolPackConfig): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: config.namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace: config.namespace,
    source: SIDECAR_SOURCES.TOOLS_PACK,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isDesktopRootIdentityMarker(value: unknown): value is DesktopRootIdentityMarker {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.pid === "number" &&
    typeof value.ppid === "number" &&
    typeof value.appPath === "string" &&
    typeof value.executablePath === "string" &&
    typeof value.logPath === "string" &&
    typeof value.namespaceRoot === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.updatedAt === "string" &&
    isRecord(value.stamp)
  );
}

function summarizeDesktopMarker(
  marker: DesktopRootIdentityMarker | null,
): Partial<DesktopRootIdentityMarker> | undefined {
  if (marker == null) return undefined;
  return {
    appPath: marker.appPath,
    executablePath: marker.executablePath,
    logPath: marker.logPath,
    namespaceRoot: marker.namespaceRoot,
    pid: marker.pid,
    ppid: marker.ppid,
    stamp: marker.stamp,
    startedAt: marker.startedAt,
    updatedAt: marker.updatedAt,
    version: marker.version,
  };
}

async function readDesktopRootIdentityMarker(config: ToolPackConfig): Promise<{
  fallback: DesktopRootIdentityFallback;
  marker: DesktopRootIdentityMarker | null;
}> {
  const markerPath = desktopIdentityPath(config);
  let payload: unknown;

  try {
    payload = JSON.parse(await readFile(markerPath, "utf8"));
  } catch (error) {
    const code = typeof error === "object" && error != null && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;
    return {
      fallback: {
        markerPath,
        reason: code === "ENOENT" ? "marker-not-found" : "marker-read-failed",
      },
      marker: null,
    };
  }

  if (!isDesktopRootIdentityMarker(payload)) {
    return {
      fallback: {
        markerPath,
        reason: "marker-invalid-shape",
      },
      marker: null,
    };
  }

  return {
    fallback: {
      marker: summarizeDesktopMarker(payload),
      markerPath,
      reason: "marker-present",
    },
    marker: payload,
  };
}

function commandMatchesDesktopMarker(
  command: string,
  marker: DesktopRootIdentityMarker,
): boolean {
  return command.includes(marker.executablePath) || command.includes(macAppExecutablePath(marker.appPath));
}

async function resolveDesktopRootIdentityFallback(config: ToolPackConfig): Promise<{
  fallback: DesktopRootIdentityFallback;
  rootPid: number | null;
}> {
  const { fallback, marker } = await readDesktopRootIdentityMarker(config);
  if (marker == null) return { fallback, rootPid: null };

  let stamp: SidecarStamp;
  try {
    stamp = OPEN_DESIGN_SIDECAR_CONTRACT.normalizeStamp(marker.stamp);
  } catch {
    return {
      fallback: { ...fallback, reason: "marker-invalid-stamp" },
      rootPid: null,
    };
  }

  const expectedIpc = resolveAppIpcPath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: config.namespace,
  });
  if (
    stamp.app !== APP_KEYS.DESKTOP ||
    stamp.mode !== SIDECAR_MODES.RUNTIME ||
    stamp.namespace !== config.namespace ||
    stamp.ipc !== expectedIpc ||
    (stamp.source !== SIDECAR_SOURCES.PACKAGED && stamp.source !== SIDECAR_SOURCES.TOOLS_PACK)
  ) {
    return {
      fallback: { ...fallback, reason: "marker-stamp-mismatch" },
      rootPid: null,
    };
  }

  if (marker.namespaceRoot !== config.roots.runtime.namespaceRoot) {
    return {
      fallback: { ...fallback, reason: "marker-namespace-root-mismatch" },
      rootPid: null,
    };
  }

  const processes = await listProcessSnapshots();
  const processInfo = processes.find((entry) => entry.pid === marker.pid) ?? null;
  if (processInfo == null) {
    return {
      fallback: { ...fallback, reason: "marker-pid-not-running" },
      rootPid: null,
    };
  }

  if (!commandMatchesDesktopMarker(processInfo.command, marker)) {
    return {
      fallback: {
        ...fallback,
        processCommand: processInfo.command,
        reason: "marker-command-mismatch",
      },
      rootPid: null,
    };
  }

  return {
    fallback: {
      ...fallback,
      processCommand: processInfo.command,
      reason: "marker-matched",
    },
    rootPid: marker.pid,
  };
}

function isUnmanagedDesktopFallback(fallback: DesktopRootIdentityFallback | undefined): boolean {
  return fallback != null && ![
    "marker-matched",
    "marker-not-found",
    "marker-pid-not-running",
  ].includes(fallback.reason);
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

async function resolvePackedMacStartTarget(config: ToolPackConfig): Promise<{
  appPath: string;
  executablePath: string;
  source: MacStartSource;
}> {
  const paths = resolveMacPaths(config);
  const candidates: Array<{ appPath: string; source: MacStartSource }> = [
    { appPath: paths.installedAppPath, source: "installed" },
    { appPath: paths.userApplicationsAppPath, source: "user-applications" },
    { appPath: paths.systemApplicationsAppPath, source: "system-applications" },
    { appPath: paths.appPath, source: "built" },
  ];

  for (const candidate of candidates) {
    const executablePath = macAppExecutablePath(candidate.appPath);
    if (await pathExists(executablePath)) {
      return { ...candidate, executablePath };
    }
  }

  throw new Error(
    `no mac .app executable found for namespace=${config.namespace}; run tools-pack mac build --to all and tools-pack mac install first`,
  );
}

async function detachMount(mountPoint: string): Promise<boolean> {
  try {
    await execFileAsync("hdiutil", ["detach", mountPoint, "-quiet"]);
    return true;
  } catch {
    try {
      await execFileAsync("hdiutil", ["detach", mountPoint, "-force", "-quiet"]);
      return true;
    } catch {
      return false;
    }
  }
}

export async function installPackedMacDmg(config: ToolPackConfig): Promise<MacInstallResult> {
  const paths = resolveMacPaths(config);
  if (!(await pathExists(paths.dmgPath))) {
    throw new Error(`no mac dmg found at ${paths.dmgPath}; run tools-pack mac build --to all first`);
  }

  await rm(paths.mountPoint, { force: true, recursive: true });
  await mkdir(paths.mountPoint, { recursive: true });
  await rm(paths.installedAppPath, { force: true, recursive: true });
  await mkdir(paths.installApplicationsRoot, { recursive: true });

  let detached = false;
  try {
    await execFileAsync("hdiutil", [
      "attach",
      paths.dmgPath,
      "-mountpoint",
      paths.mountPoint,
      "-nobrowse",
      "-quiet",
    ]);
    await execFileAsync("ditto", [join(paths.mountPoint, `${PRODUCT_NAME}.app`), paths.installedAppPath]);
    await clearQuarantine(paths.installedAppPath);
  } finally {
    detached = await detachMount(paths.mountPoint);
  }

  return {
    detached,
    dmgPath: paths.dmgPath,
    installedAppPath: paths.installedAppPath,
    mountPoint: paths.mountPoint,
    namespace: config.namespace,
  };
}

export async function startPackedMacApp(config: ToolPackConfig): Promise<MacStartResult> {
  const target = await resolvePackedMacStartTarget(config);
  const stamp = desktopStamp(config);
  const logPath = desktopLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  const spawned = await spawnBackgroundProcess({
    args: createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
    command: target.executablePath,
    cwd: target.appPath,
    env: createSidecarLaunchEnv({
      base: join(config.roots.runtime.namespaceRoot, "runtime"),
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      extraEnv: {
        ...process.env,
        [DESKTOP_LOG_ECHO_ENV]: "0",
      },
      stamp,
    }),
    logFd: null,
  });
  const status = await waitForDesktopStatus(config);
  return {
    appPath: target.appPath,
    executablePath: target.executablePath,
    logPath,
    namespace: config.namespace,
    pid: spawned.pid,
    source: target.source,
    status,
  };
}

async function findManagedDesktopProcessTree(config: ToolPackConfig): Promise<{
  fallback?: DesktopRootIdentityFallback;
  pids: number[];
}> {
  const processes = await listProcessSnapshots();
  const stampedRootPids = processes
    .filter((processInfo) =>
      matchesStampedProcess(processInfo, {
        mode: SIDECAR_MODES.RUNTIME,
        namespace: config.namespace,
        source: SIDECAR_SOURCES.TOOLS_PACK,
      }, OPEN_DESIGN_SIDECAR_CONTRACT),
    )
    .map((processInfo) => processInfo.pid);
  const identity = await resolveDesktopRootIdentityFallback(config);
  const pids = collectProcessTreePids(processes, [
    ...stampedRootPids,
    identity.rootPid,
  ]);
  return { fallback: identity.fallback, pids };
}

async function waitForNoManagedDesktopProcesses(
  config: ToolPackConfig,
  timeoutMs = 6000,
): Promise<{ fallback?: DesktopRootIdentityFallback; pids: number[] }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await findManagedDesktopProcessTree(config);
    if (current.pids.length === 0) return current;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  return await findManagedDesktopProcessTree(config);
}

export async function stopPackedMacApp(config: ToolPackConfig): Promise<MacStopResult> {
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
  if (remainingAfterGraceful.pids.length === 0) {
    const unmanaged = !gracefulRequested && before.pids.length === 0 && isUnmanagedDesktopFallback(before.fallback);
    if (!unmanaged) {
      await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
    }
    return {
      ...(before.fallback == null ? {} : { fallback: before.fallback }),
      gracefulRequested,
      namespace: config.namespace,
      remainingPids: [],
      status: unmanaged ? "unmanaged" : before.pids.length === 0 ? "not-running" : "stopped",
      stoppedPids: before.pids,
    };
  }

  const stopped = await stopProcesses(remainingAfterGraceful.pids);
  if (stopped.remainingPids.length === 0) {
    await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  }
  return {
    ...(remainingAfterGraceful.fallback == null ? {} : { fallback: remainingAfterGraceful.fallback }),
    gracefulRequested,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length === 0 ? "stopped" : "partial",
    stoppedPids: stopped.stoppedPids,
  };
}

export async function readPackedMacLogs(config: ToolPackConfig) {
  const entries = await Promise.all(
    [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON].map(async (app) => {
      const logPath = join(config.roots.runtime.namespaceRoot, "logs", app, "latest.log");
      return [app, { lines: await readLogTail(logPath, 200), logPath }] as const;
    }),
  );

  return {
    logs: Object.fromEntries(entries),
    namespace: config.namespace,
  };
}

export async function inspectPackedMacApp(config: ToolPackConfig, options: { expr?: string; path?: string }): Promise<MacInspectResult> {
  const stamp = desktopStamp(config);
  const status = await requestJsonIpc<DesktopStatusSnapshot>(
    stamp.ipc,
    { type: SIDECAR_MESSAGES.STATUS },
    { timeoutMs: 2000 },
  ).catch(() => null);

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

export async function uninstallPackedMacApp(config: ToolPackConfig): Promise<MacUninstallResult> {
  const paths = resolveMacPaths(config);
  const stop = await stopPackedMacApp(config);
  const removed = await pathExists(paths.installedAppPath);
  await rm(paths.installedAppPath, { force: true, recursive: true });

  return {
    installedAppPath: paths.installedAppPath,
    namespace: config.namespace,
    removed,
    stop,
  };
}

export async function cleanupPackedMacNamespace(config: ToolPackConfig): Promise<MacCleanupResult> {
  const paths = resolveMacPaths(config);
  const stop = await stopPackedMacApp(config);
  const detachedMount = await detachMount(paths.mountPoint);
  const removedOutputRoot = await pathExists(config.roots.output.namespaceRoot);
  const removedRuntimeNamespaceRoot = await pathExists(config.roots.runtime.namespaceRoot);

  await rm(config.roots.output.namespaceRoot, { force: true, recursive: true });
  await rm(config.roots.runtime.namespaceRoot, { force: true, recursive: true });

  return {
    detachedMount,
    namespace: config.namespace,
    outputRoot: config.roots.output.namespaceRoot,
    removedOutputRoot,
    removedRuntimeNamespaceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    stop,
  };
}
