import type { RunTerminalLifecycleStatus } from '@open-design/contracts';
import type {
  TrackingRunCancelOrigin,
  TrackingRunTerminalIntegrity,
  TrackingRunTerminalTrigger,
} from '@open-design/contracts/analytics';
import type { AnalyticsCaptureResult } from '../analytics.js';

export const RUN_TERMINAL_LIFECYCLE_VERSION =
  1 satisfies RunTerminalLifecycleStatus['version'];

export type RunTerminationOrigin = RunTerminalLifecycleStatus['terminationOrigin'];
export type RunTerminalPersistenceResult =
  RunTerminalLifecycleStatus['terminalPersistence'];
export type RunTerminalPersistenceErrorType =
  NonNullable<RunTerminalPersistenceResult['errorType']>;
export type RunPosthogDeliveryStateV1 =
  RunTerminalLifecycleStatus['posthogDelivery'];
export type RunMatureUnfinishedState =
  RunTerminalLifecycleStatus['unfinishedState'];
export type RunTerminalLifecycleV1 = RunTerminalLifecycleStatus;

function normalizedAttemptCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function runAttemptForTerminalLifecycle(input: {
  cumulativeRetryAttemptCount?: unknown;
  retryAttemptCount?: unknown;
  manualResumeAttemptCount?: unknown;
}): number {
  return normalizedAttemptCount(input.cumulativeRetryAttemptCount)
    + normalizedAttemptCount(input.retryAttemptCount)
    + normalizedAttemptCount(input.manualResumeAttemptCount);
}

export function boundedRuntimeGenerationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(normalized)
    ? normalized.toLowerCase()
    : null;
}

export function deriveRunTerminationOrigin(input: {
  cancelOrigin?: TrackingRunCancelOrigin | null;
  terminalTrigger?: TrackingRunTerminalTrigger | null;
}): RunTerminationOrigin {
  if (input.cancelOrigin === 'user_stop') return 'user_cancel';
  if (input.cancelOrigin === 'project_cleanup') return 'project_cleanup';
  if (
    input.terminalTrigger === 'first_output_deadline'
    || input.terminalTrigger === 'inactivity_watchdog'
    || input.terminalTrigger === 'acp_stage_timeout'
  ) {
    return 'watchdog_cleanup';
  }
  // `daemon_shutdown` currently merges user quit, updater apply, external
  // SIGTERM, and sidecar teardown. `daemon_restart` is observed only on the
  // next boot. Neither is sufficient evidence for a more specific origin.
  return 'unknown';
}

export function terminalPersistenceErrorType(
  error: unknown,
): RunTerminalPersistenceErrorType {
  const code = error && typeof error === 'object'
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 'EACCES' || code === 'EPERM') return 'permission_denied';
  if (code === 'EROFS') return 'read_only_storage';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'storage_full';
  if (code === 'ENOENT' || code === 'EIO') return 'storage_unavailable';
  if (error instanceof TypeError) return 'serialization_failed';
  return 'unknown';
}

export function terminalLifecycleSnapshot(input: {
  cumulativeRetryAttemptCount?: unknown;
  retryAttemptCount?: unknown;
  manualResumeAttemptCount?: unknown;
  runtimeGenerationId?: unknown;
  cancelOrigin?: TrackingRunCancelOrigin | null;
  terminalTrigger?: TrackingRunTerminalTrigger | null;
  terminalIntegrity?: TrackingRunTerminalIntegrity | null;
  terminalPersistence: RunTerminalPersistenceResult;
  posthogDelivery?: RunPosthogDeliveryStateV1 | null;
  duplicateTerminalCount?: number;
  lateTerminalCount?: number;
}): RunTerminalLifecycleV1 {
  const snapshot: RunTerminalLifecycleV1 = {
    version: RUN_TERMINAL_LIFECYCLE_VERSION,
    runAttempt: runAttemptForTerminalLifecycle(input),
    runtimeGenerationId: boundedRuntimeGenerationId(input.runtimeGenerationId),
    terminationOrigin: deriveRunTerminationOrigin(input),
    terminalIntegrity: input.terminalIntegrity ?? 'canonical',
    terminalPersistence: input.terminalPersistence,
    posthogDelivery: input.posthogDelivery ?? {
      status: 'unknown',
      acknowledgement: 'unknown',
      attemptCount: 0,
      errorType: null,
    },
    unfinishedState: 'unknown',
    duplicateTerminalCount: input.duplicateTerminalCount ?? 0,
    lateTerminalCount: input.lateTerminalCount ?? 0,
  };
  snapshot.unfinishedState = classifyMatureUnfinishedRun({
    runStatus: 'terminal',
    terminalLifecycle: snapshot,
  });
  return snapshot;
}

export function recordIgnoredTerminalClaim(
  lifecycle: RunTerminalLifecycleV1,
  kind: 'duplicate' | 'late',
): RunTerminalLifecycleV1 {
  const terminalIntegrity = lifecycle.terminalIntegrity === 'canonical'
    ? kind
    : lifecycle.terminalIntegrity === 'duplicate' && kind === 'late'
      ? 'late'
      : lifecycle.terminalIntegrity;
  return {
    ...lifecycle,
    terminalIntegrity,
    duplicateTerminalCount:
      lifecycle.duplicateTerminalCount + (kind === 'duplicate' ? 1 : 0),
    lateTerminalCount:
      lifecycle.lateTerminalCount + (kind === 'late' ? 1 : 0),
  };
}

export function beginPosthogTerminalDelivery(
  lifecycle: RunTerminalLifecycleV1,
): RunTerminalLifecycleV1 {
  const next = {
    ...lifecycle,
    posthogDelivery: {
      status: 'in_flight' as const,
      acknowledgement: 'none' as const,
      attemptCount: lifecycle.posthogDelivery.attemptCount + 1,
      errorType: null,
    },
  };
  return {
    ...next,
    unfinishedState: classifyMatureUnfinishedRun({
      runStatus: 'terminal',
      terminalLifecycle: next,
    }),
  };
}

export function finalizePosthogTerminalDelivery(
  lifecycle: RunTerminalLifecycleV1,
  result: AnalyticsCaptureResult,
): RunTerminalLifecycleV1 {
  const next = {
    ...lifecycle,
    posthogDelivery: {
      status: result.status,
      acknowledgement: result.acknowledgement,
      attemptCount: Math.max(1, lifecycle.posthogDelivery.attemptCount),
      errorType: result.errorType,
    },
  };
  return {
    ...next,
    unfinishedState: classifyMatureUnfinishedRun({
      runStatus: 'terminal',
      terminalLifecycle: next,
    }),
  };
}

export function terminalLifecycleForPosthogLocalQueue(
  lifecycle: RunTerminalLifecycleV1,
): RunTerminalLifecycleV1 {
  return finalizePosthogTerminalDelivery(lifecycle, {
    status: 'queued',
    acknowledgement: 'local_buffer',
    errorType: null,
  });
}

export function classifyMatureUnfinishedRun(input: {
  runStatus: 'running' | 'terminal' | 'unknown';
  terminalLifecycle?: RunTerminalLifecycleV1 | null;
}): RunMatureUnfinishedState {
  if (input.runStatus === 'running') return 'still_running';
  if (input.runStatus !== 'terminal' || !input.terminalLifecycle) return 'unknown';
  if (input.terminalLifecycle.terminalIntegrity === 'permanently_missing') {
    return 'permanently_missing';
  }
  if (input.terminalLifecycle.terminalPersistence.status === 'failed') {
    return 'terminated_persistence_missing';
  }
  if (
    input.terminalLifecycle.terminalPersistence.status === 'acknowledged'
    && input.terminalLifecycle.posthogDelivery.status === 'failed'
  ) {
    return 'terminal_persisted_posthog_failed';
  }
  if (
    input.terminalLifecycle.terminalPersistence.status === 'acknowledged'
    && input.terminalLifecycle.posthogDelivery.status === 'in_flight'
  ) {
    return 'recovery_pending';
  }
  return 'unknown';
}

export function markTerminalLifecycleReconciled(
  lifecycle: RunTerminalLifecycleV1,
  generationId: string,
): RunTerminalLifecycleV1 {
  const terminalIntegrity = lifecycle.terminalIntegrity === 'canonical'
    ? 'reconciled'
    : lifecycle.terminalIntegrity;
  return {
    ...lifecycle,
    terminalIntegrity,
    reconciliation: {
      generationId,
      integrity: 'recovered',
    },
  };
}
