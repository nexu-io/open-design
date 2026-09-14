// @vitest-environment node
import { expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';

const KEY = 'a7f3c91ed2b40561';
const FORM = `<question-form id="audience-brief">${JSON.stringify({
  questions: [{ id: 'audience', type: 'text', label: 'Who is the audience?' }],
})}</question-form>`;
const BEFORE_DONE = `Confirm the audience.\n\n${FORM}`;
const DONE_AND_AFTER = `\n<od-done key="${KEY}"/>I will use your answer.`;

it('keeps identical blocks when the form and later keyed done share a text event', () => {
  // The real daemon writer merges adjacent text deltas (db.ts); this web-owned
  // test calls the real builder with both transport shapes without importing
  // daemon internals or copying its normalization implementation.
  const key: PersistedAgentEvent = { kind: 'done_key', key: KEY };
  const split = buildTurnBlocks({
    runStatus: 'succeeded', startedAtMs: 1000, endedAtMs: 2000, nowMs: 2000,
    events: [key, { kind: 'text', text: BEFORE_DONE }, { kind: 'text', text: DONE_AND_AFTER }],
  });
  const merged = buildTurnBlocks({
    runStatus: 'succeeded', startedAtMs: 1000, endedAtMs: 2000, nowMs: 2000,
    events: [key, { kind: 'text', text: BEFORE_DONE + DONE_AND_AFTER }],
  });
  // Positive anchor before comparing: the split form really belongs to prose,
  // not two equally broken execution-shell projections.
  expect(split.filter((block) => block.kind === 'prose').map((block) => block.text).join('')).toContain(FORM);
  expect(merged).toEqual(split);
});
