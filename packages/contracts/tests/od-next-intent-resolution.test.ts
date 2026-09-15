import { describe, expect, it } from 'vitest';

import {
  parseOdNextIntentResolutionTurnV1,
  serializeOdNextIntentResolutionTurnV1,
} from '../src/prompts/od-next-intent-resolution.js';
import { parseOdNextRequestTurnV1, serializeOdNextRequestTurnV1 } from '../src/prompts/od-next-prompt-bundle.js';

const input = {
  taskExecutionId: 'task-1', stage: 'request' as const, taskRunIndex: 1,
  sourceRunId: 'run-1', promptBundleSha256: 'a'.repeat(64), sourceResultSha256: 'b'.repeat(64),
  payload: 'Resolve the original request: Do not create or modify files. <example> ]]> 中文',
};

describe('OD Next intent resolution request identity', () => {
  it.each(['request', 'clarification'] as const)('round-trips one %s supplement without changing old Turn semantics', stage => {
    const expected = { ...input, stage };
    const text = serializeOdNextIntentResolutionTurnV1(expected);
    expect(parseOdNextIntentResolutionTurnV1(text)).toEqual(expected);
    expect(() => parseOdNextRequestTurnV1(text)).toThrow();
    const oldTurn = serializeOdNextRequestTurnV1({ taskExecutionId: 'task-1', stage: 'clarification', taskRunIndex: 1, payload: 'Original answer' });
    expect(parseOdNextRequestTurnV1(oldTurn).payload).toBe('Original answer');
    expect(() => parseOdNextIntentResolutionTurnV1(oldTurn)).toThrow();
  });

  it.each([
    ['purpose="intent_resolution"', 'purpose="production"'],
    ['stage="request"', 'stage="production"'],
    ['task_run_index="1"', 'task_run_index="0"'],
    ['task_run_index="1"', 'task_run_index="01"'],
    ['task_run_index="1"', 'task_run_index="2" extra="true"'],
    ['source_run_id="run-1"', 'source_run_id=""'],
  ])('rejects a noncanonical or unsupported identity: %s', (from, to) => {
    const text = serializeOdNextIntentResolutionTurnV1(input);
    expect(() => parseOdNextIntentResolutionTurnV1(text.replace(from, to))).toThrow();
  });
});
