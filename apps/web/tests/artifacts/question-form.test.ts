import { describe, expect, it } from 'vitest';

import {
  formatFormAnswers,
  splitOnQuestionForms,
  parsePartialQuestionForm,
} from '../../src/artifacts/question-form';

const VALID_BODY = `{
  "questions": [
    { "id": "platform", "label": "Platform", "type": "radio",
      "options": ["Mobile", "Desktop", "Responsive"], "required": true }
  ]
}`;

describe('form content language (lang)', () => {
  it('parses a top-level lang tag from the complete form body', () => {
    const input = [
      '<question-form id="discovery" title="快速确认 · 30秒">',
      '{ "lang": "zh-CN", "questions": [',
      '  { "id": "output", "label": "我们要做什么？", "type": "radio", "options": ["海报", "网页"] }',
      '] }',
      '</question-form>',
    ].join('\n');

    const segments = splitOnQuestionForms(input);
    expect(segments[0]?.kind).toBe('form');
    if (segments[0]?.kind !== 'form') return;
    expect(segments[0].form.lang).toBe('zh-CN');
  });

  it('never exposes a defaultValue on the still-streaming trailing question', () => {
    // Red spec for the truncated-prefill freeze (production run beaf2da0):
    // while a question object is still streaming, the partial-JSON repair can
    // terminate mid-default — `"default": ["历史背景与经过", "抗战精` repairs
    // to ["历史背景与经过", "抗战精"], and `"default": "单位教` to "单位教".
    // The card adopts a streamed default only while the answer is still
    // empty, so a truncated adoption freezes garbage that the completed
    // default can never overwrite. The in-flight question must therefore
    // expose NO defaultValue until its braces close.
    const head =
      '<question-form id="discovery" title="快速确认">\n' +
      '{ "questions": [\n' +
      '  { "id": "focus", "label": "内容重点（最多选2项）", "type": "checkbox", "maxSelections": 2,\n' +
      '    "default": ["历史背景与经过", "抗战精';

    const midDefault = parsePartialQuestionForm(head);
    const focusMid = midDefault?.questions.find((q) => q.id === 'focus');
    expect(focusMid).toBeTruthy();
    expect(focusMid?.defaultValue).toBeUndefined();

    const closed = parsePartialQuestionForm(
      head +
        '神与当代意义"],\n' +
        '    "options": ["历史背景与经过", "重要战役与事件", "抗战精神与当代意义"] },\n' +
        '  { "id": "tone", "label": "整体基调", "type": "radio", "default": "庄重',
    );
    // First question closed → its complete default surfaces; the trailing
    // in-flight question ("tone", mid-default "庄重…") still exposes none.
    const focusClosed = closed?.questions.find((q) => q.id === 'focus');
    expect(focusClosed?.defaultValue).toEqual(['历史背景与经过', '抗战精神与当代意义']);
    const toneInFlight = closed?.questions.find((q) => q.id === 'tone');
    expect(toneInFlight).toBeTruthy();
    expect(toneInFlight?.defaultValue).toBeUndefined();
  });

  it('adopts a streaming lang only once its string literal terminates', () => {
    // A half-streamed tag like "zh-C" must not resolve to a dictionary; the
    // field appears once the closing quote lands (same churn rule as `id`).
    const partial = parsePartialQuestionForm(
      '<question-form id="discovery" title="快速确认">\n{ "lang": "zh-C',
    );
    expect(partial?.lang).toBeUndefined();

    const complete = parsePartialQuestionForm(
      '<question-form id="discovery" title="快速确认">\n{ "lang": "zh-CN", "questions": [',
    );
    expect(complete?.lang).toBe('zh-CN');
  });
});

describe('splitOnQuestionForms', () => {
  it('normalizes string and object question options', () => {
    const input = [
      '<question-form id="discovery" title="Quick brief">',
      '{',
      '  "questions": [',
      '    {',
      '      "id": "platform",',
      '      "label": "Primary surface",',
      '      "type": "radio",',
      '      "required": true,',
      '      "options": [',
      '        "Responsive",',
      '        { "label": "Mobile (iOS/Android)", "description": "Phone-first app prototype", "value": "mobile" },',
      '        { "label": "Desktop web", "description": "Browser-first prototype" },',
      '        { "description": "Missing label" }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '</question-form>',
    ].join('\n');

    const segments = splitOnQuestionForms(input);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: 'form' });
    if (segments[0]?.kind !== 'form') throw new Error('expected parsed form segment');

    expect(segments[0].form.questions[0]?.options).toEqual([
      { label: 'Responsive', value: 'Responsive' },
      {
        label: 'Mobile (iOS/Android)',
        value: 'mobile',
        description: 'Phone-first app prototype',
      },
      {
        label: 'Desktop web',
        value: 'Desktop web',
        description: 'Browser-first prototype',
      },
    ]);
  });

  it('parses richer web input controls and custom-choice metadata', () => {
    const input = [
      '<question-form id="advanced" title="Advanced brief">',
      '{',
      '  "questions": [',
      '    { "id": "accent", "label": "Accent", "type": "color", "defaultValue": "#ff5500" },',
      '    { "id": "intensity", "label": "Intensity", "type": "range", "min": 1, "max": 10, "step": 1 },',
      '    { "id": "deadline", "label": "Deadline", "type": "date" },',
      '    { "id": "source", "label": "Reference URL", "type": "url" },',
      '    { "id": "brief", "label": "Upload brief", "type": "file", "multiple": true, "accept": "image/*,.pdf" },',
      '    { "id": "exact", "label": "Exact id", "type": "select", "allowCustom": false, "options": [{ "label": "A", "value": "a" }] },',
      '    { "id": "tone", "label": "Tone", "type": "radio", "customLabel": "Something else", "customPlaceholder": "Describe it", "options": ["Sharp"] }',
      '  ]',
      '}',
      '</question-form>',
    ].join('\n');

    const segment = splitOnQuestionForms(input).find((s) => s.kind === 'form');
    if (!segment || segment.kind !== 'form') throw new Error('expected parsed form');

    expect(segment.form.questions.map((q) => q.type)).toEqual([
      'color',
      'range',
      'date',
      'url',
      'file',
      'select',
      'radio',
    ]);
    expect(segment.form.questions[1]).toMatchObject({ min: 1, max: 10, step: 1 });
    expect(segment.form.questions[4]).toMatchObject({ multiple: true, accept: 'image/*,.pdf' });
    expect(segment.form.questions[5]).toMatchObject({ allowCustom: false });
    expect(segment.form.questions[6]).toMatchObject({
      customLabel: 'Something else',
      customPlaceholder: 'Describe it',
    });
  });

  it('parses the agent-recommended `default` prefill the prompt contract ships', () => {
    // The system prompt instructs every question to carry a brief-inferred
    // recommended `default` (option value for radio/select, array for
    // checkbox, text otherwise) so the user can submit the form unchanged.
    const input = [
      '<question-form id="discovery" title="Quick brief">',
      '{',
      '  "questions": [',
      '    { "id": "brand", "label": "Brand context", "type": "radio", "default": "pick_direction",',
      '      "options": [{ "label": "Pick a direction for me", "value": "pick_direction" }] },',
      '    { "id": "tone", "label": "Tone", "type": "checkbox", "default": ["Modern minimal", "tech"],',
      '      "options": ["Modern minimal", { "label": "Tech / utility", "value": "tech" }] },',
      '    { "id": "scale", "label": "Roughly how much?", "type": "text", "default": "8 slides" }',
      '  ]',
      '}',
      '</question-form>',
    ].join('\n');

    const segment = splitOnQuestionForms(input).find((s) => s.kind === 'form');
    if (!segment || segment.kind !== 'form') throw new Error('expected parsed form');

    expect(segment.form.questions[0]?.defaultValue).toBe('pick_direction');
    // Label-form defaults canonicalize to stable option values.
    expect(segment.form.questions[1]?.defaultValue).toEqual(['Modern minimal', 'tech']);
    expect(segment.form.questions[2]?.defaultValue).toBe('8 slides');
  });

  it('preserves stable option values when formatting object-option answers', () => {
    const text = formatFormAnswers(
      {
        id: 'discovery',
        title: 'Quick brief',
        questions: [
          {
            id: 'platform',
            label: 'Primary surface',
            type: 'radio',
            options: [
              { label: 'Mobile (iOS/Android)', value: 'mobile' },
              { label: 'Desktop web', value: 'Desktop web' },
            ],
          },
        ],
      },
      { platform: 'mobile' },
    );

    expect(text).toContain('- Primary surface: Mobile (iOS/Android) [value: mobile]');
  });

  it('parses the canonical <question-form> tag', () => {
    const out = splitOnQuestionForms(`prose\n<question-form id="d" title="T">${VALID_BODY}</question-form>\nmore`);
    expect(out.map((s) => s.kind)).toEqual(['text', 'form', 'text']);
    if (out[1]?.kind === 'form') {
      expect(out[1].form.id).toBe('d');
      expect(out[1].form.questions).toHaveLength(1);
    }
  });

  it('accepts <ask-question> as an alias for <question-form> (#1194)', () => {
    const out = splitOnQuestionForms(`<ask-question id="brief" title="Quick brief">${VALID_BODY}</ask-question>`);
    expect(out.map((s) => s.kind)).toEqual(['form']);
    if (out[0]?.kind === 'form') {
      expect(out[0].form.id).toBe('brief');
      expect(out[0].form.title).toBe('Quick brief');
      expect(out[0].form.questions[0]?.id).toBe('platform');
    }
  });

  it('handles mixed casing on the alias (e.g. <Ask-Question>)', () => {
    const out = splitOnQuestionForms(`<Ask-Question>${VALID_BODY}</Ask-Question>`);
    expect(out.map((s) => s.kind)).toEqual(['form']);
  });

  it('does not close one tag with the other tag name', () => {
    const out = splitOnQuestionForms(`<question-form>${VALID_BODY}</ask-question>`);
    expect(out.map((s) => s.kind)).toEqual(['text']);
  });

  it('keeps malformed JSON bodies as raw text', () => {
    const out = splitOnQuestionForms(`<ask-question>not json</ask-question>`);
    expect(out.map((s) => s.kind)).toEqual(['text']);
  });

  it('keeps unterminated tags as prose without swallowing trailing text', () => {
    const out = splitOnQuestionForms(`leading <ask-question>${VALID_BODY}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'text' });
  });

  it('finds close tags without Unicode index desync (#1194)', () => {
    const out = splitOnQuestionForms(`prefix İ suffix<ask-question id="x">${VALID_BODY}</ask-question>`);
    expect(out.map((s) => s.kind)).toEqual(['text', 'form']);
    if (out[1]?.kind === 'form') {
      expect(out[1].form.id).toBe('x');
    }
  });

  it('unwinds a false-positive open tag mentioned in prose and re-parses the real form', () => {
    // Model mentioned the tag name inside backtick-quoted prose before
    // emitting the real form — the first open match must not consume the real
    // close tag, or the real form is lost.
    const input =
      `my first output should be \`<question-form id="discovery">\`.\n\n` +
      `Let me write a custom form:\n\n` +
      `<question-form id="discovery" title="Quick brief">${VALID_BODY}</question-form>\n\n` +
      `Now I'll proceed.`;
    const out = splitOnQuestionForms(input);
    expect(out.map((s) => s.kind)).toEqual(['text', 'text', 'form', 'text']);
    if (out[2]?.kind === 'form') {
      expect(out[2].form.id).toBe('discovery');
      expect(out[2].form.questions).toHaveLength(1);
    }
    // Segments must reconstruct the input without gaps or duplication.
    const reconstructed = out
      .map((s) => (s.kind === 'form' ? (s as { raw: string }).raw : (s as { text: string }).text))
      .join('');
    expect(reconstructed).toBe(input);
  });

  it('unwinds a tag-name mismatch — prose mentions <ask-question> but the real form is <question-form>', () => {
    const input =
      `In your output you'll see \`<ask-question>\` tags.\n\n` +
      `<question-form id="real" title="Brief">${VALID_BODY}</question-form>\n\n` +
      `Done.`;
    const out = splitOnQuestionForms(input);
    expect(out.map((s) => s.kind)).toEqual(['text', 'text', 'form', 'text']);
    if (out[2]?.kind === 'form') {
      expect(out[2].form.id).toBe('real');
      expect(out[2].form.questions).toHaveLength(1);
    }
    const reconstructed = out
      .map((s) => (s.kind === 'form' ? (s as { raw: string }).raw : (s as { text: string }).text))
      .join('');
    expect(reconstructed).toBe(input);
  });
});

describe('parsePartialQuestionForm (true token-by-token streaming)', () => {
  it('surfaces a question before its object closes, then grows its options', () => {
    const midLabel = '<question-form id="discovery">{"questions":[{"id":"platform","label":"Platform"';
    expect(parsePartialQuestionForm(midLabel)?.questions.map((q) => q.label)).toEqual(['Platform']);

    const oneOption =
      '<question-form id="discovery">{"questions":[{"id":"platform","label":"Platform","type":"radio","options":["Mobile"';
    expect(parsePartialQuestionForm(oneOption)?.questions[0]?.options?.map((o) => o.label)).toEqual([
      'Mobile',
    ]);

    const twoOptions =
      '<question-form id="discovery">{"questions":[{"id":"platform","label":"Platform","type":"radio","options":["Mobile","Desktop"';
    expect(parsePartialQuestionForm(twoOptions)?.questions[0]?.options?.map((o) => o.label)).toEqual([
      'Mobile',
      'Desktop',
    ]);
  });

  it('holds back a trailing question until its label exists (no id placeholder flicker)', () => {
    const buf =
      '<question-form id="discovery">{"questions":[{"id":"a","label":"First","type":"text"},{"id":"b"';
    expect(parsePartialQuestionForm(buf)?.questions.map((q) => q.label)).toEqual(['First']);
  });

  it('reads title/id from the open tag before any question arrives', () => {
    const f = parsePartialQuestionForm('<question-form id="discovery" title="Quick brief">{"questions":[');
    expect(f?.id).toBe('discovery');
    expect(f?.title).toBe('Quick brief');
    expect(f?.questions).toEqual([]);
  });

  it('does not adopt a partial body id (no char-by-char churn)', () => {
    // No tag attr; the body `id` is still arriving — the preview id must NOT
    // follow the partial token (which would remount the editable panel).
    expect(parsePartialQuestionForm('<question-form>{"id":"d')?.id).toBe('discovery');
    expect(parsePartialQuestionForm('<question-form>{"id":"disc')?.id).toBe('discovery');
  });

  it('adopts the body id once complete so it matches the final parse (no swap remount)', () => {
    // Once the id string literal is terminated, the preview adopts it — which
    // is exactly what tryParseForm assigns after the close tag, so there's no
    // preview→final identity change to remount the panel.
    const buf = '<question-form>{"id":"discovery-form","questions":[{"id":"a","label":"Q"}]}';
    expect(parsePartialQuestionForm(buf)?.id).toBe('discovery-form');
    const seg = splitOnQuestionForms(`${buf}</question-form>`).find((s) => s.kind === 'form');
    expect(seg && seg.kind === 'form' ? seg.form.id : null).toBe('discovery-form');
  });

  it('ignores a nested question id when deriving the form id', () => {
    expect(
      parsePartialQuestionForm('<question-form>{"questions":[{"id":"platform","label":"P"}')?.id,
    ).toBe('discovery');
  });

  it('does not let a nested question id/description masquerade as form metadata', () => {
    // No form-level id on the tag or top-level body — only a question-level
    // id. The form id must stay the stable fallback, not adopt "platform"
    // (which would change the live panel's identity mid-stream).
    const f = parsePartialQuestionForm(
      '<question-form>{"questions":[{"id":"platform","label":"Platform","description":"nested"',
    );
    expect(f?.id).toBe('discovery');
    expect(f?.description).toBeUndefined();
    expect(f?.questions.map((q) => q.label)).toEqual(['Platform']);
  });

  it('keeps streaming through a closed ```json fence before the close tag arrives', () => {
    // Fenced body fully written, trailing ``` present, but </question-form>
    // not yet — the preview must stay populated, not drop to empty.
    const buf =
      '<question-form id="discovery">```json\n{"questions":[{"id":"a","label":"First","type":"text"}]}\n```';
    expect(parsePartialQuestionForm(buf)?.questions.map((q) => q.label)).toEqual(['First']);
  });

  it('keeps streaming while only a partial trailing fence has arrived', () => {
    const buf =
      '<question-form id="discovery">```json\n{"questions":[{"id":"a","label":"First","type":"text"}]}\n``';
    expect(parsePartialQuestionForm(buf)?.questions.map((q) => q.label)).toEqual(['First']);
  });

  it('does not strip backticks that are content of a label still being typed', () => {
    // The trailing ``` here is inside an open string value, not a closing
    // fence — it must survive into the preview, not be trimmed to "Use ".
    const buf = '<question-form id="discovery">{"questions":[{"id":"a","label":"Use ```';
    expect(parsePartialQuestionForm(buf)?.questions[0]?.label).toContain('```');
  });

  it('carries a custom submitLabel through the streaming preview', () => {
    const buf =
      '<question-form id="discovery">{"submitLabel":"Generate brief","questions":[{"id":"a","label":"First","type":"text"}';
    expect(parsePartialQuestionForm(buf)?.submitLabel).toBe('Generate brief');
  });

  it('keeps already-visible questions when a boolean value is split across deltas', () => {
    // `required` cut mid-`true` must not drop the question already shown.
    const buf = '<question-form id="discovery">{"questions":[{"id":"a","label":"Q","required":t';
    expect(parsePartialQuestionForm(buf)?.questions.map((q) => q.label)).toEqual(['Q']);
  });

  it('streams a single closed no-id question before the close tag arrives', () => {
    // The object is complete (its `}` streamed) but has no explicit id and no
    // `]`/close tag yet. Its fallback id (q1) is already final, so it should
    // show now rather than waiting for the close tag.
    const buf = '<question-form id="discovery">{"questions":[{"label":"First","type":"text"}';
    expect(parsePartialQuestionForm(buf)?.questions.map((q) => q.label)).toEqual(['First']);
    expect(parsePartialQuestionForm(buf)?.questions.map((q) => q.id)).toEqual(['q1']);
  });

  it('still holds a no-id question whose object is not yet closed', () => {
    // Same content but the object is still open (no `}`): it might still gain
    // an id, so surfacing it now risks an id swap that orphans an answer.
    const buf = '<question-form id="discovery">{"questions":[{"label":"First","type":"text"';
    expect(parsePartialQuestionForm(buf)?.questions).toEqual([]);
  });

  it('holds a label-first question until its canonical id is determinable', () => {
    // label streamed, the in-flight object has no id yet — surfacing it now
    // would force a later id swap that orphans an in-progress answer, so it
    // waits. Once the id streams it appears with the canonical id.
    const labelFirst = parsePartialQuestionForm(
      '<question-form id="discovery">{"questions":[{"label":"Platform"',
    );
    expect(labelFirst?.questions).toEqual([]);
    const idLater = parsePartialQuestionForm(
      '<question-form id="discovery">{"questions":[{"label":"Platform","id":"platform"',
    );
    expect(idLater?.questions[0]?.id).toBe('platform');
  });

  it('gives preview question ids identical to the final parse (no orphaned answers on swap)', () => {
    const finalIds = (input: string) => {
      const seg = splitOnQuestionForms(input).find((s) => s.kind === 'form');
      return seg && seg.kind === 'form' ? seg.form.questions.map((q) => q.id) : [];
    };
    // id-bearing question: preview id == final canonical id.
    const withId =
      '<question-form id="discovery">{"questions":[{"id":"platform","label":"Platform","type":"radio","options":["A"]}';
    expect(parsePartialQuestionForm(withId)?.questions.map((q) => q.id)).toEqual(['platform']);
    expect(finalIds(`${withId}]}</question-form>`)).toEqual(['platform']);
    // no-id question that has closed (not in-flight): preview falls back to the
    // same index id the final parse will assign.
    const noId =
      '<question-form id="discovery">{"questions":[{"label":"First","type":"text"},{"id":"b"';
    expect(parsePartialQuestionForm(noId)?.questions.map((q) => q.id)).toEqual(['q1']);
    expect(finalIds('<question-form id="discovery">{"questions":[{"label":"First","type":"text"}]}</question-form>')).toEqual(['q1']);
  });
});
