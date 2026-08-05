export const RECOVERABLE_EXIT_CODES = {
  'daemon-not-running': 64,
  'plugin-not-found': 65,
  'snapshot-not-found': 65,
  'capabilities-required': 66,
  'missing-input': 67,
  'project-not-found': 68,
  'run-not-found': 69,
  'provider-not-configured': 70,
  'plugin-requires-daemon': 71,
  'snapshot-stale': 72,
  'genui-surface-awaiting': 73,
  'desktop-auth-pending': 74,
  'desktop-import-token-rejected': 75,
} as const;

export type RecoverableErrorCode = keyof typeof RECOVERABLE_EXIT_CODES;

export function normalizeRecoverableErrorCode(
  code: unknown,
  message: unknown,
): string | undefined {
  if (code === 'DESKTOP_AUTH_PENDING') return 'desktop-auth-pending';
  if (code === 'FORBIDDEN' && /desktop import token rejected/i.test(String(message ?? ''))) {
    return 'desktop-import-token-rejected';
  }
  return typeof code === 'string' ? code : undefined;
}

export function structuredErrorData(
  error: unknown,
): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const errorRecord = error as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const additionalData = errorRecord.data;
  if (additionalData !== undefined && additionalData !== null) {
    Object.assign(data, additionalData);
  }
  if (errorRecord.details !== undefined) data.details = errorRecord.details;
  if (typeof errorRecord.retryable === 'boolean') data.retryable = errorRecord.retryable;
  return Object.keys(data).length > 0 ? data : undefined;
}
