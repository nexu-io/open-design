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
        kind: 'timeout',
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
            details: { kind: 'timeout', action: 'retry', phase: 'session/prompt', timeout_ms: 1_800_000 },
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
            details: { kind: 'timeout', action: 'retry', phase: 'session/prompt', timeout_ms: 1_800_000 },
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
            details: { kind: 'timeout', action: 'retry', phase: 'session/prompt', timeout_ms: 1_000 },
          },
        },
        'ACP session completed without producing any output',
      ),
    );

    expect(failure?.failure_category).toBe('empty_output');
    expect(failure?.failure_detail).toBe('empty_output');
  });

  it('does not let an agent-supplied payload forge a timeout verdict', () => {
    // Agent-reported JSON-RPC data lands under `error.data`, never
    // `error.details` — the marker is daemon-authored by construction.
    const failure = classifyRunFailure(
      stageTimeoutClassifierInput(
        {
          message: 'json-rpc id 4: upstream refused the request',
          error: {
            code: 'AGENT_EXECUTION_FAILED',
            message: 'json-rpc id 4: upstream refused the request',
            data: { kind: 'timeout' },
          },
        },
        'json-rpc id 4: upstream refused the request',
      ),
    );

    expect(failure?.failure_category).not.toBe('timeout');
  });
});
