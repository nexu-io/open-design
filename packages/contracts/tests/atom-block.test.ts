// Phase 4 / spec §23.4 — renderActiveStageBlock contract test.

import { describe, expect, it } from 'vitest';
import { renderActiveStageBlock } from '../src/prompts/atom-block.js';

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
