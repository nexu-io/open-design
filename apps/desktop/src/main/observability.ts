import { createHash, randomUUID } from "node:crypto";
import { classifyProcessExit } from "@open-design/contracts/analytics";
import {
  clearReportedCrash,
  type DesktopCrashSummary,
  type DesktopHostEvent,
  type DesktopHostEventRecord,
} from "./session-lifecycle.js";

export type DesktopObservabilityReporter = (
  event: string,
  properties: Record<string, unknown>,
) => Promise<boolean>;

export type DesktopChildProcessGoneDetails = {
  type?: string;
  reason?: string;
  exitCode?: number;
};

export type DesktopChildProcessGoneApp = {
  on(
    event: "child-process-gone",
    listener: (event: unknown, details: DesktopChildProcessGoneDetails) => void,
  ): void;
};

// Best-effort POST of a desktop observability event (abnormal exit, child-process
// crash) to the daemon's safety-event bridge. Never throws: failing to report
// must not affect startup or shutdown.
export async function reportDesktopObservabilityEvent(
  discoverBaseUrl: () => Promise<string>,
  event: string,
  properties: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const baseUrl = await discoverBaseUrl();
    const res = await fetch(new URL("/api/observability/event", baseUrl).toString(), {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, properties: {
        client_type: "desktop", capture_source: "desktop/observability",
        platform: process.platform, arch: process.arch,
        os_version: typeof process.getSystemVersion === "function" ? process.getSystemVersion() : null,
        ...properties,
      } }),
    });
    return res.ok;
  } catch {
    // best-effort observability, never a failure path
    return false;
  }
}

export async function reportPriorDesktopUncleanExits(input: {
  previousUncleanSessions: DesktopCrashSummary[];
  currentVersion: string | null;
  stateFilePath: string;
  report: DesktopObservabilityReporter;
  clearReported?: typeof clearReportedCrash;
}): Promise<void> {
  const clearReported = input.clearReported ?? clearReportedCrash;
  await Promise.all(
    [...new Map(input.previousUncleanSessions.map(crash => [crash.sessionId, crash])).values()].map(async (crash) => {
      const hints = describeHostEvents(crash.hostEvents ?? []);
      // OS shutdown/logoff is an expected termination, never a proven crash.
      const systemExit = ["system_shutdown", "user_logoff", "closed_by_system"].includes(String(hints.exit_hint));
      const reported = await input.report("desktop_unclean_exit", {
        event_id: `desktop-exit-${createHash("sha256").update(crash.sessionId).digest("hex")}`,
        app_session_id: crash.sessionId,
        launch_attempt_id: crash.launchAttemptId ?? null,
        app_version: crash.version,
        previous_app_version: crash.version,
        occurred_at: crash.lastObservedAt ?? crash.startedAt,
        occurrence_time_source: crash.exitCode != null ? "observed" : crash.lastObservedAt ? "last_checkpoint" : "unknown",
        exit_reason: crash.exitCode != null ? crash.exitCode === 0 ? "clean-exit" : "crash" : systemExit ? "clean-exit" : "unknown",
        exit_code: crash.exitCode ?? null,
        previous_version: crash.version,
        previous_session_id: crash.sessionId,
        previous_started_at: crash.startedAt,
        current_version: input.currentVersion,
        ...hints,
      });
      if (reported) clearReported({ stateFilePath: input.stateFilePath }, crash.sessionId);
    }),
  );
}

export function attachDesktopChildProcessCrashReporter(
  app: DesktopChildProcessGoneApp,
  report: DesktopObservabilityReporter,
  logger: Pick<Console, "error"> = console,
): void {
  app.on("child-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    logger.error("[open-design desktop] child-process-gone", {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    });
    void report("desktop_child_process_crash", {
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      exit_reason: classifyProcessExit(details.reason),
      process_type: details.type,
      reason: details.reason,
      exit_code: typeof details.exitCode === "number" ? details.exitCode : null,
    });
  });
}

/**
 * What the host events of a run say about how it ended. Precedence: an OS
 * shutdown/session end, then a sleep with no later wake, then a quit whose
 * teardown never finished. `unknown` means no event explains it — a crash, a
 * force-kill, or power loss look the same from here.
 */
export function describeHostEvents(events: DesktopHostEventRecord[]): Record<string, unknown> {
  const lastIndexOf = (match: (kind: string) => boolean) => {
    for (let index = events.length - 1; index >= 0; index -= 1) if (match(events[index]!.kind)) return index;
    return -1;
  };
  const sessionEnd = events.filter((e) => e.kind.startsWith("session-end")).at(-1)?.kind ?? null;
  const reasons = sessionEnd?.split(":")[1]?.split(",") ?? [];
  const endedSuspended = lastIndexOf((k) => k === "suspend") > lastIndexOf((k) => k === "resume");
  const quitRequested = events.some((e) => e.kind === "quit-requested");
  const exitHint = events.some((e) => e.kind === "shutdown") || reasons.includes("shutdown") || reasons.includes("critical")
    ? "system_shutdown"
    : reasons.includes("logoff")
      ? "user_logoff"
      : sessionEnd
        ? "closed_by_system"
        : endedSuspended
          ? "system_suspend"
          : quitRequested
            ? "quit_incomplete"
            : "unknown";
  const last = events.at(-1);
  return {
    exit_hint: exitHint,
    ended_suspended: endedSuspended,
    quit_requested: quitRequested,
    ...(last ? { last_host_event: last.kind, last_host_event_at: last.at } : {}),
  };
}

type HostEventEmitter = { on(event: string, listener: (...args: any[]) => void): unknown };

/**
 * Record OS power and session-end events into this run's marker: sleep/wake and
 * shutdown via `powerMonitor` (shutdown is Linux/macOS only), and Windows
 * shutdown, restart or log-off via the window's `session-end`.
 */
export function attachDesktopHostLifecycleRecorder(input: {
  powerMonitor: HostEventEmitter;
  window?: HostEventEmitter | null;
  record: (event: DesktopHostEvent) => void;
}): void {
  input.powerMonitor.on("suspend", () => input.record({ kind: "suspend" }));
  input.powerMonitor.on("resume", () => input.record({ kind: "resume" }));
  input.powerMonitor.on("shutdown", () => input.record({ kind: "shutdown" }));
  input.window?.on("session-end", (event: { reasons?: unknown } | undefined) => {
    const reasons = Array.isArray(event?.reasons) ? event.reasons.filter((r): r is string => typeof r === "string") : [];
    input.record({ kind: "session-end", reasons });
  });
}
