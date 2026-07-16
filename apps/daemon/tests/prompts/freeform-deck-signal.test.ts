import { describe, expect, it } from 'vitest';

import { composeSystemPrompt, detectDeckIntentSignal } from '../../src/prompts/system.js';

const MAYBE_DECK_HEADING = '## If this brief is a slide deck / keynote / presentation';
const DECK_FRAMEWORK_HEADING = '# Slide deck — fixed framework';

describe('detectDeckIntentSignal', () => {
  it('fires on English deck vocabulary', () => {
    expect(detectDeckIntentSignal('build me a pitch deck for investors')).toBe(true);
    expect(detectDeckIntentSignal('a 10-slide keynote')).toBe(true);
    expect(detectDeckIntentSignal('export the PPT')).toBe(true);
    expect(detectDeckIntentSignal('make a slideshow of the trip')).toBe(true);
  });

  it('fires on Chinese deck vocabulary', () => {
    expect(detectDeckIntentSignal('帮我做一份路演材料')).toBe(true);
    expect(detectDeckIntentSignal('给新品发布会做个演示文稿')).toBe(true);
    expect(detectDeckIntentSignal('季度汇报，十页左右')).toBe(true);
    expect(detectDeckIntentSignal('做个课件讲解光合作用')).toBe(true);
  });

  it('stays quiet on non-deck briefs', () => {
    expect(detectDeckIntentSignal('build a landing page for a coffee brand')).toBe(false);
    expect(detectDeckIntentSignal('做一个电商后台看板')).toBe(false);
    expect(detectDeckIntentSignal('')).toBe(false);
    expect(detectDeckIntentSignal(undefined, null)).toBe(false);
  });

  it('scans every supplied text fragment', () => {
    expect(detectDeckIntentSignal('tweak the colors', '## user\n改成 PPT 形式')).toBe(true);
  });

  it('does not fire on substrings of larger words', () => {
    expect(detectDeckIntentSignal('the deckhand slides down')).toBe(true); // genuine word hits stay hits
    expect(detectDeckIntentSignal('appthesis presentational')).toBe(false);
  });
});

describe('composeSystemPrompt — freeform maybe-deck gating', () => {
  const freeform = { metadata: { kind: 'other' as const }, executionProfile: 'filesystem' as const };

  it('keeps the maybe-deck framework when the signal is true or absent (legacy)', () => {
    for (const input of [freeform, { ...freeform, freeformDeckSignal: true }]) {
      const out = composeSystemPrompt(input);
      expect(out).toContain(MAYBE_DECK_HEADING);
      expect(out).toContain(DECK_FRAMEWORK_HEADING);
    }
  });

  it('drops the maybe-deck framework when the signal is false', () => {
    const out = composeSystemPrompt({ ...freeform, freeformDeckSignal: false });
    expect(out).not.toContain(MAYBE_DECK_HEADING);
    expect(out).not.toContain(DECK_FRAMEWORK_HEADING);
  });

  it('never gates deck-kind projects on the signal', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'deck' },
      executionProfile: 'filesystem',
      freeformDeckSignal: false,
    });
    expect(out).toContain(DECK_FRAMEWORK_HEADING);
    expect(out).not.toContain(MAYBE_DECK_HEADING);
  });
});
