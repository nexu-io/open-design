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

  it('injects project-backed Website Studio state and artifacts', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        websiteStudio: {
          intake: {
            business: 'OneShot Design',
            audience: 'Design operators',
            offer: 'Professional Website Studio',
            conversion: 'Start a build packet',
            sourcePath: 'C:\\Users\\james\\projects\\references',
          },
          sitemap: ['Home', 'Proof'],
          selectedSectionIds: ['hero', 'proof'],
          tokens: {
            Color: 'Graphite, paper, amber proof',
          },
          deployTarget: 'http://127.0.0.1:3004',
          deployCommandEvidence: '',
          adapterStatus: 'verified-local',
          qualityReviews: [
            {
              id: 'visual-quality',
              title: 'Visual quality',
              status: 'blocked',
              note: 'Hero proof needs review.',
              evidence: 'Pinned review note.',
            },
          ],
          pins: [
            {
              id: 'pin-proof',
              target: 'Website Studio / Proof',
              note: 'Tie testimonial to source path.',
              createdAt: 1,
            },
          ],
          evidenceStudio: {
            sourcePath: 'C:\\Users\\james\\projects\\references',
            originals: 2,
            thumbnails: 1,
            supportingAssets: 3,
            flaggedFiles: 0,
            reviewGate: 'Sources reviewed before export.',
          },
          artifacts: {
            'site_plan.md': '# Website Studio Site Plan\nBusiness: OneShot Design',
            'section_library.md': '# Website Studio Section Library',
            'design_tokens.md': '# Website Studio Design Tokens',
            'codex_build_brief.md': '# Codex Build Brief',
            'responsive_qa.md': '# Responsive QA\nVisual quality: blocked',
          },
        },
      },
    });

    expect(prompt).toContain('### Website Studio project-backed state');
    expect(prompt).toContain('- **business**: OneShot Design');
    expect(prompt).toContain('- **adapterStatus**: verified-local');
    expect(prompt).toContain('- **qualityReviews**: Visual quality=blocked');
    expect(prompt).toContain('- **pins**: Website Studio / Proof: Tie testimonial to source path.');
    expect(prompt).toContain('##### `site_plan.md`');
    expect(prompt).toContain('# Website Studio Site Plan');
    expect(prompt).toContain('##### `responsive_qa.md`');
  });
});
