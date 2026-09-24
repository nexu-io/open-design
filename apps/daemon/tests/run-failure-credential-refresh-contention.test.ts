// A lost race for the local OAuth refresh lock must classify as a retryable
// `credential_refresh_contention`, not as an auth failure and not as an opaque
// process exit.
//
// Upstream text is the Claude Code CLI's own message, raised when a second
// process (another agent run, or a `claude login` typed by hand) holds the
// refresh lock for the shared credential file:
//
//   "Failed to refresh OAuth token: another Claude Code process is refreshing
//    it or exited mid-refresh. This is usually transient; retry in a minute,
//    and if it persists close other Claude Code processes or sign in again"
//
// Two wrong destinations are possible without this branch, and both are
// asserted against below:
//
//   * `auth` — fixed at `retryable: false` / `user_action: 'login'`, which
//     tells the user to re-authenticate a credential that never expired.
//   * `exit_nonzero` — refused by `transientSuppressedReason` as a
//     non-retryable category, which strands a condition the agent itself
//     calls transient behind a dead-end failure card.
import { describe, expect, it, vi } from 'vitest';

// Same stubs as run-failure-classification.test.ts: these modules would claim
// the text first, so stubbing them proves the new branch is what recognises it.
vi.mock('../src/integrations/vela-errors.js', () => ({
  classifyAmrAccountFailure: () => null,
  reportsPlatformProviderCredentialFault: () => false,
}));

vi.mock('../src/runtimes/auth.js', () => ({
  classifyAgentServiceFailure: () => null,
  reportsToolPrincipalAuthFailure: () => false,
}));

import {
  classifyRunFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

const CONTENTION_MESSAGE =
  'Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh. This is usually transient; retry in a minute, and if it persists close other Claude Code processes or sign in again';

function errorEvent(
  code: string,
  message: string,
): RunEventForFailureClassification {
  return {
    event: 'error',
    data: { message, error: { code, message } },
  };
}

function classify(code: string, message: string) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message,
      errorCode: code,
      exitCode: 1,
      signal: null,
    },
    errorCode: code,
    agentId: 'claude',
    events: [errorEvent(code, message)],
  });
}

describe('credential refresh contention', () => {
  it('names the contention instead of falling through to an opaque exit', () => {
    const result = classify('AGENT_EXECUTION_FAILED', CONTENTION_MESSAGE);
    expect(result?.failure_detail).toBe('credential_refresh_contention');
    expect(result?.failure_category).toBe('process_exit');
    expect(result?.failure_stage).toBe('session_init');
  });

  it('stays retryable and asks for a retry, never a sign-in', () => {
    const result = classify('AGENT_EXECUTION_FAILED', CONTENTION_MESSAGE);
    expect(result?.retryable).toBe(true);
    expect(result?.user_action).toBe('retry');
    // The credential is valid; sending the user to /login is the bug.
    expect(result?.failure_category).not.toBe('auth');
    expect(result?.user_action).not.toBe('login');
  });

  // The message's own tail advises signing in "if it persists". That advice is
  // for a human reading a repeat, not evidence about this occurrence — it must
  // not drag the first failure into the auth verdict.
  it('does not treat the trailing sign-in advice as auth evidence', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'Failed to refresh OAuth token: another Claude Code process is refreshing it. Sign in again if it persists.',
    );
    expect(result?.failure_detail).toBe('credential_refresh_contention');
    expect(result?.retryable).toBe(true);
  });

  // The half of the message that arrives when the lock holder died rather than
  // when it was merely busy.
  it('recognises the mid-refresh abort shape on its own', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'Failed to refresh OAuth token: the refreshing process exited mid-refresh.',
    );
    expect(result?.failure_detail).toBe('credential_refresh_contention');
    expect(result?.retryable).toBe(true);
  });

  // Reverse direction: a genuinely unusable token is still an auth failure.
  // Retrying that one cannot help, so it must keep its non-retryable verdict.
  it('leaves a spent refresh token in the auth bucket', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'Auth error: refresh token already used, please sign in again.',
    );
    expect(result?.failure_detail).not.toBe('credential_refresh_contention');
    expect(result?.failure_category).toBe('auth');
    expect(result?.retryable).toBe(false);
  });

  it('does not claim unrelated failures', () => {
    const result = classify('AGENT_EXECUTION_FAILED', 'Error: spawn ENOENT');
    expect(result?.failure_detail).not.toBe('credential_refresh_contention');
  });
});
