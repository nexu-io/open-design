import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { parseLauncherAfterQuitArgs, parseLauncherDelegatedArgs } from "@open-design/launcher-proto";
import { readProcessStamp } from "@open-design/platform";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import type { PackagedLauncherRuntime } from "../src/launcher-runtime.js";
import {
  launchPackagedPayloadDesktop,
  planPackagedPayloadDesktopDelegation,
} from "../src/payload-desktop-launch.js";

const stamp: SidecarStamp = {
  app: APP_KEYS.DESKTOP,
  ipc: "/tmp/open-design/ipc/release-beta/desktop.sock",
  mode: SIDECAR_MODES.RUNTIME,
  namespace: "release-beta",
  source: SIDECAR_SOURCES.PACKAGED,
};

function fakeRuntime(payloadDesktopProcess: boolean): PackagedLauncherRuntime {
  return {
    config: {} as PackagedLauncherRuntime["config"],
    desktopExecutablePath: "/tmp/payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
    descriptor: {} as PackagedLauncherRuntime["descriptor"],
    electronNodeCommand: null,
    installedLaunchPath: "/Applications/Open Design Beta.app",
    launcherPaths: {} as PackagedLauncherRuntime["launcherPaths"],
    paths: {} as PackagedLauncherRuntime["paths"],
    payloadDesktopProcess,
    selection: {
      pointer: { generation: 1, version: "1.2.3-beta.5" },
      reason: "active",
      selected: true,
    },
    source: "payload",
    targetVersion: "1.2.3-beta.5",
  };
}

describe("payload desktop delegation", () => {
  it("plans an early outer-to-payload handoff with stable after-quit and stamp args", () => {
    const runtime = fakeRuntime(false);
    const plan = planPackagedPayloadDesktopDelegation(runtime, stamp, {
      currentPid: 4321,
      timeoutMs: 60_000,
    });

    expect(plan).toEqual(expect.objectContaining({
      command: runtime.desktopExecutablePath,
      cwd: dirname(runtime.desktopExecutablePath ?? ""),
    }));
    expect(parseLauncherAfterQuitArgs(plan?.args ?? [])).toEqual({
      targetPid: 4321,
      timeoutMs: 60_000,
    });
    expect(readProcessStamp(plan?.args ?? [], OPEN_DESIGN_SIDECAR_CONTRACT)).toEqual(stamp);
  });

  it("carries the delegated pointer for a normal active delegation", () => {
    const plan = planPackagedPayloadDesktopDelegation(fakeRuntime(false), stamp, {
      currentPid: 4321,
      timeoutMs: 60_000,
    });
    expect(parseLauncherDelegatedArgs(plan?.args ?? [])).toEqual({
      generation: 1,
      version: "1.2.3-beta.5",
    });
  });

  it("omits the delegated pointer for a rollback delegation", () => {
    // A last-successful delegation is driven by rollback evidence in
    // attempt.json; marking it delegated (or re-arming) would let the spawned
    // payload re-select the broken active generation.
    const runtime: PackagedLauncherRuntime = {
      ...fakeRuntime(false),
      selection: {
        pointer: { generation: 0, version: "1.2.3-beta.4" },
        reason: "last-successful",
        selected: true,
      },
    };
    const plan = planPackagedPayloadDesktopDelegation(runtime, stamp, {
      currentPid: 4321,
      timeoutMs: 60_000,
    });
    expect(plan).not.toBeNull();
    expect(parseLauncherDelegatedArgs(plan?.args ?? [])).toBeNull();
  });

  it("pre-arms the launch attempt before spawning the delegated payload", async () => {
    // A payload that dies before reaching its own bookkeeping must still
    // leave rollback evidence — the parent arms attempt.json BEFORE spawn so
    // the next cold start rolls back instead of retrying the broken payload
    // forever.
    const root = await mkdtemp(join(tmpdir(), "od-delegated-arm-"));
    try {
      const attemptsPath = join(root, "state", "attempt.json");
      const runtime: PackagedLauncherRuntime = {
        ...fakeRuntime(false),
        launcherPaths: {
          attemptsPath,
          channel: "beta",
          namespace: "release-beta",
        } as PackagedLauncherRuntime["launcherPaths"],
      };
      let spawnSawAttempt: boolean | null = null;
      const child = {
        once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "spawn") queueMicrotask(callback);
          return child;
        }),
        unref: vi.fn(),
      };
      const spawnFake = vi.fn(() => {
        spawnSawAttempt = existsSync(attemptsPath);
        return child as never;
      });

      const launched = await launchPackagedPayloadDesktop(runtime, stamp, { spawn: spawnFake as never });

      expect(launched).toBe(true);
      expect(spawnSawAttempt).toBe(true);
      const attempt = JSON.parse(await readFile(attemptsPath, "utf8")) as Record<string, unknown>;
      expect(attempt).toMatchObject({
        channel: "beta",
        generation: 1,
        namespace: "release-beta",
        version: "1.2.3-beta.5",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not pre-arm a rollback delegation", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-delegated-rollback-"));
    try {
      const attemptsPath = join(root, "state", "attempt.json");
      const runtime: PackagedLauncherRuntime = {
        ...fakeRuntime(false),
        launcherPaths: {
          attemptsPath,
          channel: "beta",
          namespace: "release-beta",
        } as PackagedLauncherRuntime["launcherPaths"],
        selection: {
          pointer: { generation: 0, version: "1.2.3-beta.4" },
          reason: "last-successful",
          selected: true,
        },
      };
      const child = {
        once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "spawn") queueMicrotask(callback);
          return child;
        }),
        unref: vi.fn(),
      };

      await launchPackagedPayloadDesktop(runtime, stamp, { spawn: vi.fn(() => child as never) as never });

      expect(existsSync(attemptsPath)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not delegate once the current process already is the payload desktop", () => {
    expect(planPackagedPayloadDesktopDelegation(fakeRuntime(true), stamp, {
      currentPid: 4321,
      timeoutMs: 60_000,
    })).toBeNull();
  });

  it("waits for spawn acceptance and detaches the payload child", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-delegated-spawn-"));
    try {
      const once = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        if (event === "spawn") queueMicrotask(callback);
        return child;
      });
      const child = {
        once,
        unref: vi.fn(),
      };
      const spawn = vi.fn(() => child);
      const runtime: PackagedLauncherRuntime = {
        ...fakeRuntime(false),
        launcherPaths: {
          attemptsPath: join(root, "state", "attempt.json"),
          channel: "beta",
          namespace: "release-beta",
        } as PackagedLauncherRuntime["launcherPaths"],
      };

      const delegated = await launchPackagedPayloadDesktop(runtime, stamp, {
        currentPid: 4321,
        spawn: spawn as never,
        timeoutMs: 60_000,
      });

      expect(delegated).toBe(true);
      expect(spawn).toHaveBeenCalledOnce();
      expect(child.unref).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("records a failed attempt when the payload executable cannot spawn", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-payload-desktop-spawn-failure-"));
    const runtime = fakeRuntime(false);
    runtime.launcherPaths = {
      attemptsPath: join(root, "state", "attempt.json"),
      channel: "beta",
      namespace: "release-beta",
    } as PackagedLauncherRuntime["launcherPaths"];
    const spawnError = new Error("spawn EACCES");
    const child = {
      once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        if (event === "error") queueMicrotask(() => callback(spawnError));
        return child;
      }),
      unref: vi.fn(),
    };
    try {
      await expect(launchPackagedPayloadDesktop(runtime, stamp, {
        spawn: vi.fn(() => child) as never,
      })).rejects.toThrow("spawn EACCES");

      expect(JSON.parse(await readFile(runtime.launcherPaths.attemptsPath, "utf8"))).toMatchObject({
        channel: "beta",
        generation: 1,
        namespace: "release-beta",
        schemaVersion: 1,
        version: "1.2.3-beta.5",
      });
      expect(child.unref).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
