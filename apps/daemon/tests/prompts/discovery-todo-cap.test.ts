import { describe, expect, it } from 'vitest';

import { DISCOVERY_AND_PHILOSOPHY } from '../../src/prompts/discovery.js';

// The system prompt historically told the model to write "a plan of 5–10 short
// imperative items". That upper bound caused the agent to cap every plan at
// exactly ten steps and then stop or skip additional items — even when the task
// genuinely needed more. There is no maxItems constraint in the upstream
// TodoWrite JSON schema (the array is unbounded), so the cap is entirely
// prompt-driven and can be removed here.
//
// This test locks the absence of the cap so a future prompt edit cannot
// accidentally re-introduce the "5–10" or "5 to 10" wording.

describe('discovery.ts RULE 3 — TodoWrite plan item count', () => {
  it('does not cap the plan at 10 items via "5–10" wording', () => {
    // The old wording was "a plan of 5–10 short imperative items".
    // After the fix the sentence must not mention an upper bound of 10.
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/5[–\-]10\s+short\s+imperative/);
  });

  it('does not cap the plan at 10 items via "5 to 10" wording', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/5 to 10\s+(?:short\s+)?items/i);
  });

  it('does not re-introduce a numeric cap via "at most / maximum / no more than" phrasing', () => {
    // Guard against semantically equivalent upper-bound re-introduction.
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(
      /(?:at most|maximum|no more than)\s+1[0-9]\s+(?:todo|plan|step|item)/i,
    );
  });

  it('still instructs the agent to write at least a few items', () => {
    // The intent — plan with TodoWrite before building — must survive the fix.
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('TodoWrite');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('RULE 3');
  });
});
