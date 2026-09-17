import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { attachAcpSession } from '../src/agent-protocol/index.js';
import { classifyRunFailure } from '../src/run-failure-classification.js';
import type { RunEventForFailureClassification } from '../src/run-failure-classification.js';

/**
 * Red spec: an ACP stage-watchdog kill must reach the client NAMED.
 *
 * The failure this pins (real user run `500540ac`, 0.22.0-prerelease.19): a
 * `Write` tool call sat for 1800.05s producing zero bytes, the ACP stage
 * watchdog gave up and killed the child, and after 40 minutes the user got the
 * generic 「任务执行失败」 card with no Retry — for a failure whose entire
 * remedy is a retry.
 *
 * The watchdog is the DAEMON's own verdict: nothing upstream reported anything,
 * the daemon decided the stage was over. Yet it shipped that verdict as a bare
 * `{ message: 'ACP <stage> timed out after <n>ms' }`, so the only thing that
 * could still recover "this run timed out" downstream was a regex over that
 * English sentence (`isTimeoutText`). Every path that rewrites, wraps or drops
 * an ACP error message therefore re-filed a watchdog kill as an opaque
 * `process_exit / exit_code` — `retryable: false`, `user_action: 'none'` —
 * which is exactly the no-Retry card.
 *
 * So the invariant is not "the sentence is right", it is: the verdict survives
 * without its own prose.
 */

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

type Emitted = { event: string; payload: unknown };

type ErrorFrame = {
  message?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    details?: Record<string, unknown>;
  };
};

function writeResult(child: FakeAcpChild, id: number, result: unknown): void {
  child.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

/** Drive a session to the point where only the stage watchdog can end it. */
async function stallPastStageWatchdog(): Promise<Emitted[]> {
  const child = new FakeAcpChild();
  const events: Emitted[] = [];
  attachAcpSession({
    child: child as never,
    prompt: 'write the landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
    stageTimeoutMs: 1_000,
  });
  writeResult(child, 1, {});
  writeResult(child, 2, { sessionId: 'session-1' });
  // `session/prompt` is never answered — the real shape of the reported run.
  await vi.advanceTimersByTimeAsync(1_500);
  return events;
}

/**
 * Drive the same real session and let the AGENT answer `session/prompt` with a
 * JSON-RPC error carrying `error.data` — the one channel an ACP agent controls.
 * Returns the error frame the bridge actually emitted, so a test can classify
 * the daemon's real output instead of a hand-built approximation of it.
 *
 * The stage watchdog is given far more time than the frame needs, so anything
 * this produces came from the agent's payload and not from a timer.
 */
async function bridgeAgentRpcError(
  data: unknown,
): Promise<{ frame: ErrorFrame; message: string }> {
  const child = new FakeAcpChild();
  const events: Emitted[] = [];
  attachAcpSession({
    child: child as never,
    prompt: 'write the landing page',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event, payload) => events.push({ event, payload }),
    stageTimeoutMs: 600_000,
  });
  writeResult(child, 1, {});
  writeResult(child, 2, { sessionId: 'session-1' });
  child.stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      error: { code: -32000, message: 'upstream refused the request', data },
    })}\n`,
  );
  await vi.advanceTimersByTimeAsync(10);
  const error = events.find((e) => e.event === 'error');
  assert.ok(error, 'expected the bridge to emit an error event');
  const frame = error.payload as ErrorFrame;
  assert.ok(typeof frame.message === 'string', 'expected a message on the frame');
  return { frame, message: frame.message };
}

/**
 * The classifier input a stage-timeout run reaches finalize with. The child is
 * SIGTERMed by the watchdog, so the process-level facts say nothing about why.
 */
function stageTimeoutClassifierInput(
  errorPayload: unknown,
  statusError: string | null,
) {
  const events: RunEventForFailureClassification[] = [
    { event: 'start', data: { bin: 'vela' } },
    { event: 'error', data: errorPayload },
  ];
  return {
    result: 'failed' as const,
    status: {
      status: 'failed',
      error: statusError,
      errorCode: null,
      exitCode: 1,
      signal: 'SIGTERM',
    },
    agentId: 'amr',
    cancelOrigin: null,
    terminalTrigger: null,
    events,
  } as Parameters<typeof classifyRunFailure>[0];
}

describe('ACP stage watchdog names its own verdict', () => {
  it('emits a classified error frame, not a bare message', async () => {
    vi.useFakeTimers();
    try {
      const events = await stallPastStageWatchdog();
      const error = events.find((e) => e.event === 'error');
      assert.ok(error, 'expected a stage-timeout error event');
      const frame = error.payload as ErrorFrame;

      // The sentence is still the sentence — it is what the details drawer
      // shows and what telemetry reads. Naming the failure must not reword it.
      expect(frame.message).toMatch(/ACP session\/prompt timed out after 1000ms/);

      // …and now it is also NAMED, so nothing downstream has to parse that
      // sentence to learn what happened.
      expect(frame.error?.details).toMatchObject({
        kind: 'acp_stage_timeout',
        action: 'retry',
        phase: 'session/prompt',
        timeout_ms: 1000,
      });
      // A watchdog kill is the one failure whose whole remedy is a retry.
      expect(frame.error?.retryable).toBe(true);
      expect(typeof frame.error?.code).toBe('string');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timeout verdict when the message no longer says "timed out"', () => {
    // The same watchdog kill, with its sentence gone — wrapped, localized,
    // truncated, or lost on one of the paths that rewrite an ACP error frame.
    // The structured verdict is the only evidence left, and it has to be
    // enough: this is the case that produced the generic no-Retry card.
    const failure = classifyRunFailure(
      stageTimeoutClassifierInput(
        {
          message: 'the run was ended by the host',
          error: {
            code: 'AGENT_EXECUTION_FAILED',
            message: 'the run was ended by the host',
            retryable: true,
            details: { kind: 'acp_stage_timeout', action: 'retry', phase: 'session/prompt', timeout_ms: 1_800_000 },
          },
        },
        'the run was ended by the host',
      ),
    );

    expect(failure?.failure_category).toBe('timeout');
    expect(failure?.failure_detail).toBe('timeout');
    // The two fields the chat card reads to decide Retry vs contact-support.
    expect(failure?.retryable).toBe(true);
    expect(failure?.user_action).toBe('retry');
    // Still attributed to the watchdog that actually ended the run, so the
    // telemetry does not have to guess between the stall watchdogs either.
    expect(failure?.terminal_trigger).toBe('acp_stage_timeout');
  });

  it('still classifies the real watchdog sentence as a retryable timeout', () => {
    // The unrewritten path, so the fix cannot be a swap of one sole signal for
    // another: with prose AND marker present the verdict is unchanged.
    const failure = classifyRunFailure(
      stageTimeoutClassifierInput(
        {
          message: 'ACP session/prompt timed out after 1800000ms',
          error: {
            code: 'AGENT_EXECUTION_FAILED',
            message: 'ACP session/prompt timed out after 1800000ms',
            retryable: true,
            details: { kind: 'acp_stage_timeout', action: 'retry', phase: 'session/prompt', timeout_ms: 1_800_000 },
          },
        },
        'ACP session/prompt timed out after 1800000ms',
      ),
    );

    expect(failure?.failure_category).toBe('timeout');
    expect(failure?.failure_detail).toBe('timeout');
    expect(failure?.retryable).toBe(true);
    expect(failure?.user_action).toBe('retry');
    expect(failure?.terminal_trigger).toBe('acp_stage_timeout');
  });
});

describe('the timeout verdict does not spread to failures that are not timeouts', () => {
  it('leaves an unmarked SIGTERM exit as a process exit', () => {
    // Same process-level facts as a watchdog kill, no marker, no timeout prose.
    // If this turned into a timeout, every killed child would claim a Retry it
    // has not earned.
    const failure = classifyRunFailure(
      stageTimeoutClassifierInput(
        { message: 'the run was ended by the host' },
        'the run was ended by the host',
      ),
    );

    expect(failure?.failure_category).not.toBe('timeout');
    expect(failure?.failure_detail).not.toBe('timeout');
  });

  it('leaves another named ACP failure alone', () => {
    // `acp_child_exit` carries a `details.kind` too. Only `timeout` is a
    // timeout verdict; a neighbouring kind must not be read as one.
    const failure = classifyRunFailure(
      stageTimeoutClassifierInput(
        {
          message: 'ACP session exited before completion (code=3, signal=none)',
          error: {
            code: 'AGENT_EXECUTION_FAILED',
            message: 'ACP session exited before completion (code=3, signal=none)',
            details: { kind: 'acp_child_exit', phase: 'session/prompt', exit_code: 3, signal: null },
          },
        },
        'ACP session exited before completion (code=3, signal=none)',
      ),
    );

    expect(failure?.failure_category).not.toBe('timeout');
  });

  it('still reports an empty reply as no output, not as a timeout', () => {
    // The `empty_output` rung is P0-guarded ("没有输出"), and it resolves
    // BEFORE the timeout branch. A run that both stalled and produced nothing
    // must keep saying it produced nothing.
    const failure = classifyRunFailure(
      stageTimeoutClassifierInput(
        {
          message: 'ACP session completed without producing any output',
          error: {
            code: 'AGENT_EXECUTION_FAILED',
            message: 'ACP session completed without producing any output',
            retryable: true,
            details: { kind: 'acp_stage_timeout', action: 'retry', phase: 'session/prompt', timeout_ms: 1_000 },
          },
        },
        'ACP session completed without producing any output',
      ),
    );

    expect(failure?.failure_category).toBe('empty_output');
    expect(failure?.failure_detail).toBe('empty_output');
  });

  /**
   * This replaces a test that asserted the same thing against `error.data` —
   * a shape the session bridge never emits. `fail()` copies an agent's
   * JSON-RPC `error.data` straight into the `error.details` slot
   * (`fail(rpcErr, { details: rpcErrorData(obj) })`), so the frame the
   * classifier actually receives has agent-authored content sitting exactly
   * where the daemon writes its own verdict. Constructing `error.data` by hand
   * at the classifier boundary tested a frame that cannot exist, and passed
   * without ever exercising the copy.
   *
   * So this drives the real bridge and classifies the frame it really emits.
   */
  it('does not let an agent-supplied payload forge a timeout verdict', async () => {
    vi.useFakeTimers();
    try {
      const { frame, message } = await bridgeAgentRpcError({ kind: 'timeout' });

      // The mechanism, pinned as a fact about the bridge rather than assumed:
      // the agent's `error.data` really does land in the daemon's `details`
      // slot. If a future change stops copying it, this line says so.
      expect(frame.error?.details).toEqual({ kind: 'timeout' });

      const failure = classifyRunFailure(stageTimeoutClassifierInput(frame, message));

      expect(failure?.failure_category).not.toBe('timeout');
      expect(failure?.terminal_trigger).not.toBe('acp_stage_timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies the watchdog frame the bridge really emits', async () => {
    // The positive control for the test above, driven the same way: the marker
    // has to survive the round trip from the real watchdog through the real
    // frame into the classifier, or the negative test could be passing because
    // the marker stopped working at all.
    vi.useFakeTimers();
    try {
      const events = await stallPastStageWatchdog();
      const error = events.find((e) => e.event === 'error');
      assert.ok(error, 'expected a stage-timeout error event');
      const frame = error.payload as ErrorFrame;

      const failure = classifyRunFailure(
        // The sentence is deliberately withheld: this asserts the STRUCTURED
        // verdict carries the run on its own, which is the whole point of
        // emitting one.
        stageTimeoutClassifierInput(frame, 'the run was ended by the host'),
      );

      expect(failure?.failure_category).toBe('timeout');
      expect(failure?.terminal_trigger).toBe('acp_stage_timeout');
      expect(failure?.user_action).toBe('retry');
    } finally {
      vi.useRealTimers();
    }
  });
});
