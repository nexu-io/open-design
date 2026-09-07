import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../src/types';
import { activeStrategyModel, executionModel } from '../../src/runtime/execution-model';

const clarification: ChatMessage = {
  id: 'brief', role: 'assistant',
  content: '<question-form>{"questions":[]}</question-form>',
  agentId: 'amr', agentName: 'OpenDesign · claude-opus-4.7',
  strategyTaskExecutionId: 'task', runStatus: 'succeeded',
  events: [{ kind: 'status', label: 'starting', model: 'deepseek-v4-flash' }],
};

describe('strategy execution model', () => {
  it('retains the actual model while awaiting clarification and after transcript reload', () => {
    expect(activeStrategyModel(JSON.parse(JSON.stringify([clarification])))).toBe('deepseek-v4-flash');
  });

  it('keeps the notice through a queued successor before its start arrives', () => {
    expect(activeStrategyModel([clarification, {
      ...clarification, id: 'successor', content: '', events: [], runStatus: 'queued',
    }])).toBe('deepseek-v4-flash');
  });

  it.each([
    { strategyTaskDelivered: true }, { strategyTaskBlocked: true },
    { runStatus: 'canceled' as const }, { runStatus: 'failed' as const },
    { strategyTaskExecutionId: undefined },
  ])('releases the notice for terminal or ordinary messages: %j', (fields) => {
    expect(activeStrategyModel([{ ...clarification, ...fields }])).toBeNull();
  });

  it('does not leak the old task model into a new conversation or new task', () => {
    expect(activeStrategyModel([])).toBeNull();
    expect(activeStrategyModel([clarification, {
      ...clarification, id: 'new-task', strategyTaskExecutionId: 'new-task', events: [],
    }])).toBeNull();
  });

  it('uses the latest physical run start and ignores intermediate agent defaults', () => {
    expect(executionModel({ ...clarification, events: [
      { kind: 'status', label: 'starting', model: 'old-model' },
      { kind: 'status', label: 'starting', model: 'deepseek-v4-flash' },
      { kind: 'status', label: 'initializing', detail: 'another-default' },
    ] })).toBe('deepseek-v4-flash');
  });
});
