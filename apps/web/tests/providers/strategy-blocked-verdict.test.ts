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
  inputStage: 'request' | 'clarification' | 'production';
  reasonCodes?: string[];
}): string {
  return `event: end\ndata: ${JSON.stringify({
    code: 0,
    status: 'succeeded',
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
        ? {
            blockedContext: {
              reasonCodes: input.reasonCodes,
              visibleText: '好的，按你说的三页来做。计划如下：1) 首页 2) 列表 3) 详情。',
            },
          }
        : {}),
    },
  })}\n\n`;
}

async function runBlockedTurn(frame: string) {
  const h = handlers();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
    if (url === '/api/runs/run-1/events') return sseResponse(frame);
    if (url === '/api/runs/run-1') return jsonResponse({ deliverableValid: false });
    throw new Error(`unexpected fetch ${url}`);
  }));
  await streamViaDaemon({
    agentId: 'mock',
    history: [{ id: '1', role: 'user', content: '深色，三页，中文' }],
    signal: new AbortController().signal,
    handlers: h,
    taskExecutionId: 'task-1',
  });
  expect(h.onError).toHaveBeenCalledTimes(1);
  return h.onError.mock.calls[0]![0] as Error & { code?: string };
}

describe('a blocked strategy task reaches the user with the daemon\'s own verdict', () => {
  // The turn the user sees is the one right after they answered a question
  // form: their answers went in, the agent answered, and the task still landed
  // terminal-`blocked` because the reply carried no Runtime State block. The
  // verdict is correct — at the clarification stage the contract admits only
  // `plan_ready` (which needs a Plan Contract the reply never had), `blocked`
  // or `canceled`. What is NOT correct is handing that to the user as a
  // sentence with no subject, no reason and nothing to look up.
  it('carries the blocking reason code so the card and the diagnostics can name it', async () => {
    const error = await runBlockedTurn(blockedEndFrame({
      inputStage: 'clarification',
      reasonCodes: ['od_next_protocol_runtime_state_missing'],
    }));

    // Read the property directly rather than asserting through
    // `not.toHaveBeenCalledWith`: a partial-object matcher passes on an error
    // that carries no code at all.
    expect(error.code).toBe('od_next_protocol_runtime_state_missing');
  });

  it('says what happened instead of restating that something did not continue', async () => {
    const error = await runBlockedTurn(blockedEndFrame({
      inputStage: 'clarification',
      reasonCodes: ['od_next_protocol_runtime_state_missing'],
    }));

    expect(error.message).not.toBe('The strategy task could not continue.');
    expect(error.message).toContain('reply');
  });

  it('keeps a verdict from a daemon that sent no blocked context', async () => {
    // Older daemons project a blocked task without `blockedContext`. The turn
    // must still fail — just without a reason code to name.
    const error = await runBlockedTurn(blockedEndFrame({ inputStage: 'production' }));

    expect(error.code).toBeUndefined();
    expect(error.message).not.toBe('The strategy task could not continue.');
  });
});
