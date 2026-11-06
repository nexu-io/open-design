import { createHash } from 'node:crypto';

export const RUN_TELEMETRY_DELIVERY_STATE_VERSION = 1 as const;

export type RunTelemetryDeliveryTerminalStatus =
  | 'accepted'
  | 'not_expected';

export interface RunTelemetryDeliveryStateV1 {
  version: typeof RUN_TELEMETRY_DELIVERY_STATE_VERSION;
  idempotencyKey: string;
  status: 'in_flight' | 'failed' | RunTelemetryDeliveryTerminalStatus;
  attemptCount: number;
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

export function beginRunTelemetryDelivery(
  previous: RunTelemetryDeliveryStateV1 | null | undefined,
  runId: string,
  now = Date.now(),
): RunTelemetryDeliveryStateV1 {
  if (typeof previous?.finalizedAt === 'number') return previous;
  return {
    version: RUN_TELEMETRY_DELIVERY_STATE_VERSION,
    idempotencyKey:
      typeof previous?.idempotencyKey === 'string' && previous.idempotencyKey
        ? previous.idempotencyKey
        : runTelemetryDeliveryIdempotencyKey(runId),
    status: 'in_flight',
    attemptCount: previousAttemptCount(previous),
    crashWindow: true,
    startedAt: now,
  };
}

export function recordRunTelemetryDeliveryAttempt(
  previous: RunTelemetryDeliveryStateV1 | null | undefined,
  runId: string,
  now = Date.now(),
): RunTelemetryDeliveryStateV1 {
  const inFlight = beginRunTelemetryDelivery(previous, runId, now);
  if (typeof inFlight.finalizedAt === 'number') return inFlight;
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
  const status = resultStatus(result);
  const dropReason = typeof result.langfuse_drop_reason === 'string'
    && result.langfuse_drop_reason
    ? result.langfuse_drop_reason
    : status === 'failed'
      ? 'network_error'
      : undefined;
  const terminal = status === 'accepted' || status === 'not_expected';
  return {
    version: RUN_TELEMETRY_DELIVERY_STATE_VERSION,
    idempotencyKey:
      typeof previous?.idempotencyKey === 'string' && previous.idempotencyKey
        ? previous.idempotencyKey
        : runTelemetryDeliveryIdempotencyKey(runId),
    status,
    attemptCount: Math.max(persistedAttempts, resultAttemptCount(result)),
    crashWindow: false,
    startedAt:
      typeof previous?.startedAt === 'number' ? previous.startedAt : now,
    ...(dropReason ? { dropReason } : {}),
    ...(terminal ? { finalizedAt: now } : {}),
  };
}

export function isRunTelemetryDeliveryCrashWindow(
  state: RunTelemetryDeliveryStateV1 | null | undefined,
): boolean {
  return state?.version === RUN_TELEMETRY_DELIVERY_STATE_VERSION
    && state.status === 'in_flight'
    && state.crashWindow === true
    && state.finalizedAt === undefined;
}
