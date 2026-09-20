import { expect, it } from 'vitest';
import { createCodexTurnUsage } from '../../src/observability/codex-turn-usage.js';
it('A-08 sums deduplicated last-call counters in one explicit turn', () => {
  const usage = createCodexTurnUsage();
  usage.start('turn-a');
  const first = { last: { inputTokens: 10, outputTokens: 2, totalTokens: 12 }, total: { inputTokens: 1010, outputTokens: 202, totalTokens: 1212 } };
  expect(usage.add('turn-a', first)).toEqual({ input: 10, output: 2, total: 12, modelCalls: 1 });
  expect(usage.add('turn-a', first)).toEqual({ input: 10, output: 2, total: 12, modelCalls: 1 });
  expect(usage.add('turn-a', { last: { inputTokens: 15, outputTokens: 5, totalTokens: 20 }, total: { inputTokens: 1025, outputTokens: 207, totalTokens: 1232 } })).toEqual({ input: 25, output: 7, total: 32, modelCalls: 2 });
  expect(usage.add('turn-a', first)).toBeNull();
  usage.start('turn-b');
  expect(usage.add('turn-a', first)).toBeNull();
});
