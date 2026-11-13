import { createHash } from 'node:crypto';

export const RUN_TELEMETRY_DELIVERY_STATE_VERSION = 1 as const;

export type RunTelemetryDeliveryTerminalStatus =
  | 'accepted'
  | 'not_expected'
  | 'dropped';

/**
 * Failed delivery passes, live or at boot, after which a delivery is dropped.
 * Each boot replay reads the whole run event log, so an unreachable relay must
 * cost a bounded number of boots rather than every boot.
 */
export const MAX_RUN_TELEMETRY_DELIVERY_FAILURES = 4;

export interface RunTelemetryDeliveryStateV1 {
  version: typeof RUN_TELEMETRY_DELIVERY_STATE_VERSION;
  idempotencyKey: string;
  status: 'in_flight' | 'failed' | RunTelemetryDeliveryTerminalStatus;
  attemptCount: number;
  /**
   * Delivery passes that ended `failed`. Unlike `attemptCount`, which counts
   * network requests, it also counts failures that never reached the network.
   */
  failureCount?: number;
  crashWindow: boolean;
  startedAt: number;
  dropReason?: string;
  finalizedAt?: number;
}

export interface RunTelemetryDeliveryResult {
  langfuse_expected: boolean;
  langfuse_delivery_status:
    | 'not_expected'
    | 'queued'
    | 'accepted'
    | 'failed';
  langfuse_drop_reason?: string;
  langfuse_attempt_count?: number;
}

export function runTelemetryDeliveryIdempotencyKey(runId: string): string {
  const digest = createHash('sha256')
    .update(`open-design/run-telemetry/v1\n${runId}`, 'utf8')
    .digest('hex');
  return `od-run-telemetry-v1-${digest}`;
}

function previousAttemptCount(
  state: RunTelemetryDeliveryStateV1 | null | undefined,
): number {
  return Number.isSafeInteger(state?.attemptCount) && state!.attemptCount >= 0
    ? state!.attemptCount
    : 0;
}

/** A `failed` state written before `failureCount` existed counts as one failure. */
function previousFailureCount(
  state: RunTelemetryDeliveryStateV1 | null | undefined,
): number {
  if (Number.isSafeInteger(state?.failureCount) && state!.failureCount! >= 0) {
    return state!.failureCount!;
  }
  return state?.status === 'failed' ? 1 : 0;
}

function inFlightRunTelemetryDelivery(
  previous: RunTelemetryDeliveryStateV1 | null | undefined,
  runId: string,
  now: number,
  failureCount: number,
): RunTelemetryDeliveryStateV1 {
  return {
    version: RUN_TELEMETRY_DELIVERY_STATE_VERSION,
    idempotencyKey:
      typeof previous?.idempotencyKey === 'string' && previous.idempotencyKey
        ? previous.idempotencyKey
        : runTelemetryDeliveryIdempotencyKey(runId),
    status: 'in_flight',
    attemptCount: previousAttemptCount(previous),
    ...(failureCount > 0 ? { failureCount } : {}),
    crashWindow: true,
    startedAt: now,
  };
}

/**
 * Failed passes so far. A pass still in its crash window never finished, for
 * example because the daemon quit mid-delivery, so it counts as failed.
 */
function failedPassCount(
  state: RunTelemetryDeliveryStateV1 | null | undefined,
): number {
  return previousFailureCount(state)
    + (isRunTelemetryDeliveryCrashWindow(state) ? 1 : 0);
}

export function beginRunTelemetryDelivery(
  previous: RunTelemetryDeliveryStateV1 | null | undefined,
  runId: string,
  now = Date.now(),
): RunTelemetryDeliveryStateV1 {
  if (typeof previous?.finalizedAt === 'number') return previous;
  return inFlightRunTelemetryDelivery(
    previous,
    runId,
    now,
    failedPassCount(previous),
  );
}

/**
 * Drop an unfinished delivery whose failed passes already reached the limit,
 * so that no further pass starts. Passes that never finish cannot drop the
 * delivery themselves. Any other state is returned unchanged.
 */
export function dropExhaustedRunTelemetryDelivery(
  state: RunTelemetryDeliveryStateV1,
  now = Date.now(),
): RunTelemetryDeliveryStateV1 {
  if (typeof state.finalizedAt === 'number') return state;
  const failureCount = failedPassCount(state);
  if (failureCount < MAX_RUN_TELEMETRY_DELIVERY_FAILURES) return state;
  return {
    ...state,
    status: 'dropped',
    failureCount,
    crashWindow: false,
    dropReason: state.dropReason ?? 'network_error',
    finalizedAt: now,
  };
}

export function recordRunTelemetryDeliveryAttempt(
  previous: RunTelemetryDeliveryStateV1 | null | undefined,
  runId: string,
  now = Date.now(),
): RunTelemetryDeliveryStateV1 {
  if (typeof previous?.finalizedAt === 'number') return previous;
  const inFlight = inFlightRunTelemetryDelivery(
    previous,
    runId,
    now,
    previousFailureCount(previous),
  );
  return {
    ...inFlight,
    attemptCount: previousAttemptCount(inFlight) + 1,
  };
}

function resultStatus(
  result: RunTelemetryDeliveryResult,
): RunTelemetryDeliveryStateV1['status'] {
  if (result.langfuse_expected === false) return 'not_expected';
  if (result.langfuse_delivery_status === 'accepted') return 'accepted';
  return 'failed';
}

function resultAttemptCount(result: RunTelemetryDeliveryResult): number {
  if (
    Number.isSafeInteger(result.langfuse_attempt_count)
    && result.langfuse_attempt_count! >= 0
  ) {
    return result.langfuse_attempt_count!;
  }
  return result.langfuse_expected === false ? 0 : 1;
}

export function finalizeRunTelemetryDelivery(
  previous: RunTelemetryDeliveryStateV1 | null | undefined,
  runId: string,
  result: RunTelemetryDeliveryResult,
  now = Date.now(),
): RunTelemetryDeliveryStateV1 {
  if (typeof previous?.finalizedAt === 'number') return previous;
  const persistedAttempts = previousAttemptCount(previous);
  const reported = resultStatus(result);
  const failed = reported === 'failed';
  const failureCount = previousFailureCount(previous) + (failed ? 1 : 0);
  const status = failed && failureCount >= MAX_RUN_TELEMETRY_DELIVERY_FAILURES
    ? 'dropped'
    : reported;
  const dropReason = typeof result.langfuse_drop_reason === 'string'
    && result.langfuse_drop_reason
    ? result.langfuse_drop_reason
    : failed
      ? 'network_error'
      : undefined;
  const terminal = status !== 'failed';
  return {
    version: RUN_TELEMETRY_DELIVERY_STATE_VERSION,
    idempotencyKey:
      typeof previous?.idempotencyKey === 'string' && previous.idempotencyKey
        ? previous.idempotencyKey
        : runTelemetryDeliveryIdempotencyKey(runId),
    status,
    attemptCount: Math.max(persistedAttempts, resultAttemptCount(result)),
    ...(failureCount > 0 ? { failureCount } : {}),
    crashWindow: false,
    startedAt:
      typeof previous?.startedAt === 'number' ? previous.startedAt : now,
    ...(dropReason ? { dropReason } : {}),
    ...(terminal ? { finalizedAt: now } : {}),
  };
}

/**
 * The status a finalized delivery reports to analytics. The tracking contract
 * has no `dropped`: a delivery that ran out of failures reports as `failed`.
 */
export function runTelemetryDeliveryReportedStatus(
  state: RunTelemetryDeliveryStateV1,
): RunTelemetryDeliveryResult['langfuse_delivery_status'] {
  return state.status === 'dropped' || state.status === 'in_flight'
    ? 'failed'
    : state.status;
}

export function isRunTelemetryDeliveryCrashWindow(
  state: RunTelemetryDeliveryStateV1 | null | undefined,
): boolean {
  return state?.version === RUN_TELEMETRY_DELIVERY_STATE_VERSION
    && state.status === 'in_flight'
    && state.crashWindow === true
    && state.finalizedAt === undefined;
}
