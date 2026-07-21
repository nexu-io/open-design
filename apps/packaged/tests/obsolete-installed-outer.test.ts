import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProcessSnapshot, StopProcessesResult } from "@open-design/platform";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createObsoleteInstalledOuterRetirement,
} from "../src/obsolete-installed-outer.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createMacInstalledOuter(): Promise<{ executablePath: string; launchPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "od-obsolete-outer-"));
  roots.push(root);
  const launchPath = join(root, "Open Design.app");
  const executablePath = join(launchPath, "Contents", "MacOS", "Open Design");
  await mkdir(join(launchPath, "Contents", "MacOS"), { recursive: true });
  await writeFile(executablePath, "legacy outer", "utf8");
  return { executablePath, launchPath };
}

function snapshot(pid: number, ppid: number, command: string): ProcessSnapshot {
  return { command, pid, ppid };
}

function stopped(pids: number[]): StopProcessesResult {
  return {
    alreadyStopped: pids.length === 0,
    forcedPids: [],
    matchedPids: pids,
    remainingPids: [],
    stoppedPids: pids,
  };
}

function stopMock() {
  return vi.fn(async (pids: Array<number | null | undefined>) => stopped(
    pids.filter((pid): pid is number => pid != null),
  ));
}

describe("createObsoleteInstalledOuterRetirement", () => {
  it("stops only the exact installed outer root and its descendants", async () => {
    const { executablePath, launchPath } = await createMacInstalledOuter();
    const snapshots = [
      snapshot(101, 1, executablePath),
      snapshot(102, 101, `${launchPath}/Contents/Frameworks/Open Design Helper.app/Contents/MacOS/Open Design Helper`),
      snapshot(103, 102, "helper-child"),
      snapshot(104, 1, `${executablePath} Helper`),
      snapshot(105, 1, "/unrelated/Open Design"),
      snapshot(900, 1, "/payload/Open Design.app/Contents/MacOS/Open Design"),
    ];
    const stopProcesses = stopMock();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Open Design.app/Contents/MacOS/Open Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger,
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Open Design.app/Contents/MacOS/Open Design",
      platform: "darwin",
    }, {
      listProcessSnapshots: async () => snapshots,
      stopProcesses,
    });

    const result = await retire();

    expect(stopProcesses).toHaveBeenCalledExactlyOnceWith([103, 102, 101]);
    expect(result).toMatchObject({
      executablePath,
      rootPids: [101],
      status: "retired",
      treePids: [103, 102, 101],
    });
    expect(logger.info).toHaveBeenCalledWith(
      "retired obsolete installed outer",
      expect.objectContaining({ rootPids: [101], stoppedPids: [103, 102, 101] }),
    );
  });

  it("does nothing outside an exact payload desktop process", async () => {
    const { launchPath } = await createMacInstalledOuter();
    const listProcessSnapshots = vi.fn(async () => []);
    const stopProcesses = vi.fn(async () => stopped([]));
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/installed/Open Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: false,
      payloadExecutablePath: null,
      platform: "darwin",
    }, { listProcessSnapshots, stopProcesses });

    await expect(retire()).resolves.toMatchObject({ reason: "not-payload-desktop", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("stays disabled on Windows until the platform path is independently validated", async () => {
    const listProcessSnapshots = vi.fn(async () => []);
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "C:\\payload\\Open Design.exe",
      currentPid: 900,
      installedLaunchPath: "C:\\Program Files\\Open Design\\Open Design.exe",
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "C:\\payload\\Open Design.exe",
      platform: "win32",
    }, { listProcessSnapshots, stopProcesses });

    await expect(retire()).resolves.toMatchObject({ reason: "unsupported-platform", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("rejects a symlinked install executable before enumerating processes", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-obsolete-outer-symlink-"));
    roots.push(root);
    const launchPath = join(root, "Open Design.app");
    const executableDirectory = join(launchPath, "Contents", "MacOS");
    const target = join(root, "target");
    await mkdir(executableDirectory, { recursive: true });
    await writeFile(target, "not the installed executable", "utf8");
    await symlink(target, join(executableDirectory, "Open Design"));
    const listProcessSnapshots = vi.fn(async () => []);
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Open Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Open Design",
      platform: "darwin",
    }, { listProcessSnapshots, stopProcesses: async (pids) => stopped(pids.filter((pid): pid is number => pid != null)) });

    await expect(retire()).resolves.toMatchObject({ reason: "invalid-install-anchor", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
  });

  it("refuses to stop an outer tree that contains the current payload", async () => {
    const { executablePath, launchPath } = await createMacInstalledOuter();
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Open Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Open Design",
      platform: "darwin",
    }, {
      listProcessSnapshots: async () => [
        snapshot(101, 1, executablePath),
        snapshot(800, 101, "handoff daemon"),
        snapshot(900, 800, "/payload/Open Design"),
        snapshot(901, 900, "payload helper"),
      ],
      stopProcesses,
    });

    await expect(retire()).resolves.toMatchObject({
      reason: "unsafe-current-descendant",
      status: "skipped",
    });
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("coalesces concurrent retirement requests without suppressing later opens", async () => {
    const { executablePath, launchPath } = await createMacInstalledOuter();
    let releaseEnumeration: (() => void) | undefined;
    const listProcessSnapshots = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseEnumeration = resolve;
      });
      return [snapshot(101, 1, executablePath)];
    });
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Open Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Open Design",
      platform: "darwin",
    }, { listProcessSnapshots, stopProcesses });

    const first = retire();
    const concurrent = retire();
    await vi.waitFor(() => expect(releaseEnumeration).toBeTypeOf("function"));
    releaseEnumeration?.();
    await Promise.all([first, concurrent]);
    expect(listProcessSnapshots).toHaveBeenCalledTimes(1);

    const later = retire();
    await vi.waitFor(() => expect(listProcessSnapshots).toHaveBeenCalledTimes(2));
    releaseEnumeration?.();
    await later;
  });
});
