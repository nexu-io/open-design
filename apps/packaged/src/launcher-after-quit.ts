import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { stopProcesses, waitForProcessExit, type StopProcessesResult } from "@open-design/platform";
import { compareLauncherVersions, type LauncherAfterQuitRequest } from "@open-design/launcher-proto";
import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type AppKey,
  type DesktopStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  getSidecarStatus,
  invokeSidecar,
  stopSidecar,
  type SidecarStamp,
} from "@open-design/sidecar";

import type { PackagedNamespacePaths } from "./paths.js";

type LauncherAfterQuitLogger = Pick<Console, "warn"> & Partial<Pick<Console, "info">>;
const HEADLESS_SIDECAR_MODE = "headless";
const PACKAGED_SIDECAR_SOURCES = [SIDECAR_SOURCES.TOOLS_PACK, SIDECAR_SOURCES.PACKAGED] as const;

function packagedSidecarSourcesFor(stamp: SidecarStamp): readonly SidecarStamp["source"][] {
  return [stamp.source, ...PACKAGED_SIDECAR_SOURCES.filter((source) => source !== stamp.source)];
}

export type LauncherExistingDesktopGateResult =
  | { action: "continue"; reason: "headless-owner" | "inspect-failed" | "not-running" | "stale-sidecar" | "superseded-version" }
  | { action: "exit"; reason: "existing-focused" | "existing-focus-failed" | "existing-headless" };

type ExistingDesktopOwnerInspection = {
  lastError: unknown;
  observedNotRunning: DesktopStatusSnapshot | null;
  running: { stamp: SidecarStamp; status: DesktopStatusSnapshot } | null;
};

async function inspectExistingDesktopOwnerCandidates(
  stamp: SidecarStamp,
  modes: readonly SidecarStamp["mode"][],
  sources: readonly SidecarStamp["source"][],
  getStatus: typeof getSidecarStatus,
): Promise<ExistingDesktopOwnerInspection> {
  let lastError: unknown = null;
  let observedNotRunning: DesktopStatusSnapshot | null = null;
  const candidates = [...new Set(modes)].flatMap((mode) =>
    [...new Set(sources)].map((source) => ({ ...stamp, mode, source })),
  );
  for (const candidate of candidates) {
    try {
      const status = await getStatus<DesktopStatusSnapshot>(candidate, { timeoutMs: 350 });
      if (status.state === "running") {
        return { lastError, observedNotRunning, running: { stamp: candidate, status } };
      }
      observedNotRunning ??= status;
    } catch (error) {
      lastError = error;
    }
  }
  return { lastError, observedNotRunning, running: null };
}

export async function findExistingPackagedDesktopOwner(
  stamp: SidecarStamp,
  options: {
    getStatus?: typeof getSidecarStatus;
    modes?: readonly SidecarStamp["mode"][];
    sources?: readonly SidecarStamp["source"][];
  } = {},
): Promise<{ stamp: SidecarStamp; status: DesktopStatusSnapshot } | null> {
  const getStatus = options.getStatus ?? getSidecarStatus;
  const modes = options.modes ?? [stamp.mode];
  const sources = options.sources ?? packagedSidecarSourcesFor(stamp);
  return (await inspectExistingDesktopOwnerCandidates(stamp, modes, sources, getStatus)).running;
}

/**
 * Finish a duplicate packaged entry after the healthy namespace desktop has
 * accepted focus (or after focus failed without making a duplicate safe).
 *
 * Returning from `main()` alone does not terminate Electron's event loop: the
 * unused outer can keep a main process and Chromium helpers alive indefinitely.
 */
export function exitPackagedLauncherForExistingDesktop(
  result: LauncherExistingDesktopGateResult,
  exit: (code: number) => void,
): boolean {
  if (result.action !== "exit") return false;
  exit(0);
  return true;
}

async function writeLauncherAfterQuitLog(paths: PackagedNamespacePaths, message: string): Promise<void> {
  const logDir = join(paths.logsRoot, "launcher");
  await mkdir(logDir, { recursive: true });
  await appendFile(
    join(logDir, "after-quit.log"),
    `${new Date().toISOString()} ${message}\n`,
    "utf8",
  );
}

/** Injectable process controls so tests never signal real PIDs. */
export type LauncherProcessControls = {
  stopProcesses: typeof stopProcesses;
  waitForExit: typeof waitForProcessExit;
};

/**
 * Force a desktop process that outlived the launcher's graceful handshake off
 * the fixed `desktop.sock`.
 *
 * A packaged desktop that ignores SHUTDOWN or never quits keeps holding that
 * socket. A freshly updated daemon then connects to the *stale* desktop, and its
 * newer messages (e.g. `render-slides`, added in 0.13.0) are rejected as
 * "unknown sidecar message" — the version-skew export failure users hit after an
 * update. Escalating SIGTERM→SIGKILL here mirrors how `closeManagedChild`
 * already force-stops daemon/web children that ignore SHUTDOWN, so no
 * skewed desktop is left squatting on the socket the relaunched app must bind.
 *
 * @returns whether the process is confirmed gone (safe to rebind the socket).
 */
async function forceStopLingeringDesktop(
  pid: number | null | undefined,
  context: string,
  paths: PackagedNamespacePaths,
  logger: LauncherAfterQuitLogger,
  stop: typeof stopProcesses,
): Promise<boolean> {
  if (pid == null) return true;
  const result: StopProcessesResult = await stop([pid]);
  const gone = !result.remainingPids.includes(pid);
  const outcome = !gone ? "survived" : result.forcedPids.includes(pid) ? "sigkill" : "sigterm";
  const message = `force-stop ${context} pid=${pid} outcome=${outcome}`;
  await writeLauncherAfterQuitLog(paths, message);
  if (!gone) logger.warn(`[open-design launcher] ${message}`);
  return gone;
}

async function restartExistingDesktop(
  input: {
    logger: LauncherAfterQuitLogger;
    namespace: string;
    paths: PackagedNamespacePaths;
    pid: number | null;
    reason: "headless-owner" | "stale-sidecar" | "superseded-version";
    stamp: SidecarStamp;
    stopSidecar: typeof stopSidecar;
  },
): Promise<boolean> {
  try {
    const result = await input.stopSidecar(input.stamp);
    const exited = result.remainingPids.length === 0;
    await writeLauncherAfterQuitLog(
      input.paths,
      `inspect-found-existing namespace=${input.namespace} shutdown=${exited ? "exited" : "timed-out"} reason=${input.reason} pid=${input.pid ?? "unknown"}`,
    );
    return exited;
  } catch (error) {
    const message = `inspect-found-existing namespace=${input.namespace} shutdown=failed reason=${input.reason} error=${error instanceof Error ? error.message : String(error)}`;
    await writeLauncherAfterQuitLog(input.paths, message);
    input.logger.warn(`[open-design launcher] ${message}`);
    return false;
  }
}

function incomingVersionSupersedesExisting(
  incomingVersion: string | null | undefined,
  existingVersion: string | null | undefined,
): boolean {
  if (incomingVersion == null || existingVersion == null) return false;
  const incoming = incomingVersion.trim();
  const existing = existingVersion.trim();
  if (incoming.length === 0 || existing.length === 0) return false;
  try {
    return compareLauncherVersions(incoming, existing) > 0;
  } catch {
    return false;
  }
}

export async function waitForLauncherAfterQuit(
  request: LauncherAfterQuitRequest | null,
  paths: PackagedNamespacePaths,
  logger: LauncherAfterQuitLogger = console,
  controls: Partial<LauncherProcessControls> = {},
): Promise<boolean> {
  if (request == null) return true;
  const waitForExit = controls.waitForExit ?? waitForProcessExit;
  const stop = controls.stopProcesses ?? stopProcesses;
  await writeLauncherAfterQuitLog(paths, `armed targetPid=${request.targetPid} timeoutMs=${request.timeoutMs}`);
  const exited = await waitForExit(request.targetPid, request.timeoutMs);
  if (exited) {
    await writeLauncherAfterQuitLog(paths, `observed-exit targetPid=${request.targetPid}`);
    return true;
  }
  // The old process outlived its quit grace and still holds the fixed socket.
  // Force it off so the relaunched app binds cleanly instead of skewing.
  const message = `timed-out targetPid=${request.targetPid}; forcing stop`;
  await writeLauncherAfterQuitLog(paths, message);
  logger.warn(`[open-design launcher] ${message}`);
  return await forceStopLingeringDesktop(request.targetPid, "after-quit-timeout", paths, logger, stop);
}

export async function inspectExistingDesktopForLauncher(
  stamp: SidecarStamp,
  options: {
    deeplinkUrl?: string | null;
    incomingVersion?: string | null;
    logger?: LauncherAfterQuitLogger;
    paths: PackagedNamespacePaths;
    getStatus?: typeof getSidecarStatus;
    invoke?: typeof invokeSidecar;
    modes?: readonly SidecarStamp["mode"][];
    sources?: readonly SidecarStamp["source"][];
    stopSidecar?: typeof stopSidecar;
  },
): Promise<LauncherExistingDesktopGateResult> {
  const namespace = stamp.namespace;
  const logger = options.logger ?? console;
  const getStatus = options.getStatus ?? getSidecarStatus;
  const invoke = options.invoke ?? invokeSidecar;
  const stop = options.stopSidecar ?? stopSidecar;
  const modes = options.modes ?? [
    stamp.mode,
    stamp.mode === HEADLESS_SIDECAR_MODE ? SIDECAR_MODES.RUNTIME : HEADLESS_SIDECAR_MODE,
  ];
  const sources = options.sources ?? packagedSidecarSourcesFor(stamp);
  const ownerInspection = await inspectExistingDesktopOwnerCandidates(stamp, modes, sources, getStatus);
  if (ownerInspection.running == null) {
    const { lastError, observedNotRunning } = ownerInspection;
    if (observedNotRunning != null) {
      await writeLauncherAfterQuitLog(options.paths, `inspect-not-running namespace=${namespace} state=${observedNotRunning.state}`);
      return { action: "continue", reason: "not-running" };
    }
    const message = `inspect-unavailable namespace=${namespace} action=continue error=${lastError instanceof Error ? lastError.message : String(lastError)}`;
    await writeLauncherAfterQuitLog(options.paths, message);
    logger.info?.(`[open-design launcher] ${message}`);
    return { action: "continue", reason: "inspect-failed" };
  }
  const { stamp: inspectedStamp, status } = ownerInspection.running;

  const staleSidecars: AppKey[] = [];
  for (const app of [APP_KEYS.DAEMON, APP_KEYS.WEB]) {
    const sidecarStatus = await getStatus<{ url?: unknown }>(
      { ...inspectedStamp, app, mode: inspectedStamp.mode },
      { timeoutMs: 350 },
    ).catch(() => null);
    if (typeof sidecarStatus?.url !== "string" || sidecarStatus.url.length === 0) {
      staleSidecars.push(app);
    }
  }

  if (staleSidecars.length > 0) {
    const pid = typeof status.pid === "number" ? status.pid : null;
    await writeLauncherAfterQuitLog(
      options.paths,
      `inspect-found-existing namespace=${namespace} action=restart reason=stale-sidecar apps=${staleSidecars.join(",")} pid=${pid ?? "unknown"}`,
    );
    const restarted = await restartExistingDesktop({
      logger,
      namespace,
      paths: options.paths,
      pid,
      reason: "stale-sidecar",
      stamp: inspectedStamp,
      stopSidecar: stop,
    });
    if (!restarted) return { action: "exit", reason: "existing-focus-failed" };
    return { action: "continue", reason: "stale-sidecar" };
  }

  const existingVersion = status.update?.currentVersion;
  if (incomingVersionSupersedesExisting(options.incomingVersion, existingVersion)) {
    const pid = typeof status.pid === "number" ? status.pid : null;
    await writeLauncherAfterQuitLog(
      options.paths,
      `inspect-found-existing namespace=${namespace} action=restart reason=superseded-version incomingVersion=${options.incomingVersion?.trim()} existingVersion=${existingVersion?.trim()} pid=${pid ?? "unknown"}`,
    );
    const restarted = await restartExistingDesktop({
      logger,
      namespace,
      paths: options.paths,
      pid,
      reason: "superseded-version",
      stamp: inspectedStamp,
      stopSidecar: stop,
    });
    if (!restarted) return { action: "exit", reason: "existing-focus-failed" };
    return { action: "continue", reason: "superseded-version" };
  }

  if (status.windowVisible === false) {
    const pid = typeof status.pid === "number" ? status.pid : null;
    if (stamp.mode === HEADLESS_SIDECAR_MODE && inspectedStamp.mode === HEADLESS_SIDECAR_MODE) {
      await writeLauncherAfterQuitLog(
        options.paths,
        `inspect-found-existing namespace=${namespace} action=reuse reason=existing-headless pid=${pid ?? "unknown"}`,
      );
      return { action: "exit", reason: "existing-headless" };
    }
    await writeLauncherAfterQuitLog(
      options.paths,
      `inspect-found-existing namespace=${namespace} action=restart reason=headless-owner pid=${pid ?? "unknown"}`,
    );
    const restarted = await restartExistingDesktop({
      logger,
      namespace,
      paths: options.paths,
      pid,
      reason: "headless-owner",
      stamp: inspectedStamp,
      stopSidecar: stop,
    });
    if (!restarted) return { action: "exit", reason: "existing-focus-failed" };
    return { action: "continue", reason: "headless-owner" };
  }

  try {
    await invoke(
      inspectedStamp,
      SIDECAR_MESSAGES.SHOW,
      options.deeplinkUrl == null ? {} : { deeplinkUrl: options.deeplinkUrl },
      { timeoutMs: 800 },
    );
    await writeLauncherAfterQuitLog(options.paths, `inspect-found-existing namespace=${namespace} focus=accepted`);
    return { action: "exit", reason: "existing-focused" };
  } catch (error) {
    const message = `inspect-found-existing namespace=${namespace} focus=failed error=${error instanceof Error ? error.message : String(error)}`;
    await writeLauncherAfterQuitLog(options.paths, message);
    logger.warn(`[open-design launcher] ${message}`);
    return { action: "exit", reason: "existing-focus-failed" };
  }
}
