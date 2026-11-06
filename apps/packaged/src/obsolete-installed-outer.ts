import { lstat } from "node:fs/promises";
import { posix, win32 } from "node:path";

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
  inspectInstalledOuterPath?: (path: string) => Promise<{
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  } | null>;
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

function sameExecutablePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  if (platform === "win32") {
    return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
  }
  return posix.normalize(left) === posix.normalize(right);
}

async function resolveInstalledOuterExecutable(
  installedLaunchPath: string | null,
  payloadExecutablePath: string,
  platform: NodeJS.Platform,
  inspectInstalledOuterPath: NonNullable<ObsoleteInstalledOuterRetirementDeps["inspectInstalledOuterPath"]>,
): Promise<string | null> {
  if (installedLaunchPath == null || installedLaunchPath.length === 0) return null;

  if (platform === "win32") {
    if (!win32.isAbsolute(installedLaunchPath) || !win32.isAbsolute(payloadExecutablePath)) return null;
    if (win32.extname(installedLaunchPath).toLowerCase() !== ".exe") return null;
    if (win32.basename(installedLaunchPath).toLowerCase() !== win32.basename(payloadExecutablePath).toLowerCase()) {
      return null;
    }

    const executableEntry = await inspectInstalledOuterPath(installedLaunchPath);
    if (executableEntry == null || !executableEntry.isFile() || executableEntry.isSymbolicLink()) return null;
    return installedLaunchPath;
  }

  if (platform !== "darwin" || !posix.isAbsolute(installedLaunchPath)) return null;

  const launchEntry = await inspectInstalledOuterPath(installedLaunchPath);
  if (launchEntry == null || launchEntry.isSymbolicLink()) return null;

  if (!launchEntry.isDirectory() || !installedLaunchPath.endsWith(".app")) return null;
  const appName = posix.basename(installedLaunchPath, ".app");
  const executablePath = posix.join(installedLaunchPath, "Contents", "MacOS", appName);

  const executableEntry = await inspectInstalledOuterPath(executablePath);
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
    context.platform,
  )) {
    return { reason: "not-payload-desktop", status: "skipped" };
  }
  if (context.platform !== "darwin" && context.platform !== "win32") {
    return { reason: "unsupported-platform", status: "skipped" };
  }

  const inspectInstalledOuterPath = deps.inspectInstalledOuterPath
    ?? (async (path: string) => lstat(path).catch(() => null));
  const executablePath = await resolveInstalledOuterExecutable(
    context.installedLaunchPath,
    context.payloadExecutablePath,
    context.platform,
    inspectInstalledOuterPath,
  );
  if (executablePath == null) return { reason: "invalid-install-anchor", status: "skipped" };
  if (sameExecutablePath(executablePath, context.currentExecutablePath, context.platform)) {
    return { reason: "same-executable", status: "skipped" };
  }

  const enumerateProcesses = deps.listProcessSnapshots ?? listProcessSnapshots;
  let snapshots = await enumerateProcesses();
  let rootPids = snapshots
    .filter((snapshot) => snapshot.pid !== context.currentPid && processCommandExactlyRunsExecutable(
      snapshot.command,
      executablePath,
      context.platform,
    ))
    .map((snapshot) => snapshot.pid)
    .sort((left, right) => right - left);
  if (rootPids.length === 0) return { executablePath, reason: "no-match", status: "skipped" };

  if (context.platform === "win32") {
    snapshots = await enumerateProcesses();
    const expectedRootPids = new Set(rootPids);
    rootPids = snapshots
      .filter((snapshot) => expectedRootPids.has(snapshot.pid) && processCommandExactlyRunsExecutable(
        snapshot.command,
        executablePath,
        context.platform,
      ))
      .map((snapshot) => snapshot.pid)
      .sort((left, right) => right - left);
    if (rootPids.length === 0) return { executablePath, reason: "no-match", status: "skipped" };
  }

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
 * A later invocation starts a fresh scan so a later installed-outer open is
 * not hidden by a previously successful retirement.
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
