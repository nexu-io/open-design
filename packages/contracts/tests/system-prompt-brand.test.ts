import { describe, expect, it } from 'vitest';
import { composeSystemPrompt } from '../src/prompts/system.js';

describe('composeSystemPrompt brand blocks', () => {
  it('injects brand core and deliverable context blocks', () => {
    const prompt = composeSystemPrompt({
      brandTitle: '보닥',
      brandCoreMd: 'BRAND-CORE-MARKER',
      brandDeliverableKey: 'cardnews',
      brandDeliverableMd: 'DELIVERABLE-MARKER',
    } as Parameters<typeof composeSystemPrompt>[0]);
    expect(prompt).toContain('## Active brand — 보닥');
    expect(prompt).toContain('BRAND-CORE-MARKER');
    expect(prompt).toContain('## Brand deliverable context — cardnews');
    expect(prompt).toContain('DELIVERABLE-MARKER');
  });

  it('omits brand blocks when no brand is bound', () => {
    const prompt = composeSystemPrompt({} as Parameters<typeof composeSystemPrompt>[0]);
    expect(prompt).not.toContain('## Active brand');
    expect(prompt).not.toContain('## Brand deliverable context');
  });
});
