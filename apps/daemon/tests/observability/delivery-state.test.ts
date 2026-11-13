import { describe, expect, it } from 'vitest';

import {
  beginRunTelemetryDelivery,
  dropExhaustedRunTelemetryDelivery,
  finalizeRunTelemetryDelivery,
  isRunTelemetryDeliveryCrashWindow,
  MAX_RUN_TELEMETRY_DELIVERY_FAILURES,
  recordRunTelemetryDeliveryAttempt,
  runTelemetryDeliveryIdempotencyKey,
  runTelemetryDeliveryReportedStatus,
  type RunTelemetryDeliveryResult,
  type RunTelemetryDeliveryStateV1,
} from '../../src/observability/delivery-state.js';

function failDelivery(
  previous: RunTelemetryDeliveryStateV1 | undefined,
  at: number,
  result: Partial<RunTelemetryDeliveryResult> = {},
): RunTelemetryDeliveryStateV1 {
  const inFlight = beginRunTelemetryDelivery(previous, 'run-1', at);
  return finalizeRunTelemetryDelivery(inFlight, 'run-1', {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
    langfuse_attempt_count: 2,
    ...result,
  }, at + 1);
}

describe('run telemetry delivery state', () => {
  it('keeps one stable non-secret identity across crash-window recovery', () => {
    const idempotencyKey = runTelemetryDeliveryIdempotencyKey('run-1');
    const first = beginRunTelemetryDelivery(undefined, 'run-1', 1_000);
    const attempted = recordRunTelemetryDeliveryAttempt(first, 'run-1', 1_500);
    const recovered = beginRunTelemetryDelivery(attempted, 'run-1', 2_000);

    expect(idempotencyKey).toMatch(/^od-run-telemetry-v1-[a-f0-9]{64}$/u);
    expect(idempotencyKey).not.toContain('run-1');
    expect(first).toMatchObject({
      version: 1,
      idempotencyKey,
      status: 'in_flight',
      attemptCount: 0,
      crashWindow: true,
      startedAt: 1_000,
    });
    expect(recovered).toMatchObject({
      idempotencyKey,
      status: 'in_flight',
      attemptCount: 1,
      crashWindow: true,
      startedAt: 2_000,
    });
    expect(isRunTelemetryDeliveryCrashWindow(recovered)).toBe(true);
  });

  it.each([
    {
      result: {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted' as const,
        langfuse_attempt_count: 2,
      },
      expected: { status: 'accepted', attemptCount: 2 },
    },
    {
      result: {
        langfuse_expected: false,
        langfuse_delivery_status: 'not_expected' as const,
        langfuse_drop_reason: 'content_consent_off' as const,
        langfuse_attempt_count: 0,
      },
      expected: {
        status: 'not_expected',
        attemptCount: 0,
        dropReason: 'content_consent_off',
      },
    },
  ])('persists $expected.status as a terminal result', ({ result, expected }) => {
    const inFlight = beginRunTelemetryDelivery(undefined, 'run-1', 1_000);
    const finalized = finalizeRunTelemetryDelivery(inFlight, 'run-1', result, 2_000);

    expect(finalized).toMatchObject({
      version: 1,
      idempotencyKey: inFlight.idempotencyKey,
      ...expected,
      crashWindow: false,
      finalizedAt: 2_000,
    });
    expect(isRunTelemetryDeliveryCrashWindow(finalized)).toBe(false);
  });

  it('keeps an expected failure retryable with the stable delivery identity', () => {
    const inFlight = beginRunTelemetryDelivery(undefined, 'run-1', 1_000);
    const failed = finalizeRunTelemetryDelivery(inFlight, 'run-1', {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'network_error',
      langfuse_attempt_count: 2,
    }, 2_000);

    expect(failed).toMatchObject({
      version: 1,
      idempotencyKey: inFlight.idempotencyKey,
      status: 'failed',
      attemptCount: 2,
      crashWindow: false,
      dropReason: 'network_error',
    });
    expect(failed).not.toHaveProperty('finalizedAt');
    expect(beginRunTelemetryDelivery(failed, 'run-1', 3_000)).toMatchObject({
      idempotencyKey: inFlight.idempotencyKey,
      status: 'in_flight',
      attemptCount: 2,
      crashWindow: true,
      startedAt: 3_000,
    });
  });

  it('allows a later retry to replace a failed result with an accepted terminal result', () => {
    const inFlight = beginRunTelemetryDelivery(undefined, 'run-1', 1_000);
    const first = finalizeRunTelemetryDelivery(inFlight, 'run-1', {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'network_error',
      langfuse_attempt_count: 2,
    }, 2_000);
    const duplicate = finalizeRunTelemetryDelivery(first, 'run-1', {
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
      langfuse_attempt_count: 1,
    }, 3_000);

    expect(duplicate).toMatchObject({
      idempotencyKey: first.idempotencyKey,
      status: 'accepted',
      attemptCount: 2,
      finalizedAt: 3_000,
    });
  });

  it('drops a delivery once its failed passes reach the limit', () => {
    let state: RunTelemetryDeliveryStateV1 | undefined;
    for (let pass = 1; pass < MAX_RUN_TELEMETRY_DELIVERY_FAILURES; pass += 1) {
      state = failDelivery(state, pass * 1_000);
      expect(state).toMatchObject({ status: 'failed', failureCount: pass });
      expect(state).not.toHaveProperty('finalizedAt');
    }
    const lastAt = MAX_RUN_TELEMETRY_DELIVERY_FAILURES * 1_000;
    const dropped = failDelivery(state, lastAt);

    expect(dropped).toMatchObject({
      idempotencyKey: runTelemetryDeliveryIdempotencyKey('run-1'),
      status: 'dropped',
      attemptCount: 2,
      failureCount: MAX_RUN_TELEMETRY_DELIVERY_FAILURES,
      crashWindow: false,
      dropReason: 'network_error',
      finalizedAt: lastAt + 1,
    });
    expect(beginRunTelemetryDelivery(dropped, 'run-1', lastAt + 2)).toBe(dropped);
    expect(runTelemetryDeliveryReportedStatus(dropped)).toBe('failed');
  });

  it('counts a failure that never reached the network', () => {
    let state: RunTelemetryDeliveryStateV1 | undefined;
    for (let pass = 1; pass <= MAX_RUN_TELEMETRY_DELIVERY_FAILURES; pass += 1) {
      state = failDelivery(state, pass * 1_000, {
        langfuse_drop_reason: 'payload_too_large',
        langfuse_attempt_count: 0,
      });
    }

    expect(state).toMatchObject({
      status: 'dropped',
      attemptCount: 0,
      failureCount: MAX_RUN_TELEMETRY_DELIVERY_FAILURES,
      dropReason: 'payload_too_large',
    });
  });

  it('counts a failed state written before failureCount existed as one failure', () => {
    const legacy: RunTelemetryDeliveryStateV1 = {
      version: 1,
      idempotencyKey: 'od-run-telemetry-v1-legacy',
      status: 'failed',
      attemptCount: 7,
      crashWindow: false,
      startedAt: 1_000,
      dropReason: 'network_error',
    };

    expect(beginRunTelemetryDelivery(legacy, 'run-1', 2_000)).toMatchObject({
      idempotencyKey: 'od-run-telemetry-v1-legacy',
      status: 'in_flight',
      attemptCount: 7,
      failureCount: 1,
    });
    expect(failDelivery(legacy, 2_000)).toMatchObject({
      status: 'failed',
      attemptCount: 7,
      failureCount: 2,
    });
  });

  it('keeps a late success accepted after earlier failures', () => {
    let state: RunTelemetryDeliveryStateV1 | undefined;
    for (let pass = 1; pass < MAX_RUN_TELEMETRY_DELIVERY_FAILURES; pass += 1) {
      state = failDelivery(state, pass * 1_000);
    }
    const inFlight = beginRunTelemetryDelivery(state, 'run-1', 9_000);
    const accepted = finalizeRunTelemetryDelivery(inFlight, 'run-1', {
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
      langfuse_attempt_count: 1,
    }, 9_001);

    expect(accepted).toMatchObject({
      status: 'accepted',
      failureCount: MAX_RUN_TELEMETRY_DELIVERY_FAILURES - 1,
      finalizedAt: 9_001,
    });
    expect(runTelemetryDeliveryReportedStatus(accepted)).toBe('accepted');
  });

  it('counts a pass that never finished, but not each request of a pass', () => {
    const first = beginRunTelemetryDelivery(undefined, 'run-1', 1_000);
    const attempted = recordRunTelemetryDeliveryAttempt(
      recordRunTelemetryDeliveryAttempt(first, 'run-1', 1_100),
      'run-1',
      1_200,
    );
    expect(attempted).toMatchObject({ status: 'in_flight', attemptCount: 2 });
    expect(attempted).not.toHaveProperty('failureCount');

    // The daemon quit before this pass finished; the next boot starts another.
    const resumed = beginRunTelemetryDelivery(attempted, 'run-1', 2_000);
    expect(resumed).toMatchObject({
      status: 'in_flight',
      attemptCount: 2,
      failureCount: 1,
      crashWindow: true,
      startedAt: 2_000,
    });
  });

  it('drops a delivery whose unfinished passes reached the limit before another pass', () => {
    const inFlight: RunTelemetryDeliveryStateV1 = {
      version: 1,
      idempotencyKey: 'od-run-telemetry-v1-crash',
      status: 'in_flight',
      attemptCount: 5,
      failureCount: MAX_RUN_TELEMETRY_DELIVERY_FAILURES - 1,
      crashWindow: true,
      startedAt: 1_000,
    };

    expect(dropExhaustedRunTelemetryDelivery(inFlight, 2_000)).toMatchObject({
      idempotencyKey: 'od-run-telemetry-v1-crash',
      status: 'dropped',
      attemptCount: 5,
      failureCount: MAX_RUN_TELEMETRY_DELIVERY_FAILURES,
      crashWindow: false,
      dropReason: 'network_error',
      finalizedAt: 2_000,
    });
    const notYet = { ...inFlight, failureCount: MAX_RUN_TELEMETRY_DELIVERY_FAILURES - 2 };
    expect(dropExhaustedRunTelemetryDelivery(notYet, 2_000)).toBe(notYet);
    const accepted = { ...inFlight, status: 'accepted' as const, crashWindow: false, finalizedAt: 1_500 };
    expect(dropExhaustedRunTelemetryDelivery(accepted, 2_000)).toBe(accepted);
  });
});
