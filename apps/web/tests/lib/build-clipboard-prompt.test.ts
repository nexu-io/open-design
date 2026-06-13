import { describe, expect, it } from 'vitest';

import { buildClipboardPrompt } from '../../src/lib/build-clipboard-prompt';

const PROJECT = { id: 'proj-abc', name: 'Acme Dashboard' };

describe('buildClipboardPrompt', () => {
  it('includes the project name, working dir, run-claude hint, and the trailing TODO', () => {
    const prompt = buildClipboardPrompt({
      project: PROJECT,
      designMdState: {
        generatedAt: new Date('2026-05-08T11:55:00Z'),
        transcriptMessageCount: 42,
        designSystemId: 'alphatrace',
        currentArtifact: 'deck.html',
      },
      projectDir: '/Users/bryan/projects/acme',
    });

    expect(prompt).toContain('Acme Dashboard');
    expect(prompt).toContain('/Users/bryan/projects/acme');
    expect(prompt).toContain('Run `claude`');
    expect(prompt).toContain('<!-- TODO: describe what you want this session to do. -->');
    expect(prompt).toContain('Project ID: proj-abc');
    expect(prompt).toContain('Design system: alphatrace');
    expect(prompt).toContain('Current artifact: deck.html');
    expect(prompt).toContain('Transcript message count when DESIGN.md was generated: 42');
    expect(prompt).toContain('DESIGN.md generated at: 2026-05-08T11:55:00.000Z');
  });

  it('renders "none" + "unknown" sentinels when DESIGN.md fields are absent', () => {
    const prompt = buildClipboardPrompt({
      project: PROJECT,
      designMdState: {
        generatedAt: null,
        transcriptMessageCount: null,
        designSystemId: null,
        currentArtifact: null,
      },
      projectDir: '/Users/bryan/projects/acme',
    });

    expect(prompt).toContain('Design system: none');
    expect(prompt).toContain('Current artifact: none');
    expect(prompt).toContain('Transcript message count when DESIGN.md was generated: unknown');
    expect(prompt).toContain('DESIGN.md generated at: unknown');
    // The trailing task slot is always present, even when DESIGN.md fields are sparse.
    expect(prompt).toContain('<!-- TODO: describe what you want this session to do. -->');
  });
});
