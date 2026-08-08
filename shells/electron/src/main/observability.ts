import { clearReportedCrash, type DesktopCrashSummary } from "./session-lifecycle.js";

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
): Promise<boolean> {
  try {
    const baseUrl = await discoverBaseUrl();
    const res = await fetch(new URL("/api/observability/event", baseUrl).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, properties }),
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
    input.previousUncleanSessions.map(async (crash) => {
      const reported = await input.report("desktop_unclean_exit", {
        previous_version: crash.version,
        previous_session_id: crash.sessionId,
        previous_started_at: crash.startedAt,
        current_version: input.currentVersion,
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
      process_type: details.type,
      reason: details.reason,
      exit_code: typeof details.exitCode === "number" ? details.exitCode : null,
    });
  });
}
