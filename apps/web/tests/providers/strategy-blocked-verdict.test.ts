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

async function streamBlockedTurn(
  frame: string,
  runStatus: Record<string, unknown> = { deliverableValid: false },
) {
  const h = handlers();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
    if (url === '/api/runs/run-1/events') return sseResponse(frame);
    if (url === '/api/runs/run-1') return jsonResponse(runStatus);
    throw new Error(`unexpected fetch ${url}`);
  }));
  await streamViaDaemon({
    agentId: 'mock',
    history: [{ id: '1', role: 'user', content: '深色，三页，中文' }],
    signal: new AbortController().signal,
    handlers: h,
    taskExecutionId: 'task-1',
  });
  return h;
}

async function runBlockedTurn(frame: string) {
  const h = await streamBlockedTurn(frame);
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

// The incident this split exists for: vela compacted mid-build and dropped the
// run, the user typed "继续", the agent re-checked the 2.27 MB deck an earlier
// turn had already written, correctly rewrote nothing, and the turn was refused
// over its machine block. `deliverableValid` — "did THIS run write the entry" —
// is `false` for that shape and always will be, so the carve-out that exists to
// keep a delivered turn out of the failure branch could never fire, and a red
// card landed under a finished deck the user could see rendered beside it.
describe('a blocked turn the user still has the deliverable for', () => {
  it('does not become a failure when the project holds the deliverable', async () => {
    const h = await streamBlockedTurn(
      blockedEndFrame({
        inputStage: 'production',
        reasonCodes: ['od_next_canonical_deliverable_invalid'],
      }),
      { deliverableValid: false, projectDeliverableValid: true },
    );

    expect(h.onError).not.toHaveBeenCalled();
  });

  it('still fails when the project holds nothing either', async () => {
    // The other half of the split has to keep working: an empty-handed turn is
    // a real failure and must keep its card and its reason code.
    const h = await streamBlockedTurn(
      blockedEndFrame({
        inputStage: 'production',
        reasonCodes: ['od_next_canonical_deliverable_invalid'],
      }),
      { deliverableValid: false, projectDeliverableValid: false },
    );

    expect(h.onError).toHaveBeenCalledTimes(1);
    const error = h.onError.mock.calls[0]![0] as Error & { code?: string };
    expect(error.code).toBe('od_next_canonical_deliverable_invalid');
  });

  it('keeps honouring the run-scoped answer on its own', async () => {
    // A run that did write the entry has obviously delivered; the stricter
    // field must not stop counting just because a looser one arrived.
    const h = await streamBlockedTurn(
      blockedEndFrame({
        inputStage: 'production',
        reasonCodes: ['od_next_protocol_runtime_state_missing'],
      }),
      { deliverableValid: true },
    );

    expect(h.onError).not.toHaveBeenCalled();
  });

  it('fails closed when the daemon answers neither question', async () => {
    // A daemon too old to send either field, or a project scan that could not
    // run, must leave the previous behaviour in place rather than silently
    // swallowing a real failure.
    const h = await streamBlockedTurn(
      blockedEndFrame({
        inputStage: 'production',
        reasonCodes: ['od_next_protocol_runtime_state_missing'],
      }),
      {},
    );

    expect(h.onError).toHaveBeenCalledTimes(1);
  });
});
