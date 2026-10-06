import { describe, expect, it } from 'vitest';

import {
  beginRunTelemetryDelivery,
  finalizeRunTelemetryDelivery,
  isRunTelemetryDeliveryCrashWindow,
  recordRunTelemetryDeliveryAttempt,
  runTelemetryDeliveryIdempotencyKey,
} from '../../src/observability/delivery-state.js';

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
});
