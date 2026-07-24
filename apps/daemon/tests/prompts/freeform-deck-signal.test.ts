import { describe, expect, it } from 'vitest';

import { composeSystemPrompt, detectDeckIntentSignal } from '../../src/prompts/system.js';

const MAYBE_DECK_HEADING = '## If this brief is a slide deck / keynote / presentation';
const DECK_FRAMEWORK_HEADING = '# Slide deck — fixed framework';
const DECK_DELIVERY_HEADING = '# Deck delivery contract';
const DECK_OUTCOME_HEADING = '# Deck outcome quality rules';

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

  it('includes the maybe-deck directive only when the signal is true', () => {
    const out = composeSystemPrompt({ ...freeform, freeformDeckSignal: true });
    expect(out).toContain(MAYBE_DECK_HEADING);
    expect(out).toContain(DECK_DELIVERY_HEADING);
    expect(out).toContain(DECK_OUTCOME_HEADING);
  });

  it('drops the maybe-deck directive when the signal is false or absent', () => {
    for (const input of [freeform, { ...freeform, freeformDeckSignal: false }]) {
      const out = composeSystemPrompt(input);
      expect(out).not.toContain(MAYBE_DECK_HEADING);
      expect(out).not.toContain(DECK_FRAMEWORK_HEADING);
      expect(out).not.toContain(DECK_DELIVERY_HEADING);
    }
  });

  it('never gates deck-kind projects on the signal', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'deck' },
      executionProfile: 'filesystem',
      freeformDeckSignal: false,
    });
    expect(out).toContain(DECK_DELIVERY_HEADING);
    expect(out).toContain(DECK_OUTCOME_HEADING);
    expect(out).toContain('End with a purposeful close.');
    expect(out).toContain('Do not add a generic "Thank you" slide');
    expect(out).not.toContain(MAYBE_DECK_HEADING);
  });

  it('uses the selected deck prompt variant for deck-kind and signaled freeform runs', () => {
    for (const input of [
      {
        metadata: { kind: 'deck' as const },
        executionProfile: 'filesystem' as const,
        deckPromptVariant: 'outcome_only' as const,
      },
      {
        ...freeform,
        freeformDeckSignal: true,
        deckPromptVariant: 'outcome_only' as const,
      },
    ]) {
      const out = composeSystemPrompt(input);
      expect(out).toContain(DECK_DELIVERY_HEADING);
      expect(out).toContain(DECK_OUTCOME_HEADING);
      expect(out).not.toContain(DECK_FRAMEWORK_HEADING);
    }
  });
});
