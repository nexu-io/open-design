import { describe, expect, it } from 'vitest';
import { composeSystemPrompt } from '../src/prompts/system';

describe('workflow metadata prompt context', () => {
  it('injects OneShot workflow identity, gates, and exports into the system prompt', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        fidelity: 'high-fidelity',
        workflowId: 'ios-26-app-prototype',
        workflowTitle: 'iOS 26 App Prototype',
        workflowCategory: 'Mobile app',
        workflowOutcome: 'Liquid Glass iPhone concept',
        workflowCheckpoints: ['Layer model', 'Glass tiers'],
        workflowExports: ['HTML', 'PNG'],
      },
    });

    expect(prompt).toContain('- **workflow**: iOS 26 App Prototype');
    expect(prompt).toContain('- **workflowCategory**: Mobile app');
    expect(prompt).toContain('- **workflowOutcome**: Liquid Glass iPhone concept');
    expect(prompt).toContain('- **workflowCheckpoints**: Layer model, Glass tiers');
    expect(prompt).toContain('- **workflowExports**: HTML, PNG');
  });
});
