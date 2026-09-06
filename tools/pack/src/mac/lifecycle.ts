import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  type DesktopStatusSnapshot,
} from "@open-design/sidecar-proto";
import { readLogTail } from "@open-design/platform";
import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";
import { WORKSPACE_ROOT, type ToolPackConfig } from "../config/index.js";
import { pathExists, scrubMacExtendedAttributes } from "./fs.js";
import { desktopLogPath, macAppExecutablePath, resolveMacPaths } from "./paths.js";
import type { MacCleanupResult, MacInspectResult, MacInstallResult, MacStartResult, MacStartSource, MacStopResult, MacUninstallResult } from "./lifecycle-types.js";

const execFileAsync = promisify(execFile);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function runtimeChannel(config: ToolPackConfig): string {
  return releaseChannelFromVersion(config.appVersion)
    ?? releaseChannelFromNamespace(config.namespace, "default")
    ?? "stable";
}

type ReachableDesktop = {
  status: DesktopStatusSnapshot;
};

type RuntimeLifecycleReceipt = Readonly<{
  operation: "electron.runtime.inspect" | "electron.runtime.start" | "electron.runtime.status" | "electron.runtime.stop";
  cdp?: unknown;
  pid?: number;
  status?: DesktopStatusSnapshot | { state: "idle" };
  electron?: Readonly<{
    gracefulAccepted: boolean;
    matchedPids: readonly number[];
    remainingPids: readonly number[];
    stoppedPids: readonly number[];
  }>;
  standalone?: Readonly<{
    remainingPids: readonly number[];
    stoppedPids: readonly number[];
  }> | null;
  remainingPids?: readonly number[];
  retainedStandaloneReferences?: number;
  schemaVersion: 1;
}>;

async function invokeElectronRuntimeLifecycle(
  config: ToolPackConfig,
  request: Record<string, unknown>,
): Promise<RuntimeLifecycleReceipt> {
  const operation = String(request.operation).replaceAll(".", "-");
  const root = join(config.roots.output.namespaceRoot, "shell-runtime");
  const requestPath = join(root, `${operation}-request.json`);
  const receiptPath = join(root, `${operation}-receipt.json`);
  await mkdir(root, { recursive: true });
  await writeFile(requestPath, `${JSON.stringify({
    schemaVersion: 1,
    channel: runtimeChannel(config),
    namespace: config.namespace,
    ...request,
  }, null, 2)}\n`, "utf8");
  await execFileAsync(process.execPath, [
    join(WORKSPACE_ROOT, "shells/electron/scripts/runtime-lifecycle.ts"),
    "--request",
    requestPath,
    "--receipt",
    receiptPath,
  ], { cwd: WORKSPACE_ROOT, maxBuffer: 2 * 1024 * 1024 });
  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as RuntimeLifecycleReceipt;
  if (receipt.schemaVersion !== 1 || receipt.operation !== request.operation) throw new Error("Electron Shell runtime adapter returned an invalid receipt");
  return receipt;
}

async function resolveReachableDesktop(config: ToolPackConfig, timeoutMs: number): Promise<ReachableDesktop | null> {
  void timeoutMs;
  try {
    const receipt = await invokeElectronRuntimeLifecycle(config, { operation: "electron.runtime.status" });
    if (receipt.status == null || receipt.status.state === "idle") return null;
    return { status: receipt.status as DesktopStatusSnapshot };
  }
  catch { return null; }
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
  const shell = await readMacShellPackReceipt(config);
  const builtAppPath = artifactFromShellReceipt(shell, ".app");
  if (builtAppPath == null) throw new Error("Shell pack receipt does not contain a mac app bundle");
  const appBundleName = basename(builtAppPath);
  if (appBundleName !== shell.identity.appBundleName) throw new Error("Shell pack receipt app identity differs from its artifact");
  const candidates: Array<{ appPath: string; source: MacStartSource }> = [
    { appPath: join(paths.installApplicationsRoot, appBundleName), source: "installed" },
    { appPath: join(homedir(), "Applications", appBundleName), source: "user-applications" },
    { appPath: join("/Applications", appBundleName), source: "system-applications" },
    { appPath: builtAppPath, source: "built" },
  ];

  for (const candidate of candidates) {
    const executablePath = macAppExecutablePath(candidate.appPath, shell.identity.executableName);
    if (await pathExists(executablePath)) {
      return { ...candidate, executablePath };
    }
  }

  throw new Error(
    `no mac .app executable found for namespace=${config.namespace}; run tools-pack mac build --to all and tools-pack mac install first`,
  );
}

async function resolveBuiltArtifact(config: ToolPackConfig, suffix: string): Promise<string | null> {
  return artifactFromShellReceipt(await readMacShellPackReceipt(config), suffix);
}

type MacShellPackReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.pack.build";
  identity: Readonly<{ appBundleName: string; executableName: string }>;
  distribution: Readonly<{ platform: "mac"; artifacts: readonly string[] }>;
}>;

function artifactFromShellReceipt(receipt: MacShellPackReceipt, suffix: string): string | null {
  return receipt.distribution.artifacts.find((artifact) => artifact.toLowerCase().endsWith(suffix)) ?? null;
}

async function readMacShellPackReceipt(config: ToolPackConfig): Promise<MacShellPackReceipt> {
  const receiptPath = join(config.roots.output.namespaceRoot, "shell-pack-receipt.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8").catch(() => "null")) as MacShellPackReceipt | null;
  if (receipt?.schemaVersion !== 1 || receipt.operation !== "electron.pack.build"
    || receipt.distribution?.platform !== "mac" || !Array.isArray(receipt.distribution.artifacts)
    || typeof receipt.identity?.appBundleName !== "string" || typeof receipt.identity.executableName !== "string") {
    throw new Error("mac lifecycle requires a valid Shell pack receipt; run tools-pack mac build first");
  }
  return receipt;
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
  const shell = await readMacShellPackReceipt(config);
  const appPath = artifactFromShellReceipt(shell, ".app");
  if (appPath == null || basename(appPath) !== shell.identity.appBundleName) throw new Error("Shell pack receipt app identity is invalid");
  const installedAppPath = join(paths.installApplicationsRoot, shell.identity.appBundleName);
  const dmgPath = await resolveBuiltArtifact(config, ".dmg");
  if (dmgPath == null || !(await pathExists(dmgPath))) {
    throw new Error("no mac dmg found in the Shell pack receipt; run tools-pack mac build first");
  }

  await rm(paths.mountPoint, { force: true, recursive: true });
  await mkdir(paths.mountPoint, { recursive: true });
  await rm(installedAppPath, { force: true, recursive: true });
  await mkdir(paths.installApplicationsRoot, { recursive: true });

  let detached = false;
  try {
    await execFileAsync("hdiutil", [
      "attach",
      dmgPath,
      "-mountpoint",
      paths.mountPoint,
      "-nobrowse",
      "-quiet",
    ]);
    await execFileAsync("ditto", [join(paths.mountPoint, shell.identity.appBundleName), installedAppPath]);
    await scrubMacExtendedAttributes(installedAppPath);
  } finally {
    detached = await detachMount(paths.mountPoint);
  }

  return {
    detached,
    dmgPath,
    installedAppPath,
    mountPoint: paths.mountPoint,
    namespace: config.namespace,
  };
}

export async function startPackedMacApp(config: ToolPackConfig): Promise<MacStartResult> {
  const target = await resolvePackedMacStartTarget(config);
  const logPath = desktopLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");
  const started = await invokeElectronRuntimeLifecycle(config, {
    operation: "electron.runtime.start",
    appPath: target.appPath,
    argv: ["--remote-debugging-port=0"],
    executablePath: target.executablePath,
    logPath,
    runtimeRoot: join(config.roots.runtime.namespaceRoot, "runtime"),
  });
  const pid = started.pid;
  if (typeof pid !== "number") throw new Error("Electron Shell runtime adapter omitted its generation pid");
  const status = started.status?.state === "idle" ? null : started.status as DesktopStatusSnapshot | null;
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
  const stopped = await invokeElectronRuntimeLifecycle(config, { operation: "electron.runtime.stop" });
  const electron = stopped.electron;
  const stoppedPids = [...new Set([...(electron?.stoppedPids ?? []), ...(stopped.standalone?.stoppedPids ?? [])])];
  const matchedPids = electron?.matchedPids ?? [];
  const remainingPids = [...(stopped.remainingPids ?? [])];
  return {
    gracefulRequested: electron?.gracefulAccepted ?? false,
    namespace: config.namespace,
    remainingPids,
    status: remainingPids.length > 0
      ? "partial"
      : matchedPids.length > 0 || stoppedPids.length > 0 || electron?.gracefulAccepted ? "stopped" : "not-running",
    stoppedPids,
  };
}

export async function readPackedMacLogs(config: ToolPackConfig) {
  const adapterLogPath = join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.ELECTRON, "latest.log");
  const entries: Array<readonly [string, { lines: string[]; logPath: string }]> = [
    [APP_KEYS.ELECTRON, { lines: await readLogTail(adapterLogPath, 200), logPath: adapterLogPath }],
  ];
  const active = await resolveReachableDesktop(config, 1_000);
  const status = active?.status as unknown as Record<string, unknown> | undefined;
  const roots = Array.isArray(status?.logRoots) ? status.logRoots : [];
  const files: Array<{ id: string; logPath: string }> = [];
  const visit = async (scope: string, root: string, current = root): Promise<void> => {
    const children = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      const childPath = join(current, child.name);
      if (child.isDirectory()) await visit(scope, root, childPath);
      else if (child.isFile() && (child.name.endsWith(".log") || child.name.endsWith(".jsonl"))) {
        files.push({ id: `${scope}:${childPath.slice(root.length + 1)}`, logPath: childPath });
      }
    }
  };
  for (const candidate of roots) {
    if (!isRecord(candidate) || typeof candidate.scope !== "string" || typeof candidate.path !== "string") continue;
    await visit(candidate.scope, candidate.path);
  }
  entries.push(...await Promise.all(files.sort((left, right) => left.id.localeCompare(right.id)).map(async (file) => [
    file.id,
    { lines: await readLogTail(file.logPath, 200), logPath: file.logPath },
  ] as const)));

  return {
    logs: Object.fromEntries(entries),
    namespace: config.namespace,
  };
}

export async function inspectPackedMacApp(config: ToolPackConfig, _options: object = {}): Promise<MacInspectResult> {
  const receipt = await invokeElectronRuntimeLifecycle(config, { operation: "electron.runtime.inspect" });
  const status = receipt.status?.state === "idle" ? null : receipt.status as DesktopStatusSnapshot | null;
  return {
    cdp: receipt.cdp ?? { discovery: { state: "disabled" }, targets: [] },
    status,
  };
}

export async function uninstallPackedMacApp(config: ToolPackConfig): Promise<MacUninstallResult> {
  const paths = resolveMacPaths(config);
  const shell = await readMacShellPackReceipt(config);
  const installedAppPath = join(paths.installApplicationsRoot, shell.identity.appBundleName);
  const stop = await stopPackedMacApp(config);
  assertMacStopComplete(stop, "uninstall");
  const removed = await pathExists(installedAppPath);
  await rm(installedAppPath, { force: true, recursive: true });

  return {
    installedAppPath,
    namespace: config.namespace,
    removed,
    stop,
  };
}

export async function cleanupPackedMacNamespace(config: ToolPackConfig): Promise<MacCleanupResult> {
  const paths = resolveMacPaths(config);
  const stop = await stopPackedMacApp(config);
  assertMacStopComplete(stop, "cleanup");
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

function assertMacStopComplete(stop: MacStopResult, operation: string): void {
  if (stop.remainingPids.length === 0) return;
  throw new Error(
    `cannot ${operation} packaged namespace while sidecar processes remain: ${stop.remainingPids.join(", ")}`,
  );
}
