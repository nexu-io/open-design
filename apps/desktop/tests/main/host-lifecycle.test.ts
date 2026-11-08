import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { attachDesktopHostLifecycleRecorder, reportPriorDesktopUncleanExits } from "../../src/main/observability.js";
import {
  beginDesktopSession,
  markDesktopSessionRunning,
  recordDesktopHostEvent,
} from "../../src/main/session-lifecycle.js";

// A desktop run that dies without a clean shutdown is reported as
// desktop_unclean_exit, but nothing said whether the machine was shutting down,
// asleep, or the user's quit never finished. In production 26 of 28 such exits
// carried no evidence at all. The host events seen during the run travel with
// the next launch's report.

let dir: string;
let stateFilePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "desktop-host-lifecycle-"));
  stateFilePath = join(dir, "session-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function reportAfterDirtyRun(events: Array<[Parameters<typeof recordDesktopHostEvent>[1], string]>) {
  beginDesktopSession({ stateFilePath, sessionId: "run-a", version: "0.24.1", now: () => new Date("2026-10-02T10:00:00.000Z") });
  markDesktopSessionRunning({ stateFilePath });
  for (const [event, at] of events) recordDesktopHostEvent({ stateFilePath, now: () => new Date(at) }, event);
  // The process dies here: no endDesktopSessionCleanly.
  const { previousUncleanSessions } = beginDesktopSession({
    stateFilePath, sessionId: "run-b", version: "0.24.1", now: () => new Date("2026-10-02T12:00:00.000Z"),
  });
  const report = vi.fn(async () => true);
  await reportPriorDesktopUncleanExits({ previousUncleanSessions, currentVersion: "0.24.1", stateFilePath, report, clearReported: vi.fn() });
  expect(report).toHaveBeenCalledOnce();
  return (report.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
}

describe("desktop_unclean_exit carries the host events of the run that died", () => {
  test("a run that ended while the system was asleep", async () => {
    const properties = await reportAfterDirtyRun([
      [{ kind: "suspend" }, "2026-10-02T10:30:00.000Z"],
      [{ kind: "resume" }, "2026-10-02T10:40:00.000Z"],
      [{ kind: "suspend" }, "2026-10-02T11:00:00.000Z"],
    ]);
    expect(properties).toMatchObject({
      exit_hint: "system_suspend",
      last_host_event: "suspend",
      last_host_event_at: "2026-10-02T11:00:00.000Z",
      ended_suspended: true,
      quit_requested: false,
    });
  });

  test("a Windows session that ended for a shutdown", async () => {
    const properties = await reportAfterDirtyRun([
      [{ kind: "session-end", reasons: ["shutdown"] }, "2026-10-02T11:00:00.000Z"],
    ]);
    expect(properties).toMatchObject({ exit_hint: "system_shutdown", last_host_event: "session-end:shutdown" });
  });

  test("a quit that started but never finished", async () => {
    const properties = await reportAfterDirtyRun([[{ kind: "quit-requested" }, "2026-10-02T11:00:00.000Z"]]);
    expect(properties).toMatchObject({ exit_hint: "quit_incomplete", quit_requested: true });
  });

  test("no host event leaves the cause unknown, stated explicitly", async () => {
    const properties = await reportAfterDirtyRun([]);
    expect(properties).toMatchObject({ exit_hint: "unknown", ended_suspended: false, quit_requested: false });
    expect(properties).not.toHaveProperty("last_host_event");
  });
});

describe("attachDesktopHostLifecycleRecorder", () => {
  test("records power and session-end events from Electron", () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const powerMonitor = { on: vi.fn((event: string, fn: (...args: unknown[]) => void) => { handlers.set(`power:${event}`, fn); }) };
    const window = { on: vi.fn((event: string, fn: (...args: unknown[]) => void) => { handlers.set(`window:${event}`, fn); }) };
    const record = vi.fn();
    attachDesktopHostLifecycleRecorder({ powerMonitor, window, record });
    handlers.get("power:suspend")!();
    handlers.get("power:resume")!();
    handlers.get("power:shutdown")!();
    handlers.get("window:session-end")!({ reasons: ["logoff", "close-app"] });
    expect(record.mock.calls.map((call) => call[0])).toEqual([
      { kind: "suspend" },
      { kind: "resume" },
      { kind: "shutdown" },
      { kind: "session-end", reasons: ["logoff", "close-app"] },
    ]);
  });
});

describe("recordDesktopHostEvent", () => {
  test("keeps one session end when several windows report it", async () => {
    const properties = await reportAfterDirtyRun([
      [{ kind: "session-end", reasons: ["shutdown"] }, "2026-10-02T11:00:00.000Z"],
      [{ kind: "session-end", reasons: ["shutdown"] }, "2026-10-02T11:00:00.300Z"],
      [{ kind: "suspend" }, "2026-10-02T11:00:01.000Z"],
    ]);
    expect(properties).toMatchObject({ exit_hint: "system_shutdown", last_host_event: "suspend" });
  });
});
