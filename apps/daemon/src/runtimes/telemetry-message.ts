export interface PersistedRunMessage {
  runId?: string | null;
  runStatus?: string | null;
}

export interface TelemetryFinalizationBody {
  telemetryFinalized?: boolean;
  [key: string]: unknown;
}

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export function shouldReportRunCompletedFromMessage(
  saved: PersistedRunMessage | null | undefined,
  body: TelemetryFinalizationBody = {},
): boolean {
  return Boolean(
    saved &&
      saved.runId &&
      typeof saved.runStatus === 'string' &&
      TERMINAL_RUN_STATUSES.has(saved.runStatus) &&
      body.telemetryFinalized === true,
  );
}
