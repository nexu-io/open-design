import { describe, expect, it } from 'vitest';

// Refs #6143. The sibling suite (`run-failure-classification.test.ts`) mocks
// `runtimes/auth.js` and `integrations/vela-errors.js` so it can pin one branch
// at a time. That isolation hid a production path: `classifyRunFailure` reaches
// the rate-limit branch through `classifyAgentServiceFailure`, whose matcher
// carried its own bare `quota` alternative — so the daemon's empty-output
// fallback still came back as a retryable `rate_limit / rate_limit_429` even
// after the local `isHardQuotaText` stopped matching it.
//
// This file therefore imports the real classifier with no `vi.mock` at all. Its
// job is to hold the *cross-module* contract; per-branch behaviour stays in the
// mocked suite.
import {
  classifyRunFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

function errorEvent(
  code: string,
  message: string,
  retryable?: boolean,
): RunEventForFailureClassification {
  return {
    event: 'error',
    data: {
      message,
      error: {
        code,
        message,
        ...(retryable !== undefined ? { retryable } : {}),
      },
    },
  };
}

function classify(
  code: string | null,
  message = '',
  events: RunEventForFailureClassification[] = code
    ? [errorEvent(code, message)]
    : [],
) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message || null,
      errorCode: code,
      exitCode: 1,
      signal: null,
    },
    ...(code ? { errorCode: code } : {}),
    agentId: 'claude',
    events,
  });
}

// Verbatim copy of the daemon's generic fallback (apps/daemon/src/server.ts).
const EMPTY_OUTPUT_FALLBACK =
  'Agent completed without producing any output. The model or provider may ' +
  'have returned an empty response. Check the agent logs for upstream ' +
  'errors, then try re-authenticating the agent, checking quota, or ' +
  'switching models.';

describe('classifyRunFailure with real service-failure classifier', () => {
  it('classifies the daemon empty-output fallback as empty output, not a rate limit', () => {
    expect(
      classify('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK),
    ).toMatchObject({
      failure_category: 'empty_output',
      failure_detail: 'empty_output',
      retryable: true,
    });
  });

  it('keeps the fallback as empty output when an unrelated fragment mentions money', () => {
    for (const unrelated of [
      'Switched to the fallback plan for this workspace.',
      'Your payment details were updated 3 days ago.',
      'Restored session from the previous billing period snapshot.',
      'Failed to load plan',
    ]) {
      expect(
        classify('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK, [
          errorEvent('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK),
          errorEvent('AGENT_EXECUTION_FAILED', unrelated),
        ]),
        unrelated,
      ).toMatchObject({
        failure_category: 'empty_output',
        failure_detail: 'empty_output',
      });
    }
  });

  it('still reports explicit quota exhaustion as a non-retryable hard quota', () => {
    for (const text of [
      'quota exhausted',
      'quota exceeded',
      'Quota depleted for this account.',
      'You have exceeded your monthly quota.',
    ]) {
      expect(classify('AGENT_EXECUTION_FAILED', text), text).toMatchObject({
        failure_category: 'rate_limit',
        failure_detail: 'hard_quota',
        retryable: false,
      });
      // Under RATE_LIMITED the stakes are higher: losing the phrase match turns
      // a terminal quota failure into a retryable `rate_limit_429`.
      expect(
        classify('RATE_LIMITED', text),
        `RATE_LIMITED ${text}`,
      ).toMatchObject({
        failure_detail: 'hard_quota',
        retryable: false,
      });
    }
  });

  it('keeps a genuinely corroborated quota fragment classified alongside the fallback', () => {
    // With the real vela detector in play, this wording is routed to the more
    // specific balance category before the quota branch is reached. Either way
    // it must stay non-retryable — what the fallback must not do is *become*
    // this.
    expect(
      classify('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK, [
        errorEvent('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK),
        errorEvent(
          'AGENT_EXECUTION_FAILED',
          'You exceeded your current quota, please check your plan and billing details.',
        ),
      ]),
    ).toMatchObject({
      failure_category: 'insufficient_balance',
      retryable: false,
    });

    // A quota fragment that corroborates itself without tripping the vela
    // detector still lands on the hard-quota path.
    expect(
      classify('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK, [
        errorEvent('AGENT_EXECUTION_FAILED', EMPTY_OUTPUT_FALLBACK),
        errorEvent(
          'AGENT_EXECUTION_FAILED',
          'Your plan has no quota left for this model.',
        ),
      ]),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'hard_quota',
      retryable: false,
    });
  });

  it('still recognises ordinary rate limits and auth failures through the real classifier', () => {
    expect(
      classify('AGENT_EXECUTION_FAILED', 'HTTP 429 Too Many Requests'),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'rate_limit_429',
      retryable: true,
    });
    expect(
      classify('AGENT_EXECUTION_FAILED', 'HTTP 401 Unauthorized'),
    ).toMatchObject({
      failure_category: 'auth',
    });
  });
});
