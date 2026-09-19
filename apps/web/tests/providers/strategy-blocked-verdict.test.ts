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
  physicalStatus?: 'succeeded' | 'failed';
}): string {
  return `event: end\ndata: ${JSON.stringify({
    code: 0,
    status: input.physicalStatus ?? 'succeeded',
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

// Reconciliation with main #7931: project delivery is weaker than delivery by
// this run, so it needs this run's own nonempty response as well.
describe('project delivery evidence during blocked run completion', () => {
  it('fails closed when the daemon answers neither delivery question', async () => {
    const h = handlers();
    const reply = 'The existing result is ready.';
    const text = `event: agent\ndata: ${JSON.stringify({ type: 'text_delta', delta: reply })}\n\n`;
    const end = blockedEndFrame({ inputStage: 'production',
      reasonCodes: ['od_next_protocol_runtime_state_missing'] });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/events') return sseResponse(text + end);
      // Older daemons can omit both fields. A nonempty reply is not proof
      // of delivery, and absence must not default to success.
      if (url === '/api/runs/run-1') return jsonResponse({});
      throw new Error(`unexpected fetch ${url}`);
    }));
    await streamViaDaemon({ agentId: 'mock',
      history: [{ id: 'request', role: 'user', content: 'Check the existing result.' }],
      signal: new AbortController().signal, handlers: h, taskExecutionId: 'task-1' });
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onError.mock.calls[0]![0]).toMatchObject({ code: 'od_next_protocol_runtime_state_missing' });
    expect(h.onDone).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'keeps project delivery with this run reply', reply: 'The existing result is ready.', projectValid: true, runValid: false, physicalStatus: 'succeeded', succeeds: true },
    { name: 'rejects project delivery without a reply', reply: '', projectValid: true, runValid: false, physicalStatus: 'succeeded', succeeds: false },
    { name: 'rejects project delivery with only whitespace', reply: '\n  ', projectValid: true, runValid: false, physicalStatus: 'succeeded', succeeds: false },
    { name: 'rejects a reply without either delivery proof', reply: 'The existing result is ready.', projectValid: false, runValid: false, physicalStatus: 'succeeded', succeeds: false },
    { name: 'keeps this run delivery without prose', reply: '', projectValid: false, runValid: true, physicalStatus: 'succeeded', succeeds: true },
    { name: 'preserves physical failure despite project delivery and prose', reply: 'The existing result is ready.', projectValid: true, runValid: false, physicalStatus: 'failed', succeeds: false },
  ] as const)('$name', async ({ reply, projectValid, runValid, physicalStatus, succeeds }) => {
    const h = handlers();
    const text = `event: agent\ndata: ${JSON.stringify({ type: 'text_delta', delta: reply })}\n\n`;
    const end = blockedEndFrame({ inputStage: 'production', physicalStatus,
      reasonCodes: ['od_next_protocol_runtime_state_missing'] });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/events') return sseResponse(text + end);
      if (url === '/api/runs/run-1') return jsonResponse({
        deliverableValid: runValid, projectDeliverableValid: projectValid,
      });
      throw new Error(`unexpected fetch ${url}`);
    }));
    await streamViaDaemon({ agentId: 'mock',
      history: [
        { id: 'earlier', role: 'assistant', content: 'A previous run already described the project.' },
        { id: 'request', role: 'user', content: 'Check the existing result.' },
      ],
      signal: new AbortController().signal, handlers: h, taskExecutionId: 'task-1' });
    if (succeeds) {
      expect(h.onError).not.toHaveBeenCalled();
      expect(h.onDone).toHaveBeenCalledTimes(1);
      expect(h.onDone).toHaveBeenCalledWith(reply);
    } else {
      expect(h.onError).toHaveBeenCalledTimes(1);
      expect(h.onDone).not.toHaveBeenCalled();
      expect(h.onError.mock.calls[0]![0]).toMatchObject({ code: 'od_next_protocol_runtime_state_missing' });
    }
  });
});
