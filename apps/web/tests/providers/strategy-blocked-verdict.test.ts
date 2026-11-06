import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StrategyTaskProjectionV2 } from '@open-design/contracts';

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
  const onStrategyTaskSettled = vi.fn();
  const onRunStatus = vi.fn();
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
    onRunStatus,
    onStrategyTaskSettled,
  });
  expect(h.onError).not.toHaveBeenCalled();
  expect(h.onDone).toHaveBeenCalledTimes(1);
  expect(onRunStatus).toHaveBeenLastCalledWith('succeeded');
  expect(onStrategyTaskSettled).toHaveBeenCalledTimes(1);
  return onStrategyTaskSettled.mock.calls[0]![0] as StrategyTaskProjectionV2;
}

describe('a blocked strategy task reaches the message as the daemon\'s own verdict', () => {
  // The turn the user sees is the one right after they answered a question
  // form: their answers went in, the agent answered, and the task still landed
  // terminal-`blocked` because the reply carried no Runtime State block. The
  // verdict is correct — at the clarification stage the contract admits only
  // `plan_ready` (which needs a Plan Contract the reply never had), `blocked`
  // or `canceled`. The Run itself succeeded, so the turn ends Done: the
  // verdict is stamped on the message through the settled projection, where
  // the diagnostics can name the reason, and no run error is raised over it.
  //
  // These frames stream no visible reply. That no longer changes the outcome:
  // a succeeded Run stays Done whether or not the agent said anything.
  it('carries the blocking reason code on the settled verdict so the diagnostics can name it', async () => {
    const settled = await runBlockedTurn(blockedEndFrame({
      inputStage: 'clarification',
      reasonCodes: ['od_next_protocol_runtime_state_missing'],
    }));

    expect(settled.outcome).toBe('blocked');
    expect(settled.blockedContext?.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);
  });

  it('ends the turn Done instead of raising a run error over the verdict', async () => {
    const settled = await runBlockedTurn(blockedEndFrame({
      inputStage: 'clarification',
      reasonCodes: ['od_next_protocol_runtime_state_missing'],
    }));

    // `runBlockedTurn` already asserts no `onError`, one `onDone` and a final
    // `succeeded` status; the settled projection is what the message keeps.
    expect(settled.terminal).toBe(true);
    expect(settled.inputStage).toBe('clarification');
  });

  it('keeps a verdict from a daemon that sent no blocked context', async () => {
    // Older daemons project a blocked task without `blockedContext`. The turn
    // still ends Done, and the verdict still lands — without a reason to name.
    const settled = await runBlockedTurn(blockedEndFrame({ inputStage: 'production' }));

    expect(settled.outcome).toBe('blocked');
    expect(settled.blockedContext).toBeUndefined();
  });
});

// The daemon's two delivery answers (did this run write the entry, does the
// project hold one) used to decide whether a succeeded Run kept its success
// beside a blocked task. They no longer take part: the Run's own result
// decides, and only a Run that did not succeed raises the error.
describe('delivery evidence during blocked run completion', () => {
  it('keeps the success when the daemon answers neither delivery question', async () => {
    const h = handlers();
    const reply = 'The existing result is ready.';
    const text = `event: agent\ndata: ${JSON.stringify({ type: 'text_delta', delta: reply })}\n\n`;
    const end = blockedEndFrame({ inputStage: 'production',
      reasonCodes: ['od_next_protocol_runtime_state_missing'] });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/events') return sseResponse(text + end);
      // Older daemons can omit both fields; the outcome does not depend on them.
      if (url === '/api/runs/run-1') return jsonResponse({});
      throw new Error(`unexpected fetch ${url}`);
    }));
    await streamViaDaemon({ agentId: 'mock',
      history: [{ id: 'request', role: 'user', content: 'Check the existing result.' }],
      signal: new AbortController().signal, handlers: h, taskExecutionId: 'task-1' });
    expect(h.onError).not.toHaveBeenCalled();
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledWith(reply);
  });

  it.each([
    { name: 'keeps the success with project delivery and this run reply', reply: 'The existing result is ready.', projectValid: true, runValid: false, physicalStatus: 'succeeded', succeeds: true },
    { name: 'keeps the success with project delivery and no reply', reply: '', projectValid: true, runValid: false, physicalStatus: 'succeeded', succeeds: true },
    { name: 'keeps the success with project delivery and only whitespace', reply: '\n  ', projectValid: true, runValid: false, physicalStatus: 'succeeded', succeeds: true },
    { name: 'keeps the success with a reply and neither delivery proof', reply: 'The existing result is ready.', projectValid: false, runValid: false, physicalStatus: 'succeeded', succeeds: true },
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
