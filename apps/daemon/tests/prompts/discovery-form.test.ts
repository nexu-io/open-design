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
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "speakerNotes"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"type": "switch"');
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

describe('discovery.ts form prefill contract', () => {
  // Every emitted <question-form> ships a brief-inferred recommended `default`
  // per question so the user can submit the form unchanged. The web renderer
  // already honours `default`/`defaultValue` (question-form.ts parseDefaultValue
  // + QuestionForm initial state); these markers keep the instruction side and
  // the example anchors from regressing.
  it('instructs a recommended default prefill on every question', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Prefill every question with a recommended `default`',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'a form the user can submit unchanged and still get a sensible build',
    );
  });

  it('prefills the router form too, without loosening its verbatim guard', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Do not rename, tailor, drop, reorder, or rewrite the `taskType` options',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      "set each question's `default` to your brief-inferred recommendation",
    );
  });

  it('exempts the verbatim task-type router form from the 5-question cap', () => {
    // Reviewer finding on #5603: the hard cap said "never more than 5" while
    // the locked router form above it carries six fields — two frozen
    // instructions the model could not satisfy at once. The cap now names the
    // router form as its one sanctioned exception; both must stay present.
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('**Hard cap: 5 questions per form — never more.**');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'The one sanctioned exception is the verbatim `<question-form id="task-type">` router form',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('never a reason to trim the router form');
  });

  it('anchors the pattern with a concrete default in the example forms', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"default": "pick_direction"');
  });
});
