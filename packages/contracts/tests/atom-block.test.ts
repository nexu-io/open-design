// Phase 4 / spec §23.4 — renderActiveStageBlock contract test.

import { describe, expect, it } from 'vitest';
import {
  renderActiveStageBlock,
  renderActiveStageBlocks,
} from '../src/prompts/atom-block.js';

describe('renderActiveStageBlock', () => {
  it('returns an empty string when no bodies are supplied', () => {
    expect(renderActiveStageBlock({ stageId: 'discovery', bodies: [] })).toBe('');
    expect(
      renderActiveStageBlock({
        stageId: 'plan',
        bodies: [{ atomId: 'todo-write', body: '' }],
      }),
    ).toBe('');
  });

  it('emits a stage header with one atom subsection', () => {
    const out = renderActiveStageBlock({
      stageId: 'discovery',
      bodies: [
        { atomId: 'discovery-question-form', body: 'Ask the user about audience.' },
      ],
    });
    expect(out).toContain('## Active stage: discovery');
    expect(out).toContain('### discovery-question-form');
    expect(out).toContain('Ask the user about audience.');
    // Single atom → no trailing separator.
    expect(out).not.toMatch(/---$/);
  });

  it('separates multiple atoms with --- but not after the last one', () => {
    const out = renderActiveStageBlock({
      stageId: 'plan',
      bodies: [
        { atomId: 'todo-write',       body: 'TodoWrite-driven plan.' },
        { atomId: 'direction-picker', body: '3-5 directions.' },
      ],
    });
    expect(out).toContain('### todo-write');
    expect(out).toContain('### direction-picker');
    expect(out).toMatch(/---/);
    // Only one separator between two atoms.
    expect(out.match(/---/g)?.length).toBe(1);
  });

  it('annotates the header with the iteration when iterating', () => {
    const out = renderActiveStageBlock({
      stageId:   'critique',
      iteration: 2,
      bodies:    [{ atomId: 'critique-theater', body: 'Score 0-5 along 5 axes.' }],
    });
    expect(out).toContain('## Active stage: critique (iteration 2)');
  });
});

// Issue #6238 — an atom shared by multiple pipeline stages (od-default
// declares `discovery-question-form` in both `task-type` and
// `discovery`) must have its full SKILL.md body inlined exactly once;
// later stages reference the earlier inline instead of repeating it.
describe('renderActiveStageBlocks (cross-stage atom dedup)', () => {
  const questionFormBody = 'Emit a <question-form> artifact to clarify intent.';

  it('inlines a shared atom body only in the first stage that uses it', () => {
    const blocks = renderActiveStageBlocks([
      {
        stageId: 'task-type',
        bodies:  [{ atomId: 'discovery-question-form', body: questionFormBody }],
      },
      {
        stageId: 'discovery',
        bodies:  [{ atomId: 'discovery-question-form', body: questionFormBody }],
      },
    ]);

    expect(blocks).toHaveLength(2);
    // Both stages keep their §23.4 headers.
    expect(blocks[0]).toContain('## Active stage: task-type');
    expect(blocks[1]).toContain('## Active stage: discovery');
    // The full body appears exactly once across all blocks.
    const joined = blocks.join('\n');
    expect(joined.split(questionFormBody).length - 1).toBe(1);
    // The first stage carries the inline body …
    expect(blocks[0]).toContain(questionFormBody);
    // … and the later stage carries a reference back to it instead.
    expect(blocks[1]).toContain('### discovery-question-form');
    expect(blocks[1]).not.toContain(questionFormBody);
    expect(blocks[1]).toContain('## Active stage: task-type');
  });

  it('leaves distinct atoms untouched across stages', () => {
    const blocks = renderActiveStageBlocks([
      {
        stageId: 'plan',
        bodies:  [{ atomId: 'todo-write', body: 'TodoWrite-driven plan.' }],
      },
      {
        stageId: 'critique',
        bodies:  [{ atomId: 'critique-theater', body: 'Score 0-5 along 5 axes.' }],
      },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('TodoWrite-driven plan.');
    expect(blocks[1]).toContain('Score 0-5 along 5 axes.');
    expect(blocks[1]).not.toContain('already included');
  });

  it('drops stages whose atoms all resolve to empty bodies', () => {
    const blocks = renderActiveStageBlocks([
      { stageId: 'empty', bodies: [{ atomId: 'ghost', body: '' }] },
      { stageId: 'plan',  bodies: [{ atomId: 'todo-write', body: 'Plan.' }] },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('## Active stage: plan');
  });

  it('does not treat an empty-body occurrence as the first inline', () => {
    // If the first stage's copy of the atom failed to load (empty body),
    // the next stage with a real body must still inline it in full.
    const blocks = renderActiveStageBlocks([
      { stageId: 'task-type', bodies: [{ atomId: 'discovery-question-form', body: '' }] },
      { stageId: 'discovery', bodies: [{ atomId: 'discovery-question-form', body: questionFormBody }] },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('## Active stage: discovery');
    expect(blocks[0]).toContain(questionFormBody);
  });

  it('forwards iteration to the per-stage header', () => {
    const blocks = renderActiveStageBlocks([
      {
        stageId:   'critique',
        iteration: 2,
        bodies:    [{ atomId: 'critique-theater', body: 'Score.' }],
      },
    ]);
    expect(blocks[0]).toContain('## Active stage: critique (iteration 2)');
  });
});
