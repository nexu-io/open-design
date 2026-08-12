import { describe, expect, it } from 'vitest';

import {
  buildFallbackDiscoveryQuestionForm,
  formatQuestionFormAnswers,
  parseCompletedQuestionForm,
  parseQuestionFormAnswer,
  resolveA2AQuestionForm,
  standaloneQuestionFormToolResult,
} from '../src/a2a/question-form.js';

describe('Open Design A2A question forms', () => {
  it('recovers a valid standalone question form emitted through a tool result', () => {
    const toolResult = `<question-form id="discovery" title="Quick brief">
      {"questions":[{"id":"tone","label":"Visual tone","type":"radio","options":[{"label":"Bold","value":"bold"}]}]}
    </question-form>`;
    expect(standaloneQuestionFormToolResult(toolResult)).toBe(toolResult);
    const resolved = resolveA2AQuestionForm({
      assistantText: 'Please answer the form before I continue.',
      standaloneToolResult: toolResult,
      prompt: 'Create a website.',
    });
    expect(resolved).toMatchObject({
      source: 'tool-result',
      repaired: false,
      form: { id: 'discovery', title: 'Quick brief' },
    });
  });

  it('uses a localized deterministic fallback for malformed A2A form JSON', () => {
    const malformed = `<question-form id="discovery" title="快速确认">
      {"questions":[{"id":"tone","label":"视觉风格" "type":"radio"}]}
    </question-form>`;
    const resolved = resolveA2AQuestionForm({
      assistantText: '请先确认以下问题。',
      standaloneToolResult: malformed,
      prompt: '设计一个企业网站',
    });
    expect(resolved).toMatchObject({
      source: 'fallback',
      repaired: true,
      reason: 'question form body is not valid JSON',
      form: { id: 'discovery', lang: 'zh-CN' },
    });
    expect(resolved?.form.questions.length).toBeGreaterThan(0);
    expect(buildFallbackDiscoveryQuestionForm('设计一个网站').title).toContain('快速确认');
  });

  it('does not treat prose surrounding a tool result as a standalone form', () => {
    expect(standaloneQuestionFormToolResult(
      'output:\n<question-form>{"questions":[]}</question-form>',
    )).toBeNull();
  });

  it('parses the canonical question-form artifact and preserves surrounding prose', () => {
    const parsed = parseCompletedQuestionForm(`Before I continue, choose a direction.
<question-form id="discovery" title="Design direction">
{
  "description": "Choose the direction that best fits the product.",
  "submitLabel": "Continue",
  "lang": "en",
  "questions": [
    {
      "id": "tone",
      "label": "Visual tone",
      "type": "radio",
      "required": true,
      "allowCustom": false,
      "default": "bold",
      "options": [
        { "label": "Calm", "value": "calm", "description": "Quiet and editorial" },
        { "label": "Bold", "value": "bold", "description": "High contrast and energetic" }
      ]
    },
    {
      "id": "audience",
      "label": "Primary audience",
      "type": "text",
      "placeholder": "For example, independent designers",
      "help": "Describe the people this site should serve."
    }
  ]
}
</question-form>
I will use the answer to build the first draft.`);

    expect(parsed.kind).toBe('valid');
    if (parsed.kind !== 'valid') return;
    expect(parsed.form).toEqual({
      id: 'discovery',
      title: 'Design direction',
      description: 'Choose the direction that best fits the product.',
      submitLabel: 'Continue',
      lang: 'en',
      questions: [
        {
          id: 'tone',
          label: 'Visual tone',
          type: 'radio',
          required: true,
          allowCustom: false,
          defaultValue: 'bold',
          options: [
            { label: 'Calm', value: 'calm', description: 'Quiet and editorial' },
            { label: 'Bold', value: 'bold', description: 'High contrast and energetic' },
          ],
        },
        {
          id: 'audience',
          label: 'Primary audience',
          type: 'text',
          placeholder: 'For example, independent designers',
          help: 'Describe the people this site should serve.',
        },
      ],
    });
    expect(parsed.prose).toContain('Before I continue');
    expect(parsed.prose).toContain('build the first draft');
  });

  it('validates a structured answer and formats the exact Open Design follow-up prompt', () => {
    const parsed = parseCompletedQuestionForm(`<question-form id="discovery">
      {"questions":[{"id":"tone","label":"Visual tone","type":"radio","required":true,"allowCustom":false,"options":[{"label":"Bold","value":"bold"}]}]}
    </question-form>`);
    expect(parsed.kind).toBe('valid');
    if (parsed.kind !== 'valid') return;

    const answer = parseQuestionFormAnswer({
      schemaVersion: 1,
      formId: 'discovery',
      answers: { tone: 'bold' },
    }, parsed.form);

    expect(formatQuestionFormAnswers(parsed.form, answer.answers)).toBe(
      '[form answers — discovery]\n- Visual tone: Bold [value: bold]',
    );
  });

  it('rejects answers for unknown options when custom values are disabled', () => {
    const parsed = parseCompletedQuestionForm(`<question-form id="discovery">
      {"questions":[{"id":"tone","label":"Tone","type":"radio","allowCustom":false,"options":["Calm"]}]}
    </question-form>`);
    expect(parsed.kind).toBe('valid');
    if (parsed.kind !== 'valid') return;

    expect(() => parseQuestionFormAnswer({
      schemaVersion: 1,
      formId: 'discovery',
      answers: { tone: 'Chaotic' },
    }, parsed.form)).toThrow('not an allowed option');
  });
});
