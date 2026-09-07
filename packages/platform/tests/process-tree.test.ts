import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  collectProcessTreePids,
  processCommandExactlyRunsExecutable,
  stopProcesses,
  type ProcessStampContract,
  type ProcessSnapshot,
  waitForProcessExit,
} from "../src/index.js";
import { parseWindowsProcessSnapshots, selectStampedProcessesAtInvocation } from "../src/process.js";

function snapshot(pid: number, ppid: number, command = `pid-${pid}`): ProcessSnapshot {
  return { command, pid, ppid };
}

type TestStamp = { namespace: string };

const stampContract: ProcessStampContract<TestStamp> = {
  normalizeStamp(input) {
    const namespace = (input as Partial<TestStamp>).namespace;
    if (typeof namespace !== "string" || namespace.length === 0) throw new Error("invalid namespace");
    return { namespace };
  },
  normalizeStampCriteria(input = {}) {
    const namespace = (input as Partial<TestStamp>).namespace;
    return namespace == null ? {} : { namespace };
  },
  stampFields: ["namespace"],
  stampFlags: { namespace: "--test-namespace" },
};

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

describe("selectStampedProcessesAtInvocation", () => {
  const command = "node fixture.js --test-namespace=alpha";

  it("keeps only matching Windows processes created before the invocation boundary", () => {
    expect(selectStampedProcessesAtInvocation([
      { command, pid: 100, ppid: 1, startedAtMs: 900 },
      { command, pid: 200, ppid: 1, startedAtMs: 1_100 },
      { command: "node unrelated.js", pid: 300, ppid: 1 },
    ], { namespace: "alpha" }, stampContract, 1_000, "win32")).toEqual([
      { command, pid: 100, ppid: 1, startedAtMs: 900 },
    ]);
  });

  it("quick-fails when a matching Windows process has an ambiguous creation boundary", () => {
    expect(() => selectStampedProcessesAtInvocation([
      { command, pid: 100, ppid: 1 },
    ], { namespace: "alpha" }, stampContract, 1_000, "win32")).toThrow(
      "cannot establish process generation boundary for pid 100",
    );

    expect(() => selectStampedProcessesAtInvocation([
      { command, pid: 200, ppid: 1, startedAtMs: 1_000 },
    ], { namespace: "alpha" }, stampContract, 1_000, "win32")).toThrow(
      "cannot establish process generation boundary for pid 200",
    );
  });

  it("does not require Windows creation metadata from unrelated processes", () => {
    expect(selectStampedProcessesAtInvocation([
      { command: "node unrelated.js", pid: 300, ppid: 1 },
    ], { namespace: "alpha" }, stampContract, 1_000, "win32")).toEqual([]);
  });

});

describe("parseWindowsProcessSnapshots", () => {
  it("retains the OS creation time used by the generation boundary", () => {
    expect(parseWindowsProcessSnapshots(JSON.stringify({
      CommandLine: "node fixture.js",
      ParentProcessId: 10,
      ProcessId: 20,
      StartedAtMs: "1724490000123",
    }))).toEqual([{
      command: "node fixture.js",
      pid: 20,
      ppid: 10,
      startedAtMs: 1_724_490_000_123,
    }]);
  });

  it("leaves invalid creation metadata explicit for boundary quick-fail", () => {
    expect(parseWindowsProcessSnapshots(JSON.stringify({
      CommandLine: "node fixture.js",
      ParentProcessId: 10,
      ProcessId: 20,
      StartedAtMs: null,
    }))).toEqual([{ command: "node fixture.js", pid: 20, ppid: 10 }]);
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

describe("stopProcesses", () => {
  it.skipIf(process.platform === "win32")(
    "escalates to SIGKILL when a child ignores SIGTERM",
    async () => {
      const child = spawn(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>{});process.stdout.write('ready\\n');setInterval(()=>{},1000)",
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const pid = child.pid;
      if (pid == null) throw new Error("test child did not start");
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.stdout?.once("data", () => resolve());
      });

      try {
        const result = await stopProcesses([pid], {
          termGraceMs: 100,
          killGraceMs: 1_000,
        });
        expect(result.forcedPids).toContain(pid);
        expect(result.remainingPids).toEqual([]);
        expect(result.stoppedPids).toContain(pid);
      } finally {
        child.kill("SIGKILL");
        await waitForProcessExit(pid, 1_000);
      }
    },
    5_000,
  );
});
