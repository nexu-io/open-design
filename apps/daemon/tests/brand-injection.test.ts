import { describe, expect, it } from 'vitest';
import { composeSystemPrompt } from '../src/prompts/system.js';

describe('daemon composeSystemPrompt brand blocks', () => {
  it('injects brand blocks before the design-system block', () => {
    const prompt = composeSystemPrompt({
      brandTitle: '보닥',
      brandCoreMd: 'BRAND-CORE-MARKER',
      brandDeliverableKey: 'iam',
      brandDeliverableMd: 'DELIVERABLE-MARKER',
      designSystemBody: 'DS-MARKER',
      designSystemTitle: 'Bodoc IAM',
    } as Parameters<typeof composeSystemPrompt>[0]);
    const brandIdx = prompt.indexOf('## Active brand — 보닥');
    const dsIdx = prompt.indexOf('## Active design system — Bodoc IAM');
    expect(brandIdx).toBeGreaterThan(-1);
    expect(prompt).toContain('## Brand deliverable context — iam');
    expect(dsIdx).toBeGreaterThan(brandIdx);
  });
});
