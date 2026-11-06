import { describe, expect, it } from 'vitest';
import { summarizeHistoricalQuestionForms } from '../src/artifacts/history-question-form.js';

const body = JSON.stringify({
  description: 'Choose a brand color.',
  questions: [{ id: 'color', label: 'Color?', type: 'radio', required: true,
    options: [{ value: 'blue-code', label: 'Blue', description: 'Keep the existing palette.' }],
    unfamiliar: { constraint: 'Use high contrast.', values: [false, null, 5] },
  }],
});
const form = `<question-form id="brand" title="Brand brief">${body}</question-form>`;

describe('historical assistant question forms', () => {
  it.each(['question-form', 'ask-question'])('keeps all information from %s without claiming answers or constraining another question', tag => {
    const source = form.replaceAll('question-form', tag);
    const result = summarizeHistoricalQuestionForms(source);
    for (const text of ['brand', 'Brand brief', 'Choose a brand color.', 'Color?', 'blue-code', 'Blue', 'Keep the existing palette.', 'Use high contrast.', 'false', 'null', '5']) {
      expect(result).toContain(text);
    }
    expect(result).toContain('historical context');
    expect(result).not.toContain(`<${tag}`);
    expect(result).not.toContain('already answered');
    expect(result).not.toContain('do not ask');
  });

  it('keeps prose around multiple forms, including an empty form, in order', () => {
    const result = summarizeHistoricalQuestionForms(`Before\n${form}\nBetween\n<question-form>{"questions":[]}</question-form>\nAfter`);
    expect(result).toContain('Before\n[Previous');
    expect(result).toContain('Between\n[Previous');
    expect(result).toContain('(empty list)');
    expect(result).toMatch(/\[End previous assistant question form\]\nAfter$/);
  });

  it('supports bare arrays and fenced JSON bodies without changing field values', () => {
    const source = '<ask-question>```json\n[{"label":"Need more details?","options":["A","B"]}]\n```</ask-question>';
    const result = summarizeHistoricalQuestionForms(source);
    expect(result).toContain('Need more details?');
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).not.toContain('```json');
  });

  it.each([
    `\`${form}\``,
    `\`\`\`xml\n${form}\n\`\`\`\n`,
    `\`\`\`xml\n${form}`,
    `<artifact identifier="draft" type="text/html">${form}</artifact>`,
    `<artifact identifier="draft" type="text/html">${form}`,
    '<question-form>{not JSON}</question-form>',
    '<question-form>{"unexpected":"Keep this information."}</question-form>',
    `<question-form>${body}`,
    `\`\`\`json\n${body}\n\`\`\``,
  ])('preserves examples, unique artifact bodies and unfamiliar or incomplete forms', source => {
    expect(summarizeHistoricalQuestionForms(source)).toBe(source);
  });

  it('preserves an unfamiliar earlier block while summarizing a later readable form', () => {
    const prefix = '<question-form>{not JSON}</question-form>\n';
    expect(summarizeHistoricalQuestionForms(prefix + form)).toContain(prefix + '[Previous');
  });

  it('keeps a JSON string backtick from hiding a following real form', () => {
    const first = '<question-form>{"questions":[{"label":"Use ` or plain text?"}]}</question-form>';
    const result = summarizeHistoricalQuestionForms(first + '\n' + form);
    expect(result).toContain('Use ` or plain text?');
    expect(result).not.toContain('<question-form');
  });

  it.each(['9007199254740993', '1e400'])('preserves numeric history that JSON.parse cannot represent faithfully (%s)', number => {
    const source = `<question-form>{"questions":[],"externalRecordId":${number}}</question-form>`;
    expect(summarizeHistoricalQuestionForms(source)).toBe(source);
  });

  it('does not rewrite form examples inside an unfamiliar JSON body and still handles the next independent form', () => {
    const opaque = '<question-form>{"unexpected":"Keep literal <question-form>[]</question-form> and <ask-question>[]</ask-question> exactly"}</question-form>';
    expect(summarizeHistoricalQuestionForms(opaque)).toBe(opaque);
    expect(summarizeHistoricalQuestionForms(opaque + '\n' + form)).toContain(opaque + '\n[Previous');
  });
});
