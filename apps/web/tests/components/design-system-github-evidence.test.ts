import { describe, expect, it } from 'vitest';

import {
  buildRepoImportPrompt,
  designSystemGithubEvidenceState,
  designSystemNeedsRepoConnect,
  repoConnectCopy,
} from '../../src/components/design-system-github-evidence';
import type { DesignSystemSummary } from '../../src/types';

function designSystem(overrides: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id: 'user:acme',
    title: 'Acme Design System',
    category: 'Custom',
    summary: 'Context project for Acme.',
    swatches: [],
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    ...overrides,
  };
}

const githubBacked = designSystem({
  provenance: { githubUrls: ['https://github.com/acme/product'] },
});

describe('designSystemGithubEvidenceState', () => {
  it('treats systems without GitHub repos as ready and never required', () => {
    const state = designSystemGithubEvidenceState(designSystem(), ['DESIGN.md', 'preview/colors.html']);
    expect(state.required).toBe(false);
    expect(state.ready).toBe(true);
  });

  it('detects the source manifest for non-GitHub systems', () => {
    const state = designSystemGithubEvidenceState(designSystem(), ['context/source-context.md']);
    expect(state.hasSourceManifest).toBe(true);
  });

  it('is not ready when a GitHub repo is declared but no evidence has landed', () => {
    const state = designSystemGithubEvidenceState(githubBacked, ['DESIGN.md']);
    expect(state.required).toBe(true);
    expect(state.noteCount).toBe(0);
    expect(state.snapshotCount).toBe(0);
    expect(state.ready).toBe(false);
  });

  it('stays not-ready when notes exist but file snapshots are still missing', () => {
    const state = designSystemGithubEvidenceState(githubBacked, [
      'DESIGN.md',
      'context/github/acme-product.md',
    ]);
    expect(state.noteCount).toBe(1);
    expect(state.snapshotCount).toBe(0);
    expect(state.ready).toBe(false);
  });

  it('becomes ready once notes cover every repo and at least one snapshot exists', () => {
    const state = designSystemGithubEvidenceState(githubBacked, [
      'context/github/acme-product.md',
      'context/github/acme-product/files/App.tsx',
    ]);
    expect(state.noteCount).toBe(1);
    expect(state.snapshotCount).toBe(1);
    expect(state.ready).toBe(true);
  });

  it('normalizes leading ./ and backslash paths case-insensitively', () => {
    const state = designSystemGithubEvidenceState(githubBacked, [
      './context\\github\\Acme-Product.md',
      'context\\github\\Acme-Product\\files\\Button.tsx',
    ]);
    expect(state.noteCount).toBe(1);
    expect(state.snapshotCount).toBe(1);
    expect(state.ready).toBe(true);
  });
});

describe('designSystemNeedsRepoConnect', () => {
  it('returns false for a missing system', () => {
    expect(designSystemNeedsRepoConnect(null, ['DESIGN.md'])).toBe(false);
    expect(designSystemNeedsRepoConnect(undefined, ['DESIGN.md'])).toBe(false);
  });

  it('returns false for systems without GitHub repos', () => {
    expect(designSystemNeedsRepoConnect(designSystem(), ['DESIGN.md'])).toBe(false);
  });

  it('returns true while a GitHub-backed system is missing evidence', () => {
    expect(designSystemNeedsRepoConnect(githubBacked, ['context/github/acme-product.md'])).toBe(true);
  });

  it('returns false once evidence is fully captured', () => {
    expect(
      designSystemNeedsRepoConnect(githubBacked, [
        'context/github/acme-product.md',
        'context/github/acme-product/files/App.tsx',
      ]),
    ).toBe(false);
  });
});

describe('repoConnectCopy', () => {
  it('asks the user to connect when GitHub is not connected', () => {
    const copy = repoConnectCopy(false);
    expect(copy.buttonLabel).toBe('Connect GitHub');
    expect(copy.bannerTitle).toBe('Connect your repo to pull aspects of your design system');
    expect(copy.cardTitle).toBe('Connect your repo');
  });

  it('switches to re-import guidance when GitHub is already connected', () => {
    const copy = repoConnectCopy(true);
    expect(copy.buttonLabel).toBe('Import repo');
    expect(copy.bannerTitle).toBe('GitHub is connected');
    expect(copy.cardTitle).toBe('GitHub is connected');
    expect(copy.bannerBody).toContain('Re-import');
    expect(copy.cardBody).toContain('Re-import');
  });

  it('shows a neutral pending label while the status is still loading', () => {
    const copy = repoConnectCopy(undefined);
    expect(copy.buttonLabel).toBe('Checking GitHub...');
    expect(copy.bannerBody).toContain('Checking');
    expect(copy.cardBody).toContain('Checking');
    // Never advertise connect or import before the status is known.
    expect(copy.buttonLabel).not.toBe('Connect GitHub');
    expect(copy.buttonLabel).not.toBe('Import repo');
  });
});

describe('buildRepoImportPrompt', () => {
  it('runs the bounded intake from the linked repo URLs', () => {
    const prompt = buildRepoImportPrompt(githubBacked, ['DESIGN.md']);
    expect(prompt).toContain('github-design-context');
    expect(prompt).toContain('context/github/');
    expect(prompt).toContain('https://github.com/acme/product');
  });

  it('does not require source-context.md when the manifest is absent', () => {
    const prompt = buildRepoImportPrompt(githubBacked, ['DESIGN.md']);
    expect(prompt).not.toContain('context/source-context.md');
  });

  it('points at source-context.md only once the manifest exists', () => {
    const prompt = buildRepoImportPrompt(githubBacked, ['DESIGN.md', 'context/source-context.md']);
    expect(prompt).toContain('context/source-context.md');
  });
});
