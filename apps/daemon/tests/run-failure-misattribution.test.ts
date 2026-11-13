/**
 * Production texts that the classifier attributed to the wrong cause
 * (OPEND-4392). Unlike run-failure-classification.test.ts nothing is mocked:
 * the misattributions come from the real AMR account-failure detector and the
 * forced-signal precedence.
 */
import { describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../src/run-failure-classification.js';

type Input = Parameters<typeof classifyRunFailure>[0];

function classify({
  error,
  errorCode,
  agentId,
  signal = null,
  exitCode = 1,
  events = [],
}: {
  error: string;
  errorCode: string;
  agentId: string;
  signal?: string | null;
  exitCode?: number | null;
  events?: NonNullable<Input['events']>;
}) {
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error, errorCode, exitCode, signal },
    errorCode,
    agentId,
    events,
  });
}

const fatalClose = { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' } };

describe('AMR model catalog failure followed by the daemon tearing vela down', () => {
  // 0.26.x Motion runs on macOS: vela reports the catalog failure, the daemon
  // then SIGKILLs the child. 16 of 20 sampled `signal_killed` bundles were this.
  it('keeps the reported catalog failure instead of the teardown signal', () => {
    const message = 'json-rpc id 2: AMR model catalog is temporarily unavailable. Please retry.';
    const failure = classify({
      error: message,
      errorCode: 'UPSTREAM_UNAVAILABLE',
      agentId: 'amr',
      signal: 'SIGKILL',
      events: [
        {
          event: 'error',
          data: {
            message,
            error: {
              code: 'UPSTREAM_UNAVAILABLE',
              message,
              retryable: true,
              details: { kind: 'model_catalog_unavailable', phase: 'session_load', retryable: true },
            },
          },
        },
        fatalClose,
      ],
    });
    expect(failure?.failure_category).toBe('upstream_unavailable');
    expect(failure?.failure_detail).not.toBe('signal_killed');
    expect(failure?.retryable).toBe(true);
  });

  it('still reports a bare forced kill as signal_killed', () => {
    const failure = classify({
      error: 'Agent process exited unexpectedly.',
      errorCode: 'AGENT_EXECUTION_FAILED',
      agentId: 'amr',
      signal: 'SIGKILL',
      exitCode: null,
      events: [fatalClose],
    });
    expect(failure?.failure_detail).toBe('signal_killed');
  });
});

describe('provider content filter', () => {
  // 24 runs / 6 users on Claude Opus and Sonnet, 10/23-10/26, reported as fatal_rpc_error.
  it('is a non-retryable content_filtered policy rejection', () => {
    const failure = classify({
      error:
        'json-rpc id 4: opencode event stream: {"id":"evt_1","properties":{"error":{"data":{"message":"The response was blocked by the provider\'s content filter"},"name":"ContentFilterError"},"sessionID":"ses_1"},"type":"session.error"} (event=session.error, session=ses_1)',
      errorCode: 'AGENT_EXECUTION_FAILED',
      agentId: 'amr',
      events: [fatalClose],
    });
    expect(failure).toMatchObject({
      failure_detail: 'content_filtered',
      failure_mechanism: 'policy_rejection',
      failure_domain: 'policy_admission',
      policy_reason: 'content_filtered',
      retryable: false,
    });
  });
});

describe('Gemini BYOK quota errors', () => {
  const head =
    'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n';

  it('treats a per-minute free-tier limit as a retryable rate limit, not AMR balance', () => {
    const failure = classify({
      error:
        head +
        '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.6-flash, description: Generate content requests per minute limit exceeded on Free Tier. See https://ai.google.dev/gemini-api/docs/rate-limits.\nPlease retry in 32.4s.',
      errorCode: 'RATE_LIMITED',
      agentId: 'byok-opencode',
    });
    expect(failure).toMatchObject({ failure_category: 'rate_limit', failure_detail: 'rate_limit_429', retryable: true });
  });

  it('treats a per-day or zero limit as an exhausted provider quota, not AMR balance', () => {
    const failure = classify({
      error:
        head +
        '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-4-argon, description: Generate content input tokens per day limit exceeded on Free Tier.',
      errorCode: 'RATE_LIMITED',
      agentId: 'byok-opencode',
    });
    expect(failure).toMatchObject({ failure_category: 'rate_limit', failure_detail: 'hard_quota', retryable: false });
  });
});

describe('explicit AMR balance signals reported as RATE_LIMITED', () => {
  it.each(['balance is empty', 'balance too low', 'billing balance', '额度不足'])(
    'preserves recharge guidance for %s', (error) => {
      expect(classify({ error, errorCode: 'RATE_LIMITED', agentId: 'amr' })).toMatchObject({
        failure_detail: 'amr_insufficient_balance',
        policy_reason: 'amr_insufficient_balance',
        retryable: false,
        user_action: 'recharge',
      });
    },
  );
});
