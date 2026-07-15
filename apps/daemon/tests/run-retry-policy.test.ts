import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS,
  MAX_RETRY_BACKOFF_DELAY_MS,
  RATE_LIMIT_RETRY_BASE_DELAY_MS,
  SAFE_RUN_RETRY_STRATEGY,
  TRANSIENT_RETRY_BASE_DELAY_MS,
  computeRetryBackoffMs,
  decideSafeRunRetry,
  type RunRetryPolicyInput,
} from '../src/run-retry-policy.js';

function decide(input: Partial<RunRetryPolicyInput> = {}) {
  return decideSafeRunRetry({
    result: 'failed',
    attemptCount: 0,
    failure: {
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_5xx',
      failure_stage: 'first_token_wait',
      retryable: true,
    },
    ...input,
  });
}

describe('decideSafeRunRetry', () => {
  it('allows retryable transient upstream failures before side effects', () => {
    // random: () => 0 pins equal-jitter to its floor (delay/2) for an exact match.
    expect(decide({ random: () => 0 })).toEqual({
      shouldRetry: true,
      retryAttemptIndex: 1,
      retryMaxAttempts: DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS,
      retryStrategy: SAFE_RUN_RETRY_STRATEGY,
      retryReason: 'transient_failure',
      retryDelayMs: TRANSIENT_RETRY_BASE_DELAY_MS / 2,
    });
  });

  it('allows ordinary retryable 429 rate limits but suppresses hard quota', () => {
    expect(
      decide({
        failure: {
          failure_category: 'rate_limit',
          failure_detail: 'rate_limit_429',
          failure_stage: 'session_init',
          retryable: true,
        },
      }).shouldRetry,
    ).toBe(true);

    expect(
      decide({
        failure: {
          failure_category: 'rate_limit',
          failure_detail: 'hard_quota',
          failure_stage: 'session_init',
          retryable: false,
        },
      }),
    ).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'hard_quota',
    });
  });

  it('allows empty output and first-token timeout failures', () => {
    expect(
      decide({
        failure: {
          failure_category: 'empty_output',
          failure_detail: 'empty_output',
          failure_stage: 'first_token_wait',
          retryable: true,
        },
      }).shouldRetry,
    ).toBe(true);

    expect(
      decide({
        failure: {
          failure_category: 'timeout',
          failure_detail: 'inactivity_timeout',
          failure_stage: 'first_token_wait',
          retryable: true,
        },
      }).shouldRetry,
    ).toBe(true);
  });

  it('allows named transient process-exit details before side effects', () => {
    for (const failure_detail of [
      'agent_protocol_error',
      'qoder_stop_sequence',
      'session_resume_expired',
      'stream_error',
      'fatal_rpc_error',
    ] as const) {
      expect(
        decide({
          failure: {
            failure_category: 'process_exit',
            failure_detail,
            failure_stage: 'child_close',
            retryable: true,
          },
        }),
      ).toMatchObject({
        shouldRetry: true,
        retryReason: 'transient_failure',
      });
    }
  });

  it('keeps upstream client errors out of the transient retry allowlist', () => {
    expect(
      decide({
        failure: {
          failure_category: 'upstream_unavailable',
          failure_detail: 'upstream_client_error',
          failure_stage: 'first_token_wait',
          retryable: true,
        },
      }),
    ).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'non_retryable_category',
    });
  });

  it('uses unsafe_failure_stage for transient categories after unsafe output phases', () => {
    expect(
      decide({
        failure: {
          failure_category: 'empty_output',
          failure_detail: 'empty_output',
          failure_stage: 'artifact_write',
          retryable: true,
        },
      }),
    ).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'unsafe_failure_stage',
    });

    expect(
      decide({
        failure: {
          failure_category: 'timeout',
          failure_detail: 'inactivity_timeout',
          failure_stage: 'child_close',
          retryable: true,
        },
      }),
    ).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'unsafe_failure_stage',
    });
  });

  it('does not retry successful or cancelled terminal results', () => {
    expect(decide({ result: 'success' })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'not_failed',
    });
    expect(decide({ result: 'cancelled' })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'not_failed',
    });
  });

  it('requires the classifier retryable signal', () => {
    expect(
      decide({
        failure: {
          failure_category: 'upstream_unavailable',
          failure_detail: 'upstream_5xx',
          failure_stage: 'first_token_wait',
          retryable: false,
        },
      }),
    ).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'not_retryable',
    });
  });

  it('suppresses missing classifier signals separately from non-retryable failures', () => {
    expect(
      decideSafeRunRetry({
        result: 'failed',
        attemptCount: 0,
      }),
    ).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'missing_failure_signal',
    });
  });

  it('suppresses non-transient categories even when the classifier marks them retryable', () => {
    for (const failure_category of [
      'auth',
      'prompt_too_large',
      'model_unavailable',
      'tool_error',
      'process_exit',
      'unknown',
    ] as const) {
      expect(
        decide({
          failure: {
            failure_category,
            failure_stage: 'tool_execution',
            retryable: true,
          },
        }),
      ).toMatchObject({
        shouldRetry: false,
        retrySuppressedReason: 'non_retryable_category',
      });
    }
  });

  it('allows at most one automatic same-run retry by default', () => {
    expect(decide({ attemptCount: 0 })).toMatchObject({
      shouldRetry: true,
      retryAttemptIndex: 1,
      retryMaxAttempts: DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS,
    });
    expect(decide({ attemptCount: 1 })).toMatchObject({
      shouldRetry: false,
      retryAttemptIndex: 2,
      retryMaxAttempts: DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS,
      retrySuppressedReason: 'attempt_limit_reached',
    });
  });

  it('stops at the configured attempt limit', () => {
    expect(decide({ attemptCount: 1, maxAttempts: 2 })).toMatchObject({
      shouldRetry: true,
      retryAttemptIndex: 2,
      retryMaxAttempts: 2,
    });
    expect(decide({ attemptCount: 2, maxAttempts: 2 })).toMatchObject({
      shouldRetry: false,
      retryAttemptIndex: 3,
      retryMaxAttempts: 2,
      retrySuppressedReason: 'attempt_limit_reached',
    });
  });

  it('suppresses retries after user-visible output, tools, artifact writes, or live artifacts', () => {
    expect(decide({ sideEffects: { userVisibleOutputSeen: true } })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'user_visible_output_seen',
    });
    expect(decide({ sideEffects: { toolCallSeen: true } })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'tool_call_seen',
    });
    expect(decide({ sideEffects: { artifactWriteSeen: true } })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'artifact_write_seen',
    });
    expect(decide({ sideEffects: { liveArtifactSeen: true } })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'live_artifact_seen',
    });
  });

  it('suppresses retries when cancellation was requested', () => {
    expect(decide({ sideEffects: { cancelRequested: true } })).toMatchObject({
      shouldRetry: false,
      retrySuppressedReason: 'cancel_requested',
    });
  });

  it('never auto-retries process kills, crashes, or interruptions', () => {
    for (const failure_detail of [
      'signal_killed',
      'process_crashed',
      'interrupted',
    ] as const) {
      expect(
        decide({
          failure: {
            failure_category: 'process_exit',
            failure_detail,
            failure_stage: 'child_close',
            retryable: false,
          },
        }).shouldRetry,
      ).toBe(false);
    }
  });

  it('attaches an exponential backoff delay to retry decisions', () => {
    // rate_limit uses the larger base; equal jitter floor (random → 0) is base/2.
    const rateLimit = decide({
      failure: {
        failure_category: 'rate_limit',
        failure_detail: 'rate_limit_429',
        failure_stage: 'session_init',
        retryable: true,
      },
      random: () => 0,
    });
    expect(rateLimit).toMatchObject({
      shouldRetry: true,
      retryDelayMs: RATE_LIMIT_RETRY_BASE_DELAY_MS / 2,
    });

    // Other transient classes use the smaller base.
    expect(decide({ random: () => 0 })).toMatchObject({
      shouldRetry: true,
      retryDelayMs: TRANSIENT_RETRY_BASE_DELAY_MS / 2,
    });
  });
});

describe('computeRetryBackoffMs', () => {
  it('grows exponentially by attempt index and applies equal jitter', () => {
    // random → 0 is the floor (delay/2), random → 1 is the ceiling (full delay).
    expect(computeRetryBackoffMs(1, 'rate_limit', () => 0)).toBe(
      RATE_LIMIT_RETRY_BASE_DELAY_MS / 2,
    );
    expect(computeRetryBackoffMs(1, 'rate_limit', () => 1)).toBe(
      RATE_LIMIT_RETRY_BASE_DELAY_MS,
    );
    // Attempt 2 doubles the base before jitter.
    expect(computeRetryBackoffMs(2, 'rate_limit', () => 1)).toBe(
      RATE_LIMIT_RETRY_BASE_DELAY_MS * 2,
    );
  });

  it('caps the backoff at the configured ceiling', () => {
    expect(computeRetryBackoffMs(99, 'rate_limit', () => 1)).toBe(
      MAX_RETRY_BACKOFF_DELAY_MS,
    );
  });

  it('keeps jitter within [delay/2, delay] for any random sample', () => {
    for (const sample of [0, 0.25, 0.5, 0.75, 1]) {
      const delay = computeRetryBackoffMs(2, 'upstream_unavailable', () => sample);
      const capped = Math.min(
        TRANSIENT_RETRY_BASE_DELAY_MS * 2,
        MAX_RETRY_BACKOFF_DELAY_MS,
      );
      expect(delay).toBeGreaterThanOrEqual(capped / 2);
      expect(delay).toBeLessThanOrEqual(capped);
    }
  });
});
