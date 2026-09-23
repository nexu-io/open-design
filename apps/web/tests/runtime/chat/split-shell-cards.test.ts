import { describe, expect, it } from 'vitest';
import { splitShellCards } from '../../../src/runtime/chat/split-shell-cards';

const payload = { summary: 'Preserve `<od-demo>text</od-demo>`', fields: [] };
const card = `<od-card type="task-brief">${JSON.stringify(payload)}</od-card>`;

describe('shell card decoding', () => {
  it('preserves a different tag sharing the od-card prefix while streaming', () => {
    const text = 'Before <od-card-example> keep this normal explanation.';
    expect(splitShellCards(text, true)).toEqual([{ kind: 'text', text }]);
  });

  it('keeps Markdown-like content inside a real card payload intact', () => {
    expect(splitShellCards(card, false)).toEqual([
      { kind: 'card', card: { kind: 'task-brief', ...payload }, raw: card },
    ]);
  });

  it('does not let a backtick inside one card payload turn the next card into code', () => {
    const firstPayload = { summary: 'Use `brand', fields: [] };
    const secondPayload = { summary: 'Applied palette', used: [{ type: 'rule', name: 'Palette' }] };
    const first = `<od-card type="task-brief">${JSON.stringify(firstPayload)}</od-card>`;
    const second = `<od-card type="memory-applied">${JSON.stringify(secondPayload)}</od-card>`;

    expect(splitShellCards(`${first}\n${second}\ntail\``, false)).toEqual([
      { kind: 'card', card: { kind: 'task-brief', ...firstPayload }, raw: first },
      { kind: 'text', text: '\n' },
      { kind: 'card', card: { kind: 'memory-applied', ...secondPayload }, raw: second },
      { kind: 'text', text: '\ntail`' },
    ]);
  });

  it('does not let an unclosed tag quoted in code consume a later real card', () => {
    const quoted = '`<od-card type="task-brief">`\n\n';
    const segments = splitShellCards(quoted + card, true);
    expect(segments[0]).toEqual({ kind: 'text', text: quoted });
    expect(segments[1]?.kind).toBe('card');
  });

  // Product ruling (user, 2026-09-18): a closed card whose JSON does not parse
  // is not shown at all — raw protocol markup reads as garbage to the user.
  it('drops a malformed complete block instead of painting it beside valid cards', () => {
    const malformed = '<od-card type="task-brief">invalid JSON</od-card>';
    const segments = splitShellCards(`${malformed}\n${card}`, false);
    expect(segments).toEqual([
      { kind: 'text', text: '\n' },
      { kind: 'card', card: { kind: 'task-brief', ...payload }, raw: card },
    ]);
  });

  it('keeps the prose around a dropped malformed block', () => {
    const malformed = '<od-card type="memory-applied">{"used":[],}</od-card>';
    expect(splitShellCards(`Before.\n${malformed}\nAfter.`, false)).toEqual([
      { kind: 'text', text: 'Before.\n\nAfter.' },
    ]);
  });

  // "Malformed" is not "still being written": an opener with no close tag yet is
  // withheld while streaming so a later delta can complete it into a real card.
  it('withholds an unclosed opener while streaming instead of dropping the turn', () => {
    const partial = 'Reading your preferences.\n\n<od-card type="memory-applied">{"sum';
    expect(splitShellCards(partial, true)).toEqual([
      { kind: 'text', text: 'Reading your preferences.\n\n' },
    ]);
  });
});

/**
 * Markdown classification must be computed over the text that will actually be
 * RENDERED. A dropped block contributes no characters to the render, so nothing
 * inside its payload may decide whether a later `<od-card` opener counts as a
 * quoted example. The view is "retained prose + unprocessed suffix" — neither
 * the raw input (stale: the payload still votes) nor the suffix alone (lossy:
 * the prose before the drop stops voting, and both halves render together).
 */
describe('shell card decoding · Markdown context around a dropped block', () => {
  it('does not let a fence hidden in a dropped payload swallow the next valid card', () => {
    // The payload carries an unclosed fence on its own line. Left in the
    // classifier's view it marks everything after it as code, so the valid card
    // below is never decoded and falls out of the tail `appendText` as raw
    // markup — the exact leak this whole change exists to remove.
    const malformed = '<od-card type="memory-applied">{"summary":"x",\n```\n"used":[],}</od-card>';

    expect(splitShellCards(`${malformed}\n${card}`, false)).toEqual([
      { kind: 'text', text: '\n' },
      { kind: 'card', card: { kind: 'task-brief', ...payload }, raw: card },
    ]);
  });

  it('keeps a fenced protocol example quoted before a dropped block as prose', () => {
    // Reverse anchor: recomputing the context must not start decoding cards the
    // user only quoted. The fenced example stays raw; the malformed block after
    // it is still dropped.
    const quoted = '```html\n<od-card type="task-brief">{"summary":"Doc"}</od-card>\n```\n';
    const malformed = '<od-card type="memory-applied">{"used":[],}</od-card>';

    expect(splitShellCards(`${quoted}${malformed}\ntail`, false)).toEqual([
      { kind: 'text', text: `${quoted}\ntail` },
    ]);
  });

  it('keeps the retained prose in the view instead of reclassifying the suffix alone', () => {
    // The prose before the drop does not end in a newline, so the ``` that
    // follows the dropped block is mid-line and opens nothing. Classify the
    // suffix on its own and that ``` becomes a line-leading fence that runs to
    // the end of the buffer, hiding the valid card below it and leaking it as
    // raw markup. Both halves render as one Markdown string, so both must vote.
    // (A backtick-free payload here, so only the ``` decides the outcome.)
    const malformed = '<od-card type="memory-applied">{"used":[],}</od-card>';
    const plainPayload = { summary: 'Applied palette', used: [{ type: 'rule', name: 'Palette' }] };
    const plain = `<od-card type="memory-applied">${JSON.stringify(plainPayload)}</od-card>`;

    expect(splitShellCards(`Inline example: ${malformed}\`\`\`\nstill prose\n${plain}`, false))
      .toEqual([
        { kind: 'text', text: 'Inline example: ```\nstill prose\n' },
        { kind: 'card', card: { kind: 'memory-applied', ...plainPayload }, raw: plain },
      ]);
  });
});
