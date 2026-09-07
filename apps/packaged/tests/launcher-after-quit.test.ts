import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SidecarStamp, SidecarStopResult } from "@open-design/sidecar";
import { APP_KEYS, SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import type { StopProcessesResult, stopProcesses, waitForProcessExit } from "@open-design/platform";
import { describe, expect, it, vi } from "vitest";

import { exitPackagedLauncherForExistingDesktop, inspectExistingDesktopForLauncher, waitForLauncherAfterQuit } from "../src/launcher-after-quit.js";
import type { PackagedNamespacePaths } from "../src/paths.js";

function stamp(namespace = "release-prerelease"): SidecarStamp {
  return { app: APP_KEYS.DESKTOP, channel: "prerelease", mode: "runtime", namespace, source: "packaged" };
}

function fakePaths(root: string): PackagedNamespacePaths {
  return {
    cacheRoot: join(root, "cache"), dataRoot: join(root, "data"), desktopLogPath: join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(root, "logs", "desktop"), electronSessionDataRoot: join(root, "user-data", "session"),
    electronUserDataRoot: join(root, "user-data"), installationRoot: root,
    installerObservationRoot: join(root, "data", "observations", "installer"), logsRoot: join(root, "logs"), namespaceRoot: root,
    resourceRoot: join(root, "resources", "open-design"), runtimeRoot: join(root, "runtime"), updateRoot: join(root, "updates"),
  };
}

function processStop(pid: number, survived = false): StopProcessesResult {
  return { alreadyStopped: false, forcedPids: [], matchedPids: [pid], remainingPids: survived ? [pid] : [], stoppedPids: survived ? [] : [pid] };
}

function sidecarStop(pid = 1234): SidecarStopResult {
  return { ...processStop(pid), gracefulAccepted: true };
}

describe("waitForLauncherAfterQuit", () => {
  it("logs a completed updater wait", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-after-quit-"));
    try {
      const result = await waitForLauncherAfterQuit({ targetPid: 999999, timeoutMs: 1000 }, fakePaths(root), console, {
        waitForExit: (async () => true) as typeof waitForProcessExit,
      });
      expect(result).toBe(true);
      expect(await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8")).toContain("observed-exit targetPid=999999");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("force-stops a pid after the updater grace expires", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-timeout-"));
    const stop = vi.fn(async () => processStop(4242)) as unknown as typeof stopProcesses;
    try {
      await expect(waitForLauncherAfterQuit({ targetPid: 4242, timeoutMs: 1 }, fakePaths(root), console, {
        stopProcesses: stop, waitForExit: (async () => false) as typeof waitForProcessExit,
      })).resolves.toBe(true);
      expect(stop).toHaveBeenCalledWith([4242]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("inspectExistingDesktopForLauncher", () => {
  it("continues when no stamped desktop answers", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-inspect-"));
    try {
      await expect(inspectExistingDesktopForLauncher(stamp(), {
        getStatus: vi.fn(async () => { throw new Error("not running"); }), paths: fakePaths(root),
      })).resolves.toEqual({ action: "continue", reason: "inspect-failed" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("focuses a healthy desktop through the business invoke boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-focus-"));
    const invoke = vi.fn(async () => ({ accepted: true }));
    try {
      await expect(inspectExistingDesktopForLauncher(stamp(), {
        deeplinkUrl: "opendesign://invite",
        getStatus: vi.fn(async (target: SidecarStamp) => target.app === APP_KEYS.DESKTOP
          ? { pid: 1234, state: "running", updatedAt: new Date().toISOString(), windowVisible: true }
          : { state: "running", url: "http://127.0.0.1:1234" }) as never,
        invoke: invoke as never, paths: fakePaths(root),
      })).resolves.toEqual({ action: "exit", reason: "existing-focused" });
      expect(invoke).toHaveBeenCalledWith(stamp(), "show", { deeplinkUrl: "opendesign://invite" }, { timeoutMs: 800 });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("terminally stops a stale peer set before continuing", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-stale-"));
    const stop = vi.fn(async () => sidecarStop());
    try {
      await expect(inspectExistingDesktopForLauncher(stamp(), {
        getStatus: vi.fn(async (target: SidecarStamp) => {
          if (target.app === APP_KEYS.WEB) throw new Error("stale");
          return target.app === APP_KEYS.DESKTOP
            ? { pid: 1234, state: "running", updatedAt: new Date().toISOString(), windowVisible: true }
            : { state: "running", url: "http://127.0.0.1:1234" };
        }) as never,
        paths: fakePaths(root), stopSidecar: stop,
      })).resolves.toEqual({ action: "continue", reason: "stale-sidecar" });
      expect(stop).toHaveBeenCalledWith(stamp());
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("discovers a headless owner and checks its daemon and web peers in headless mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-headless-owner-"));
    const getStatus = vi.fn(async (target: SidecarStamp) => {
      if (target.app === APP_KEYS.DESKTOP && target.mode === "runtime") throw new Error("runtime desktop absent");
      if (target.app === APP_KEYS.DESKTOP && target.mode === "headless") {
        return { pid: 4321, state: "running", updatedAt: new Date().toISOString(), windowVisible: false };
      }
      if (target.mode !== "headless") throw new Error("peer did not use the desktop owner mode");
      return { state: "running", url: "http://127.0.0.1:1234" };
    });
    const stop = vi.fn(async () => sidecarStop(4321));
    try {
      await expect(inspectExistingDesktopForLauncher(stamp(), {
        getStatus: getStatus as never,
        paths: fakePaths(root),
        stopSidecar: stop,
      })).resolves.toEqual({ action: "continue", reason: "headless-owner" });
      expect(getStatus).toHaveBeenCalledWith({ ...stamp(), mode: "headless" }, { timeoutMs: 350 });
      expect(getStatus).toHaveBeenCalledWith({ ...stamp(), app: APP_KEYS.DAEMON, mode: "headless" }, { timeoutMs: 350 });
      expect(getStatus).toHaveBeenCalledWith({ ...stamp(), app: APP_KEYS.WEB, mode: "headless" }, { timeoutMs: 350 });
      expect(stop).toHaveBeenCalledWith({ ...stamp(), mode: "headless" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reuses a healthy same-mode headless generation instead of restarting it", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-existing-headless-"));
    const headlessStamp = { ...stamp(), mode: "headless" as const };
    const stop = vi.fn(async () => sidecarStop(4321));
    try {
      await expect(inspectExistingDesktopForLauncher(headlessStamp, {
        getStatus: vi.fn(async (target: SidecarStamp) => {
          if (target.mode !== "headless") throw new Error("generation peer mode mismatch");
          return target.app === APP_KEYS.DESKTOP
            ? { pid: 4321, state: "running", updatedAt: new Date().toISOString(), windowVisible: false }
            : { state: "running", url: "http://127.0.0.1:1234" };
        }) as never,
        modes: ["headless"],
        paths: fakePaths(root),
        stopSidecar: stop,
      })).resolves.toEqual({ action: "exit", reason: "existing-headless" });
      expect(stop).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("finds and reuses a packaged headless owner for a tools-pack headless request", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-cross-source-headless-"));
    const requestedStamp = { ...stamp(), mode: "headless", source: SIDECAR_SOURCES.TOOLS_PACK } satisfies SidecarStamp;
    const ownerStamp = { ...requestedStamp, source: SIDECAR_SOURCES.PACKAGED };
    const getStatus = vi.fn(async (target: SidecarStamp) => {
      if (target.source === SIDECAR_SOURCES.TOOLS_PACK) throw new Error("tools-pack owner absent");
      return target.app === APP_KEYS.DESKTOP
        ? { pid: 4321, state: "running", updatedAt: new Date().toISOString(), windowVisible: false }
        : { state: "running", url: "http://127.0.0.1:1234" };
    });
    const stop = vi.fn(async () => sidecarStop(4321));
    try {
      await expect(inspectExistingDesktopForLauncher(requestedStamp, {
        getStatus: getStatus as never,
        modes: ["headless"],
        paths: fakePaths(root),
        stopSidecar: stop,
      })).resolves.toEqual({ action: "exit", reason: "existing-headless" });
      expect(getStatus).toHaveBeenCalledWith(ownerStamp, { timeoutMs: 350 });
      expect(getStatus).toHaveBeenCalledWith({ ...ownerStamp, app: APP_KEYS.DAEMON }, { timeoutMs: 350 });
      expect(getStatus).toHaveBeenCalledWith({ ...ownerStamp, app: APP_KEYS.WEB }, { timeoutMs: 350 });
      expect(stop).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("finds and focuses a packaged GUI owner for a tools-pack GUI request", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-launcher-cross-source-gui-"));
    const requestedStamp = { ...stamp(), source: SIDECAR_SOURCES.TOOLS_PACK } satisfies SidecarStamp;
    const ownerStamp = { ...requestedStamp, source: SIDECAR_SOURCES.PACKAGED };
    const invoke = vi.fn(async () => ({ accepted: true }));
    try {
      await expect(inspectExistingDesktopForLauncher(requestedStamp, {
        getStatus: vi.fn(async (target: SidecarStamp) => {
          if (target.source === SIDECAR_SOURCES.TOOLS_PACK) throw new Error("tools-pack owner absent");
          return target.app === APP_KEYS.DESKTOP
            ? { pid: 1234, state: "running", updatedAt: new Date().toISOString(), windowVisible: true }
            : { state: "running", url: "http://127.0.0.1:1234" };
        }) as never,
        invoke: invoke as never,
        modes: ["runtime"],
        paths: fakePaths(root),
      })).resolves.toEqual({ action: "exit", reason: "existing-focused" });
      expect(invoke).toHaveBeenCalledWith(ownerStamp, "show", {}, { timeoutMs: 800 });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

it("exits Electron only for an existing desktop result", () => {
  const exit = vi.fn();
  expect(exitPackagedLauncherForExistingDesktop({ action: "exit", reason: "existing-focused" }, exit)).toBe(true);
  expect(exit).toHaveBeenCalledWith(0);
});
