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
        workflowExportPackage: [
          {
            format: 'HTML',
            artifact: 'Interactive iPhone prototype',
            instructions: 'Ship a responsive HTML prototype.',
          },
          {
            format: 'PNG',
            artifact: 'Review capture',
            instructions: 'Prepare a clean still capture target.',
          },
        ],
        workflowScorecard: ['iOS fit', 'Glass tier discipline'],
      },
    });

    expect(prompt).toContain('- **workflow**: iOS 26 App Prototype');
    expect(prompt).toContain('- **workflowCategory**: Mobile app');
    expect(prompt).toContain('- **workflowOutcome**: Liquid Glass iPhone concept');
    expect(prompt).toContain('- **workflowCheckpoints**: Layer model, Glass tiers');
    expect(prompt).toContain('- **workflowExports**: HTML, PNG');
    expect(prompt).toContain('### Workflow export package');
    expect(prompt).toContain('- **HTML**: Interactive iPhone prototype - Ship a responsive HTML prototype.');
    expect(prompt).toContain('- **PNG**: Review capture - Prepare a clean still capture target.');
    expect(prompt).toContain('- **workflowScorecard**: iOS fit, Glass tier discipline');
    expect(prompt).toContain('fix any weak dimension instead of merely reporting it');
  });

  it('injects CoverVisionOS handoff stages, artifacts, and commands', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'template',
        workflowTitle: 'OneShot Cover Run',
        workflowHandoff: {
          system: 'CoverVisionOS',
          stages: ['Layout package', 'Production specs', 'Generation preflight'],
          artifacts: ['layout_handoff.md', 'production_specs.md', 'preflight_report.json'],
          commands: ['layout-package', 'production-specs', 'preflight'],
        },
      },
    });

    expect(prompt).toContain('### CoverVisionOS handoff');
    expect(prompt).toContain('Treat this handoff as the downstream production bridge.');
    expect(prompt).toContain('- **stages**: Layout package -> Production specs -> Generation preflight');
    expect(prompt).toContain('- **artifacts**: layout_handoff.md, production_specs.md, preflight_report.json');
    expect(prompt).toContain('- **commands**: layout-package, production-specs, preflight');
  });
});
