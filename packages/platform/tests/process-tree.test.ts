import { describe, expect, it } from "vitest";

import {
  collectProcessTreePids,
  processCommandExactlyRunsExecutable,
  type ProcessSnapshot,
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
  });
});
