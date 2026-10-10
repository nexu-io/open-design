import { describe, expect, it } from 'vitest';
import {
  findOdCardClose,
  splitOnOdCards,
  stripTrailingOpenOdCard,
} from '../src/artifacts/od-card.js';
import { chatProtocolSkipRanges } from '../src/artifacts/chat-protocol-context.js';

// #8379: a `</od-card>` quoted inside a JSON string is payload data, not the
// outer close. `JSON.stringify` keeps the marker verbatim, so host-produced
// cards reach this path whenever a stored name or note contains it.
const MARKER = 'Literal </od-card> marker';

function frame(kind: string, payload: unknown): string {
  return `<od-card type="${kind}">${JSON.stringify(payload)}</od-card>`;
}

const KINDS = [
  { kind: 'task-brief', payload: { summary: MARKER, fields: [{ label: 'Note', value: MARKER }] } },
  { kind: 'memory-applied', payload: { summary: 'Saved one preference', used: [{ id: 'memory-1', type: 'profile', name: MARKER }] } },
  { kind: 'verify-scorecard', payload: { status: 'pass', rows: [{ rule: MARKER, status: 'pass' }] } },
  { kind: 'rule-proposal', payload: { name: MARKER, assertion: MARKER, check: 'Inspect copy' } },
  { kind: 'brand-browser-assist', payload: { brandId: 'brand-1', reason: MARKER } },
];

describe('od-card outer boundary ignores close markers inside JSON strings', () => {
  it.each(KINDS)('keeps a $kind card whole when a field quotes the close marker', ({ kind, payload }) => {
    const raw = frame(kind, payload);
    const segments = splitOnOdCards(`Before.\n${raw}\nAfter.`);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: 'text', text: 'Before.\n' });
    expect(segments[1]).toMatchObject({ kind: 'card', card: { kind }, raw });
    expect(segments[2]).toEqual({ kind: 'text', text: '\nAfter.' });
  });

  it('matches the quoted marker case-insensitively as payload data', () => {
    const raw = frame('memory-applied', { summary: 'Upper </OD-CARD> case', used: [] });
    expect(splitOnOdCards(raw)).toEqual([
      { kind: 'card', card: { kind: 'memory-applied', summary: 'Upper </OD-CARD> case', used: [] }, raw },
    ]);
  });

  it('tracks escaped quotes and escaped backslashes inside strings', () => {
    // `\\"` ends the string (escaped backslash, then a real quote); `\"` does not.
    const summary = 'a \\" b \\\\ </od-card> c \\\\';
    const raw = frame('memory-applied', { summary, used: [] });
    const segments = splitOnOdCards(`${raw} tail`);
    expect(segments).toEqual([
      { kind: 'card', card: { kind: 'memory-applied', summary, used: [] }, raw },
      { kind: 'text', text: ' tail' },
    ]);
  });

  it('accepts an uppercase outer close after a quoted marker', () => {
    const raw = `<od-card type="memory-applied">${JSON.stringify({ summary: MARKER, used: [] })}</OD-CARD>`;
    expect(splitOnOdCards(raw)).toMatchObject([{ kind: 'card', raw }]);
  });

  it('keeps a fenced JSON body whole', () => {
    const raw = `<od-card type="memory-applied">\n\`\`\`json\n${JSON.stringify({ summary: MARKER, used: [] })}\n\`\`\`\n</od-card>`;
    expect(splitOnOdCards(raw)).toMatchObject([{ kind: 'card', card: { summary: MARKER }, raw }]);
  });
});

describe('od-card outer boundary reverse anchors', () => {
  it.each([
    ['an escaped slash', '<\\/od-card>'],
    ['a unicode-escaped bracket', '\\u003c/od-card>'],
  ])('does not treat %s as a close marker', (_label, encoded) => {
    const raw = `<od-card type="memory-applied">{"summary":"x ${encoded} y","used":[]}</od-card>`;
    expect(splitOnOdCards(`${raw}!`)).toMatchObject([
      { kind: 'card', card: { summary: 'x </od-card> y' }, raw },
      { kind: 'text', text: '!' },
    ]);
  });

  it('still closes a malformed block at its first marker and keeps the later card', () => {
    const malformed = '<od-card type="task-brief">invalid JSON</od-card>';
    const valid = frame('memory-applied', { summary: 'Later card', used: [] });
    expect(splitOnOdCards(`${malformed}\n${valid}`)).toEqual([
      { kind: 'text', text: malformed },
      { kind: 'text', text: '\n' },
      { kind: 'card', card: { kind: 'memory-applied', summary: 'Later card', used: [] }, raw: valid },
    ]);
  });

  it('closes a malformed block with an unbalanced quote at its first marker', () => {
    const malformed = '<od-card type="memory-applied">{"summary":"oops}</od-card>';
    const valid = frame('memory-applied', { summary: 'He said "hi" <b>', used: [] });
    const input = `${malformed}\nSee "this" <b>prose</b>.\n${valid}\nAfter.`;
    expect(splitOnOdCards(input)).toEqual([
      { kind: 'text', text: malformed },
      { kind: 'text', text: '\nSee "this" <b>prose</b>.\n' },
      { kind: 'card', card: { kind: 'memory-applied', summary: 'He said "hi" <b>', used: [] }, raw: valid },
      { kind: 'text', text: '\nAfter.' },
    ]);
  });

  it('falls back to the first marker when the extended body is not a JSON object', () => {
    const input = '<od-card type="memory-applied">{"summary":"a</od-card>" "b"}</od-card> tail';
    const first = input.indexOf('</od-card>');
    expect(findOdCardClose(input, input.indexOf('>') + 1)).toBe(first);
    expect(splitOnOdCards(input)[0]).toEqual({ kind: 'text', text: input.slice(0, first + '</od-card>'.length) });
  });

  it('keeps ordinary trailing prose after a valid card', () => {
    const raw = frame('memory-applied', { summary: 'Plain', used: [] });
    expect(splitOnOdCards(`${raw} and "quoted" prose </od-card>`)).toEqual([
      { kind: 'card', card: { kind: 'memory-applied', summary: 'Plain', used: [] }, raw },
      { kind: 'text', text: ' and "quoted" prose </od-card>' },
    ]);
  });

  it('keeps a trailing unterminated card as prose in final input', () => {
    const input = `Before <od-card type="memory-applied">{"summary":"${MARKER}"`;
    expect(splitOnOdCards(input)).toEqual([
      { kind: 'text', text: 'Before ' },
      { kind: 'text', text: '<od-card type="memory-applied">{"summary":"Literal </od-card>' },
      { kind: 'text', text: ' marker"' },
    ]);
  });
});

describe('streaming a card whose payload quotes the close marker', () => {
  const payload = JSON.stringify({ summary: MARKER, used: [] });
  const opener = '<od-card type="memory-applied">';
  const whole = `Reading your preferences.\n\n${opener}${payload}</od-card>\nDone.`;
  const markerEnd = whole.indexOf('</od-card>') + '</od-card>'.length;
  const frames = [
    whole.slice(0, whole.indexOf('</od-card>') + 4),
    whole.slice(0, markerEnd),
    whole.slice(0, whole.lastIndexOf('</od-card>')),
    whole,
  ];

  it.each(frames.slice(0, 3).map((text, index) => ({ index, text })))(
    'keeps frame $index hidden before the real outer close',
    ({ text }) => {
      expect(stripTrailingOpenOdCard(text)).toEqual({
        text: 'Reading your preferences.\n\n',
        hadOpenCard: true,
      });
    },
  );

  it('releases the card once the real outer close arrives', () => {
    expect(stripTrailingOpenOdCard(frames[3]!)).toEqual({ text: whole, hadOpenCard: false });
    expect(splitOnOdCards(frames[3]!).map((segment) => segment.kind)).toEqual(['text', 'card', 'text']);
  });

  it('reports the in-string marker as pending only for live callers', () => {
    const text = frames[1]!;
    const from = text.indexOf(opener) + opener.length;
    expect(findOdCardClose(text, from, { live: true })).toBe(-1);
    expect(findOdCardClose(text, from)).toBe(text.indexOf('</od-card>'));
  });

  it('does not hold a malformed block open once a non-JSON character follows its marker', () => {
    const text = `${opener}{"summary":"oops}</od-card>\nSee "this <b>prose`;
    expect(stripTrailingOpenOdCard(text)).toEqual({ text, hadOpenCard: false });
  });

  it('releases an unbalanced-quote block at the first raw newline while live', () => {
    // JSON strings never hold a raw newline, so the in-string marker is final.
    const text = `${opener}{"summary":"oops}</od-card>\nplain prose`;
    expect(stripTrailingOpenOdCard(text)).toEqual({ text, hadOpenCard: false });
    expect(splitOnOdCards(text)).toEqual([
      { kind: 'text', text: `${opener}{"summary":"oops}</od-card>` },
      { kind: 'text', text: '\nplain prose' },
    ]);
  });

  // Known trade-off: while the stream is live, an unbalanced quote followed only
  // by quote-free text on the same line cannot be told apart from a payload still
  // being written. The final parse keeps the historical first-marker boundary.
  it('holds a single-line ambiguous block while live and restores it when final', () => {
    const text = `${opener}{"summary":"oops}</od-card> plain prose`;
    expect(stripTrailingOpenOdCard(text)).toEqual({ text: '', hadOpenCard: true });
    expect(splitOnOdCards(text)).toEqual([
      { kind: 'text', text: `${opener}{"summary":"oops}</od-card>` },
      { kind: 'text', text: ' plain prose' },
    ]);
  });

  it.each(['<', '</', '</od-', '</OD-CA', '</od-card'])(
    'keeps the card hidden while the real outer close is cut at %j',
    (partial) => {
      const text = `Intro. ${opener}{"summary":"use the </od-card> tag"}${partial}`;
      expect(stripTrailingOpenOdCard(text)).toEqual({ text: 'Intro. ', hadOpenCard: true });
    },
  );

  it('releases an unbalanced-quote block inside a fenced example at the fence newline', () => {
    const text = `Example:\n\n\`\`\`html\n${opener}{"summary":"x</od-card>\n\`\`\`\n\nRest of the answer.`;
    expect(stripTrailingOpenOdCard(text)).toEqual({ text, hadOpenCard: false });
  });

  it('never disagrees with the final boundary except by still waiting', () => {
    const texts = [
      ...frames,
      `${opener}{"summary":"a\\</od-card> b"}</od-card> after`,
      `${opener}{"summary":"oops}</od-card> "quoted" prose`,
      `${opener}["a</od-card>"]</od-card> after`,
      `${opener}{"summary":"x</od-card>`,
    ];
    for (const text of texts) {
      const from = text.indexOf(opener) + opener.length;
      const live = findOdCardClose(text, from, { live: true });
      if (live !== -1) expect(live).toBe(findOdCardClose(text, from));
    }
  });
});

describe('a backslash before a quoted close marker', () => {
  it('still treats the marker as the malformed boundary and keeps later content', () => {
    const text = '<od-card type="task-brief">{"summary":"a\\</od-card>\n\nProse between.\n\n'
      + '<od-card type="task-brief">{"summary":"b"}</od-card>\n\nTail prose.';
    const firstClose = text.indexOf('</od-card>') + '</od-card>'.length;
    const segments = splitOnOdCards(text);

    expect(segments[0]).toEqual({ kind: 'text', text: text.slice(0, firstClose) });
    expect(segments[1]).toEqual({ kind: 'text', text: '\n\nProse between.\n\n' });
    expect(segments[2]).toMatchObject({ kind: 'card', card: { summary: 'b' } });
    expect(segments[3]).toEqual({ kind: 'text', text: '\n\nTail prose.' });
    expect(stripTrailingOpenOdCard(text)).toEqual({ text, hadOpenCard: false });
  });

  it('does not let protocol ownership run to the end of the message', () => {
    const text = '<od-card type="task-brief">{"summary":"C:\\</od-card>\n\nAll the rest.';
    const ranges = chatProtocolSkipRanges(text, () => null);
    expect(ranges.some(([, end]) => end === text.length)).toBe(false);
  });
});

describe('bodies that are not a single JSON object', () => {
  it.each([
    ['an array', '["a</od-card>"]'],
    ['a string', '"a</od-card>"'],
    ['two strings', '"a</od-card>" "b"'],
    ['a number after a string', '"a</od-card>" 1'],
  ])('keeps the first-marker boundary for %s', (_label, body) => {
    const text = `<od-card type="task-brief">${body}</od-card> after`;
    const from = text.indexOf('>') + 1;
    expect(findOdCardClose(text, from)).toBe(text.indexOf('</od-card>'));
  });

  it('keeps a payload that quotes a whole escaped card as one card', () => {
    const inner = '<od-card type="task-brief">{"summary":"inner"}</od-card>';
    const raw = frame('task-brief', { summary: 'demo', note: inner });
    expect(splitOnOdCards(`${raw} after`)).toEqual([
      { kind: 'card', card: expect.objectContaining({ summary: 'demo' }), raw },
      { kind: 'text', text: ' after' },
    ]);
  });
});

describe('protocol ownership follows the JSON-aware boundary', () => {
  it('owns the whole card payload including text after a quoted marker', () => {
    const raw = frame('memory-applied', { summary: 'Saved', used: [{ type: 'profile', name: `${MARKER} \` tick` }] });
    const text = `${raw}\n\n\`code\``;
    const ranges = chatProtocolSkipRanges(text, () => null);
    expect(ranges[0]).toEqual([0, raw.length]);
    expect(ranges).toContainEqual([raw.length + 2, text.length]);
  });

  it('stays linear on many adjacent cards that quote the marker', () => {
    // Behavioral sequence coverage; each card must still decode.
    const raw = frame('memory-applied', { summary: MARKER, used: [] });
    const input = Array.from({ length: 500 }, () => raw).join('\n');
    const cards = splitOnOdCards(input).filter((segment) => segment.kind === 'card');
    expect(cards).toHaveLength(500);
  });

  // Escaped quotes outside a string used to let every earlier scan stay inside
  // one string and walk to the end of the input. At this size a quadratic scan
  // takes tens of seconds, far past the test timeout; a linear one takes
  // milliseconds.
  it.each([
    ['escaped-quote cards', (n: number) => '<od-card>\\"</od-card>'.repeat(n)],
    ['double-escaped JSON cards', (n: number) => Array.from({ length: n }, (_, i) =>
      `<od-card>{\\"kind\\":\\"task-brief\\",\\"summary\\":\\"item ${i}\\"}</od-card>\n\nprose ${i}\n\n`).join('')],
  ])('keeps each malformed block at its first marker for %s', (_label, build) => {
    const n = 20_000;
    const input = build(n);
    const blocks = splitOnOdCards(input).filter((segment) => segment.kind === 'text' && segment.text.startsWith('<od-card'));
    expect(blocks).toHaveLength(n);
    expect(chatProtocolSkipRanges(input, () => null).length).toBeLessThanOrEqual(n);
  });
});
