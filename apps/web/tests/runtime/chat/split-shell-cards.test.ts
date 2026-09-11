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

  it('keeps malformed complete protocol as text beside valid cards', () => {
    const malformed = '<od-card type="task-brief">invalid JSON</od-card>\n';
    const segments = splitShellCards(malformed + card, false);
    expect(segments[0]).toEqual({ kind: 'text', text: malformed });
    expect(segments[1]?.kind).toBe('card');
  });
});
