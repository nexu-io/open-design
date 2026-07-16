import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { stopProcesses, waitForProcessExit, type StopProcessesResult } from "@open-design/platform";
import type { LauncherAfterQuitRequest } from "@open-design/launcher-proto";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  type AppKey,
  type DesktopStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";

import type { PackagedNamespacePaths } from "./paths.js";

type LauncherAfterQuitLogger = Pick<Console, "warn"> & Partial<Pick<Console, "info">>;

export type LauncherExistingDesktopGateResult =
  | { action: "continue"; reason: "inspect-failed" | "not-running" | "stale-sidecar" }
  | { action: "exit"; reason: "existing-focused" | "existing-focus-failed" };

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

export async function waitForLauncherAfterQuit(
  request: LauncherAfterQuitRequest | null,
  paths: PackagedNamespacePaths,
  logger: LauncherAfterQuitLogger = console,
  controls: Partial<LauncherProcessControls> = {},
): Promise<void> {
  if (request == null) return;
  const waitForExit = controls.waitForExit ?? waitForProcessExit;
  const stop = controls.stopProcesses ?? stopProcesses;
  await writeLauncherAfterQuitLog(paths, `armed targetPid=${request.targetPid} timeoutMs=${request.timeoutMs}`);
  const exited = await waitForExit(request.targetPid, request.timeoutMs);
  if (exited) {
    await writeLauncherAfterQuitLog(paths, `observed-exit targetPid=${request.targetPid}`);
    return;
  }
  // The old process outlived its quit grace and still holds the fixed socket.
  // Force it off so the relaunched app binds cleanly instead of skewing.
  const message = `timed-out targetPid=${request.targetPid}; forcing stop`;
  await writeLauncherAfterQuitLog(paths, message);
  logger.warn(`[open-design launcher] ${message}`);
  await forceStopLingeringDesktop(request.targetPid, "after-quit-timeout", paths, logger, stop);
}

export async function inspectExistingDesktopForLauncher(
  namespace: string,
  options: {
    logger?: LauncherAfterQuitLogger;
    paths: PackagedNamespacePaths;
    requestIpc?: typeof requestJsonIpc;
    stopProcesses?: typeof stopProcesses;
    waitForExit?: typeof waitForProcessExit;
  },
): Promise<LauncherExistingDesktopGateResult> {
  const logger = options.logger ?? console;
  const requestIpc = options.requestIpc ?? requestJsonIpc;
  const waitForExit = options.waitForExit ?? waitForProcessExit;
  const stop = options.stopProcesses ?? stopProcesses;
  const ipcPath = resolveAppIpcPath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace,
  });
  let status: DesktopStatusSnapshot | null = null;
  try {
    status = await requestIpc<DesktopStatusSnapshot>(
      ipcPath,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs: 350 },
    );
  } catch (error) {
    const message = `inspect-unavailable namespace=${namespace} action=continue error=${error instanceof Error ? error.message : String(error)}`;
    await writeLauncherAfterQuitLog(options.paths, message);
    logger.info?.(`[open-design launcher] ${message}`);
    return { action: "continue", reason: "inspect-failed" };
  }

  if (status.state !== "running") {
    await writeLauncherAfterQuitLog(options.paths, `inspect-not-running namespace=${namespace} state=${status.state}`);
    return { action: "continue", reason: "not-running" };
  }

  const staleSidecars: AppKey[] = [];
  for (const app of [APP_KEYS.DAEMON, APP_KEYS.WEB]) {
    const sidecarIpcPath = resolveAppIpcPath({
      app,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    });
    const sidecarStatus = await requestIpc<{ url?: unknown }>(
      sidecarIpcPath,
      { type: SIDECAR_MESSAGES.STATUS },
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
    try {
      await requestIpc(ipcPath, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 800 });
    } catch (error) {
      const message = `inspect-found-existing namespace=${namespace} shutdown=failed reason=stale-sidecar error=${error instanceof Error ? error.message : String(error)}`;
      await writeLauncherAfterQuitLog(options.paths, message);
      logger.warn(`[open-design launcher] ${message}`);
      return { action: "exit", reason: "existing-focus-failed" };
    }
    if (pid != null) {
      const exited = await waitForExit(pid, 5000);
      await writeLauncherAfterQuitLog(
        options.paths,
        `inspect-found-existing namespace=${namespace} shutdown=${exited ? "exited" : "timed-out"} reason=stale-sidecar pid=${pid}`,
      );
      // A skewed desktop (running, but its own daemon/web sidecars are stale)
      // that ignores SHUTDOWN would otherwise make us exit and leave the user
      // pinned to it. Force it off the socket instead, then restart fresh.
      if (!exited) {
        const gone = await forceStopLingeringDesktop(pid, "stale-sidecar", options.paths, logger, stop);
        if (!gone) return { action: "exit", reason: "existing-focus-failed" };
      }
    }
    return { action: "continue", reason: "stale-sidecar" };
  }

  try {
    await requestIpc(ipcPath, { type: SIDECAR_MESSAGES.SHOW }, { timeoutMs: 800 });
    await writeLauncherAfterQuitLog(options.paths, `inspect-found-existing namespace=${namespace} focus=accepted`);
    return { action: "exit", reason: "existing-focused" };
  } catch (error) {
    const message = `inspect-found-existing namespace=${namespace} focus=failed error=${error instanceof Error ? error.message : String(error)}`;
    await writeLauncherAfterQuitLog(options.paths, message);
    logger.warn(`[open-design launcher] ${message}`);
    return { action: "exit", reason: "existing-focus-failed" };
  }
}
