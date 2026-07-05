import { describe, expect, it } from 'vitest';

import { renderDiscoveryAndPhilosophy } from '../../src/prompts/discovery.js';

const DISCOVERY_AND_PHILOSOPHY = renderDiscoveryAndPhilosophy('filesystem');

// The default-router exception in `discovery.ts` emits a single `<question-form
// id="task-type">` on turn 1 that combines the routing question (which Open
// Design workflow to take) with the core discovery brief (audience / brand /
// scale / constraints). Before this consolidation, freeform projects (no Home
// chip pick) saw two clarification cards in a row — task-type, then "Quick
// brief — 30 seconds" — which felt like the agent was re-asking. These tests
// lock the single-shot shape so a future prompt edit cannot accidentally split
// the brief into two turns again.

describe('discovery.ts task-type form (single-shot brief)', () => {
  it('emits a task-type form that asks the routing question plus the discovery brief', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('<question-form id="task-type"');
    // Task-type radio + the four discovery brief fields must all live in this
    // single form so the user does not see a second clarification card.
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "taskType"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "audience"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "brand"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "scale"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "constraints"');
  });

  it('preserves the three branch values RULE 2 dispatches on', () => {
    // RULE 2 line 130+ keys off these exact `brand` answer values to choose
    // Branch A (real brand source) vs Branch B (auto-pick). They are part of
    // the discovery contract — labels can localize but values must not.
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "pick_direction"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "brand_spec"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "reference_match"');
  });

  it('keeps the eight canonical task-type options', () => {
    const options = [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ];
    for (const option of options) {
      expect(DISCOVERY_AND_PHILOSOPHY).toContain(`"${option}"`);
    }
  });

  it('forbids the agent from emitting a second Quick brief form after task-type answers', () => {
    // The whole point of the consolidation: once turn 1's task-type form is
    // answered, turn 2 must go straight to brand handling / planning. A regex
    // is brittle so check for the explicit no-second-form sentence the prompt
    // ships with.
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /do NOT emit a second `<question-form id="discovery">` \/ "Quick brief — 30 seconds" form/,
    );
  });

  it('forbids pairing a tailored discovery form with the default Quick brief in one turn', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('Emit exactly ONE `<question-form>` in this turn.');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'that tailored form replaces the default "Quick brief — 30 seconds" form; never output both.',
    );
  });

  it('requires the discovery question form before any tool use', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('No native tool calls');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Do not call TodoWrite, write files, or invoke any native tool before emitting the complete `<question-form>...</question-form>` block',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('the form itself is the next action');
  });

  it('teaches RULE 2 to accept the task-type answer marker alongside discovery', () => {
    // RULE 2's first sentence enumerates the answer markers it routes on. The
    // single-shot brief means `[form answers — task-type]` must be a valid
    // entry point — equivalent to `[form answers — discovery]` for the brand
    // branching logic that follows.
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /\[form answers — discovery\][^.]*\[form answers — task-type\]/,
    );
  });
});
