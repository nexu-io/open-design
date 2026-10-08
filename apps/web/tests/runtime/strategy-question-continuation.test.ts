import { describe, expect, it, vi } from 'vitest';
import type { ChatRunStatusResponse, StrategyTaskProjectionV2 } from '@open-design/contracts';
import {
  resolveQuestionFormStrategyTaskExecutionId,
  strategySettledMessageFields,
  strategyTaskParkedOnSucceededRun,
  strategyTaskRunIndex,
} from '../../src/runtime/strategy-question-continuation';

describe('question-form strategy continuation handle recovery', () => {
  it('recovers the task handle from status during the same-render projection race', async () => {
    const fetchRunStatus = vi.fn(async () => ({
      strategyTask: { taskExecutionId: 'task-1' },
    } as ChatRunStatusResponse));

    await expect(resolveQuestionFormStrategyTaskExecutionId({
      sourceRunId: 'run-1',
      fetchRunStatus,
    })).resolves.toBe('task-1');
    expect(fetchRunStatus).toHaveBeenCalledWith('run-1');
  });

  it('keeps an ordinary question form ordinary when status has no task', async () => {
    const fetchRunStatus = vi.fn(async () => ({ status: 'succeeded' } as ChatRunStatusResponse));

    await expect(resolveQuestionFormStrategyTaskExecutionId({
      sourceRunId: 'run-ordinary',
      fetchRunStatus,
    })).resolves.toBeUndefined();
  });

  it('does not reject or block submission when status recovery fails', async () => {
    const fetchRunStatus = vi.fn(async () => {
      throw new Error('daemon unavailable');
    });
    const submit = vi.fn();

    const taskExecutionId = await resolveQuestionFormStrategyTaskExecutionId({
      sourceRunId: 'run-unavailable',
      fetchRunStatus,
    });
    submit(taskExecutionId);

    expect(taskExecutionId).toBeUndefined();
    expect(submit).toHaveBeenCalledWith(undefined);
  });
});

function taskProjection(
  overrides: Partial<StrategyTaskProjectionV2> = {},
): StrategyTaskProjectionV2 {
  return {
    taskExecutionId: 'task-1',
    strategy: {
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: 'a'.repeat(64),
      snapshotId: 'snapshot-1',
    },
    inputStage: 'request',
    outcome: 'completed',
    route: 'full_plan',
    executionMode: null,
    activeRunId: 'run-1',
    terminal: true,
    ...overrides,
  } as StrategyTaskProjectionV2;
}

describe('strategySettledMessageFields', () => {
  it('does not infer delivery from a historical completed task without evidence', () => {
    expect(strategySettledMessageFields(taskProjection({
      outcome: 'completed',
      terminal: true,
    }))).toBeNull();
  });

  it('does not claim delivery merely because a marker task ended', () => {
    expect(strategySettledMessageFields(taskProjection({
      outcome: 'completed', terminal: true,
      deliverableValid: false,
    }))).toBeNull();
    expect(strategySettledMessageFields(taskProjection({
      outcome: 'completed', terminal: true,
      deliverableValid: true,
    }))).toEqual({ strategyTaskDelivered: true });
  });

  it('stamps nothing while the task is still running', () => {
    expect(strategySettledMessageFields(taskProjection({
      outcome: 'running',
      terminal: false,
    }))).toBeNull();
    expect(strategySettledMessageFields(undefined)).toBeNull();
  });
});


describe('daemon-owned task run positions', () => {
  it('resolves source and successor independently from the same task projection', () => {
    const projection = taskProjection({ runMappings: [
      { runId: 'source', taskRunIndex: 1 },
      { runId: 'successor', taskRunIndex: 2 },
    ] });
    expect(strategyTaskRunIndex(projection, 'source')).toBe(1);
    expect(strategyTaskRunIndex(projection, 'successor')).toBe(2);
    expect(strategyTaskRunIndex(projection, 'different-run')).toBeUndefined();
  });

  it('keeps legacy, absent and ambiguous positions unknown', () => {
    expect(strategyTaskRunIndex(undefined, 'run-1')).toBeUndefined();
    expect(strategyTaskRunIndex(taskProjection(), 'run-1')).toBeUndefined();
    expect(strategyTaskRunIndex(taskProjection({ runMappings: [
      { runId: 'run-1', taskRunIndex: 0 }, { runId: 'run-1', taskRunIndex: 1 },
    ] }), 'run-1')).toBeUndefined();
    expect(strategyTaskRunIndex(taskProjection({ runMappings: [
      { runId: 'run-1', taskRunIndex: -1 },
    ] }), 'run-1')).toBeUndefined();
  });
});

describe('strategyTaskParkedOnSucceededRun', () => {
  const parked = (overrides: Partial<StrategyTaskProjectionV2> = {}) => taskProjection({
    outcome: 'clarification_required',
    terminal: false,
    ...overrides,
  });

  it.each(['clarification_required', 'plan_ready'] as const)(
    'is true when a succeeded Run left its task waiting on the user (%s)',
    (outcome) => {
      expect(strategyTaskParkedOnSucceededRun(
        { status: 'succeeded', strategyTask: parked({ outcome }) },
        'run-1',
      )).toBe(true);
    },
  );

  it('is false while the task still runs, even on the same Run', () => {
    expect(strategyTaskParkedOnSucceededRun(
      { status: 'succeeded', strategyTask: parked({ outcome: 'running' }) },
      'run-1',
    )).toBe(false);
  });

  it('is false when the task has moved on to another Run', () => {
    expect(strategyTaskParkedOnSucceededRun(
      { status: 'succeeded', strategyTask: parked({ activeRunId: 'run-2' }) },
      'run-1',
    )).toBe(false);
  });

  it('is false while the Run itself has not succeeded', () => {
    for (const status of ['queued', 'running', 'failed', 'canceled'] as const) {
      expect(strategyTaskParkedOnSucceededRun(
        { status, strategyTask: parked() },
        'run-1',
      )).toBe(false);
    }
  });

  it('leaves terminal tasks and task-less Runs to their own checks', () => {
    expect(strategyTaskParkedOnSucceededRun(
      { status: 'succeeded', strategyTask: taskProjection() },
      'run-1',
    )).toBe(false);
    expect(strategyTaskParkedOnSucceededRun({ status: 'succeeded' }, 'run-1')).toBe(false);
  });
});
