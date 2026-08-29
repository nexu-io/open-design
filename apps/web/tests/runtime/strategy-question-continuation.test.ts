import { describe, expect, it, vi } from 'vitest';
import type { ChatRunStatusResponse, StrategyTaskProjectionV2 } from '@open-design/contracts';
import {
  resolveQuestionFormStrategyTaskExecutionId,
  strategyBlockedMessageFields,
  strategySettledMessageFields,
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

function blockedProjection(
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
    outcome: 'blocked',
    route: 'full_plan',
    executionMode: null,
    activeRunId: 'run-1',
    terminal: true,
    ...overrides,
  } as StrategyTaskProjectionV2;
}

describe('strategyBlockedMessageFields', () => {
  it('derives message termination fields from a blocked terminal projection', () => {
    expect(strategyBlockedMessageFields(blockedProjection({
      blockedContext: {
        reasonCodes: ['od_next_machine_protocol_missing'],
        visibleText: ' 这轮回复没有携带机器协议块。 ',
      },
    }))).toEqual({
      strategyTaskBlocked: true,
      strategyTaskBlockedText: '这轮回复没有携带机器协议块。',
    });
  });

  it('keeps the blocked flag with a null text when the gate left no visible text', () => {
    expect(strategyBlockedMessageFields(blockedProjection({
      blockedContext: {
        reasonCodes: ['od_next_native_session_continuity_unproven'],
        visibleText: null,
      },
    }))).toEqual({ strategyTaskBlocked: true, strategyTaskBlockedText: null });
    expect(strategyBlockedMessageFields(blockedProjection())).toEqual({
      strategyTaskBlocked: true,
      strategyTaskBlockedText: null,
    });
  });

  it('returns null for non-blocked or absent projections', () => {
    expect(strategyBlockedMessageFields(undefined)).toBeNull();
    expect(strategyBlockedMessageFields(blockedProjection({
      outcome: 'completed',
    }))).toBeNull();
    expect(strategyBlockedMessageFields(blockedProjection({
      outcome: 'running',
      terminal: false,
    }))).toBeNull();
  });
});

describe('strategySettledMessageFields', () => {
  it('stamps a delivered flag for a completed task', () => {
    expect(strategySettledMessageFields(blockedProjection({
      outcome: 'completed',
      terminal: true,
      blockedContext: undefined,
    }))).toEqual({ strategyTaskDelivered: true });
  });

  it('keeps the blocked stamp taking precedence', () => {
    expect(strategySettledMessageFields(blockedProjection())).toMatchObject({
      strategyTaskBlocked: true,
    });
  });

  it('stamps nothing while the task is still running', () => {
    expect(strategySettledMessageFields(blockedProjection({
      outcome: 'running',
      terminal: false,
      blockedContext: undefined,
    }))).toBeNull();
    expect(strategySettledMessageFields(undefined)).toBeNull();
  });
});
