import { spawn } from "node:child_process";
import { lstat, mkdir, open, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";

import { cac } from "cac";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  SIDECAR_SOURCES,
  type DaemonStatusSnapshot,
  type DesktopClickResult,
  type DesktopConsoleResult,
  type DesktopEvalResult,
  type DesktopScreenshotResult,
  type DesktopStatusSnapshot,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import { createSidecarLaunchEnv, requestJsonIpc } from "@open-design/sidecar";
import {
  collectProcessTreePids,
  createPackageManagerInvocation,
  createProcessStampArgs,
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail,
  spawnBackgroundProcess,
  stopProcesses,
  type StopProcessesResult,
} from "@open-design/platform";

import {
  ALL_APPS,
  DEFAULT_START_APPS,
  DEFAULT_STOP_APPS,
  parsePortOption,
  resolveRunApps,
  resolveStartApps,
  resolveStopApps,
  resolveTargetApps,
  resolveToolDevConfig,
  type ToolDevAppName,
  type ToolDevConfig,
  type ToolDevOptions,
} from "./config.js";
import {
  appendStartupLogDiagnostics,
  createStartupLogDiagnostics,
  detectLogDiagnostics,
  formatLogDiagnostics,
  type LogDiagnostic,
} from "./diagnostics.js";
import {
  inspectDaemonRuntime,
  inspectDesktopRuntime,
  inspectWebRuntime,
  waitForDaemonRuntime,
  waitForDesktopRuntime,
  waitForWebRuntime,
} from "./sidecar-client.js";

type CliOptions = ToolDevOptions & {
  expr?: string;
  parentPid?: number;
  path?: string;
  selector?: string;
  timeout?: string;
};

const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function exitWithError(error: unknown): never {
  process.stderr.write(`${formatError(error)}\n`);
  process.exit(1);
}

process.on("uncaughtException", exitWithError);
process.on("unhandledRejection", exitWithError);

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function output(payload: unknown, options: CliOptions = {}): void {
  if (typeof payload === "string" && options.json !== true) {
    process.stdout.write(`${payload}\n`);
    return;
  }
  printJson(payload);
}

function normalizeDisplayUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function colorizeLink(url: string): string {
  if (process.env.NO_COLOR != null || process.stdout.isTTY !== true) return url;
  const reset = "\x1b[0m";
  const cyan = "\x1b[36m";
  const underline = "\x1b[4m";
  return `${cyan}${underline}${url}${reset}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberArrayField(record: Record<string, unknown> | null, key: string): number[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function formatProcessList(pids: readonly number[]): string | null {
  if (pids.length === 0) return null;
  const visible = pids.slice(0, 5).join(", ");
  return pids.length > 5 ? `${visible}, +${pids.length - 5} more` : visible;
}

function formatStatusSummary(status: unknown): string {
  const record = asRecord(status);
  if (record == null) return "status unavailable";

  const parts = [stringField(record, "state") ?? "unknown"];
  const url = stringField(record, "url");
  const pid = numberField(record, "pid");
  const title = stringField(record, "title");
  const windowVisible = record.windowVisible;
  if (url != null) parts.push(url);
  if (pid != null) parts.push(`pid ${pid}`);
  if (title != null) parts.push(`title ${JSON.stringify(title)}`);
  if (typeof windowVisible === "boolean") parts.push(`window ${windowVisible ? "visible" : "hidden"}`);

  return parts.join(" · ");
}

function printStatusEntries(apps: Record<string, unknown>): void {
  for (const [appName, appStatus] of Object.entries(apps)) {
    process.stdout.write(`- ${appName}: ${formatStatusSummary(appStatus)}\n`);
  }
}

function printStartSection(result: Partial<Record<ToolDevAppName, unknown>>, heading: string): void {
  process.stdout.write(`${heading}\n`);
  const entries = Object.entries(result);
  if (entries.length === 0) {
    process.stdout.write("(no apps)\n");
    return;
  }

  for (const [appName, rawEntry] of entries) {
    const entry = asRecord(rawEntry);
    const created = entry?.created;
    const action = created === true ? "started" : created === false ? "already running" : "ready";
    process.stdout.write(`- ${appName}: ${action} · ${formatStatusSummary(entry?.status)}\n`);
    const logPath = entry == null ? null : stringField(entry, "logPath");
    if (logPath != null) process.stdout.write(`  log: ${logPath}\n`);
  }
}

function printStartResult(result: Partial<Record<ToolDevAppName, unknown>>, options: CliOptions, heading = "tools-dev start"): void {
  if (options.json === true) {
    printJson(result);
    return;
  }
  printStartSection(result, heading);
}

function printStopSection(result: Partial<Record<ToolDevAppName, unknown>>, heading: string): void {
  process.stdout.write(`${heading}\n`);
  const entries = Object.entries(result);
  if (entries.length === 0) {
    process.stdout.write("(no apps)\n");
    return;
  }

  for (const [appName, rawEntry] of entries) {
    const entry = asRecord(rawEntry);
    const stop = asRecord(entry?.stop);
    const stoppedPids = formatProcessList(numberArrayField(stop, "stoppedPids"));
    const remainingPids = formatProcessList(numberArrayField(stop, "remainingPids"));
    const parts = [entry == null ? "unknown" : stringField(entry, "status") ?? "unknown"];
    const via = entry == null ? null : stringField(entry, "via");
    if (via != null) parts.push(`via ${via}`);
    if (stoppedPids != null) parts.push(`stopped pids ${stoppedPids}`);
    if (remainingPids != null) parts.push(`remaining pids ${remainingPids}`);
    process.stdout.write(`- ${appName}: ${parts.join(" · ")}\n`);
  }
}

function printStopResult(result: Partial<Record<ToolDevAppName, unknown>>, options: CliOptions, heading = "tools-dev stop"): void {
  if (options.json === true) {
    printJson(result);
    return;
  }
  printStopSection(result, heading);
}

function printRestartResult(result: unknown, options: CliOptions): void {
  if (options.json === true) {
    printJson(result);
    return;
  }

  const record = asRecord(result);
  process.stdout.write("tools-dev restart\n");
  printStopSection((asRecord(record?.stop) ?? {}) as Partial<Record<ToolDevAppName, unknown>>, "Stop");
  printStartSection((asRecord(record?.start) ?? {}) as Partial<Record<ToolDevAppName, unknown>>, "Start");
}

function printStatusResult(result: unknown, options: CliOptions, appName: string | undefined): void {
  if (options.json === true) {
    printJson(result);
    return;
  }

  const record = asRecord(result);
  const apps = asRecord(record?.apps);
  if (apps != null) {
    const namespace = stringField(record ?? {}, "namespace");
    const statusLabel = stringField(record ?? {}, "status");
    const details = [namespace == null ? null : `namespace ${namespace}`, statusLabel].filter((entry): entry is string => entry != null);
    process.stdout.write(`tools-dev status${details.length > 0 ? ` (${details.join(" · ")})` : ""}\n`);
    printStatusEntries(apps);
    return;
  }

  process.stdout.write("tools-dev status\n");
  process.stdout.write(`- ${appName ?? ALL_APPS.join("/")}: ${formatStatusSummary(result)}\n`);
}

function printRunForegroundResult(started: Partial<Record<ToolDevAppName, unknown>>, options: CliOptions): void {
  if (options.json === true) {
    printJson({ mode: "foreground", started });
    return;
  }

  const webStatus = asRecord(asRecord(started.web)?.status);
  const daemonStatus = asRecord(asRecord(started.daemon)?.status);
  const webUrl = stringField(webStatus ?? {}, "url");
  const daemonUrl = stringField(daemonStatus ?? {}, "url");

  if (webUrl != null || daemonUrl != null) {
    process.stdout.write("\n  Open Design dev server ready\n\n");
    if (webUrl != null) process.stdout.write(`  ➜  Web:    ${colorizeLink(normalizeDisplayUrl(webUrl))}\n`);
    if (daemonUrl != null) process.stdout.write(`  ➜  Daemon: ${colorizeLink(normalizeDisplayUrl(daemonUrl))}\n`);
    process.stdout.write("\n  Press Ctrl+C to stop\n\n");
    return;
  }

  printStartSection(started, "tools-dev run");
  process.stdout.write("Foreground loop is active. Press Ctrl+C to stop.\n");
}

function runtimeLookup(config: ToolDevConfig) {
  return { base: config.toolsDevRoot, namespace: config.namespace };
}

function appConfig(config: ToolDevConfig, appName: ToolDevAppName) {
  return config.apps[appName];
}

function urlPort(url: string): string {
  const parsed = new URL(url);
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : "80";
}

function statusMatchesForcedPort(url: string | null | undefined, forcedPort: number | null): boolean {
  return forcedPort == null || (url != null && urlPort(url) === String(forcedPort));
}

function prependNodePath(entries: string[], current = process.env.NODE_PATH): string {
  const existing = current == null || current.length === 0 ? [] : current.split(path.delimiter);
  return [...entries, ...existing].join(path.delimiter);
}

async function openAppLog(config: ToolDevConfig, appName: ToolDevAppName): Promise<FileHandle> {
  const logPath = appConfig(config, appName).latestLogPath;
  await mkdir(path.dirname(logPath), { recursive: true });
  return await open(logPath, "a");
}

async function runLoggedCommand(request: {
  args: string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  logFd: number;
  windowsVerbatimArguments?: boolean;
}): Promise<void> {
  const child = spawn(request.command, request.args, {
    cwd: request.cwd,
    env: request.env,
    stdio: ["ignore", request.logFd, request.logFd],
    windowsHide: process.platform === "win32",
    windowsVerbatimArguments: request.windowsVerbatimArguments,
  });

  await new Promise<void>((resolveRun, rejectRun) => {
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`command failed: ${request.command} ${request.args.join(" ")} (${signal ?? code})`));
    });
  });
}

function createAppStamp(config: ToolDevConfig, appName: ToolDevAppName) {
  const currentAppConfig = appConfig(config, appName);
  const stamp = {
    app: appName,
    ipc: currentAppConfig.ipcPath,
    mode: "dev" as const,
    namespace: config.namespace,
    source: SIDECAR_SOURCES.TOOLS_DEV,
  };

  return {
    args: createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
    env: createSidecarLaunchEnv({
      base: config.toolsDevRoot,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      stamp,
    }),
    stamp,
  };
}

async function findAppProcessTree(config: ToolDevConfig, appName: ToolDevAppName) {
  const processes = await listProcessSnapshots();
  const rootPids = processes
    .filter((processInfo) =>
      matchesStampedProcess(processInfo, {
        app: appName,
        mode: "dev",
        namespace: config.namespace,
        source: SIDECAR_SOURCES.TOOLS_DEV,
      }, OPEN_DESIGN_SIDECAR_CONTRACT),
    )
    .map((processInfo) => processInfo.pid);
  const pids = collectProcessTreePids(processes, rootPids);

  return { pids, rootPids };
}

async function waitForAppProcessExit(config: ToolDevConfig, appName: ToolDevAppName, timeoutMs = 5000): Promise<number[]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await findAppProcessTree(config, appName);
    if (current.pids.length === 0) return [];
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  return (await findAppProcessTree(config, appName)).pids;
}

async function assertNoStaleActiveProcess(config: ToolDevConfig, appName: ToolDevAppName): Promise<void> {
  const active = await findAppProcessTree(config, appName);
  if (active.pids.length > 0) {
    throw new Error(`${appName} has active stamped processes but no reachable IPC status; run tools-dev stop ${appName} first`);
  }
}

async function spawnSidecarRuntime(request: {
  appName: typeof APP_KEYS.DAEMON | typeof APP_KEYS.WEB;
  config: ToolDevConfig;
  env: NodeJS.ProcessEnv;
  logHandle: FileHandle;
}): Promise<{ pid: number }> {
  const { args: stampArgs, env } = createAppStamp(request.config, request.appName);
  const sidecarConfig = request.config.apps[request.appName];
  const spawned = await spawnBackgroundProcess({
    args: [request.config.tsxCliPath, sidecarConfig.sidecarEntryPath, ...stampArgs],
    command: process.execPath,
    cwd: request.config.workspaceRoot,
    detached: true,
    env: {
      ...process.env,
      ...env,
      ...request.env,
    },
    logFd: request.logHandle.fd,
  });
  return { pid: spawned.pid };
}

async function spawnDaemonRuntime(config: ToolDevConfig, options: CliOptions): Promise<{ pid: number }> {
  const daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  const webPort = parsePortOption(options.webPort, "--web-port");
  const logHandle = await openAppLog(config, APP_KEYS.DAEMON);

  try {
    await logHandle.write(`\n[tools-dev] launching daemon at ${new Date().toISOString()}\n`);
    if (webPort != null) await logHandle.write(`[tools-dev] trusting web origin port ${webPort}\n`);
    return await spawnSidecarRuntime({
      appName: APP_KEYS.DAEMON,
      config,
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: String(daemonPort ?? 0),
        ...(webPort == null ? {} : { [SIDECAR_ENV.WEB_PORT]: String(webPort) }),
        ...(options.parentPid == null ? {} : { [TOOLS_DEV_PARENT_PID_ENV]: String(options.parentPid) }),
      },
      logHandle,
    });
  } finally {
    await logHandle.close();
  }
}

async function spawnWebRuntime(config: ToolDevConfig, options: CliOptions): Promise<{ pid: number }> {
  const daemonStatus = await waitForDaemonRuntime(runtimeLookup(config));
  if (daemonStatus.url == null) throw new Error("daemon must be running before web starts");

  const webPort = parsePortOption(options.webPort, "--web-port");
  const daemonPort = urlPort(daemonStatus.url);
  const logHandle = await openAppLog(config, APP_KEYS.WEB);

  try {
    await ensureWebDevNodeModules(config);
    await writeWebDevTsconfig(config);
    await logHandle.write(`\n[tools-dev] launching web at ${new Date().toISOString()}\n`);
    await logHandle.write(`[tools-dev] proxying web API requests to daemon port ${daemonPort}\n`);
    return await spawnSidecarRuntime({
      appName: APP_KEYS.WEB,
      config,
      env: {
        NODE_PATH: prependNodePath([
          path.join(config.workspaceRoot, "apps/web/node_modules"),
          path.join(config.workspaceRoot, "node_modules"),
        ]),
        [SIDECAR_ENV.DAEMON_PORT]: daemonPort,
        [SIDECAR_ENV.WEB_DIST_DIR]: config.apps.web.nextDistDir,
        [SIDECAR_ENV.WEB_TSCONFIG_PATH]: config.apps.web.nextTsconfigPath,
        [SIDECAR_ENV.WEB_PORT]: String(webPort ?? 0),
        PORT: String(webPort ?? 0),
        ...(options.parentPid == null ? {} : { [TOOLS_DEV_PARENT_PID_ENV]: String(options.parentPid) }),
        ...(options.prod === true
          ? { NODE_ENV: "production", OD_WEB_OUTPUT_MODE: "server", OD_WEB_PROD: "1" }
          : {}),
      },
      logHandle,
    });
  } finally {
    await logHandle.close();
  }
}

async function buildDesktop(config: ToolDevConfig, logHandle: FileHandle): Promise<void> {
  await logHandle.write(`\n[tools-dev] building @open-design/desktop at ${new Date().toISOString()}\n`);
  const invocation = createPackageManagerInvocation(["--filter", "@open-design/desktop", "build"], process.env);
  await runLoggedCommand({
    args: invocation.args,
    command: invocation.command,
    cwd: config.workspaceRoot,
    env: process.env,
    logFd: logHandle.fd,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

async function ensureWebDevNodeModules(config: ToolDevConfig): Promise<void> {
  const webRuntimeRoot = path.dirname(config.apps.web.nextDistDir);
  const runtimeNodeModules = path.join(webRuntimeRoot, "node_modules");
  const webNodeModules = path.join(config.workspaceRoot, "apps/web/node_modules");

  await mkdir(webRuntimeRoot, { recursive: true });
  const current = await lstat(runtimeNodeModules).catch(() => null);
  if (current?.isSymbolicLink()) return;
  if (current != null) await rm(runtimeNodeModules, { force: true, recursive: true });
  await symlink(webNodeModules, runtimeNodeModules, "junction");
}

async function writeWebDevTsconfig(config: ToolDevConfig): Promise<void> {
  const webRoot = path.join(config.workspaceRoot, "apps/web");
  const tsconfigPath = config.apps.web.nextTsconfigPath;
  const tsconfigDir = path.dirname(tsconfigPath);
  const sourceTsconfig = path.join(webRoot, "tsconfig.json");
  const relativeSourceTsconfig = (path.relative(tsconfigDir, sourceTsconfig) || "./tsconfig.json").replaceAll("\\", "/");

  await mkdir(tsconfigDir, { recursive: true });
  await writeFile(
    tsconfigPath,
    `${JSON.stringify({
      extends: relativeSourceTsconfig,
      compilerOptions: {
        plugins: [{ name: "next" }],
      },
    }, null, 2)}\n`,
    "utf8",
  );
}

async function spawnDesktopRuntime(config: ToolDevConfig, options: CliOptions): Promise<{ pid: number }> {
  const { args: stampArgs, env } = createAppStamp(config, APP_KEYS.DESKTOP);
  const logHandle = await openAppLog(config, APP_KEYS.DESKTOP);

  try {
    await buildDesktop(config, logHandle);
    await logHandle.write(`[tools-dev] launching desktop at ${new Date().toISOString()}\n`);
    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...env,
      ...(options.parentPid == null ? {} : { [TOOLS_DEV_PARENT_PID_ENV]: String(options.parentPid) }),
    };
    // ELECTRON_RUN_AS_NODE=1 makes Electron boot as plain Node and skip
    // main-process API injection (app, BrowserWindow, protocol all become
    // undefined). Strip it from the spawn env so desktop always boots in
    // real Electron mode even when the parent shell is an Electron-based
    // IDE that sets this variable for sidecar reuse.
    //
    // Iterate keys with a case-insensitive comparison rather than
    // `delete spawnEnv.ELECTRON_RUN_AS_NODE`: spreading process.env into
    // a plain object loses Node's Windows case-insensitive proxy, so any
    // alternate-cased variant (e.g. `electron_run_as_node`) would still
    // be passed to the child and Win32 CreateProcess would treat it as
    // the same variable, undoing the fix.
    //
    // Scope is tools-dev only. The packaged runtime intentionally sets
    // ELECTRON_RUN_AS_NODE on its own daemon/web sidecars (see
    // apps/packaged/src/sidecars.ts) to reuse the bundled Node binary;
    // that flow is independent and untouched here.
    for (const key of Object.keys(spawnEnv)) {
      if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") {
        delete spawnEnv[key];
      }
    }
    const spawned = await spawnBackgroundProcess({
      args: [config.apps.desktop.mainEntryPath, ...stampArgs],
      command: config.apps.desktop.electronBinaryPath,
      cwd: config.workspaceRoot,
      detached: true,
      env: spawnEnv,
      logFd: logHandle.fd,
    });
    return { pid: spawned.pid };
  } finally {
    await logHandle.close();
  }
}

async function startDaemon(config: ToolDevConfig, options: CliOptions) {
  const daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  const existing = await inspectDaemonRuntime(runtimeLookup(config));
  if (existing?.url != null && statusMatchesForcedPort(existing.url, daemonPort)) {
    return { app: APP_KEYS.DAEMON, created: false, logPath: config.apps.daemon.latestLogPath, status: existing };
  }
  if (existing?.url != null) {
    throw new Error(`${APP_KEYS.DAEMON} is already running in namespace ${config.namespace} at ${existing.url}; stop it or choose another namespace`);
  }
  await assertNoStaleActiveProcess(config, APP_KEYS.DAEMON);

  const spawned = await spawnDaemonRuntime(config, options);
  try {
    const status = await waitForDaemonRuntime(runtimeLookup(config));
    return {
      app: APP_KEYS.DAEMON,
      created: true,
      logPath: config.apps.daemon.latestLogPath,
      pid: spawned.pid,
      status,
    };
  } catch (error) {
    const logPath = config.apps.daemon.latestLogPath;
    const lines = await readLogTail(logPath, 80).catch(() => []);
    await stopApp(config, APP_KEYS.DAEMON).catch(() => undefined);
    throw appendStartupLogDiagnostics(error, APP_KEYS.DAEMON, createStartupLogDiagnostics(logPath, lines));
  }
}

async function startWeb(config: ToolDevConfig, options: CliOptions) {
  const webPort = parsePortOption(options.webPort, "--web-port");
  const existing = await inspectWebRuntime(runtimeLookup(config));
  if (existing?.url != null && statusMatchesForcedPort(existing.url, webPort)) {
    return { app: APP_KEYS.WEB, created: false, logPath: config.apps.web.latestLogPath, status: existing };
  }
  if (existing?.url != null) {
    throw new Error(`${APP_KEYS.WEB} is already running in namespace ${config.namespace} at ${existing.url}; stop it or choose another namespace`);
  }
  await assertNoStaleActiveProcess(config, APP_KEYS.WEB);

  const spawned = await spawnWebRuntime(config, options);
  try {
    const status = await waitForWebRuntime(runtimeLookup(config));
    return {
      app: APP_KEYS.WEB,
      created: true,
      logPath: config.apps.web.latestLogPath,
      pid: spawned.pid,
      status,
    };
  } catch (error) {
    await stopApp(config, APP_KEYS.WEB).catch(() => undefined);
    throw error;
  }
}

async function startDesktop(config: ToolDevConfig, options: CliOptions) {
  const existing = await inspectDesktopRuntime(runtimeLookup(config));
  if (existing != null) {
    return { app: APP_KEYS.DESKTOP, created: false, logPath: config.apps.desktop.latestLogPath, status: existing };
  }
  await assertNoStaleActiveProcess(config, APP_KEYS.DESKTOP);

  const spawned = await spawnDesktopRuntime(config, options);
  try {
    const status = await waitForDesktopRuntime(runtimeLookup(config));
    return {
      app: APP_KEYS.DESKTOP,
      created: true,
      logPath: config.apps.desktop.latestLogPath,
      pid: spawned.pid,
      status,
    };
  } catch (error) {
    await stopApp(config, APP_KEYS.DESKTOP).catch(() => undefined);
    throw error;
  }
}

async function startApp(config: ToolDevConfig, appName: ToolDevAppName, options: CliOptions) {
  switch (appName) {
    case APP_KEYS.DAEMON:
      return await startDaemon(config, options);
    case APP_KEYS.WEB:
      return await startWeb(config, options);
    case APP_KEYS.DESKTOP:
      return await startDesktop(config, options);
  }
}

async function requestAppShutdown(config: ToolDevConfig, appName: ToolDevAppName): Promise<boolean> {
  try {
    await requestJsonIpc(appConfig(config, appName).ipcPath, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1500 });
    return true;
  } catch {
    return false;
  }
}

function stoppedByGracefulResult(matchedPids: number[]): StopProcessesResult {
  return {
    alreadyStopped: matchedPids.length === 0,
    forcedPids: [],
    matchedPids,
    remainingPids: [],
    stoppedPids: matchedPids,
  };
}

async function stopApp(config: ToolDevConfig, appName: ToolDevAppName) {
  const before = await findAppProcessTree(config, appName);
  const gracefulRequested = await requestAppShutdown(config, appName);
  const remainingAfterGraceful = gracefulRequested
    ? await waitForAppProcessExit(config, appName)
    : before.pids;

  if (remainingAfterGraceful.length === 0) {
    return {
      app: appName,
      status: before.pids.length === 0 ? "not-running" : "stopped",
      stop: stoppedByGracefulResult(before.pids),
      via: gracefulRequested ? "ipc" : "process-scan",
    };
  }

  const stop = await stopProcesses(remainingAfterGraceful);
  return {
    app: appName,
    status: stop.remainingPids.length === 0 ? "stopped" : "partial",
    stop,
    via: gracefulRequested ? "ipc+fallback" : "fallback",
  };
}

async function inspectAppStatus(config: ToolDevConfig, appName: ToolDevAppName) {
  if (appName === APP_KEYS.DAEMON) {
    const status = await inspectDaemonRuntime(runtimeLookup(config));
    if (status != null) return status;
    const active = await findAppProcessTree(config, appName);
    return { pid: active.rootPids[0] ?? null, state: active.pids.length > 0 ? "starting" : "idle", url: null } satisfies DaemonStatusSnapshot;
  }
  if (appName === APP_KEYS.WEB) {
    const status = await inspectWebRuntime(runtimeLookup(config));
    if (status != null) return status;
    const active = await findAppProcessTree(config, appName);
    return { pid: active.rootPids[0] ?? null, state: active.pids.length > 0 ? "starting" : "idle", url: null } satisfies WebStatusSnapshot;
  }

  const status = await inspectDesktopRuntime(runtimeLookup(config));
  if (status != null) return status;
  const active = await findAppProcessTree(config, appName);
  return { pid: active.rootPids[0] ?? null, state: active.pids.length > 0 ? "unknown" : "idle", url: null };
}

function summarizeStatus(apps: Record<ToolDevAppName, any>): string {
  const states = Object.values(apps).map((entry) => entry?.state);
  if (states.every((state) => state === "idle")) return "not-running";
  if (states.every((state) => state === "running")) return "running";
  return "partial";
}

async function status(config: ToolDevConfig, appName: string | undefined) {
  const targets = resolveTargetApps(appName, DEFAULT_START_APPS);
  if (targets.length === 1) return await inspectAppStatus(config, targets[0]);

  const apps = Object.fromEntries(
    await Promise.all(targets.map(async (target) => [target, await inspectAppStatus(config, target)] as const)),
  ) as Record<ToolDevAppName, unknown>;
  return { apps, namespace: config.namespace, status: summarizeStatus(apps) };
}

async function restartTargets(config: ToolDevConfig, appName: string | undefined, options: CliOptions) {
  const stopTargets = resolveStopApps(appName);
  const startTargets = resolveStartApps(appName);
  return {
    stop: await runSequential(stopTargets, (target) => stopApp(config, target)),
    start: await runSequential(startTargets, (target) => startApp(config, target, options)),
  };
}

async function readLogs(config: ToolDevConfig, appName: ToolDevAppName) {
  const logPath = appConfig(config, appName).latestLogPath;
  return { app: appName, lines: await readLogTail(logPath, 200), logPath };
}

function createLogDiagnostics(logs: Record<string, LogResult>): Record<string, LogDiagnostic[]> {
  return Object.fromEntries(
    Object.entries(logs).map(([appName, log]) => [appName, detectLogDiagnostics(log.lines)] as const),
  );
}

type LogResult = Awaited<ReturnType<typeof readLogs>>;

function isLogResult(value: LogResult | Record<string, LogResult>): value is LogResult {
  return Array.isArray((value as LogResult).lines);
}

function printLogs(result: LogResult | Record<string, LogResult>, options: CliOptions) {
  if (options.json === true) {
    printJson(result);
    return;
  }

  const entries: Array<[string, LogResult]> = isLogResult(result) ? [[result.app, result]] : Object.entries(result);
  for (const [appName, entry] of entries) {
    process.stdout.write(`[${appName}] ${entry.logPath}\n`);
    process.stdout.write(entry.lines.length > 0 ? `${entry.lines.join("\n")}\n` : "(no log lines)\n");
  }
}

function printCheckResult(result: unknown, options: CliOptions): void {
  if (options.json === true) {
    printJson(result);
    return;
  }

  const record = asRecord(result);
  const namespace = record == null ? null : stringField(record, "namespace");
  process.stdout.write(`tools-dev check${namespace == null ? "" : ` (namespace ${namespace})`}\n`);

  const apps = asRecord(record?.apps);
  if (apps != null) {
    process.stdout.write("Status\n");
    printStatusEntries(apps);
  }

  const logs = asRecord(record?.logs);
  if (logs != null) {
    process.stdout.write("\nLogs\n");
    printLogs(logs as Record<string, LogResult>, options);
  }

  const diagnostics = asRecord(record?.diagnostics);
  if (diagnostics != null) {
    const entries = Object.entries(diagnostics)
      .map(([appName, value]) => [appName, Array.isArray(value) ? formatLogDiagnostics(value as LogDiagnostic[]) : null] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] != null);
    if (entries.length > 0) {
      process.stdout.write("\nDiagnostics\n");
      for (const [appName, message] of entries) {
        process.stdout.write(`[${appName}] ${message}\n`);
      }
    }
  }
}

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--timeout must be a positive number of seconds");
  return seconds * 1000;
}

async function inspectDesktop(config: ToolDevConfig, target: string | undefined, options: CliOptions) {
  const operation = target ?? "status";
  const timeoutMs = parseTimeoutMs(options.timeout) ?? 30000;

  switch (operation) {
    case "status":
      return (await inspectDesktopRuntime(runtimeLookup(config), 1000)) ?? ({ state: "idle" } satisfies DesktopStatusSnapshot);
    case "eval":
      if (options.expr == null) throw new Error("--expr is required for desktop eval");
      return await requestJsonIpc<DesktopEvalResult>(
        config.apps.desktop.ipcPath,
        { input: { expression: options.expr }, type: SIDECAR_MESSAGES.EVAL },
        { timeoutMs },
      );
    case "screenshot":
      if (options.path == null) throw new Error("--path is required for desktop screenshot");
      return await requestJsonIpc<DesktopScreenshotResult>(
        config.apps.desktop.ipcPath,
        { input: { path: options.path }, type: SIDECAR_MESSAGES.SCREENSHOT },
        { timeoutMs },
      );
    case "console":
      return await requestJsonIpc<DesktopConsoleResult>(config.apps.desktop.ipcPath, { type: SIDECAR_MESSAGES.CONSOLE }, { timeoutMs });
    case "click":
      if (options.selector == null) throw new Error("--selector is required for desktop click");
      return await requestJsonIpc<DesktopClickResult>(
        config.apps.desktop.ipcPath,
        { input: { selector: options.selector }, type: SIDECAR_MESSAGES.CLICK },
        { timeoutMs },
      );
    default:
      throw new Error(`unsupported desktop inspect target: ${operation}`);
  }
}

async function inspect(config: ToolDevConfig, appName: string, target: string | undefined, options: CliOptions) {
  if (appName === APP_KEYS.DAEMON) {
    if (target != null && target !== "status") throw new Error(`unsupported daemon inspect target: ${target}`);
    return (await inspectDaemonRuntime(runtimeLookup(config), 1000)) ?? ({ state: "idle", url: null } satisfies DaemonStatusSnapshot);
  }
  if (appName === APP_KEYS.WEB) {
    if (target != null && target !== "status") throw new Error(`unsupported web inspect target: ${target}`);
    return (await inspectWebRuntime(runtimeLookup(config), 1000)) ?? ({ state: "idle", url: null } satisfies WebStatusSnapshot);
  }
  if (appName !== APP_KEYS.DESKTOP) throw new Error(`unsupported tools-dev app: ${appName}`);
  return await inspectDesktop(config, target, options);
}

async function runSequential<T>(targets: readonly ToolDevAppName[], operation: (target: ToolDevAppName) => Promise<T>) {
  const result: Partial<Record<ToolDevAppName, T>> = {};
  for (const target of targets) result[target] = await operation(target);
  return result;
}

function stopOrderFor(targets: readonly ToolDevAppName[]): ToolDevAppName[] {
  const selected = new Set(targets);
  return DEFAULT_STOP_APPS.filter((target) => selected.has(target));
}

async function runForeground(config: ToolDevConfig, appName: string | undefined, options: CliOptions) {
  const targets = resolveRunApps(appName);
  const foregroundOptions = { ...options, parentPid: process.pid };
  const started = await runSequential(targets, (target) => startApp(config, target, foregroundOptions));
  printRunForegroundResult(started, options);

  let shuttingDown = false;
  const keepAlive = setInterval(() => undefined, 60_000);
  await new Promise<void>((resolveDone) => {
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      clearInterval(keepAlive);
      process.stderr.write("\nStopping Open Design dev server...\n");
      void runSequential(stopOrderFor(targets), (target) => stopApp(config, target)).finally(() => {
        for (const sig of ["SIGINT", "SIGTERM"] as const) {
          process.off(sig, shutdown);
        }
        process.exitCode = 0;
        resolveDone();
      });
    };
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.on(sig, shutdown);
    }
  });
}

const cli = cac("tools-dev");

function addSharedOptions(command: ReturnType<typeof cli.command>) {
  return command
    .option("--namespace <name>", "runtime namespace (default: default)")
    .option("--tools-dev-root <path>", "tools-dev runtime root")
    .option("--json", "print JSON");
}

function addPortOptions(command: ReturnType<typeof cli.command>) {
  return command
    .option("--daemon-port <port>", "force daemon port; conflict quick-fails")
    .option("--web-port <port>", "force web port; conflict quick-fails")
    .option("--prod", "use production build (requires pnpm build first)");
}

addPortOptions(addSharedOptions(cli.command("start [app]", "Start daemon, web, desktop, or all when app is omitted"))).action(
  async (appName: string | undefined, options: CliOptions) => {
    const config = resolveToolDevConfig(options);
    const targets = resolveStartApps(appName);
    const result = await runSequential(targets, (target) => startApp(config, target, options));
    printStartResult(result, options);
  },
);

addPortOptions(addSharedOptions(cli.command("run [app]", "Start apps and keep this command alive until interrupted"))).action(
  async (appName: string | undefined, options: CliOptions) => {
    await runForeground(resolveToolDevConfig(options), appName, options);
  },
);

addSharedOptions(cli.command("status [app]", "Show app status for daemon, web, desktop, or all")).action(
  async (appName: string | undefined, options: CliOptions) => {
    printStatusResult(await status(resolveToolDevConfig(options), appName), options, appName);
  },
);

addSharedOptions(cli.command("stop [app]", "Stop daemon, web, desktop, or all when app is omitted")).action(
  async (appName: string | undefined, options: CliOptions) => {
    const config = resolveToolDevConfig(options);
    const targets = resolveStopApps(appName);
    const result = await runSequential(targets, (target) => stopApp(config, target));
    printStopResult(result, options);
  },
);

addPortOptions(addSharedOptions(cli.command("restart [app]", "Restart daemon, web, desktop, or all when app is omitted"))).action(
  async (appName: string | undefined, options: CliOptions) => {
    printRestartResult(await restartTargets(resolveToolDevConfig(options), appName, options), options);
  },
);

addSharedOptions(cli.command("logs [app]", "Show log tail for daemon, web, desktop, or all")).action(
  async (appName: string | undefined, options: CliOptions) => {
    const config = resolveToolDevConfig(options);
    const targets = resolveTargetApps(appName, DEFAULT_START_APPS);
    const result = targets.length === 1
      ? await readLogs(config, targets[0])
      : Object.fromEntries(await Promise.all(targets.map(async (target) => [target, await readLogs(config, target)] as const)));
    printLogs(result, options);
  },
);

addSharedOptions(
  cli.command("inspect <app> [target]", "Inspect daemon/web status or desktop status/eval/screenshot/console/click"),
)
  .option("--expr <js>", "JavaScript expression for desktop eval")
  .option("--path <file>", "Output path for desktop screenshot")
  .option("--selector <css>", "CSS selector for desktop click")
  .option("--timeout <seconds>", "Desktop inspect timeout in seconds")
  .action(async (appName: string, target: string | undefined, options: CliOptions) => {
    output(await inspect(resolveToolDevConfig(options), appName, target, options), options);
  });

addSharedOptions(cli.command("check [app]", "Print status and recent logs for quick diagnostics")).action(
  async (appName: string | undefined, options: CliOptions) => {
    const config = resolveToolDevConfig(options);
    const targets = resolveTargetApps(appName, DEFAULT_START_APPS);
    const apps = Object.fromEntries(
      await Promise.all(targets.map(async (target) => [target, await inspectAppStatus(config, target)] as const)),
    );
    const logs = Object.fromEntries(
      await Promise.all(targets.map(async (target) => [target, await readLogs(config, target)] as const)),
    );
    printCheckResult({ apps, diagnostics: createLogDiagnostics(logs), logs, namespace: config.namespace }, options);
  },
);

cli.help();

const rawCliArgs = process.argv.slice(2);
const cliArgs = rawCliArgs[0] === "--" ? rawCliArgs.slice(1) : rawCliArgs;
process.argv.splice(2, process.argv.length - 2, ...cliArgs);

if (cliArgs.length === 0 || (cliArgs[0]?.startsWith("-") && cliArgs[0] !== "--help" && cliArgs[0] !== "-h")) {
  process.argv.splice(2, 0, "start");
}

cli.parse();
