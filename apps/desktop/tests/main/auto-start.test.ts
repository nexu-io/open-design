/**
 * Regression tests for the auto-start registry write in
 * `apps/desktop/src/main/auto-start.ts`.
 *
 * Two bugs were uncovered together and they're both covered here so
 * neither can silently regress:
 *
 *  1. The `start "" /b` literal was being collapsed to `start  /b` by
 *     a previous `args.join(" ")` call. The current code uses a template
 *     literal so the empty window title is preserved. Verify the
 *     literal `""` survives the build.
 *  2. `reg add` interprets `\\` as `\` on write, so a Windows UNC IPC
 *     path like `\\.\pipe\…` (which must reach the child process as
 *     TWO literal backslashes) has to be passed as FOUR backslashes.
 *     Without the `escapeForRegAddValue` doubling, the registry stored
 *     `\.\pipe\…` and the child process received a malformed
 *     `--od-stamp-ipc` arg — which broke the sidecar IPC layer and
 *     made the auto-started desktop hang at boot.
 *
 * The tests pin the value passed to `reg add /d` (via a mocked
 * `execFile`) so any future change to the escaping — or a
 * reintroduced `args.join` — fails loudly here instead of in
 * production at login time.
 *
 * NOTE on backslashes: regular template literals process `\X` as
 * `X` (the backslash is dropped), so the test sources use
 * `String.raw` for paths that contain backslashes. A literal
 * `\\.\pipe\…` in a normal template would arrive at the function
 * as `.pipe…` — already wrong before the function even ran.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

import { execFile } from "node:child_process";

const mockedExecFile = vi.mocked(execFile);

async function importFresh() {
  vi.resetModules();
  return await import("../../src/main/auto-start.js");
}

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
  // Default impl: any reg call returns success. `isAutoStartEnabled`
  // inspects stdout to determine whether the product name appears,
  // so make stdout report "OpenDesign" by default.
  mockedExecFile.mockImplementation(
    ((_cmd: string, args: readonly string[], _opts: unknown, callback: unknown) => {
      if (typeof callback === "function") {
        const isQuery = args.includes("query");
        const stdout = isQuery ? "OpenDesign\n" : "";
        (callback as (err: null, stdout: string, stderr: string) => void)(null, stdout, "");
      }
      return undefined;
    }) as never,
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("auto-start registry write (Windows path)", () => {
  it("preserves the literal `start \"\" /b` empty window title", async () => {
    const { enableAutoStart } = await importFresh();
    await enableAutoStart("default", String.raw`\\.\pipe\open-design-default-desktop`);

    const call = regAddCall();
    const value = call.args[call.args.indexOf("/d") + 1]!;
    // The empty title token MUST appear between `start` and `/b`.
    // The first version of this code used `args.join(" ")` and
    // collapsed it; the rewrite uses a template literal precisely
    // because cmd parses the first unquoted token after `start` as
    // the window title and would silently consume `/b` (or worse,
    // `electron.exe`) as a label.
    expect(value).toContain(`start "" /b`);
  });

  it("doubles backslashes in the IPC path so reg add stores the UNC `\\\\.\\pipe\\…` form", async () => {
    const { enableAutoStart } = await importFresh();
    // Two backslashes is the canonical Windows UNC pipe path. The
    // runtime (sidecar-proto) hands it to us with two backslashes
    // and we MUST preserve those two when writing to the registry,
    // because `reg add` collapses `\\` to `\` on the way in. To
    // round-trip a 2-backslash value we pass 4 backslashes to reg.
    await enableAutoStart("default", String.raw`\\.\pipe\open-design-default-desktop`);

    const call = regAddCall();
    const value = call.args[call.args.indexOf("/d") + 1]!;
    // The `/d` value we hand to reg.exe contains 4 backslashes in
    // a row before `.` (which reg then collapses to 2 in the
    // registry). A naive implementation would pass only 2 (and
    // the registry would store only 1), which is exactly the
    // boot loop this guards against.
    expect(value).toContain(String.raw`--od-stamp-ipc="\\\\.\\pipe\\open-design-default-desktop"`);
  });

  it("writes the registry under the OD_APP_NAME product name (default `OpenDesign`)", async () => {
    const { enableAutoStart } = await importFresh();
    await enableAutoStart("default", String.raw`\\.\pipe\open-design-default-desktop`);

    const call = regAddCall();
    const vIdx = call.args.indexOf("/v");
    expect(call.args[vIdx + 1]).toBe("OpenDesign");
    expect(call.args).toContain("/t");
    expect(call.args[call.args.indexOf("/t") + 1]).toBe("REG_SZ");
    expect(call.args).toContain("/f");
  });

  it("doubles backslashes in the namespace too (defense in depth for future path-style namespaces)", async () => {
    const { enableAutoStart } = await importFresh();
    // A Windows path-style namespace like `c:\work\default` is not
    // used today, but the doubling is cheap and protects against
    // the same reg-escape bug biting later. Three backslashes in
    // the input become six backslashes in the captured value (each
    // one doubled), which is what `reg add` then collapses back
    // down to three in the registry.
    await enableAutoStart(String.raw`c:\work\default`, String.raw`\\.\pipe\open-design-default-desktop`);

    const call = regAddCall();
    const value = call.args[call.args.indexOf("/d") + 1]!;
    expect(value).toContain(String.raw`--od-stamp-namespace="c:\\work\\default"`);
  });

  it("isAutoStartEnabled reports true when the product name is in the reg query stdout", async () => {
    const { isAutoStartEnabled } = await importFresh();
    const enabled = await isAutoStartEnabled();
    expect(enabled).toBe(true);
  });

  it("isAutoStartEnabled returns false when reg query stdout does not mention the product name", async () => {
    // Override the default mock: empty stdout means the key
    // doesn't exist yet.
    mockedExecFile.mockReset();
    mockedExecFile.mockImplementation(((_cmd: string, _args: readonly string[], _opts: unknown, callback: unknown) => {
      if (typeof callback === "function") {
        (callback as (err: null, stdout: string, stderr: string) => void)(null, "", "");
      }
      return undefined;
    }) as never);

    const { isAutoStartEnabled } = await importFresh();
    const enabled = await isAutoStartEnabled();
    expect(enabled).toBe(false);
  });

  it("isAutoStartEnabled treats reg query's nonzero exit (e.g. key not found) as 'not enabled' rather than throwing", async () => {
    mockedExecFile.mockReset();
    mockedExecFile.mockImplementation(((_cmd: string, _args: readonly string[], _opts: unknown, callback: unknown) => {
      if (typeof callback === "function") {
        // reg query exits with level 1 when the key is missing; the
        // auto-start helper should swallow that into a `false` so
        // the tray UI doesn't flash an error on a fresh install.
        const err = new Error("The system was unable to find the specified registry key or value.") as Error & { code?: number };
        err.code = 1;
        (callback as (err: Error) => void)(err);
      }
      return undefined;
    }) as never);

    const { isAutoStartEnabled } = await importFresh();
    const enabled = await isAutoStartEnabled();
    expect(enabled).toBe(false);
  });
});
