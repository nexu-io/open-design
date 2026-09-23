import { execFile } from "node:child_process";
import { mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  isDesktopUpdateAction,
  type DesktopEvalResult,
  type DesktopScreenshotResult,
  type DesktopStatusSnapshot,
  type DesktopUpdateAction,
  type DesktopUpdateResult,
} from "@open-design/sidecar-proto";
import {
  convergeSidecarLaunch,
  getSidecarStatus,
  invokeSidecar,
  stopSidecars,
  type SidecarStamp as ConvergedSidecarStamp,
} from "@open-design/sidecar";
import { readLogTail } from "@open-design/platform";
import type { ToolPackConfig } from "../config/index.js";
import { allPackagedSidecarStopRequests, toolPackSidecarStamp } from "../config/sidecar-stamps.js";
import { resolveToolPackLauncherLayout } from "../launcher/layout.js";
import { readToolPackLauncherRuntimeSnapshot } from "../launcher/runtime-snapshot.js";
import { readToolPackUpdateCacheLifecycleSnapshot } from "../updates/cache-lifecycle-snapshot.js";
import { PACKAGED_CONFIG_PATH_ENV, writeLaunchPackagedConfig } from "./app-config.js";
import { DESKTOP_LOG_ECHO_ENV } from "./constants.js";
import { pathExists, scrubMacExtendedAttributes } from "./fs.js";
import { resolveMacInstallIdentity } from "./identity.js";
import { desktopLogPath, macAppExecutablePath, resolveMacPaths } from "./paths.js";
import type { MacCleanupResult, MacInspectResult, MacInstallResult, MacStartResult, MacStartSource, MacStopResult, MacUninstallResult } from "./types.js";

const execFileAsync = promisify(execFile);
const UPDATE_ACTION_TIMEOUT_MS = 10 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function convergedDesktopStamp(
  config: ToolPackConfig,
  source: typeof SIDECAR_SOURCES.TOOLS_PACK | typeof SIDECAR_SOURCES.PACKAGED = SIDECAR_SOURCES.TOOLS_PACK,
  mode: ConvergedSidecarStamp["mode"] = SIDECAR_MODES.RUNTIME,
): ConvergedSidecarStamp {
  return toolPackSidecarStamp(config, { app: APP_KEYS.DESKTOP, mode, source });
}

type ReachableDesktop = {
  stamp: ConvergedSidecarStamp;
  status: DesktopStatusSnapshot;
};

async function resolveReachableDesktop(config: ToolPackConfig, timeoutMs: number): Promise<ReachableDesktop | null> {
  const probes = await Promise.all([
    SIDECAR_SOURCES.TOOLS_PACK,
    SIDECAR_SOURCES.PACKAGED,
  ].map(async (source) => {
    const stamp = convergedDesktopStamp(config, source);
    try {
      return { stamp, status: await getSidecarStatus<DesktopStatusSnapshot>(stamp, { timeoutMs }) };
    } catch {
      return null;
    }
  }));
  return probes.find((probe): probe is ReachableDesktop => probe != null) ?? null;
}

async function waitForDesktopStatus(config: ToolPackConfig, timeoutMs = 45_000): Promise<DesktopStatusSnapshot | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const active = await resolveReachableDesktop(config, 1000);
    if (active != null) return active.status;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  return null;
}

function nonEmptyLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0);
}

function tailLines(lines: string[], maxLines: number): string[] {
  return lines.slice(Math.max(0, lines.length - maxLines));
}

function truncateLine(line: string, maxLength = 260): string {
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 3)}...`;
}

async function collectLaunchAssessment(appPath: string): Promise<string[]> {
  const commands: Array<{ args: string[]; label: string }> = [
    { args: ["--verify", "--deep", "--strict", "--verbose=2", appPath], label: "codesign" },
    { args: ["--assess", "--type", "execute", "--verbose=4", appPath], label: "spctl" },
  ];
  const lines: string[] = [];

  for (const command of commands) {
    try {
      const result = await execFileAsync(command.label, command.args, { maxBuffer: 1024 * 1024 });
      lines.push(`[${command.label}] ok`);
      if (result.stdout.trim().length > 0) lines.push(result.stdout.trim());
      if (result.stderr.trim().length > 0) lines.push(result.stderr.trim());
    } catch (error) {
      lines.push(`[${command.label}] failed`);
      if (isRecord(error) && typeof error.stdout === "string" && error.stdout.trim().length > 0) {
        lines.push(error.stdout.trim());
      }
      if (isRecord(error) && typeof error.stderr === "string" && error.stderr.trim().length > 0) {
        lines.push(error.stderr.trim());
      }
      if (error instanceof Error && lines.at(-1) !== error.message) {
        lines.push(error.message);
      }
    }
  }

  return lines;
}

async function collectLaunchXattrSummary(appPath: string): Promise<string[]> {
  try {
    const result = await execFileAsync("xattr", ["-lr", appPath], { maxBuffer: 2 * 1024 * 1024 });
    const lines = nonEmptyLines(result.stdout);
    const quarantine = lines.filter((line) => line.includes("com.apple.quarantine"));
    const provenance = lines.filter((line) => line.includes("com.apple.provenance"));
    const macl = lines.filter((line) => line.includes("com.apple.macl"));
    const matched = [...quarantine, ...provenance, ...macl];
    return [
      `quarantine entries: ${quarantine.length}`,
      `provenance entries: ${provenance.length}`,
      `macl entries: ${macl.length}`,
      ...(matched.length === 0 ? [] : tailLines(matched, 8).map((line) => truncateLine(line))),
    ];
  } catch (error) {
    if (isRecord(error) && typeof error.stdout === "string") {
      const lines = nonEmptyLines(error.stdout);
      if (lines.length > 0) return tailLines(lines, 40);
    }
    return [error instanceof Error ? error.message : String(error)];
  }
}

function isRelevantSystemPolicyLine(line: string): boolean {
  return [
    "Malware rejection",
    "lack of matching active rule",
    "notarization daemon",
    "code signature",
    "Gatekeeper",
    "proc_exit",
  ].some((keyword) => line.includes(keyword)) || /\b(crash|exited|exit|fault|killed|terminated|termination)\b/i.test(line);
}

function compactSystemPolicyLines(lines: string[]): string[] {
  const relevant = lines.filter(isRelevantSystemPolicyLine);
  if (relevant.length === 0) return tailLines(lines, 24).map((line) => truncateLine(line));

  const malware = relevant.filter((line) => line.includes("Malware rejection"));
  const missingRule = relevant.filter((line) => line.includes("lack of matching active rule"));
  const notarization = relevant.filter((line) => line.includes("notarization daemon"));
  const other = relevant.filter((line) =>
    !line.includes("Malware rejection") &&
    !line.includes("lack of matching active rule") &&
    !line.includes("notarization daemon")
  );
  const samples = [
    ...tailLines(malware, 5),
    ...tailLines(notarization, 5),
    ...tailLines(missingRule, 5),
    ...tailLines(other, 8),
  ];

  return [
    `matching entries: ${relevant.length}`,
    `malware rejection entries: ${malware.length}`,
    `missing active rule entries: ${missingRule.length}`,
    `notarization daemon entries: ${notarization.length}`,
    ...[...new Set(samples)].map((line) => truncateLine(line)),
  ];
}

async function collectSystemPolicyLog(target: { appPath: string; executablePath: string }): Promise<string[]> {
  const appName = basename(target.appPath, ".app");
  const executableName = basename(target.executablePath);
  const predicate = [...new Set([
    `process == "${appName}"`,
    `process == "${executableName}"`,
    `process == "amfid"`,
    `eventMessage CONTAINS[c] "${appName}"`,
    `eventMessage CONTAINS[c] "${executableName}"`,
    'eventMessage CONTAINS[c] "Malware rejection"',
    'eventMessage CONTAINS[c] "lack of matching active rule"',
    'eventMessage CONTAINS[c] "notarization daemon"',
    'eventMessage CONTAINS[c] "code signature"',
    'eventMessage CONTAINS[c] "Gatekeeper"',
  ])].join(" OR ");

  try {
    const result = await execFileAsync("/usr/bin/log", [
      "show",
      "--style",
      "compact",
      "--last",
      "3m",
      "--predicate",
      predicate,
    ], { maxBuffer: 2 * 1024 * 1024 });
    const lines = nonEmptyLines([result.stdout, result.stderr].join("\n"));
    return compactSystemPolicyLines(lines);
  } catch (error) {
    const lines = [
      ...(isRecord(error) && typeof error.stdout === "string" ? nonEmptyLines(error.stdout) : []),
      ...(isRecord(error) && typeof error.stderr === "string" ? nonEmptyLines(error.stderr) : []),
    ];
    if (lines.length > 0) {
      return compactSystemPolicyLines(lines);
    }
    return [error instanceof Error ? error.message : String(error)];
  }
}

async function createLaunchFailureMessage(
  config: ToolPackConfig,
  target: { appPath: string; executablePath: string; source: MacStartSource },
  details: { pid: number; reason: string },
): Promise<string> {
  const logPath = desktopLogPath(config);
  const logLines = await readLogTail(logPath, 80).catch(() => []);
  const assessment = await collectLaunchAssessment(target.appPath);
  const xattrs = await collectLaunchXattrSummary(target.appPath);
  const systemPolicyLog = await collectSystemPolicyLog(target);
  return [
    `mac desktop failed to become healthy (${details.reason})`,
    `namespace: ${config.namespace}`,
    `source: ${target.source}`,
    `pid: ${details.pid}`,
    `appPath: ${target.appPath}`,
    `executablePath: ${target.executablePath}`,
    `logPath: ${logPath}`,
    "launch assessment:",
    ...(assessment.length === 0 ? ["(no assessment output)"] : assessment),
    "launch xattrs:",
    ...(xattrs.length === 0 ? ["(no xattr output)"] : xattrs),
    "macOS system policy log:",
    ...(systemPolicyLog.length === 0 ? ["(no matching system log lines)"] : systemPolicyLog),
    "desktop log tail:",
    ...(logLines.length === 0 ? ["(no log lines)"] : logLines),
  ].join("\n");
}

async function resolvePackedMacStartTarget(config: ToolPackConfig): Promise<{
  appPath: string;
  executablePath: string;
  source: MacStartSource;
}> {
  const paths = resolveMacPaths(config);
  const identity = resolveMacInstallIdentity(config);
  const candidates: Array<{ appPath: string; source: MacStartSource }> = [
    { appPath: paths.installedAppPath, source: "installed" },
    { appPath: paths.userApplicationsAppPath, source: "user-applications" },
    { appPath: paths.systemApplicationsAppPath, source: "system-applications" },
    { appPath: paths.appPath, source: "built" },
  ];

  for (const candidate of candidates) {
    const executablePath = macAppExecutablePath(candidate.appPath, identity.executableName);
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
  const identity = resolveMacInstallIdentity(config);
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
    await execFileAsync("ditto", [join(paths.mountPoint, identity.publicAppBundleName), paths.installedAppPath]);
    await scrubMacExtendedAttributes(paths.installedAppPath);
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
  const stamp = convergedDesktopStamp(config);
  const logPath = desktopLogPath(config);
  const launchConfigPath = await writeLaunchPackagedConfig(config, target.appPath);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  const logHandle = await open(logPath, "a");
  let convergence: Awaited<ReturnType<typeof convergeSidecarLaunch>>;
  try {
    convergence = await convergeSidecarLaunch({
      args: [],
      command: target.executablePath,
      cwd: target.appPath,
      detached: true,
      env: {
          ...process.env,
          [DESKTOP_LOG_ECHO_ENV]: "0",
          [PACKAGED_CONFIG_PATH_ENV]: launchConfigPath,
      },
      logFd: logHandle.fd,
      resources: {
        dataRoot: join(config.roots.runtime.namespaceRoot, "data"),
        ownerPid: null,
        port: 0,
        runtimeRoot: join(config.roots.runtime.namespaceRoot, "runtime"),
      },
      stamp,
    }, { ownerStamps: [stamp, convergedDesktopStamp(config, SIDECAR_SOURCES.PACKAGED)] });
  } finally {
    await logHandle.close().catch(() => undefined);
  }
  convergence.launcherProcess.unref();
  const pid = convergence.description.resources.pid;

  const status = await waitForDesktopStatus(config);
  if (status == null) {
    throw new Error(await createLaunchFailureMessage(config, target, {
      pid,
      reason: "converged sidecar owner stopped responding before desktop status became available",
    }));
  }
  return {
    appPath: target.appPath,
    executablePath: target.executablePath,
    logPath,
    namespace: config.namespace,
    pid,
    source: target.source,
    status,
  };
}

export async function stopPackedMacApp(config: ToolPackConfig): Promise<MacStopResult> {
  const stopped = await stopSidecars(allPackagedSidecarStopRequests(config));
  return {
    gracefulRequested: stopped.gracefulAccepted,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length > 0
      ? "partial"
      : stopped.matchedPids.length > 0 || stopped.gracefulAccepted ? "stopped" : "not-running",
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

function resolveUpdateAction(value: string | undefined): DesktopUpdateAction | null {
  if (value == null) return null;
  if (isDesktopUpdateAction(value)) return value;
  throw new Error("--update-action must be status, check, clear-cache, download, or install");
}

export async function inspectPackedMacApp(config: ToolPackConfig, options: { expr?: string; path?: string; updateAction?: string }): Promise<MacInspectResult> {
  const active = await resolveReachableDesktop(config, 2000);
  const stamp = active?.stamp ?? convergedDesktopStamp(config);
  const status = active?.status ?? null;
  const updateAction = resolveUpdateAction(options.updateAction);

  return {
    ...(options.expr == null ? {} : {
      eval: await invokeSidecar<DesktopEvalResult>(
        stamp,
        SIDECAR_MESSAGES.EVAL,
        { expression: options.expr },
        { timeoutMs: 5000 },
      ),
    }),
    launcher: await readToolPackLauncherRuntimeSnapshot(config),
    updateCache: await readToolPackUpdateCacheLifecycleSnapshot(config),
    ...(options.path == null ? {} : {
      screenshot: await invokeSidecar<DesktopScreenshotResult>(
        stamp,
        SIDECAR_MESSAGES.SCREENSHOT,
        { path: options.path },
        { timeoutMs: 10000 },
      ),
    }),
    ...(updateAction == null ? {} : {
      update: await invokeSidecar<DesktopUpdateResult>(
        stamp,
        SIDECAR_MESSAGES.UPDATE,
        { action: updateAction },
        { timeoutMs: UPDATE_ACTION_TIMEOUT_MS },
      ),
    }),
    status,
  };
}

export async function uninstallPackedMacApp(config: ToolPackConfig): Promise<MacUninstallResult> {
  const paths = resolveMacPaths(config);
  const stop = await stopPackedMacApp(config);
  assertMacStopComplete(stop, "uninstall");
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
  const launcher = resolveToolPackLauncherLayout(config);
  const stop = await stopPackedMacApp(config);
  assertMacStopComplete(stop, "cleanup");
  const detachedMount = await detachMount(paths.mountPoint);
  const removedOutputRoot = await pathExists(config.roots.output.namespaceRoot);
  const removedRuntimeNamespaceRoot = await pathExists(config.roots.runtime.namespaceRoot);
  const removedLauncherNamespaceRoot = await pathExists(launcher.paths.namespaceRoot);

  await rm(config.roots.output.namespaceRoot, { force: true, recursive: true });
  await rm(config.roots.runtime.namespaceRoot, { force: true, recursive: true });
  await rm(launcher.paths.namespaceRoot, { force: true, recursive: true });

  return {
    detachedMount,
    namespace: config.namespace,
    outputRoot: config.roots.output.namespaceRoot,
    removedLauncherNamespaceRoot,
    removedOutputRoot,
    removedRuntimeNamespaceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    stop,
  };
}

function assertMacStopComplete(stop: MacStopResult, operation: string): void {
  if (stop.remainingPids.length === 0) return;
  throw new Error(
    `cannot ${operation} packaged namespace while sidecar processes remain: ${stop.remainingPids.join(", ")}`,
  );
}
