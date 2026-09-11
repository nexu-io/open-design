import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const questionCss = readFileSync(
  new URL('../../src/styles/viewer/composio.css', import.meta.url),
  'utf8',
);
const questionFormSource = readFileSync(
  new URL('../../src/components/QuestionForm.tsx', import.meta.url),
  'utf8',
);

describe('question form title layout', () => {
  it('keeps a long title on one stable line and exposes an ellipsis', () => {
    const titleRules = [...questionCss.matchAll(/\.question-form-title\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1] ?? '')
      .join('\n');

    expect(titleRules).toMatch(/white-space\s*:\s*nowrap/);
    expect(titleRules).toMatch(/overflow\s*:\s*hidden/);
    expect(titleRules).toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(questionFormSource).toContain('<b className="question-form-title" title={form.title}>');
  });
});
