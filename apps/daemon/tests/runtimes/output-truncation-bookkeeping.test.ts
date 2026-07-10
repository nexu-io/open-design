// Red spec for nexu-io/open-design#4137 (part 1).
//
// Symptom: on a large/complex page the model stops mid-file because it hit the
// output-length cap (`stop_reason: max_tokens`), the response ends prematurely,
// and the daemon treats it as an ordinary clean turn — no signal that it was
// cut off. The bookkeeping used a single `stopReason !== 'tool_use'` test, so a
// truncated turn was indistinguishable from a normal `end_turn`.
//
// This pins the fix at its cheapest layer: `applyClaudeStreamJsonRunBookkeeping`
// must (a) still mark a `max_tokens` / `length` turn as cleanly completed (the
// child exits normally and we keep the partial artifact) AND (b) record
// `lastTurnTruncated` so the run status / SSE `end` frame can surface it. A
// normal `end_turn` / `tool_use` must NOT set the flag.

import { describe, expect, it } from 'vitest';

import {
  applyClaudeStreamJsonRunBookkeeping,
  isOutputTruncationStopReason,
} from '../../src/runtimes/chat-run-lifecycle.js';

type BookkeepingRun = {
  stdinOpen?: boolean;
  turnCompletedCleanly?: boolean;
  lastTurnTruncated?: boolean;
  child?: { stdin?: { destroyed?: boolean; end: () => void } | null } | null;
};

function freshRun(): BookkeepingRun {
  return { stdinOpen: true, child: { stdin: { destroyed: false, end: () => {} } } };
}

describe('isOutputTruncationStopReason', () => {
  it('is true only for the output-length-cap stop reasons', () => {
    expect(isOutputTruncationStopReason('max_tokens')).toBe(true); // Anthropic / Claude Code
    expect(isOutputTruncationStopReason('length')).toBe(true); // OpenAI-compatible
  });

  it('is false for reasons that mean the turn finished on its own', () => {
    for (const reason of ['end_turn', 'stop_sequence', 'tool_use', '', null, undefined, 42]) {
      expect(isOutputTruncationStopReason(reason)).toBe(false);
    }
  });
});

describe('applyClaudeStreamJsonRunBookkeeping — truncation flag (#4137)', () => {
  it('flags a max_tokens turn_end as truncated while still completing cleanly', () => {
    const run = freshRun();
    applyClaudeStreamJsonRunBookkeeping(run, { type: 'turn_end', stopReason: 'max_tokens' });
    expect(run.turnCompletedCleanly).toBe(true);
    expect(run.lastTurnTruncated).toBe(true);
    // stdin is still closed — the turn genuinely ended.
    expect(run.stdinOpen).toBe(false);
  });

  it('flags a length usage frame (OpenAI-compatible) as truncated', () => {
    const run = freshRun();
    applyClaudeStreamJsonRunBookkeeping(run, { type: 'usage', stopReason: 'length' });
    expect(run.turnCompletedCleanly).toBe(true);
    expect(run.lastTurnTruncated).toBe(true);
  });

  it('does NOT flag a normal end_turn as truncated', () => {
    const run = freshRun();
    applyClaudeStreamJsonRunBookkeeping(run, { type: 'turn_end', stopReason: 'end_turn' });
    expect(run.turnCompletedCleanly).toBe(true);
    expect(run.lastTurnTruncated).toBeFalsy();
  });

  it('does not touch either flag for a tool_use pause (mid-tool, not terminal)', () => {
    const run = freshRun();
    applyClaudeStreamJsonRunBookkeeping(run, { type: 'turn_end', stopReason: 'tool_use' });
    expect(run.turnCompletedCleanly).toBeFalsy();
    expect(run.lastTurnTruncated).toBeFalsy();
    // stdin stays open so a follow-up tool result can still be streamed in.
    expect(run.stdinOpen).toBe(true);
  });
});
