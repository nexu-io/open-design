import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../../src/runtimes/runs.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-29T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function createRuns() {
  return createChatRunService({
    createSseResponse: () => ({
      send: vi.fn(() => true),
      end: vi.fn(),
      cleanup: vi.fn(),
    }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

function createRun(runs: ReturnType<typeof createChatRunService>, strategyTask?: unknown) {
  const run = runs.create({
    projectId: 'project-1',
    conversationId: 'conv-1',
    agentId: 'amr',
  }) as any;
  if (strategyTask !== undefined) run.strategyTask = strategyTask;
  return run;
}

describe('chat run completion gate on strategy verdict', () => {
  it('downgrades a clean exit to failed when the terminal strategy verdict refutes success', () => {
    const runs = createRuns();
    const run = createRun(runs, {
      taskExecutionId: 't1',
      outcome: 'blocked',
      terminal: true,
    });
    runs.finish(run, 'succeeded', 0, null);
    expect(run.status).toBe('failed');
  });

  it('downgrades a clean exit to failed for a terminal canceled task', () => {
    const runs = createRuns();
    const run = createRun(runs, {
      taskExecutionId: 't1',
      outcome: 'canceled',
      terminal: true,
    });
    runs.finish(run, 'succeeded', 0, null);
    expect(run.status).toBe('failed');
  });

  it('keeps a succeeded close when there is no strategy task', () => {
    const runs = createRuns();
    const run = createRun(runs);
    runs.finish(run, 'succeeded', 0, null);
    expect(run.status).toBe('succeeded');
  });

  it('keeps a succeeded close when the terminal strategy task completed', () => {
    const runs = createRuns();
    const run = createRun(runs, {
      taskExecutionId: 't1',
      outcome: 'completed',
      terminal: true,
    });
    runs.finish(run, 'succeeded', 0, null);
    expect(run.status).toBe('succeeded');
  });

  it('keeps a succeeded close for a non-terminal clarification task', () => {
    const runs = createRuns();
    const run = createRun(runs, {
      taskExecutionId: 't1',
      outcome: 'clarification_required',
      terminal: false,
    });
    runs.finish(run, 'succeeded', 0, null);
    expect(run.status).toBe('succeeded');
  });
});
