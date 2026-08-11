import { describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFile,
}));

const { listProcessSnapshots } = await import("../src/process.js");

describe("listProcessSnapshots", () => {
  it("bounds Windows process enumeration and parses the resulting snapshot", async () => {
    execFile.mockImplementationOnce((...args: unknown[]) => {
      const commandArgs = args[1] as string[];
      const options = args[2] as { timeout?: number };
      const callback = args[3] as (error: Error | null, stdout: string) => void;
      expect(commandArgs.at(-1)).toContain("Get-CimInstance Win32_Process -OperationTimeoutSec 1");
      expect(options.timeout).toBe(37);
      callback(null, JSON.stringify({ CommandLine: "Open Design.exe", ParentProcessId: 1, ProcessId: 42 }));
      return undefined;
    });

    await expect(listProcessSnapshots({ platform: "win32", timeoutMs: 37 })).resolves.toEqual([
      { command: "Open Design.exe", pid: 42, ppid: 1 },
    ]);
  });

  it("fails closed to an empty snapshot after the bounded command errors", async () => {
    execFile.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[3] as (error: Error, stdout: string) => void;
      callback(new Error("process enumeration timed out"), "");
      return undefined;
    });

    await expect(listProcessSnapshots({ platform: "win32", timeoutMs: 1 })).resolves.toEqual([]);
  });
});
