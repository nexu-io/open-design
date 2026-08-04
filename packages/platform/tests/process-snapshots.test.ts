import { afterEach, describe, expect, it, vi } from "vitest";

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { configurable: true, value });
}

afterEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  vi.doUnmock("node:child_process");
  vi.resetModules();
});

describe("readProcessSnapshots Windows creation dates", () => {
  it("parses PowerShell 5.1 /Date(ms)/ CreationDate snapshots", async () => {
    setPlatform("win32");
    const createdAt = Date.UTC(2026, 0, 2, 3, 4, 5, 678);
    const execFile = vi.fn(((
      _file: string,
      _args: string[],
      _options: { encoding: string; maxBuffer: number },
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(null, JSON.stringify({
        CommandLine: "node.exe",
        CreationDate: `/Date(${createdAt})/`,
        ParentProcessId: 1,
        ProcessId: 123,
      }));
    }) as typeof import("node:child_process").execFile);

    vi.doMock("node:child_process", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:child_process")>()),
      execFile,
    }));

    const { readProcessSnapshots } = await import("../src/process.js");

    await expect(readProcessSnapshots()).resolves.toEqual({
      ok: true,
      processes: [{
        command: "node.exe",
        createdAt,
        pid: 123,
        ppid: 1,
      }],
    });
  });

  it.skipIf(process.platform !== "win32")("reports a finite createdAt for the current Windows process", async () => {
    const { readProcessSnapshots } = await import("../src/index.js");

    const observation = await readProcessSnapshots();
    const currentProcess = observation.processes.find((processInfo) => processInfo.pid === process.pid);

    expect(observation.ok).toBe(true);
    expect(currentProcess?.createdAt).toEqual(expect.any(Number));
    expect(Number.isFinite(currentProcess?.createdAt)).toBe(true);
  });
});
