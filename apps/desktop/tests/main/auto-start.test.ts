/**
 * Regression tests for the auto-start registry write in
 * `apps/desktop/src/main/auto-start.ts`.
 *
 * NOTE on backslashes: regular template literals process `\X` as
 * `X` (the backslash is dropped), so the test sources use
 * `String.raw` for paths that contain backslashes. A literal
 * `\\.\pipe\…` in a normal template would arrive at the function
 * as `.pipe…` — already wrong before the function even ran.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

const mockedExecFile = vi.mocked(execFile);

// Module-level mock state. Tests mutate these instead of resetting
// `mockedExecFile` between assertions — one impl, one cast, all
// the per-test behavior differences ride on these two variables.
let mockStdout = "OpenDesign\n";
let mockError: Error | null = null;

const autoStart = await import("../../src/main/auto-start.js");

interface RegAddCall {
  args: readonly string[];
}

function regAddCalls(): RegAddCall[] {
  return mockedExecFile.mock.calls
    .filter((call) => call[0] === "reg.exe")
    .map((call) => ({ args: call[1] as readonly string[] }));
}

function regAddCall(): RegAddCall {
  const adds = regAddCalls();
  expect(adds.length).toBeGreaterThan(0);
  return adds[adds.length - 1]!;
}

beforeEach(() => {
  mockedExecFile.mockReset();
  mockStdout = "OpenDesign\n";
  mockError = null;
  // Default impl: any reg call returns success. `isAutoStartEnabled`
  // inspects stdout to determine whether the product name appears;
  // `mockStdout` defaults to the product name and `mockError` is
  // null, so the success path is "key exists, enabled = true".
  mockedExecFile.mockImplementation(((cmd: string, args: readonly string[], _opts: unknown, callback: unknown) => {
    if (cmd !== "reg.exe" || typeof callback !== "function") return undefined;
    if (mockError) {
      (callback as (err: Error) => void)(mockError);
    } else {
      const isQuery = args.includes("query");
      (callback as (err: null, stdout: string, stderr: string) => void)(null, isQuery ? mockStdout : "", "");
    }
    return undefined;
  }) as never);
});

describe("auto-start registry write (Windows path)", () => {
  it("preserves the literal `start \"\" /b` empty window title", async () => {
    await autoStart.enableAutoStart("default", String.raw`\\.\pipe\open-design-default-desktop`);

    const value = regAddCall().args[regAddCall().args.indexOf("/d") + 1]!;
    // The empty title token MUST appear between `start` and `/b`.
    // Without it, cmd parses the first unquoted token as a window
    // title and the real command never executes.
    expect(value).toContain(`start "" /b`);
  });

  it("doubles backslashes in the IPC path so reg add stores the UNC `\\\\.\\pipe\\…` form", async () => {
    await autoStart.enableAutoStart("default", String.raw`\\.\pipe\open-design-default-desktop`);

    const value = regAddCall().args[regAddCall().args.indexOf("/d") + 1]!;
    // `/d` value carries 4 backslashes before `.`; reg collapses to
    // 2 in storage. Naive implementation would pass 2, store 1.
    expect(value).toContain(String.raw`--od-stamp-ipc="\\\\.\\pipe\\open-design-default-desktop"`);
  });

  it("writes the registry under the OD_APP_NAME product name (default `OpenDesign`)", async () => {
    await autoStart.enableAutoStart("default", String.raw`\\.\pipe\open-design-default-desktop`);

    const args = regAddCall().args;
    const vIdx = args.indexOf("/v");
    expect(args[vIdx + 1]).toBe("OpenDesign");
    expect(args).toContain("/t");
    expect(args[args.indexOf("/t") + 1]).toBe("REG_SZ");
    expect(args).toContain("/f");
  });

  it("escapes backslashes in namespace too", async () => {
    await autoStart.enableAutoStart(String.raw`c:\work\default`, String.raw`\\.\pipe\open-design-default-desktop`);

    const value = regAddCall().args[regAddCall().args.indexOf("/d") + 1]!;
    expect(value).toContain(String.raw`--od-stamp-namespace="c:\\work\\default"`);
  });

  it("isAutoStartEnabled reports true when the product name is in the reg query stdout", async () => {
    const enabled = await autoStart.isAutoStartEnabled();
    expect(enabled).toBe(true);
  });

  it("isAutoStartEnabled returns false when reg query stdout does not mention the product name", async () => {
    mockStdout = "";
    const enabled = await autoStart.isAutoStartEnabled();
    expect(enabled).toBe(false);
  });

  it("isAutoStartEnabled treats reg query's nonzero exit (e.g. key not found) as 'not enabled' rather than throwing", async () => {
    // reg query exits level 1 when the key is missing; the auto-start
    // helper should swallow that into `false` so the tray UI doesn't
    // flash an error on a fresh install.
    mockError = Object.assign(new Error("The system was unable to find the specified registry key or value."), {
      code: 1,
    });
    const enabled = await autoStart.isAutoStartEnabled();
    expect(enabled).toBe(false);
  });
});
