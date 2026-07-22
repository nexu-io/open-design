import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";
import type { StopProcessesResult, stopProcesses, waitForProcessExit } from "@open-design/platform";

import {
  exitPackagedLauncherForExistingDesktop,
  inspectExistingDesktopForLauncher,
  waitForLauncherAfterQuit,
} from "../src/launcher-after-quit.js";
import type { PackagedNamespacePaths } from "../src/paths.js";

/** Build a `stopProcesses` result without signalling any real PID. */
function fakeStopResult(pid: number, opts: { forced?: boolean; survived?: boolean } = {}): StopProcessesResult {
  return {
    alreadyStopped: false,
    forcedPids: opts.forced ? [pid] : [],
    matchedPids: [pid],
    remainingPids: opts.survived ? [pid] : [],
    stoppedPids: opts.survived ? [] : [pid],
  };
}

const neverExits = (async () => false) as typeof waitForProcessExit;

function fakeStop(pid: number, opts: { forced?: boolean; survived?: boolean } = {}) {
  return vi.fn(async () => fakeStopResult(pid, opts)) as unknown as typeof stopProcesses;
}

function fakePaths(root: string): PackagedNamespacePaths {
  return {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    desktopIdentityPath: join(root, "runtime", "desktop-root.json"),
    desktopLogPath: join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(root, "logs", "desktop"),
    electronSessionDataRoot: join(root, "user-data", "session"),
    electronUserDataRoot: join(root, "user-data"),
    headlessIdentityPath: join(root, "runtime", "headless-root.json"),
    installationRoot: root,
    installerObservationRoot: join(root, "data", "observations", "installer"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources", "open-design"),
    runtimeRoot: join(root, "runtime"),
    updateRoot: join(root, "updates"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

describe("waitForLauncherAfterQuit", () => {
  it("logs and returns when the old pid is already gone", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-after-quit-"));
    try {
      const paths = fakePaths(root);

      const exited = await waitForLauncherAfterQuit({ targetPid: 999999, timeoutMs: 1000 }, paths);

      expect(exited).toBe(true);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("armed targetPid=999999 timeoutMs=1000");
      expect(log).toContain("observed-exit targetPid=999999");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("logs and warns on timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-after-quit-timeout-"));
    const logger = { warn: vi.fn() };
    const stop = fakeStop(4242, { survived: true });
    try {
      const paths = fakePaths(root);

      const exited = await waitForLauncherAfterQuit({ targetPid: 4242, timeoutMs: 1 }, paths, logger, {
        stopProcesses: stop,
        waitForExit: neverExits,
      });

      expect(exited).toBe(false);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("armed targetPid=4242 timeoutMs=1");
      expect(log).toContain("timed-out targetPid=4242; forcing stop");
      expect(log).toContain("force-stop after-quit-timeout pid=4242 outcome=survived");
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("timed-out targetPid=4242"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("force-stops the lingering pid when the old process never exits", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-after-quit-forcekill-"));
    const stop = fakeStop(4242);
    try {
      const paths = fakePaths(root);

      const exited = await waitForLauncherAfterQuit({ targetPid: 4242, timeoutMs: 5 }, paths, { warn: vi.fn() }, {
        stopProcesses: stop,
        waitForExit: neverExits,
      });

      expect(exited).toBe(true);
      expect(stop).toHaveBeenCalledWith([4242]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("timed-out targetPid=4242; forcing stop");
      expect(log).toContain("force-stop after-quit-timeout pid=4242 outcome=sigterm");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("exitPackagedLauncherForExistingDesktop", () => {
  it.each(["existing-focused", "existing-focus-failed"] as const)(
    "terminates the duplicate outer after %s",
    (reason) => {
      const exit = vi.fn();

      expect(exitPackagedLauncherForExistingDesktop({ action: "exit", reason }, exit)).toBe(true);
      expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    },
  );

  it("keeps the outer alive when startup must continue", () => {
    const exit = vi.fn();

    expect(exitPackagedLauncherForExistingDesktop(
      { action: "continue", reason: "superseded-version" },
      exit,
    )).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("inspectExistingDesktopForLauncher", () => {
  it("restarts a healthy older desktop before a newer installed package continues", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-superseded-"));
    const requests: unknown[] = [];
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-prerelease", {
        incomingVersion: "0.16.0-prerelease.1",
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          requests.push(message);
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon") || ipcPath.includes("web")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            return {
              pid: 1234,
              state: "running",
              update: { currentVersion: "0.15.1-prerelease.15" },
              updatedAt: new Date().toISOString(),
            };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
        waitForExit: (async (pid: number) => pid === 1234) as typeof import("@open-design/platform").waitForProcessExit,
      });

      expect(result).toEqual({ action: "continue", reason: "superseded-version" });
      expect(requests).toEqual([
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.SHUTDOWN },
      ]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain(
        "action=restart reason=superseded-version incomingVersion=0.16.0-prerelease.1 existingVersion=0.15.1-prerelease.15 pid=1234",
      );
      expect(log).toContain("shutdown=exited reason=superseded-version pid=1234");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each([
    { existingVersion: "0.16.0-prerelease.1", incomingVersion: "0.16.0-prerelease.1", label: "the same version" },
    { existingVersion: "0.16.0-prerelease.2", incomingVersion: "0.16.0-prerelease.1", label: "a newer version" },
    { existingVersion: undefined, incomingVersion: "0.16.0-prerelease.1", label: "an unknown historical version" },
  ])("focuses an existing namespace desktop running $label", async ({ existingVersion, incomingVersion }) => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-focus-"));
    const requests: Array<{ message: unknown; timeoutMs?: number }> = [];
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        incomingVersion,
        paths,
        requestIpc: (async (ipcPath: string, message: unknown, options?: { timeoutMs?: number }) => {
          requests.push({ message, timeoutMs: options?.timeoutMs });
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon") || ipcPath.includes("web")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            return {
              pid: 1234,
              state: "running",
              ...(existingVersion == null ? {} : { update: { currentVersion: existingVersion } }),
              updatedAt: new Date().toISOString(),
            };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });

      expect(result).toEqual({ action: "exit", reason: "existing-focused" });
      expect(requests.map((request) => request.message)).toEqual([
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.SHOW },
      ]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("inspect-found-existing namespace=release-beta-win focus=accepted");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("continues when inspect cannot reach desktop", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-failed-"));
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        paths,
        requestIpc: (async () => {
          throw new Error("pipe closed");
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });

      expect(result).toEqual({ action: "continue", reason: "inspect-failed" });
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("inspect-unavailable namespace=release-beta-win action=continue error=pipe closed");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("exits without launching a duplicate when focus fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-focus-failed-"));
    const logger = { warn: vi.fn() };
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        logger,
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon") || ipcPath.includes("web")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          throw new Error("show rejected");
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });

      expect(result).toEqual({ action: "exit", reason: "existing-focus-failed" });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("focus=failed"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("restarts instead of focusing when an existing desktop has a stale web sidecar", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-stale-web-"));
    const requests: unknown[] = [];
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          requests.push(message);
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            if (ipcPath.includes("web")) {
              throw new Error("web pipe missing");
            }
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
        waitForExit: (async (pid: number) => pid === 1234) as typeof import("@open-design/platform").waitForProcessExit,
      });

      expect(result).toEqual({ action: "continue", reason: "stale-sidecar" });
      expect(requests).toEqual([
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.STATUS },
        { type: SIDECAR_MESSAGES.SHUTDOWN },
      ]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("action=restart reason=stale-sidecar apps=web pid=1234");
      expect(log).toContain("shutdown=exited reason=stale-sidecar pid=1234");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("force-stops a skewed desktop that ignores SHUTDOWN, then restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-stale-forcekill-"));
    const stop = fakeStop(1234, { forced: true });
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            if (ipcPath.includes("web")) {
              throw new Error("web pipe missing");
            }
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
        stopProcesses: stop,
        waitForExit: neverExits,
      });

      expect(result).toEqual({ action: "continue", reason: "stale-sidecar" });
      expect(stop).toHaveBeenCalledWith([1234]);
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("shutdown=timed-out reason=stale-sidecar pid=1234");
      expect(log).toContain("force-stop stale-sidecar pid=1234 outcome=sigkill");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("exits without restarting when a skewed desktop cannot be force-stopped", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-stale-survives-"));
    const logger = { warn: vi.fn() };
    const stop = fakeStop(1234, { survived: true });
    try {
      const paths = fakePaths(root);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        logger,
        paths,
        requestIpc: (async (ipcPath: string, message: unknown) => {
          if ((message as { type?: string }).type === SIDECAR_MESSAGES.STATUS) {
            if (ipcPath.includes("daemon")) {
              return { pid: 2345, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:1234" };
            }
            if (ipcPath.includes("web")) {
              throw new Error("web pipe missing");
            }
            return { pid: 1234, state: "running", updatedAt: new Date().toISOString() };
          }
          return { accepted: true };
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
        stopProcesses: stop,
        waitForExit: neverExits,
      });

      expect(result).toEqual({ action: "exit", reason: "existing-focus-failed" });
      expect(stop).toHaveBeenCalledWith([1234]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("force-stop stale-sidecar pid=1234 outcome=survived"),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
