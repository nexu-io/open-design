import { describe, expect, it } from 'vitest';
import { splitOnOdCards } from '../src/artifacts/od-card.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

const memoryBody = '### Profile\n\nOperator audience.\n\n### Verified rules\n\nKeep spacing consistent.';

describe('OPEND-2971 contracts memory card instructions', () => {
  for (const memoryHooks of [undefined, { rewrite: true, verify: true }]) {
    describe(memoryHooks ? 'explicitly enabled hooks' : 'default hooks', () => {
      it.each(['task-brief', 'rule-proposal'])('does not request a %s card', (kind) => {
        const prompt = composeSystemPrompt({ memoryBody, memoryHooks });

        expect(prompt).not.toContain(`<od-card type="${kind}">`);
      });
    });
  }

  it('retains personal memory, applied-memory chips, and rule verification', () => {
    const prompt = composeSystemPrompt({ memoryBody });

    expect(prompt).toContain(memoryBody);
    expect(prompt).toContain('## Personal memory');
    expect(prompt).toContain('<od-card type="memory-applied">');
    expect(prompt).toContain('<od-card type="verify-scorecard">');
  });

  it('still honors the verification switch without dropping memory', () => {
    const prompt = composeSystemPrompt({ memoryBody, memoryHooks: { verify: false } });

    expect(prompt).toContain(memoryBody);
    expect(prompt).toContain('<od-card type="memory-applied">');
    expect(prompt).not.toContain('<od-card type="verify-scorecard">');
  });

  it('does not introduce memory cards when there is no memory', () => {
    const prompt = composeSystemPrompt({ memoryBody: '  ' });

    expect(prompt).not.toContain('<od-card type="task-brief">');
    expect(prompt).not.toContain('<od-card type="rule-proposal">');
  });
});

describe('historical od-card compatibility', () => {
  it.each([
    { kind: 'task-brief', payload: { summary: 'Historic brief', fields: [{ label: 'Format', value: '16:9' }] } },
    { kind: 'rule-proposal', payload: { name: 'Historic rule', assertion: 'Keep spacing consistent', check: 'Inspect spacing' } },
    { kind: 'memory-applied', payload: { summary: 'Applied saved preferences', used: [] } },
    { kind: 'verify-scorecard', payload: { status: 'pass', rows: [{ rule: 'Spacing', status: 'pass' }] } },
    { kind: 'brand-browser-assist', payload: { brandId: 'brand-1', url: 'https://example.test' } },
  ])('still recognizes $kind without leaking its raw block into prose', ({ kind, payload }) => {
    const raw = `<od-card type="${kind}">${JSON.stringify(payload)}</od-card>`;
    const segments = splitOnOdCards(`Before.\n${raw}\nAfter.`);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: 'text', text: 'Before.\n' });
    expect(segments[1]).toMatchObject({ kind: 'card', card: { kind, ...payload }, raw });
    expect(segments[2]).toEqual({ kind: 'text', text: '\nAfter.' });
  });
});
