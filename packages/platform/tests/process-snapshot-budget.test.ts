import { once } from "node:events";
import type { ChildProcess, ExecFileOptions, ExecFileOptionsWithStringEncoding } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "hang", child: undefined as ChildProcess | undefined,
  calls: [] as Array<{ command: string; options: ExecFileOptions }> }));
vi.mock("node:child_process", async (load) => {
  const actual = await load<typeof import("node:child_process")>();
  return { ...actual, execFile: ((command: string, _args: string[], options: ExecFileOptionsWithStringEncoding,
    callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    state.calls.push({ command, options });
    // Real bounded child, with the Windows query command intercepted only at
    // the OS launch boundary. No CIM claim is made by this cross-platform test.
    state.child = actual.execFile(process.execPath, ["-e", state.mode === "hang"
      ? "setInterval(() => {}, 1000)"
      : 'process.stdout.write(JSON.stringify([{ ProcessId: 80, ParentProcessId: 1, CommandLine: "owned", StartedAtMs: 1234 }]))'],
    options, callback);
    return state.child;
  }) as typeof actual.execFile };
});
import { captureProcessSnapshot } from "../src/process.js";

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(() => { Object.defineProperty(process, "platform", platformDescriptor); state.calls = []; });

describe("explicit Windows snapshot budget", () => {
  it("kills the actual query child and rejects within a caller-supplied budget", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    state.mode = "hang";
    const capture = captureProcessSnapshot as (options?: { timeoutMs: number }) => Promise<unknown>;
    const result = capture({ timeoutMs: 50 }).then(() => "resolved", () => "rejected");
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const observed = await Promise.race([result, new Promise<string>(resolve => {
        watchdog = setTimeout(() => resolve("still-pending"), 500);
      })]);
      expect(observed).toBe("rejected");
      expect(state.calls[0]?.command).toBe("powershell.exe");
      expect(state.child?.exitCode !== null || state.child?.signalCode !== null).toBe(true);
    } finally {
      clearTimeout(watchdog);
      if (state.child && state.child.exitCode === null && state.child.signalCode === null) {
        const closed = once(state.child, "close"); state.child.kill("SIGKILL"); await closed;
      }
      await result;
    }
  });

  it("keeps existing default callers and Windows parsing unchanged", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    state.mode = "success";
    expect(await captureProcessSnapshot()).toEqual([{ pid: 80, ppid: 1, command: "owned", startedAtMs: 1234 }]);
    expect(state.calls[0]?.options.timeout).toBeUndefined();
  });
});
