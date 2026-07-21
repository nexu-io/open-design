import { lstat } from "node:fs/promises";
import { posix } from "node:path";

import {
  collectProcessTreePids,
  listProcessSnapshots,
  processCommandExactlyRunsExecutable,
  stopProcesses,
  type StopProcessesResult,
} from "@open-design/platform";

type RetirementLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
};

export type ObsoleteInstalledOuterRetirementContext = {
  currentExecutablePath: string;
  currentPid: number;
  installedLaunchPath: string | null;
  logger: RetirementLogger;
  payloadDesktopProcess: boolean;
  payloadExecutablePath: string | null;
  platform: NodeJS.Platform;
};

type ObsoleteInstalledOuterRetirementDeps = {
  listProcessSnapshots?: typeof listProcessSnapshots;
  stopProcesses?: typeof stopProcesses;
};

export type ObsoleteInstalledOuterRetirementResult =
  | {
      reason:
        | "invalid-install-anchor"
        | "not-payload-desktop"
        | "same-executable"
        | "unsupported-platform"
        | "unsafe-current-descendant";
      status: "skipped";
    }
  | {
      executablePath: string;
      reason: "no-match";
      status: "skipped";
    }
  | {
      executablePath: string;
      result: StopProcessesResult;
      rootPids: number[];
      status: "failed" | "retired";
      treePids: number[];
    };

function sameExecutablePath(left: string, right: string): boolean {
  return posix.normalize(left) === posix.normalize(right);
}

async function resolveInstalledOuterExecutable(
  installedLaunchPath: string | null,
  platform: NodeJS.Platform,
): Promise<string | null> {
  if (installedLaunchPath == null || installedLaunchPath.length === 0) return null;
  if (platform !== "darwin" || !posix.isAbsolute(installedLaunchPath)) return null;

  const launchEntry = await lstat(installedLaunchPath).catch(() => null);
  if (launchEntry == null || launchEntry.isSymbolicLink()) return null;

  if (!launchEntry.isDirectory() || !installedLaunchPath.endsWith(".app")) return null;
  const appName = posix.basename(installedLaunchPath, ".app");
  const executablePath = posix.join(installedLaunchPath, "Contents", "MacOS", appName);

  const executableEntry = await lstat(executablePath).catch(() => null);
  if (executableEntry == null || !executableEntry.isFile() || executableEntry.isSymbolicLink()) return null;
  return executablePath;
}

async function retireObsoleteInstalledOuter(
  context: ObsoleteInstalledOuterRetirementContext,
  deps: ObsoleteInstalledOuterRetirementDeps,
): Promise<ObsoleteInstalledOuterRetirementResult> {
  if (!context.payloadDesktopProcess || context.payloadExecutablePath == null || !sameExecutablePath(
    context.currentExecutablePath,
    context.payloadExecutablePath,
  )) {
    return { reason: "not-payload-desktop", status: "skipped" };
  }
  if (context.platform !== "darwin") {
    return { reason: "unsupported-platform", status: "skipped" };
  }

  const executablePath = await resolveInstalledOuterExecutable(context.installedLaunchPath, context.platform);
  if (executablePath == null) return { reason: "invalid-install-anchor", status: "skipped" };
  if (sameExecutablePath(executablePath, context.currentExecutablePath)) {
    return { reason: "same-executable", status: "skipped" };
  }

  const snapshots = await (deps.listProcessSnapshots ?? listProcessSnapshots)();
  const rootPids = snapshots
    .filter((snapshot) => snapshot.pid !== context.currentPid && processCommandExactlyRunsExecutable(
      snapshot.command,
      executablePath,
      "darwin",
    ))
    .map((snapshot) => snapshot.pid)
    .sort((left, right) => right - left);
  if (rootPids.length === 0) return { executablePath, reason: "no-match", status: "skipped" };

  const safeRootPids = rootPids.filter((rootPid) => {
    const tree = collectProcessTreePids(snapshots, [rootPid]);
    return !tree.includes(context.currentPid);
  });
  if (safeRootPids.length === 0) {
    context.logger.warn("skipped obsolete installed outer retirement because it contains current payload", {
      currentPid: context.currentPid,
      executablePath,
      rootPids,
    });
    return { reason: "unsafe-current-descendant", status: "skipped" };
  }

  const treePids = collectProcessTreePids(snapshots, safeRootPids);
  const result = await (deps.stopProcesses ?? stopProcesses)(treePids);
  const status = result.remainingPids.length === 0 ? "retired" : "failed";
  const meta = {
    executablePath,
    forcedPids: result.forcedPids,
    remainingPids: result.remainingPids,
    rootPids: safeRootPids,
    stoppedPids: result.stoppedPids,
    treePids,
  };
  if (status === "retired") {
    context.logger.info("retired obsolete installed outer", meta);
  } else {
    context.logger.warn("obsolete installed outer survived retirement", meta);
  }
  return { executablePath, result, rootPids: safeRootPids, status, treePids };
}

/**
 * Build a re-usable, single-flight cleanup callback for desktop SHOW and quit.
 * A later invocation starts a fresh scan so a later LaunchServices open is not
 * hidden by a previously successful retirement.
 */
export function createObsoleteInstalledOuterRetirement(
  context: ObsoleteInstalledOuterRetirementContext,
  deps: ObsoleteInstalledOuterRetirementDeps = {},
): () => Promise<ObsoleteInstalledOuterRetirementResult> {
  let pending: Promise<ObsoleteInstalledOuterRetirementResult> | null = null;
  return () => {
    if (pending != null) return pending;
    pending = retireObsoleteInstalledOuter(context, deps).finally(() => {
      pending = null;
    });
    return pending;
  };
}
