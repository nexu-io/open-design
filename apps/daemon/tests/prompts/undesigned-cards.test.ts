import { describe, expect, it } from 'vitest';
import { composeSystemPrompt } from '../../src/prompts/system.js';

const memoryBody = '### Profile\n\nOperator audience.\n\n### Verified rules\n\nKeep spacing consistent.';

// OPEND-2971: retire only the two undesigned card instructions, not memory.
describe.each(['classic', 'slim'] as const)('%s memory card instructions', (promptCoreVariant) => {
  for (const memoryHooks of [undefined, { rewrite: true, verify: true }]) {
    describe(memoryHooks ? 'explicitly enabled hooks' : 'default hooks', () => {
      it.each(['task-brief', 'rule-proposal'])('does not request a %s card', (kind) => {
        const prompt = composeSystemPrompt({ memoryBody, memoryHooks, promptCoreVariant });

        expect(prompt).not.toContain(`<od-card type="${kind}">`);
      });
    });
  }

  it('retains personal memory, applied-memory chips, and rule verification', () => {
    const prompt = composeSystemPrompt({ memoryBody, promptCoreVariant });

    expect(prompt).toContain(memoryBody);
    expect(prompt).toContain('## Personal memory');
    expect(prompt).toContain('<od-card type="memory-applied">');
    expect(prompt).toContain('<od-card type="verify-scorecard">');
  });

  it('still honors the verification switch without dropping memory', () => {
    const prompt = composeSystemPrompt({
      memoryBody,
      promptCoreVariant,
      memoryHooks: { verify: false },
    });

    expect(prompt).toContain(memoryBody);
    expect(prompt).toContain('<od-card type="memory-applied">');
    expect(prompt).not.toContain('<od-card type="verify-scorecard">');
  });

  it('does not introduce memory cards when there is no memory', () => {
    const prompt = composeSystemPrompt({ memoryBody: '  ', promptCoreVariant });

    expect(prompt).not.toContain('<od-card type="task-brief">');
    expect(prompt).not.toContain('<od-card type="rule-proposal">');
  });
});
