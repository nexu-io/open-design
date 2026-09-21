/**
 * A blocked strategy task reaches the user with the daemon's own verdict.
 *
 * Since the two-round design a task blocks for one reason: its physical Run
 * failed before the round settled, which the daemon stamps as
 * `od_next_physical_run_interrupted`. The Run's own error frame normally
 * names the cause first (pinned in `sse.test.ts`); these cases cover the
 * stream that lost that frame, where the verdict is read off the terminal
 * `end` payload and the error the chat receives has to name the reason and
 * say what happened instead of restating that something did not continue.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamViaDaemon } from '../../src/providers/daemon';

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
}

function handlers() {
  return {
    onDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onAgentEvent: vi.fn(),
    onArtifactCount: vi.fn(),
  };
}

function blockedEndFrame(input: {
  inputStage: 'request' | 'production';
  reasonCodes?: string[];
}): string {
  return `event: end\ndata: ${JSON.stringify({
    code: 1,
    status: 'failed',
    strategyTask: {
      taskExecutionId: 'task-1',
      strategy: {
        id: 'od-next-strategy',
        version: '2.0.0',
        packageHash: 'a'.repeat(64),
        snapshotId: 'snapshot-1',
      },
      inputStage: input.inputStage,
      outcome: 'blocked',
      route: 'full_plan',
      executionMode: input.inputStage === 'production' ? 'simple' : null,
      activeRunId: 'run-1',
      terminal: true,
      ...(input.reasonCodes
        ? { blockedContext: { reasonCodes: input.reasonCodes, visibleText: null } }
        : {}),
    },
  })}\n\n`;
}

async function runBlockedTurn(frame: string) {
  const h = handlers();
  const onRunStatus = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
    if (url === '/api/runs/run-1/events') return sseResponse(frame);
    throw new Error(`unexpected fetch ${url}`);
  }));
  await streamViaDaemon({
    agentId: 'mock',
    history: [{ id: '1', role: 'user', content: '深色，三页，中文' }],
    signal: new AbortController().signal,
    handlers: h,
    onRunStatus,
  });
  expect(onRunStatus).toHaveBeenLastCalledWith('failed');
  expect(h.onDone).not.toHaveBeenCalled();
  expect(h.onError).toHaveBeenCalledTimes(1);
  return h.onError.mock.calls[0]![0] as Error & { code?: string };
}

describe('a blocked strategy task reaches the user with the daemon\'s own verdict', () => {
  it('carries the interrupted-run reason code so the card and the diagnostics can name it', async () => {
    const error = await runBlockedTurn(blockedEndFrame({
      inputStage: 'production',
      reasonCodes: ['od_next_physical_run_interrupted'],
    }));

    // Read the property directly rather than asserting through
    // `not.toHaveBeenCalledWith`: a partial-object matcher passes on an error
    // that carries no code at all.
    expect(error.code).toBe('od_next_physical_run_interrupted');
  });

  it('says what happened instead of restating that something did not continue', async () => {
    const error = await runBlockedTurn(blockedEndFrame({
      inputStage: 'request',
      reasonCodes: ['od_next_physical_run_interrupted'],
    }));

    expect(error.message).not.toBe('The strategy task could not continue.');
    expect(error.message).toMatch(/agent process ended before this round settled/);
  });

  it('keeps a verdict from a daemon that sent no blocked context', async () => {
    // A projection without `blockedContext` still fails the turn — just
    // without a reason code to name.
    const error = await runBlockedTurn(blockedEndFrame({ inputStage: 'production' }));

    expect(error.code).toBeUndefined();
    expect(error.message).not.toBe('The strategy task could not continue.');
  });
});
