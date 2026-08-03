import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectOwnedProcessTreePids,
  collectProcessTreePids,
  processCommandExactlyRunsExecutable,
  terminateOwnedProcessTree,
  type OwnedProcessIdentity,
  type ProcessSnapshot,
  type ProcessSnapshotObservation,
} from "../src/index.js";

function snapshot(pid: number, ppid: number, command = `pid-${pid}`): ProcessSnapshot {
  return { command, pid, ppid };
}

describe("collectProcessTreePids", () => {
  it("returns an empty array when no roots are supplied", () => {
    expect(collectProcessTreePids([snapshot(100, 1), snapshot(101, 100)], [])).toEqual([]);
    expect(collectProcessTreePids([], [null, undefined])).toEqual([]);
  });

  it("returns a single root with no descendants", () => {
    expect(collectProcessTreePids([snapshot(101, 1)], [100])).toEqual([100]);
  });

  it("walks two levels of descendants and sorts pids descending", () => {
    const processes = [
      snapshot(100, 1),
      snapshot(200, 100),
      snapshot(201, 100),
      snapshot(300, 200),
    ];
    expect(collectProcessTreePids(processes, [100])).toEqual([300, 201, 200, 100]);
  });

  it("returns the root even when no matching ppid exists in the process list", () => {
    expect(collectProcessTreePids([snapshot(500, 1)], [100])).toEqual([100]);
  });

  it("dedupes repeated root pids", () => {
    expect(collectProcessTreePids([snapshot(200, 100)], [100, 100])).toEqual([200, 100]);
  });

  it("terminates on parent-child cycles instead of looping forever", () => {
    const processes = [snapshot(100, 200), snapshot(200, 100)];
    expect(collectProcessTreePids(processes, [100])).toEqual([200, 100]);
  });
});

describe("collectOwnedProcessTreePids", () => {
  const owner = (pid: number, createdAt: number): OwnedProcessIdentity => ({ pid, createdAt });

  it("includes descendants after the captured parent has exited", () => {
    const processes = [
      { ...snapshot(200, 100), createdAt: 20 },
      { ...snapshot(300, 200), createdAt: 30 },
    ];

    expect(collectOwnedProcessTreePids(processes, owner(100, 10))).toEqual([300, 200]);
  });

  it("rejects a reused root PID instead of targeting its new process tree", () => {
    const processes = [
      { ...snapshot(100, 1), createdAt: 99 },
      { ...snapshot(200, 100), createdAt: 100 },
    ];

    expect(collectOwnedProcessTreePids(processes, owner(100, 10))).toEqual([]);
  });

  it("orders descendants before their parents instead of relying on PID order", () => {
    const processes = [
      { ...snapshot(100, 1), createdAt: 10 },
      { ...snapshot(500, 100), createdAt: 20 },
      { ...snapshot(101, 500), createdAt: 30 },
    ];

    expect(collectOwnedProcessTreePids(processes, owner(100, 10))).toEqual([101, 500, 100]);
  });
});

describe("terminateOwnedProcessTree observation failures", () => {
  const root: OwnedProcessIdentity = { pid: 100, createdAt: 10 };
  const liveTree: ProcessSnapshot[] = [
    { ...snapshot(100, 1), createdAt: 10 },
    { ...snapshot(200, 100), createdAt: 20 },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function observations(...results: ProcessSnapshotObservation[]) {
    const reader = vi.fn();
    for (const result of results) reader.mockResolvedValueOnce(result);
    return reader;
  }

  it.each([
    {
      name: "initial observation",
      snapshotReader: observations({ ok: false, processes: [] }),
      signals: [],
    },
    {
      name: "grace polling",
      snapshotReader: observations(
        { ok: true, processes: liveTree },
        { ok: false, processes: [] },
      ),
      signals: ["SIGTERM"],
    },
    {
      name: "final observation",
      snapshotReader: observations(
        { ok: true, processes: liveTree },
        { ok: true, processes: liveTree },
        { ok: false, processes: [] },
      ),
      signals: ["SIGTERM", "SIGKILL"],
    },
  ])("does not verify quiescence when $name fails", async ({ snapshotReader, signals }) => {
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);

    const result = await terminateOwnedProcessTree(root, {
      graceMs: 0,
      forceWaitMs: 0,
      readSnapshots: snapshotReader,
    });

    expect(result).toMatchObject({
      childTreeQuiescent: false,
      identityVerified: false,
      remainingPids: [],
    });
    expect([...new Set(kill.mock.calls.map(([, signal]) => signal))]).toEqual(signals);
  });
});

describe("processCommandExactlyRunsExecutable", () => {
  it("accepts exact POSIX and quoted Windows executable commands", () => {
    expect(processCommandExactlyRunsExecutable(
      "/Applications/Open Design.app/Contents/MacOS/Open Design",
      "/Applications/Open Design.app/Contents/MacOS/Open Design",
      "darwin",
    )).toBe(true);
    expect(processCommandExactlyRunsExecutable(
      '"C:\\Program Files\\Open Design\\Open Design.exe"',
      "C:\\Program Files\\Open Design\\Open Design.exe",
      "win32",
    )).toBe(true);
  });

  it("rejects arguments and lookalike executable prefixes", () => {
    const executable = "/Applications/Open Design.app/Contents/MacOS/Open Design";
    expect(processCommandExactlyRunsExecutable(`${executable} --inspect`, executable, "darwin")).toBe(false);
    expect(processCommandExactlyRunsExecutable(`${executable} Helper`, executable, "darwin")).toBe(false);

    const windowsExecutable = "C:\\Program Files\\Open Design\\Open Design.exe";
    expect(processCommandExactlyRunsExecutable(
      `"${windowsExecutable}" od://project/123`,
      windowsExecutable,
      "win32",
    )).toBe(false);
    expect(processCommandExactlyRunsExecutable(
      `"${windowsExecutable}.old"`,
      windowsExecutable,
      "win32",
    )).toBe(false);
  });

  it("compares Windows executable paths case-insensitively", () => {
    expect(processCommandExactlyRunsExecutable(
      '"C:\\PROGRAM FILES\\OPEN DESIGN\\OPEN DESIGN.EXE"',
      "c:\\Program Files\\Open Design\\Open Design.exe",
      "win32",
    )).toBe(true);
  });
});
