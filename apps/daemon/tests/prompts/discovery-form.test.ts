import { describe, expect, it } from 'vitest';

import { renderDiscoveryAndPhilosophy } from '../../src/prompts/discovery.js';

const DISCOVERY_AND_PHILOSOPHY = renderDiscoveryAndPhilosophy('filesystem');

describe('discovery.ts — on-demand clarification policy', () => {
  it('skips the form when the brief and known context are sufficient', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'If they provide enough information to make a sound design and delivery decision, skip the form',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Skip the form whenever the brief and known context are sufficient',
    );
  });

  it('asks only for unresolved information that materially changes the result', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'only when an unresolved answer would materially change the design direction, content structure, or delivery format',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'A missing field is an unresolved fact, not an instruction to ask',
    );
  });

  it('does not use turn number, project creation, stage presence, or empty metadata as triggers', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'A first turn, a new project, a discovery stage, or an unfilled metadata field does not by itself require a form',
    );
    for (const forbidden of [
      'turn 1 must emit',
      'very first output',
      'The form **applies** even when',
      'ask anyway',
      '**Only** skip the form',
    ]) {
      expect(DISCOVERY_AND_PHILOSOPHY).not.toContain(forbidden);
    }
  });

  it('keeps the generic question-form protocol and stable brand branches', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('<question-form id="discovery"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "pick_direction"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "brand_spec"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "reference_match"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('**Hard cap: 5 questions per form — never more.**');
  });

  it('leaves the task-type form to od-default while accepting historical answers', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toContain('<question-form id="task-type"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'It owns the conditional `task-type` form; do not reproduce or extend that form here',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /\[form answers — discovery\][^.]*\[form answers — task-type\]/,
    );
  });

  it('emits a complete form before tools only after clarification is needed', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'When a form is needed, emit the complete block before TodoWrite, file writes, Bash, or other native tools',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'After `</question-form>`, **stop your turn**',
    );
  });
});
