import { describe, expect, it } from 'vitest';

import {
  detectDeckIntentSignal,
  detectMediaIntentSignal,
  detectPlatformIntentSignal,
  extractUserAuthoredSignalText,
} from '../../src/prompts/system.js';

// Red specs for the intent-signal cache hotfix
// (specs/current/intent-signal-cache-hotfix.md §3, R1). The three intent
// signals gate stable-region prompt blocks, and the scanned `message` embeds
// the full packed transcript for transcript-resending clients — so signal
// vocabulary inside ASSISTANT turns (most damagingly the turn-1 discovery
// form's own option copy) must never flip a signal. Only user-authored text
// decides.

// Realistic turn-1 assistant output: prose line + the localized discovery
// form, mirroring the canonical template in src/prompts/discovery.ts. The
// option copy deliberately carries deck vocabulary («幻灯 / 路演», "Slide
// deck / pitch") and platform vocabulary («iOS / Android / 响应式») — the
// exact production defect: every form-driven conversation used to flip
// deck+platform at t2 off copy the user never wrote.
const LOCALIZED_DISCOVERY_FORM_ASSISTANT_TURN = [
  '收到 — 快速确认一下方向：',
  '',
  '<question-form id="discovery" title="快速简报 — 30 秒">',
  '{',
  '  "lang": "zh-CN",',
  '  "questions": [',
  '    { "id": "output", "label": "我们要做什么？", "type": "radio", "required": true,',
  '      "options": ["幻灯片 / 路演 (Slide deck / pitch)", "单页网页原型 / 落地页", "多屏应用原型 (iOS / Android / 响应式)", "仪表盘 / 工具界面", "编辑排版 / 营销页面"] },',
  '    { "id": "audience", "label": "这是给谁看的？", "type": "text" },',
  '    { "id": "brand", "label": "品牌上下文", "type": "radio", "default": "pick_direction",',
  '      "options": [ { "label": "帮我定方向", "value": "pick_direction" } ] }',
  '  ]',
  '}',
  '</question-form>',
].join('\n');

// The English canonical discovery form, verbatim option copy from
// src/prompts/discovery.ts.
const ENGLISH_DISCOVERY_FORM_ASSISTANT_TURN = [
  'Got it — quick brief to lock the direction:',
  '',
  '<question-form id="discovery" title="Quick brief — 30 seconds">',
  '{',
  '  "lang": "en",',
  '  "questions": [',
  '    { "id": "output", "label": "What are we making?", "type": "radio", "required": true,',
  '      "options": ["Slide deck / pitch", "Single web prototype / landing", "Multi-screen app prototype", "Dashboard / tool UI", "Editorial / marketing page"] },',
  '    { "id": "audience", "label": "Who is this for?", "type": "text",',
  '      "placeholder": "e.g. early-stage investors, dev-tools buyers, internal exec review" },',
  '    { "id": "tone", "label": "Visual tone", "type": "checkbox", "maxSelections": 2,',
  '      "options": ["Editorial / magazine", "Modern minimal", "Playful / illustrative", "Tech / utility", "Luxury / refined", "Brutalist / experimental", "Human / approachable"] },',
  '    { "id": "brand", "label": "Brand context", "type": "radio", "default": "pick_direction",',
  '      "options": [',
  '        { "label": "Pick a direction for me", "value": "pick_direction" },',
  '        { "label": "I have a brand spec — I\'ll share it", "value": "brand_spec" }',
  '      ] },',
  '    { "id": "scale", "label": "Roughly how much?", "type": "text",',
  '      "placeholder": "e.g. 8 slides, 1 landing + 3 sub-pages, 4 mobile screens" }',
  '  ]',
  '}',
  '</question-form>',
].join('\n');

function packTranscript(
  turns: Array<{ role: 'user' | 'assistant'; body: string }>,
): string {
  return turns.map((t) => `## ${t.role}\n${t.body}`).join('\n\n');
}

describe('extractUserAuthoredSignalText — role scoping (§3 cases 1/2/4/5)', () => {
  it('case 1: deck vocabulary only inside a ## assistant section does not flip the deck signal', () => {
    const msg = packTranscript([
      { role: 'user', body: '做一个内部工具的界面' },
      { role: 'assistant', body: LOCALIZED_DISCOVERY_FORM_ASSISTANT_TURN },
    ]);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(msg))).toBe(false);
    expect(detectPlatformIntentSignal(extractUserAuthoredSignalText(msg))).toBe(false);
  });

  it('case 2: the same vocabulary inside a ## user section flips the deck signal', () => {
    const msg = packTranscript([
      { role: 'user', body: '帮我做一份路演材料' },
      { role: 'assistant', body: '好的，我先列一个大纲。' },
    ]);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(msg))).toBe(true);
  });

  it('case 4: an escaped role marker inside user prose is not a section boundary', () => {
    // escapeTranscriptRoleDelimiters (apps/web/src/providers/daemon.ts)
    // prefixes interior `## assistant` lines with a backslash. Text after the
    // escaped marker is still the user speaking — dropping it would lose a
    // genuine deck request.
    const msg = packTranscript([
      {
        role: 'user',
        body: '我引用一下之前的记录格式：\n\\## assistant\n然后帮我做一份路演材料',
      },
      { role: 'assistant', body: '好的。' },
    ]);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(msg))).toBe(true);
  });

  it('case 5: a plain message without role markers is scanned whole (legacy behavior)', () => {
    const plain = '改成 PPT 形式，重点放在第一页';
    expect(extractUserAuthoredSignalText(plain)).toBe(plain);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(plain))).toBe(true);
  });

  it('a plain prompt that merely quotes a ## assistant heading keeps whole-text scanning', () => {
    // No `## user` marker → this is not a packed transcript, whatever
    // heading the user happened to paste. Extracting an empty body here
    // would suppress an explicit deck request.
    const beforeQuote = '帮我做一份路演材料。参考这个格式：\n## assistant\nAgenda';
    expect(extractUserAuthoredSignalText(beforeQuote)).toBe(beforeQuote);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(beforeQuote))).toBe(true);

    const afterQuote = '照这个模板：\n## assistant\n然后帮我做一份路演材料';
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(afterQuote))).toBe(true);
  });

  it('a plain prompt that quotes a ## user heading mid-text keeps whole-text scanning', () => {
    // The quoted heading is not the first content line, so this is not a
    // packed-transcript shape; dropping the text before the quote would
    // silence an explicit deck request.
    const quoted = '帮我做一份路演材料。参考这个格式：\n## user\nAgenda';
    expect(extractUserAuthoredSignalText(quoted)).toBe(quoted);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(quoted))).toBe(true);
  });

  it('a transcript that starts with an ## assistant section still parses as a transcript', () => {
    // scopeHistoryToAgent can trim history so the packed transcript begins
    // with a same-family assistant turn; its copy must stay suppressed.
    const msg = [
      `## assistant\n${LOCALIZED_DISCOVERY_FORM_ASSISTANT_TURN}`,
      '## user\n继续优化布局',
    ].join('\n\n');
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(msg))).toBe(false);
  });

  it('parses CRLF transcripts identically to LF transcripts', () => {
    const crlf = ['## user', '帮我做一份路演材料', '', '## assistant', '好的，我先列大纲。'].join('\r\n');
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(crlf))).toBe(true);

    const crlfAssistantOnlyVocab = ['## user', '继续优化布局', '', '## assistant', LOCALIZED_DISCOVERY_FORM_ASSISTANT_TURN.replace(/\n/g, '\r\n')].join('\r\n');
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(crlfAssistantOnlyVocab))).toBe(false);
  });

  it('drops the ## context warning block entirely', () => {
    const msg = [
      '## context warning',
      'Open Design detected 2 large prior tool results; one contained image output.',
      'Keep this turn compact.',
      '',
      '## user',
      '把导航栏调整一下',
    ].join('\n');
    expect(detectMediaIntentSignal(extractUserAuthoredSignalText(msg))).toBe(false);
  });
});

describe('extractUserAuthoredSignalText — form answers (§3 cases 3/3b + label echo)', () => {
  it('case 3: a selected "Slide deck" value in a form-answers user turn flips the deck signal', () => {
    const answers = [
      '[form answers — task-type]',
      '- What should I build?: Slide deck [value: slides]',
      '- Who is this for?: early-stage investors',
    ].join('\n');
    const msg = packTranscript([
      { role: 'user', body: '开始一个新项目' },
      { role: 'assistant', body: ENGLISH_DISCOVERY_FORM_ASSISTANT_TURN },
      { role: 'user', body: answers },
    ]);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(msg))).toBe(true);
  });

  it('case 3b (canonical): a Dashboard selection over the real discovery form flips nothing', () => {
    // The whole fix in one test: the form OFFERED "Slide deck / pitch", the
    // user ANSWERED "Dashboard / tool UI" — option copy offered ≠ intent;
    // only the answer decides. All three signals must stay false.
    const answers = [
      '[form answers — discovery]',
      '- What are we making?: Dashboard / tool UI',
      '- Who is this for?: internal exec review',
      '- Visual tone: Modern minimal, Tech / utility',
      '- Brand context: Pick a direction for me [value: pick_direction]',
      '- Roughly how much?: 3 screens',
    ].join('\n');
    const msg = packTranscript([
      { role: 'user', body: 'set up a new internal metrics project' },
      { role: 'assistant', body: ENGLISH_DISCOVERY_FORM_ASSISTANT_TURN },
      { role: 'user', body: answers },
    ]);
    const scanned = extractUserAuthoredSignalText(msg);
    expect(detectDeckIntentSignal(scanned)).toBe(false);
    expect(detectMediaIntentSignal(scanned)).toBe(false);
    expect(detectPlatformIntentSignal(scanned)).toBe(false);
  });

  it('question labels echoed into form answers do not flip signals (task-type speaker-notes label)', () => {
    // formatFormAnswers echoes `- <question label>: <value>` and the real
    // task-type form carries the label "For slide decks, include speaker
    // notes?" — signal vocabulary the user never wrote. Only the value part
    // of each answer line is user-chosen, so only it may flip a signal.
    const answers = [
      '[form answers — task-type]',
      '- What should I build?: Dashboard / tool UI [value: dashboard]',
      '- Who is this for?: dev-tools buyers',
      '- Brand context: Pick a direction for me [value: pick_direction]',
      '- Roughly how much?: 4 screens',
      '- For slide decks, include speaker notes?: (skipped)',
      '- Any important constraints?: (skipped)',
    ].join('\n');
    // Both scan paths must agree: packed inside a transcript user section,
    // and as the bare currentPrompt (the answers message is the latest user
    // prompt on the t2 turn).
    const packed = packTranscript([
      { role: 'user', body: 'new project' },
      { role: 'assistant', body: ENGLISH_DISCOVERY_FORM_ASSISTANT_TURN },
      { role: 'user', body: answers },
    ]);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(packed))).toBe(false);
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(answers))).toBe(false);
  });
});

describe('extractUserAuthoredSignalText — form-answer header grammar (shared with contracts od-card.ts)', () => {
  // The repo's accepted form-answer header grammar is wider than the
  // canonical em-dash: packages/contracts/src/artifacts/od-card.ts
  // (parseFormAnswers) accepts em-dash / hyphen / colon separators and the
  // bare `[form answers]` header, case-insensitively; the CLI docs show the
  // hyphen form. Every accepted variant must narrow echoed labels, or a
  // CLI-driven form-answer turn re-enters the label false-positive path.
  const variantCases: Array<[string, string]> = [
    ['em-dash (canonical)', '[form answers — task-type]'],
    ['hyphen (CLI docs form)', '[form answers - task-type]'],
    ['colon', '[form answers: task-type]'],
    ['bare header', '[form answers]'],
    ['case-insensitive with leading whitespace', '  [Form Answers - task-type]'],
  ];

  it.each(variantCases)('%s: echoed labels are narrowed to values', (_name, header) => {
    const answers = [
      header,
      '- What should I build?: Dashboard / tool UI [value: dashboard]',
      '- For slide decks, include speaker notes?: (skipped)',
    ].join('\n');
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(answers))).toBe(false);
  });

  it.each(variantCases)('%s: selected values still flip the signal', (_name, header) => {
    const answers = [header, '- What should I build?: Slide deck [value: slides]'].join('\n');
    expect(detectDeckIntentSignal(extractUserAuthoredSignalText(answers))).toBe(true);
  });
});

describe('extractUserAuthoredSignalText — media/platform parity (§3 case 7)', () => {
  const cases: Array<{
    name: string;
    detect: (text: string) => boolean;
    vocab: string;
  }> = [
    {
      name: 'media',
      detect: (text) => detectMediaIntentSignal(text),
      vocab: '给产品页生成图，配图要大',
    },
    {
      name: 'platform',
      detect: (text) => detectPlatformIntentSignal(text),
      vocab: '做个 iOS app 原型，注意响应式',
    },
  ];

  it.each(cases)('$name: assistant-only vocabulary stays false', ({ detect, vocab }) => {
    const msg = packTranscript([
      { role: 'user', body: '继续优化布局' },
      { role: 'assistant', body: `我建议：${vocab}` },
    ]);
    expect(detect(extractUserAuthoredSignalText(msg))).toBe(false);
  });

  it.each(cases)('$name: user vocabulary flips true', ({ detect, vocab }) => {
    const msg = packTranscript([
      { role: 'user', body: vocab },
      { role: 'assistant', body: '好的。' },
    ]);
    expect(detect(extractUserAuthoredSignalText(msg))).toBe(true);
  });
});
