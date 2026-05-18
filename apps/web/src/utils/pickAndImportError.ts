import type { DesktopPickAndImportResult } from '../types/electron';

/**
 * Best-effort flattening of the `details` field that the
 * pickAndImport main-process handler attaches when the daemon returned
 * a structured error envelope (PR #974 round-4 mrcfps). Daemon errors
 * carry `error.message` and sometimes nested `error.details.reason`;
 * we surface the most operator-actionable string we can find without
 * over-coupling to any particular error code.
 */
export function formatPickAndImportErrorDetails(details: unknown): string | undefined {
  if (typeof details === 'string' && details.length > 0) return details;
  if (details == null || typeof details !== 'object') return undefined;
  const record = details as Record<string, unknown>;
  const error = record.error;
  if (error != null && typeof error === 'object') {
    const errRecord = error as Record<string, unknown>;
    const message = errRecord.message;
    const nestedDetails = errRecord.details;
    if (typeof message === 'string' && message.length > 0) {
      if (nestedDetails != null && typeof nestedDetails === 'object') {
        const nestedReason = (nestedDetails as Record<string, unknown>).reason;
        if (typeof nestedReason === 'string' && nestedReason.length > 0) {
          return `${message} (${nestedReason})`;
        }
      }
      return message;
    }
  }
  return undefined;
}

export function formatPickAndImportFailure(
  result: DesktopPickAndImportResult,
): { message: string; details?: string } {
  const reason = 'reason' in result && typeof result.reason === 'string'
    ? result.reason
    : 'unknown failure';
  const details = 'details' in result && result.details != null
    ? formatPickAndImportErrorDetails(result.details)
    : undefined;
  return {
    message: `Open folder failed: ${reason}`,
    ...(details ? { details } : {}),
  };
}
