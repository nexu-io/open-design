// Unit coverage for `deriveRunErrorCode`. The v2 analytics doc requires
// `run_finished` events with `result === 'failed'` to carry a non-empty
// `error_code` so dashboards keyed on it can break failures down by
// reason. Several daemon failure paths reach `runs.finish('failed',
// ...)` WITHOUT first emitting an SSE `error` event (ACP fatal,
// agentStreamError fall-through, child close with no diagnostic). When
// they do, the run status body's `errorCode` is `null`. The fallback
// chain in `run-result.ts` turns those signal/exitCode hints into a
// best-effort code so the wire emission never blanks out.
//
// This pins each failure shape's expected output. A future refactor
// that loses the fallback re-introduces the original symptom: PostHog
// shows `result=failed` events with no `error_code`.

import { describe, expect, it } from 'vitest';

import {
  deriveRunErrorCode,
  runResultFromStatus,
} from '../src/run-result.js';

describe('runResultFromStatus', () => {
  it('maps succeeded -> success', () => {
    expect(runResultFromStatus('succeeded')).toBe('success');
  });
  it('maps canceled -> cancelled (with the analytics doc spelling)', () => {
    expect(runResultFromStatus('canceled')).toBe('cancelled');
  });
  it('maps failed -> failed', () => {
    expect(runResultFromStatus('failed')).toBe('failed');
  });
  it('maps unknown / partial states to failed (defensive)', () => {
    expect(runResultFromStatus('running')).toBe('failed');
    expect(runResultFromStatus(undefined)).toBe('failed');
  });
});

describe('deriveRunErrorCode', () => {
  it('returns undefined for a successful run', () => {
    expect(
      deriveRunErrorCode({
        status: 'succeeded',
        errorCode: null,
        exitCode: 0,
        signal: null,
      }),
    ).toBeUndefined();
  });

  it('forwards an explicit errorCode set via runs.emit(error, …)', () => {
    expect(
      deriveRunErrorCode({
        status: 'failed',
        errorCode: 'AGENT_EXECUTION_FAILED',
        exitCode: 1,
        signal: null,
      }),
    ).toBe('AGENT_EXECUTION_FAILED');
  });

  it('derives AGENT_SIGNAL_* when the child died from a signal', () => {
    expect(
      deriveRunErrorCode({
        status: 'failed',
        errorCode: null,
        exitCode: null,
        signal: 'SIGSEGV',
      }),
    ).toBe('AGENT_SIGNAL_SIGSEGV');
  });

  it('derives AGENT_EXIT_<code> when the child exited non-zero with no signal', () => {
    expect(
      deriveRunErrorCode({
        status: 'failed',
        errorCode: null,
        exitCode: 1,
        signal: null,
      }),
    ).toBe('AGENT_EXIT_1');
    expect(
      deriveRunErrorCode({
        status: 'failed',
        errorCode: null,
        exitCode: 137,
        signal: null,
      }),
    ).toBe('AGENT_EXIT_137');
  });

  it('falls back to AGENT_TERMINATED_UNKNOWN when neither signal nor non-zero exit is available', () => {
    // This is the shape produced when `acpSession.hasFatalError()` is
    // true even though the child exited cleanly (code=0, no signal) —
    // see `child.on('close', ...)` in server.ts. Without this fallback,
    // those failures would still blank out on PostHog.
    expect(
      deriveRunErrorCode({
        status: 'failed',
        errorCode: null,
        exitCode: 0,
        signal: null,
      }),
    ).toBe('AGENT_TERMINATED_UNKNOWN');
  });

  it('returns undefined for a cancelled run with no stamped code', () => {
    // Cancellation is the user's choice; not a diagnosable failure.
    expect(
      deriveRunErrorCode({
        status: 'canceled',
        errorCode: null,
        exitCode: null,
        signal: 'SIGTERM',
      }),
    ).toBeUndefined();
  });

  it('forwards an explicit errorCode on a cancelled run (cancel during error recovery)', () => {
    expect(
      deriveRunErrorCode({
        status: 'canceled',
        errorCode: 'AGENT_AUTH_REQUIRED',
        exitCode: 1,
        signal: null,
      }),
    ).toBe('AGENT_AUTH_REQUIRED');
  });

  it('treats empty-string errorCode as "missing" so the fallback chain still kicks in', () => {
    // Defensive — `readString` in runs.ts trims and null-checks, but
    // any future caller passing an empty string would otherwise emit a
    // blank `error_code` field and reintroduce the original symptom.
    expect(
      deriveRunErrorCode({
        status: 'failed',
        errorCode: '',
        exitCode: 1,
        signal: null,
      }),
    ).toBe('AGENT_EXIT_1');
  });
});
