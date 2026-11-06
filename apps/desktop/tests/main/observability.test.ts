import { describe, expect, test, vi } from "vitest";

import {
  attachDesktopChildProcessCrashReporter,
  reportPriorDesktopUncleanExits,
  type DesktopChildProcessGoneDetails,
} from "../../src/main/observability.js";

describe("desktop observability wiring", () => {
  test("reports prior unclean exits and clears only acked sessions", async () => {
    const report = vi.fn(async (_event: string, properties: Record<string, unknown>) => {
      return properties.previous_session_id === "acked";
    });
    const clearReported = vi.fn();

    await reportPriorDesktopUncleanExits({
      previousUncleanSessions: [
        { sessionId: "acked", version: "0.14.0", startedAt: "2026-07-09T12:00:00.000Z" },
        { sessionId: "retry-next-launch", version: "0.14.0", startedAt: "2026-07-09T13:00:00.000Z" },
      ],
      currentVersion: "0.14.1",
      stateFilePath: "session-state.json",
      report,
      clearReported,
    });

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith("desktop_unclean_exit", expect.objectContaining({
      previous_version: "0.14.0",
      previous_session_id: "acked",
      previous_started_at: "2026-07-09T12:00:00.000Z",
      current_version: "0.14.1",
      // No host event recorded: the cause is stated as unknown.
      exit_hint: "unknown",
      ended_suspended: false,
      quit_requested: false,
    }));
    expect(clearReported).toHaveBeenCalledTimes(1);
    expect(clearReported).toHaveBeenCalledWith({ stateFilePath: "session-state.json" }, "acked");
  });

  test("does not clear unclean exits when reporting fails", async () => {
    const report = vi.fn(async () => false);
    const clearReported = vi.fn();

    await reportPriorDesktopUncleanExits({
      previousUncleanSessions: [
        { sessionId: "pending", version: null, startedAt: "2026-07-09T12:00:00.000Z" },
      ],
      currentVersion: "0.14.1",
      stateFilePath: "session-state.json",
      report,
      clearReported,
    });

    expect(report).toHaveBeenCalledOnce();
    expect(clearReported).not.toHaveBeenCalled();
  });

  test("reports abnormal child-process exits and ignores clean exits", async () => {
    type ChildProcessGoneListener = (event: unknown, details: DesktopChildProcessGoneDetails) => void;
    const listeners: ChildProcessGoneListener[] = [];
    const app = {
      on: vi.fn((event: "child-process-gone", nextListener: ChildProcessGoneListener) => {
        expect(event).toBe("child-process-gone");
        listeners.push(nextListener);
      }),
    };
    const report = vi.fn(async () => true);
    const logger = { error: vi.fn() };

    attachDesktopChildProcessCrashReporter(app, report, logger);
    const capturedListener = listeners[0];
    if (!capturedListener) throw new Error("child-process-gone listener was not registered");
    capturedListener(null, { type: "GPU", reason: "crashed", exitCode: 139 });
    capturedListener(null, { type: "Utility", reason: "clean-exit", exitCode: 0 });

    expect(logger.error).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("desktop_child_process_crash", expect.objectContaining({
      process_type: "GPU",
      reason: "crashed",
      exit_code: 139,
    }));
  });
});

 test('deduplicates queued sessions and preserves occurrence identity across upgrade/replay', async () => {
  const crash = { sessionId: 'previous-session', launchAttemptId: 'previous-launch', version: '1.0.0-beta.1',
    startedAt: '2026-10-16T01:00:00.000Z', lastObservedAt: '2026-10-16T02:00:00.000Z' };
  const report = vi.fn(async () => false);
  for (const currentVersion of ['2.0.0', '3.0.0']) await reportPriorDesktopUncleanExits({
    previousUncleanSessions: [crash, crash], currentVersion, stateFilePath: 'unused', report,
  });
  expect(report).toHaveBeenCalledTimes(2);
  const first = report.mock.calls[0] as unknown as [string, Record<string, unknown>];
  const second = report.mock.calls[1] as unknown as [string, Record<string, unknown>];
  expect(first[1]).toMatchObject({ app_version: '1.0.0-beta.1', previous_app_version: '1.0.0-beta.1',
    app_session_id: 'previous-session', launch_attempt_id: 'previous-launch', exit_reason: 'unknown',
    occurred_at: crash.lastObservedAt, occurrence_time_source: 'last_checkpoint' });
  expect(second[1].event_id).toBe(first[1].event_id);
 });

 test.each(['shutdown', 'session-end:shutdown', 'session-end:logoff'])('excludes known OS %s from crash classification', async kind => {
  const report = vi.fn(async (_event: string, _props: Record<string, unknown>) => true);
  await reportPriorDesktopUncleanExits({ previousUncleanSessions: [{ sessionId: 'os-ended', version: null,
    startedAt: '2026-10-16T01:00:00.000Z', hostEvents: [{ kind, at: '2026-10-16T02:00:00.000Z' }] }],
    currentVersion: '2.0.0', stateFilePath: 'unused', report, clearReported: vi.fn() });
  expect(report.mock.calls[0]![1]).toMatchObject({ exit_reason: 'clean-exit' });
 });

test('uses observed main nonzero exit evidence rather than guessing OOM on restart', async () => {
  const report = vi.fn(async (_event: string, _props: Record<string, unknown>) => true);
  await reportPriorDesktopUncleanExits({ previousUncleanSessions: [{ sessionId: 'main', version: '1.0.0',
    startedAt: '2026-10-16T01:00:00.000Z', lastObservedAt: '2026-10-16T02:00:00.000Z', exitCode: 1 }],
    currentVersion: '2.0.0', stateFilePath: 'unused', report, clearReported: vi.fn() });
  expect(report.mock.calls[0]![1]).toMatchObject({ exit_reason: 'crash', exit_code: 1, occurrence_time_source: 'observed' });
});
