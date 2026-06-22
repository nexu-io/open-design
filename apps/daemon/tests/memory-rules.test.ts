import { describe, expect, it } from 'vitest';

import {
  distillRulesFromAnnotations,
  parseRuleBody,
} from '../src/memory-rules.js';

describe('parseRuleBody', () => {
  it('parses assertion / check / rationale lines', () => {
    const parsed = parseRuleBody(
      'Assertion: CTA copy is action-first\nCheck: The button starts with a verb\nVerified by: user highlighted the CTA',
    );
    expect(parsed.assertion).toBe('CTA copy is action-first');
    expect(parsed.check).toBe('The button starts with a verb');
    expect(parsed.rationale).toBe('user highlighted the CTA');
  });

  it('falls back to the first line as the assertion when unlabelled', () => {
    const parsed = parseRuleBody('Always use the brand teal for primary buttons.');
    expect(parsed.assertion).toBe('Always use the brand teal for primary buttons.');
    // No explicit check → mirror the assertion so the rubric is never empty.
    expect(parsed.check).toBe('Always use the brand teal for primary buttons.');
  });
});

describe('distillRulesFromAnnotations', () => {
  it('produces heuristic proposals when no LLM provider is available', async () => {
    const result = await distillRulesFromAnnotations(
      '/tmp/unused',
      {
        annotations: [
          { note: 'Make the CTA copy action-first', targetLabel: 'Hero button' },
          { note: 'x' }, // too short — dropped
        ],
      },
      // Injected suggest stands in for the no-provider path (returns []).
      { suggest: async () => [] },
    );
    expect(result.attemptedLLM).toBe(true);
    expect(result.source).toBe('heuristic');
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.assertion).toBe('Make the CTA copy action-first');
    expect(result.proposals[0]?.rationale).toContain('Hero button');
  });

  it('merges LLM drafts ahead of heuristic ones and dedupes by assertion', async () => {
    const result = await distillRulesFromAnnotations(
      '/tmp/unused',
      { annotations: [{ note: 'Buttons must use sentence case' }] },
      {
        suggest: async () => [
          {
            type: 'rule',
            name: 'Sentence-case buttons',
            description: 'Buttons use sentence case',
            body: 'Assertion: Buttons must use sentence case\nCheck: No all-caps button labels',
          },
        ],
      },
    );
    expect(result.attemptedLLM).toBe(true);
    expect(result.source).toBe('mixed');
    // The LLM draft and the heuristic draft share the same assertion, so the
    // surfaced list collapses to a single proposal — the LLM phrasing wins.
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.name).toBe('Sentence-case buttons');
    expect(result.proposals[0]?.check).toBe('No all-caps button labels');
  });

  it('returns nothing for an empty annotation batch', async () => {
    const result = await distillRulesFromAnnotations(
      '/tmp/unused',
      { annotations: [] },
      { suggest: async () => [] },
    );
    expect(result.proposals).toHaveLength(0);
    expect(result.attemptedLLM).toBe(false);
  });
});
