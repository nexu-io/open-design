import { expect, it } from 'vitest';
import { splitOnQuestionForms } from '../../src/artifacts/question-form';

function form(id: string, label: string) {
  return `<question-form id="${id}">${JSON.stringify({
    questions: [{ id: 'answer', type: 'text', label }],
  })}</question-form>`;
}

it.each(['Do you want an <od-card> block?', 'Keep an unmatched ` in this label'])(
  'preserves sibling form payloads and the complete raw text after %s',
  (firstLabel) => {
    // No paragraph break isolates the first field's unmatched backtick: only
    // the valid form boundary keeps it from pairing across the second form.
    const first = form('first', firstLabel);
    const second = form('second', 'Second audience question');
    const input = `${first}\n${second}\nA literal trailing backtick: \``;
    const segments = splitOnQuestionForms(input);
    const forms = segments.filter((segment) => segment.kind === 'form');
    expect(forms.map((segment) => ({ id: segment.form.id, questions: segment.form.questions }))).toEqual([
      { id: 'first', questions: [expect.objectContaining({ id: 'answer', type: 'text', label: firstLabel })] },
      { id: 'second', questions: [expect.objectContaining({ id: 'answer', type: 'text', label: 'Second audience question' })] },
    ]);
    expect(forms.map((segment) => segment.raw)).toEqual([first, second]);
    expect(segments.map((segment) => segment.kind === 'form' ? segment.raw : segment.text).join('')).toBe(input);
  },
);
