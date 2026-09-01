import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { parseLauncherAfterQuitArgs, parseLauncherDelegatedArgs } from "@open-design/launcher-proto";
import { describe, expect, it, vi } from "vitest";

import type { PackagedLauncherRuntime } from "../src/launcher-runtime.js";
import {
  findPackagedDeeplinkArg,
  launchPackagedPayloadDesktop,
  planPackagedPayloadDesktopDelegation,
} from "../src/payload-desktop-launch.js";

function fakeRuntime(payloadDesktopProcess: boolean): PackagedLauncherRuntime {
  return {
    config: {} as PackagedLauncherRuntime["config"],
    desktopExecutablePath: "/tmp/payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
    descriptor: {} as PackagedLauncherRuntime["descriptor"],
    electronNodeCommand: null,
    installedLaunchPath: "/Applications/Open Design Beta.app",
    launcherPaths: {} as PackagedLauncherRuntime["launcherPaths"],
    paths: { dataRoot: "/tmp/data", runtimeRoot: "/tmp/runtime" } as PackagedLauncherRuntime["paths"],
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
  it("plans the launcher handoff while leaving stamp serialization to sidecar", () => {
    const runtime = fakeRuntime(false);
    const plan = planPackagedPayloadDesktopDelegation(runtime, {
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
    expect(plan?.args.some((arg) => arg.startsWith("--od-sidecar-"))).toBe(false);
  });

  it("carries the delegated pointer for a normal active delegation", () => {
    const plan = planPackagedPayloadDesktopDelegation(fakeRuntime(false), {
      currentPid: 4321,
      timeoutMs: 60_000,
    });
    expect(parseLauncherDelegatedArgs(plan?.args ?? [])).toEqual({
      generation: 1,
      version: "1.2.3-beta.5",
    });
  });

  it("forwards only the OS invite URL across an outer-to-payload cold start", () => {
    const deeplink = "opendesign://workspace/invite/continue?nonce=payload-cold-start";
    expect(findPackagedDeeplinkArg(["Open Design.exe", "--unrelated", deeplink])).toBe(deeplink);
    expect(findPackagedDeeplinkArg(["Open Design.exe", "--unrelated"])).toBeNull();
    const plan = planPackagedPayloadDesktopDelegation(fakeRuntime(false), {
      currentPid: 4321,
      forwardedArgs: ["Open Design.exe", "--unrelated", deeplink],
      timeoutMs: 60_000,
    });

    expect(plan?.args).toContain(deeplink);
    expect(plan?.args).not.toContain("--unrelated");
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
    const plan = planPackagedPayloadDesktopDelegation(runtime, {
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
      const handoff = vi.fn(async () => {
        spawnSawAttempt = existsSync(attemptsPath);
      });

      const launched = await launchPackagedPayloadDesktop(runtime, { handoff });

      expect(launched).toBe(true);
      expect(spawnSawAttempt).toBe(true);
      const attempt = JSON.parse(await readFile(attemptsPath, "utf8")) as Record<string, unknown>;
      expect(attempt).toMatchObject({
        channel: "beta",
        generation: 1,
        namespace: "release-beta",
        version: "1.2.3-beta.5",
      });
      expect(handoff).toHaveBeenCalledWith(expect.objectContaining({
        command: runtime.desktopExecutablePath,
      }), { timeoutMs: 60_000 });
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
      await launchPackagedPayloadDesktop(runtime, {
        handoff: vi.fn(async () => undefined),
      });

      expect(existsSync(attemptsPath)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not delegate once the current process already is the payload desktop", () => {
    expect(planPackagedPayloadDesktopDelegation(fakeRuntime(true), {
      currentPid: 4321,
      timeoutMs: 60_000,
    })).toBeNull();
  });

  it("delegates the next child to the current sidecar generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-delegated-spawn-"));
    try {
      const handoff = vi.fn(async () => undefined);
      const runtime: PackagedLauncherRuntime = {
        ...fakeRuntime(false),
        launcherPaths: {
          attemptsPath: join(root, "state", "attempt.json"),
          channel: "beta",
          namespace: "release-beta",
        } as PackagedLauncherRuntime["launcherPaths"],
      };

      const delegated = await launchPackagedPayloadDesktop(runtime, {
        currentPid: 4321,
        handoff,
        timeoutMs: 60_000,
      });

      expect(delegated).toBe(true);
      expect(handoff).toHaveBeenCalledWith(expect.objectContaining({
        args: expect.any(Array),
        command: runtime.desktopExecutablePath,
        cwd: dirname(runtime.desktopExecutablePath ?? ""),
      }), { timeoutMs: 60_000 });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("records a failed attempt when the supervisor rejects the handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-payload-desktop-spawn-failure-"));
    const runtime = fakeRuntime(false);
    runtime.launcherPaths = {
      attemptsPath: join(root, "state", "attempt.json"),
      channel: "beta",
      namespace: "release-beta",
    } as PackagedLauncherRuntime["launcherPaths"];
    try {
      await expect(launchPackagedPayloadDesktop(runtime, {
        handoff: vi.fn(async () => { throw new Error("handoff rejected"); }),
      })).rejects.toThrow("handoff rejected");

      expect(JSON.parse(await readFile(runtime.launcherPaths.attemptsPath, "utf8"))).toMatchObject({
        channel: "beta",
        generation: 1,
        namespace: "release-beta",
        schemaVersion: 1,
        version: "1.2.3-beta.5",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
