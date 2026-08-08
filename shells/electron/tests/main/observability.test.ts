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
    expect(report).toHaveBeenCalledWith("desktop_unclean_exit", {
      previous_version: "0.14.0",
      previous_session_id: "acked",
      previous_started_at: "2026-07-09T12:00:00.000Z",
      current_version: "0.14.1",
    });
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
    expect(report).toHaveBeenCalledWith("desktop_child_process_crash", {
      process_type: "GPU",
      reason: "crashed",
      exit_code: 139,
    });
  });
});
