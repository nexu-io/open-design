import { describe, expect, it } from 'vitest';
import { splitOnQuestionForms } from '../../src/artifacts/question-form';

const NESTED_FORM = "<question-form id='card-owned'><question-text id='hidden' label='Card-owned question'/></question-form>";
const REAL_FORM = `<question-form id='actual-prose'>${JSON.stringify({
  questions: [{ id: 'audience', type: 'text', label: 'Actual prose question' }],
})}</question-form>`;

function card(index: number): string {
  return `<od-card type="rule-proposal">${JSON.stringify({
    kind: 'rule-proposal', name: `Rule ${index}`,
    assertion: `${NESTED_FORM} unmatched payload backtick: \``, check: 'Existing rule check',
  }, null, 2)}</od-card>`;
}

function expectOnlyActualForm(input: string) {
  const segments = splitOnQuestionForms(input);
  const forms = segments.filter((segment) => segment.kind === 'form');
  expect(forms).toHaveLength(1);
  expect(forms[0]?.form).toMatchObject({
    id: 'actual-prose',
    questions: [{ id: 'audience', type: 'text', label: 'Actual prose question' }],
  });
  expect(segments.map((segment) => segment.kind === 'form' ? segment.raw : segment.text).join('')).toBe(input);
}

describe('card-separated Markdown boundaries for real question forms', () => {
  it('keeps adjacent card payload backticks opaque and preserves following literal code and a real form', () => {
    // Behavioral sequence coverage, not a wall-clock benchmark or a call-count
    // assertion about the scanner's implementation.
    const cards = Array.from({ length: 64 }, (_, index) => card(index)).join('');
    const input = `${cards}\n\n\`${NESTED_FORM}\`\n\n${REAL_FORM}`;
    expectOnlyActualForm(input);
  });

  it.each(['# ', '- ', '1. '])('starts fresh Markdown after a card on a %s line', (prefix) => {
    // The complete card ends the old heading/list render. The new paragraph's
    // inline-code pair can cross a newline, and its quoted form is not real.
    const input = `${prefix}${card(1)}\`literal example\n${NESTED_FORM}\`\n\n${REAL_FORM}`;
    expectOnlyActualForm(input);
  });
});
