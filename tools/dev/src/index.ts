import { spawn } from "node:child_process";
import { lstat, mkdir, open, readFile, readdir, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";

import { cac } from "cac";

import {
  APP_KEYS,
  SIDECAR_ENV,
  SIDECAR_SOURCES,
  type DaemonStatusSnapshot,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  findSidecarProcesses,
  launchSidecar,
  restartSidecar,
  stopSidecar,
  type SidecarRestartOptions,
  type SidecarRestartResult,
  type SidecarStamp as ConvergedSidecarStamp,
} from "@open-design/sidecar";
import {
  createPackageManagerInvocation,
  isProcessAlive,
  readLogTail,
} from "@open-design/platform";

import {
  ALL_APPS,
  DEFAULT_OBSERVE_APPS,
  DEFAULT_START_APPS,
  DEFAULT_STOP_APPS,
  parseParentPidOption,
  parsePortOption,
  resolveRunApps,
  resolveStartApps,
  resolveStopApps,
  resolveTargetApps,
  resolveToolDevConfig,
  WORKSPACE_ROOT,
  type ToolDevAppName,
  type ToolDevConfig,
  type ToolDevOptions,
} from "./config.js";
import { resolveToolsDevDataRoot } from "./data-root.js";
import {
  appendStartupLogDiagnostics,
  createUnsupportedNodeRuntimeError,
  createStartupLogDiagnostics,
  detectLogDiagnostics,
  formatLogDiagnostics,
  isSupportedNodeRuntime,
  type LogDiagnostic,
} from "./diagnostics.js";
import {
  inspectDaemonRuntime,
  inspectWebRuntime,
  waitForDaemonRuntime,
  waitForWebRuntime,
} from "./sidecar-client.js";
import { rewriteCliArgsForDefaultStart } from "./cli-args.js";
import { loadWorkspaceLocalEnv } from "./local-env.js";
import { resolveSharedPortsFromRunningState } from "./shared-ports.js";

type CliOptions = ToolDevOptions & {
  envFile?: string | string[];
  noEnvFile?: boolean;
  parentPid?: number;
  standaloneBootstrapUrl?: string;
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

function assertSupportedNodeRuntimeForStart(): void {
  if (!isSupportedNodeRuntime()) throw createUnsupportedNodeRuntimeError();
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
    process.stdout.write("\n  OpenDesign dev server ready\n\n");
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
    shell: false,
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

function createConvergedAppStamp(config: ToolDevConfig, appName: ToolDevAppName): ConvergedSidecarStamp {
  return {
    app: appName,
    channel: "local",
    mode: "dev",
    namespace: config.namespace,
    source: SIDECAR_SOURCES.TOOLS_DEV,
  };
}

async function findAppProcessTree(config: ToolDevConfig, appName: ToolDevAppName) {
  const roots = await findSidecarProcesses(createConvergedAppStamp(config, appName));
  const rootPids = roots.map(({ pid }) => pid);
  return { pids: rootPids, rootPids };
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
  restart?: boolean;
  restartOptions?: SidecarRestartOptions;
}): Promise<{ pid: number } | SidecarRestartResult> {
  const sidecarConfig = request.config.apps[request.appName];
  const launchRequest = {
    args: [request.config.tsxCliPath, sidecarConfig.sidecarEntryPath],
    command: process.execPath,
    cwd: request.config.workspaceRoot,
    detached: true,
    env: { ...process.env, ...request.env },
    logFd: request.logHandle.fd,
    resources: {
      dataRoot: resolveToolsDevDataRoot(request.config.workspaceRoot),
      ownerPid: request.env[TOOLS_DEV_PARENT_PID_ENV] == null ? null : Number(request.env[TOOLS_DEV_PARENT_PID_ENV]),
      port: Number(request.env[
        request.appName === APP_KEYS.DAEMON ? SIDECAR_ENV.DAEMON_PORT : SIDECAR_ENV.WEB_PORT
      ] ?? 0),
      runtimeRoot: request.config.toolsDevRoot,
    },
    stamp: createConvergedAppStamp(request.config, request.appName),
  };
  return request.restart === true
    ? await restartSidecar(launchRequest, request.restartOptions)
    : await launchSidecar(launchRequest);
}

async function spawnDaemonRuntime(
  config: ToolDevConfig,
  options: CliOptions,
  spawnOptions: { restart?: boolean; restartOptions?: SidecarRestartOptions } = {},
): Promise<{ pid: number } | SidecarRestartResult> {
  const daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  const webPort = parsePortOption(options.webPort, "--web-port");
  const logHandle = await openAppLog(config, APP_KEYS.DAEMON);

  try {
    await ensureDaemonCliBuild(config, logHandle);
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
      ...(spawnOptions.restart === undefined ? {} : { restart: spawnOptions.restart }),
      ...(spawnOptions.restartOptions === undefined ? {} : { restartOptions: spawnOptions.restartOptions }),
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

async function latestMtimeMs(filePath: string): Promise<number> {
  const entry = await lstat(filePath).catch(() => null);
  if (entry == null) return 0;
  if (!entry.isDirectory()) return entry.mtimeMs;

  const children = await readdir(filePath, { withFileTypes: true }).catch(() => []);
  let latest = entry.mtimeMs;
  for (const child of children) {
    if (child.name === "node_modules" || child.name === "dist" || child.name === ".tmp") continue;
    latest = Math.max(latest, await latestMtimeMs(path.join(filePath, child.name)));
  }
  return latest;
}

async function ensureDaemonCliBuild(config: ToolDevConfig, logHandle: FileHandle): Promise<void> {
  await ensureContractsBuild(config, logHandle);

  const daemonRoot = path.join(config.workspaceRoot, "apps/daemon");
  const distCliPath = path.join(daemonRoot, "dist/cli.js");
  const distMtime = await latestMtimeMs(distCliPath);
  const sourceMtime = Math.max(
    await latestMtimeMs(path.join(daemonRoot, "src")),
    await latestMtimeMs(path.join(daemonRoot, "package.json")),
    await latestMtimeMs(path.join(daemonRoot, "tsconfig.json")),
  );
  if (distMtime > 0 && distMtime >= sourceMtime) return;

  const reason = distMtime > 0 ? "source is newer than apps/daemon/dist/cli.js" : "apps/daemon/dist/cli.js is missing";
  await logHandle.write(`\n[tools-dev] building @open-design/daemon because ${reason} at ${new Date().toISOString()}\n`);
  const invocation = createPackageManagerInvocation(["--filter", "@open-design/daemon", "build"], process.env);
  await runLoggedCommand({
    args: invocation.args,
    command: invocation.command,
    cwd: config.workspaceRoot,
    env: process.env,
    logFd: logHandle.fd,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

async function ensureContractsBuild(config: ToolDevConfig, logHandle: FileHandle): Promise<void> {
  const contractsRoot = path.join(config.workspaceRoot, "packages/contracts");
  const distDeclarationPath = path.join(contractsRoot, "dist/index.d.ts");
  const distMtime = await latestMtimeMs(distDeclarationPath);
  const sourceMtime = Math.max(
    await latestMtimeMs(path.join(contractsRoot, "src")),
    await latestMtimeMs(path.join(contractsRoot, "package.json")),
    await latestMtimeMs(path.join(contractsRoot, "tsconfig.json")),
    await latestMtimeMs(path.join(contractsRoot, "esbuild.config.mjs")),
  );
  if (distMtime > 0 && distMtime >= sourceMtime) return;

  const reason = distMtime > 0
    ? "source is newer than packages/contracts/dist/index.d.ts"
    : "packages/contracts/dist/index.d.ts is missing";
  await logHandle.write(`\n[tools-dev] building @open-design/contracts because ${reason} at ${new Date().toISOString()}\n`);
  const invocation = createPackageManagerInvocation(["--filter", "@open-design/contracts", "build"], process.env);
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

type ElectronLifecycleOperation = "electron.dev.inspect" | "electron.dev.start" | "electron.dev.status" | "electron.dev.stop";

async function invokeElectronLifecycle(config: ToolDevConfig, operation: ElectronLifecycleOperation, options: CliOptions): Promise<Record<string, unknown>> {
  const logHandle = await openAppLog(config, APP_KEYS.DESKTOP);
  const operationFileName = operation.replaceAll(".", "-");
  const requestPath = path.join(config.apps.desktop.controlRuntimeRoot, `${operationFileName}-request.json`);
  const receiptPath = path.join(config.apps.desktop.controlRuntimeRoot, `${operationFileName}-receipt.json`);
  try {
    const request = {
      schemaVersion: 1,
      operation,
      channel: "dev",
      namespace: config.namespace,
      controlRuntimeRoot: config.apps.desktop.controlRuntimeRoot,
      ...(operation === "electron.dev.start" ? {
        bootstrapUrl: options.standaloneBootstrapUrl ?? process.env.OD_ELECTRON_STANDALONE_BOOTSTRAP_URL,
        installationRoot: config.apps.desktop.installationRoot,
        ownerPid: options.parentPid ?? null,
      } : {}),
    };
    if (operation === "electron.dev.start" && request.bootstrapUrl == null) {
      throw new Error("--standalone-bootstrap-url is required for tools-dev desktop");
    }
    await mkdir(config.apps.desktop.controlRuntimeRoot, { recursive: true });
    await rm(receiptPath, { force: true });
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
    await logHandle.write(`\n[tools-dev] ${operation} via shells/electron at ${new Date().toISOString()}\n`);
    await runLoggedCommand({
      args: [config.apps.desktop.lifecycleScriptPath, "--request", requestPath, "--receipt", receiptPath],
      command: process.execPath,
      cwd: config.workspaceRoot,
      env: process.env,
      logFd: logHandle.fd,
    });
    return JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
  } finally {
    await logHandle.close();
  }
}

async function startDaemon(
  config: ToolDevConfig,
  options: CliOptions,
  startOptions: { refreshWebOrigin?: boolean } = {},
) {
  const daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  const webPort = parsePortOption(options.webPort, "--web-port");
  let existing = await inspectDaemonRuntime(runtimeLookup(config));
  const shouldRefreshWebOrigin = startOptions.refreshWebOrigin === true && webPort != null;
  const existingWeb = shouldRefreshWebOrigin
    ? await inspectWebRuntime(runtimeLookup(config))
    : null;
  if (existingWeb?.url != null && !statusMatchesForcedPort(existingWeb.url, webPort)) {
    throw new Error(`${APP_KEYS.WEB} is already running in namespace ${config.namespace} at ${existingWeb.url}; stop it or choose another namespace`);
  }
  const daemonTrustedWebOriginPort = existing?.trustedWebOriginPort ?? null;
  if (existing?.url != null && statusMatchesForcedPort(existing.url, daemonPort)) {
    if (options.parentPid != null) {
      throw new Error(
        `${APP_KEYS.DAEMON} is already running in namespace ${config.namespace} at ${existing.url}; ` +
        `owner-bound starts require a clean namespace, so stop it or choose another namespace`,
      );
    }
    if (shouldRefreshWebOrigin && daemonTrustedWebOriginPort !== webPort) {
      if (existingWeb?.url != null) {
        await stopApp(config, APP_KEYS.WEB);
      }
      await stopApp(config, APP_KEYS.DAEMON);
      existing = null;
    } else {
      return { app: APP_KEYS.DAEMON, created: false, logPath: config.apps.daemon.latestLogPath, status: existing };
    }
  }
  if (existing?.url != null) {
    throw new Error(`${APP_KEYS.DAEMON} is already running in namespace ${config.namespace} at ${existing.url}; stop it or choose another namespace`);
  }
  await assertNoStaleActiveProcess(config, APP_KEYS.DAEMON);

  const spawned = await spawnDaemonRuntime(config, options);
  try {
    const status = await waitForDaemonRuntime(
      runtimeLookup(config),
      undefined,
      () => isProcessAlive(spawned.pid),
    );
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

async function restartDaemon(config: ToolDevConfig, options: CliOptions) {
  const runningDaemon = await inspectDaemonRuntime(runtimeLookup(config));
  const runningWeb = await inspectWebRuntime(runtimeLookup(config));
  const requestedDaemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  const requestedWebPort = parsePortOption(options.webPort, "--web-port");
  const runningDaemonPort = runningDaemon?.url == null ? null : Number(urlPort(runningDaemon.url));
  const runningWebPort = runningWeb?.url == null ? null : Number(urlPort(runningWeb.url));

  if (runningWebPort != null && requestedWebPort != null && requestedWebPort !== runningWebPort) {
    throw new Error(
      `${APP_KEYS.WEB} is already running in namespace ${config.namespace} at ${runningWeb?.url}; ` +
      `restart web to change its port`,
    );
  }
  if (
    runningWebPort != null &&
    requestedDaemonPort != null &&
    runningDaemonPort != null &&
    requestedDaemonPort !== runningDaemonPort
  ) {
    throw new Error(
      `${APP_KEYS.WEB} still depends on daemon port ${runningDaemonPort}; restart web to change the daemon port`,
    );
  }

  const restartOptions: CliOptions = {
    ...options,
    ...(runningWebPort == null ? {} : { webPort: runningWebPort }),
    ...(requestedDaemonPort == null && runningDaemonPort != null
      ? { daemonPort: runningDaemonPort }
      : {}),
  };
  const restarted = await spawnDaemonRuntime(config, restartOptions, {
    restart: true,
    restartOptions: { requireConcretePort: runningWebPort != null },
  });
  if (!("stop" in restarted)) throw new Error("sidecar restart did not return its stopped generation");

  try {
    const status = await waitForDaemonRuntime(
      runtimeLookup(config),
      undefined,
      () => isProcessAlive(restarted.pid),
    );
    return {
      start: {
        [APP_KEYS.DAEMON]: {
          app: APP_KEYS.DAEMON,
          created: true,
          logPath: config.apps.daemon.latestLogPath,
          pid: restarted.pid,
          status,
        },
      },
      stop: {
        [APP_KEYS.DAEMON]: formatStopAppResult(APP_KEYS.DAEMON, restarted.stop),
      },
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
    if (options.parentPid != null) {
      throw new Error(
        `${APP_KEYS.WEB} is already running in namespace ${config.namespace} at ${existing.url}; ` +
        `owner-bound starts require a clean namespace, so stop it or choose another namespace`,
      );
    }
    return { app: APP_KEYS.WEB, created: false, logPath: config.apps.web.latestLogPath, status: existing };
  }
  if (existing?.url != null) {
    throw new Error(`${APP_KEYS.WEB} is already running in namespace ${config.namespace} at ${existing.url}; stop it or choose another namespace`);
  }
  await assertNoStaleActiveProcess(config, APP_KEYS.WEB);

  const spawned = await spawnWebRuntime(config, options);
  try {
    const status = await waitForWebRuntime(
      runtimeLookup(config),
      undefined,
      () => isProcessAlive(spawned.pid),
    );
    return {
      app: APP_KEYS.WEB,
      created: true,
      logPath: config.apps.web.latestLogPath,
      pid: spawned.pid,
      status,
    };
  } catch (error) {
    const logPath = config.apps.web.latestLogPath;
    const lines = await readLogTail(logPath, 80).catch(() => []);
    await stopApp(config, APP_KEYS.WEB).catch(() => undefined);
    throw appendStartupLogDiagnostics(error, APP_KEYS.WEB, createStartupLogDiagnostics(logPath, lines));
  }
}

async function startDesktop(config: ToolDevConfig, options: CliOptions) {
  if (options.daemonPort != null || options.webPort != null) throw new Error("desktop owns transient daemon/Web ports through Closure; port flags apply only to daemon or web development");
  const existing = asRecord((await invokeElectronLifecycle(config, "electron.dev.status", options)).status);
  if (existing?.state === "running") {
    if (options.parentPid != null) {
      throw new Error(
        `${APP_KEYS.DESKTOP} is already running in namespace ${config.namespace}; ` +
        `owner-bound starts require a clean namespace, so stop it or choose another namespace`,
      );
    }
    return { app: APP_KEYS.DESKTOP, created: false, logPath: config.apps.desktop.latestLogPath, status: existing };
  }
  const receipt = await invokeElectronLifecycle(config, "electron.dev.start", options);
  const status = asRecord(receipt.status);
  return { app: APP_KEYS.DESKTOP, created: true, logPath: config.apps.desktop.latestLogPath, pid: numberField(status ?? {}, "pid"), status };
}

async function startApp(
  config: ToolDevConfig,
  appName: ToolDevAppName,
  options: CliOptions,
  context: { targets?: readonly ToolDevAppName[] } = {},
) {
  switch (appName) {
    case APP_KEYS.DAEMON:
      return await startDaemon(config, options, {
        refreshWebOrigin: context.targets?.includes(APP_KEYS.WEB) === true,
      });
    case APP_KEYS.WEB:
      return await startWeb(config, options);
    case APP_KEYS.DESKTOP:
      return await startDesktop(config, options);
  }
}

function formatStopAppResult(appName: ToolDevAppName, stop: Awaited<ReturnType<typeof stopSidecar>>) {
  return {
    app: appName,
    status: stop.alreadyStopped && !stop.gracefulAccepted ? "not-running" : stop.remainingPids.length === 0 ? "stopped" : "partial",
    stop,
    via: stop.gracefulAccepted ? (stop.forcedPids.length === 0 ? "ipc" : "ipc+fallback") : "fallback",
  };
}

async function stopApp(config: ToolDevConfig, appName: ToolDevAppName) {
  if (appName === APP_KEYS.DESKTOP) {
    const receipt = await invokeElectronLifecycle(config, "electron.dev.stop", {});
    const stopped = asRecord(receipt.stopped) ?? {};
    return {
      app: APP_KEYS.DESKTOP,
      status: Array.isArray(stopped.remainingPids) && stopped.remainingPids.length > 0 ? "partial" : "stopped",
      stop: stopped,
      via: stopped.gracefulAccepted === true ? "ipc" : "fallback",
    };
  }
  return formatStopAppResult(appName, await stopSidecar(createConvergedAppStamp(config, appName)));
}

async function inspectAppStatus(config: ToolDevConfig, appName: ToolDevAppName) {
  if (appName === APP_KEYS.DAEMON) {
    const status = await inspectDaemonRuntime(runtimeLookup(config));
    if (status != null) return status;
    const active = await findAppProcessTree(config, appName);
    return {
      // Synthetic snapshot while the web-only development daemon is starting.
      desktopAuthGateActive: false,
      pid: active.rootPids[0] ?? null,
      state: active.pids.length > 0 ? "starting" : "idle",
      url: null,
    } satisfies DaemonStatusSnapshot;
  }
  if (appName === APP_KEYS.WEB) {
    const status = await inspectWebRuntime(runtimeLookup(config));
    if (status != null) return status;
    const active = await findAppProcessTree(config, appName);
    return { pid: active.rootPids[0] ?? null, state: active.pids.length > 0 ? "starting" : "idle", url: null } satisfies WebStatusSnapshot;
  }

  return asRecord((await invokeElectronLifecycle(config, "electron.dev.status", {})).status) ?? { state: "idle" };
}

function summarizeStatus(apps: Record<ToolDevAppName, any>): string {
  const states = Object.values(apps).map((entry) => entry?.state);
  if (states.every((state) => state === "idle")) return "not-running";
  if (states.every((state) => state === "running")) return "running";
  return "partial";
}

async function status(config: ToolDevConfig, appName: string | undefined) {
  const targets = resolveTargetApps(appName, DEFAULT_OBSERVE_APPS);
  if (targets.length === 1) return await inspectAppStatus(config, targets[0]);

  const apps = Object.fromEntries(
    await Promise.all(targets.map(async (target) => [target, await inspectAppStatus(config, target)] as const)),
  ) as Record<ToolDevAppName, unknown>;
  return { apps, namespace: config.namespace, status: summarizeStatus(apps) };
}

async function restartTargets(config: ToolDevConfig, appName: string | undefined, options: CliOptions) {
  if (appName === APP_KEYS.DAEMON) return await restartDaemon(config, options);
  const stopTargets = resolveStopApps(appName);
  const startTargets = resolveStartApps(appName);
  await resolveSharedPortsFromRunningState(startTargets, options, {
    daemonUrl: async () => (await inspectDaemonRuntime(runtimeLookup(config)))?.url,
    webUrl: async () => (await inspectWebRuntime(runtimeLookup(config)))?.url,
  });
  return {
    stop: await runSequential(stopTargets, (target) => stopApp(config, target)),
    start: await runSequential(startTargets, (target) => startApp(config, target, options, { targets: startTargets })),
  };
}

async function readLogs(config: ToolDevConfig, appName: ToolDevAppName) {
  const logPath = appConfig(config, appName).latestLogPath;
  const primary = Object.freeze({ id: "adapter", logPath, lines: await readLogTail(logPath, 200) });
  if (appName !== APP_KEYS.DESKTOP) return { app: appName, lines: primary.lines, logPath, sources: [primary] };
  const status = asRecord((await invokeElectronLifecycle(config, "electron.dev.status", {})).status);
  const roots = Array.isArray(status?.logRoots) ? status.logRoots : [];
  const files: Array<{ id: string; logPath: string }> = [];
  const visit = async (scope: string, root: string, current = root): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(scope, root, entryPath);
      else if (entry.isFile() && (entry.name.endsWith(".log") || entry.name.endsWith(".jsonl"))) {
        files.push({ id: `${scope}:${path.relative(root, entryPath)}`, logPath: entryPath });
      }
    }
  };
  for (const candidate of roots) {
    const root = asRecord(candidate);
    const scope = root == null ? null : stringField(root, "scope");
    const rootPath = root == null ? null : stringField(root, "path");
    if (scope != null && rootPath != null && path.isAbsolute(rootPath)) await visit(scope, rootPath);
  }
  const runtimeSources = await Promise.all(files.sort((left, right) => left.id.localeCompare(right.id)).map(async (file) => Object.freeze({
    ...file,
    lines: await readLogTail(file.logPath, 200),
  })));
  const sources = [primary, ...runtimeSources];
  return {
    app: appName,
    lines: sources.flatMap((source) => [`[${source.id}] ${source.logPath}`, ...source.lines]),
    logPath,
    sources,
  };
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

async function inspectDesktop(config: ToolDevConfig, target: string | undefined, options: CliOptions) {
  const operation = target ?? "status";
  if (operation !== "status") throw new Error(`desktop ${operation} has not yet migrated to the Electron Shell handler surface`);
  const receipt = await invokeElectronLifecycle(config, "electron.dev.inspect", options);
  return {
    cdp: asRecord(receipt.cdp) ?? { discovery: { state: "disabled" }, targets: [] },
    status: asRecord(receipt.status) ?? { state: "idle" },
  };
}

async function inspect(config: ToolDevConfig, appName: string, target: string | undefined, options: CliOptions) {
  if (appName === APP_KEYS.DAEMON) {
    if (target != null && target !== "status") throw new Error(`unsupported daemon inspect target: ${target}`);
    return (
      (await inspectDaemonRuntime(runtimeLookup(config), 1000)) ??
      ({ desktopAuthGateActive: false, state: "idle", url: null } satisfies DaemonStatusSnapshot)
    );
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
  await resolveSharedPortsFromRunningState(targets, foregroundOptions, {
    daemonUrl: async () => (await inspectDaemonRuntime(runtimeLookup(config)))?.url,
    webUrl: async () => (await inspectWebRuntime(runtimeLookup(config)))?.url,
  });
  const started = await runSequential(targets, (target) => startApp(config, target, foregroundOptions, { targets }));
  printRunForegroundResult(started, options);

  let shuttingDown = false;
  const keepAlive = setInterval(() => undefined, 60_000);
  await new Promise<void>((resolveDone) => {
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      clearInterval(keepAlive);
      process.stderr.write("\nStopping OpenDesign dev server...\n");
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
    .option("--env-file <path>", "load env file before resolving tools-dev config; repeatable")
    .option("--no-env-file", "skip automatic .env file loading", { default: false })
    .option("--standalone-bootstrap-url <url>", "signed local Standalone bootstrap for desktop")
    .option("--json", "print JSON");
}

function addPortOptions(command: ReturnType<typeof cli.command>) {
  return command
    .option("--daemon-port <port>", "force daemon port; conflict quick-fails")
    .option("--web-port <port>", "force web port; conflict quick-fails")
    .option("--prod", "use production build (requires pnpm --filter @open-design/web build first)");
}

addPortOptions(addSharedOptions(cli.command("start [app]", "Start daemon, web, desktop, or all when app is omitted")))
  .option("--parent-pid <pid>", "stop started apps when this owner process exits")
  .action(
    async (appName: string | undefined, options: CliOptions) => {
      assertSupportedNodeRuntimeForStart();
      const parentPid = parseParentPidOption(options.parentPid);
      if (parentPid != null && !isProcessAlive(parentPid)) {
        throw new Error(`--parent-pid process is not alive: ${parentPid}`);
      }
      const startOptions = parentPid == null ? options : { ...options, parentPid };
      const config = resolveToolDevConfig(startOptions);
      const targets = resolveStartApps(appName);
      await resolveSharedPortsFromRunningState(targets, startOptions, {
        daemonUrl: async () => (await inspectDaemonRuntime(runtimeLookup(config)))?.url,
        webUrl: async () => (await inspectWebRuntime(runtimeLookup(config)))?.url,
      });
      const result = await runSequential(
        targets,
        (target) => startApp(config, target, startOptions, { targets }),
      );
      printStartResult(result, startOptions);
    },
  );

addPortOptions(addSharedOptions(cli.command("run [app]", "Start apps and keep this command alive until interrupted"))).action(
  async (appName: string | undefined, options: CliOptions) => {
    assertSupportedNodeRuntimeForStart();
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
    assertSupportedNodeRuntimeForStart();
    printRestartResult(await restartTargets(resolveToolDevConfig(options), appName, options), options);
  },
);

addSharedOptions(cli.command("logs [app]", "Show log tail for daemon, web, desktop, or all")).action(
  async (appName: string | undefined, options: CliOptions) => {
    const config = resolveToolDevConfig(options);
    const targets = resolveTargetApps(appName, DEFAULT_OBSERVE_APPS);
    const result = targets.length === 1
      ? await readLogs(config, targets[0])
      : Object.fromEntries(await Promise.all(targets.map(async (target) => [target, await readLogs(config, target)] as const)));
    printLogs(result, options);
  },
);

addSharedOptions(
  cli.command("inspect <app> [target]", "Inspect daemon, web, or Electron desktop status"),
)
  .action(async (appName: string, target: string | undefined, options: CliOptions) => {
    output(await inspect(resolveToolDevConfig(options), appName, target, options), options);
  });

addSharedOptions(cli.command("check [app]", "Print status and recent logs for quick diagnostics")).action(
  async (appName: string | undefined, options: CliOptions) => {
    const config = resolveToolDevConfig(options);
    const targets = resolveTargetApps(appName, DEFAULT_OBSERVE_APPS);
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
loadWorkspaceLocalEnv({
  args: cliArgs,
  log: (message) => process.stderr.write(`${message}\n`),
  workspaceRoot: WORKSPACE_ROOT,
});
process.argv.splice(2, process.argv.length - 2, ...rewriteCliArgsForDefaultStart(cliArgs));

cli.parse();
