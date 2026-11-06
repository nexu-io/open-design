import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ArtifactPublicationBlockedError,
  findUnresolvedArtifactPlaceholders,
  isPublicationGuardedArtifactKind,
  shouldBlockArtifactPublication,
} from '../../src/artifacts/publication-guard.js';
import { listFiles, writeProjectFile } from '../../src/projects.js';

const deckManifest = {
  kind: 'deck',
  renderer: 'deck-html',
  title: 'Pitch deck',
  exports: ['html', 'pdf'],
  metadata: { identifier: 'pitch-deck' },
};

const htmlManifest = {
  kind: 'html',
  renderer: 'html',
  title: 'Pitch HTML',
  exports: ['html'],
  metadata: { identifier: 'pitch-html' },
};

const markdownManifest = {
  kind: 'markdown',
  renderer: 'markdown',
  title: 'Notes',
  exports: ['md'],
  metadata: { identifier: 'pitch-notes' },
};

describe('artifact publication guard — placeholder detection', () => {
  it('finds every shipped placeholder when present in generated HTML', () => {
    const html = `
      <!doctype html>
      <html>
        <body>
          <section>Name to confirm</section>
          <section>$X.XM</section>
          <section>Replace this panel with actual pipeline once known.</section>
          <section>Replace role placeholders with leadership names.</section>
          <section>Your form answer only said "seed deck".</section>
        </body>
      </html>
    `;

    expect(findUnresolvedArtifactPlaceholders(html)).toEqual([
      'Name to confirm',
      '$X.XM',
      'Replace this panel with',
      'Replace role placeholders',
      'Your form answer only said',
    ]);
    expect(shouldBlockArtifactPublication(html)).toBe(true);
  });

  it('passes pitch-deck content that already carries concrete ask and traction copy', () => {
    const html = `
      <!doctype html>
      <html>
        <body>
          <section>Acme AI turns support transcripts into shipped product fixes.</section>
          <section>$4.5M seed round</section>
          <section>42% MoM revenue growth, 18 enterprise pilots, 91% retention.</section>
          <section>Use of funds: engineering, GTM, compliance, and customer success.</section>
        </body>
      </html>
    `;

    expect(findUnresolvedArtifactPlaceholders(html)).toEqual([]);
    expect(shouldBlockArtifactPublication(html)).toBe(false);
  });

  it('reads Buffer and Uint8Array bodies, returning [] for non-text inputs', () => {
    const placeholderBuffer = Buffer.from('<html>Name to confirm</html>', 'utf8');
    expect(findUnresolvedArtifactPlaceholders(placeholderBuffer)).toEqual(['Name to confirm']);

    const placeholderBytes = new Uint8Array(Buffer.from('<html>$X.XM</html>', 'utf8'));
    expect(findUnresolvedArtifactPlaceholders(placeholderBytes)).toEqual(['$X.XM']);

    expect(findUnresolvedArtifactPlaceholders(null)).toEqual([]);
    expect(findUnresolvedArtifactPlaceholders(undefined)).toEqual([]);
    expect(findUnresolvedArtifactPlaceholders({ unknown: true })).toEqual([]);
  });

  it('only guards html and deck artifact kinds, not markdown / code / etc.', () => {
    expect(isPublicationGuardedArtifactKind('html')).toBe(true);
    expect(isPublicationGuardedArtifactKind('deck')).toBe(true);
    expect(isPublicationGuardedArtifactKind('markdown')).toBe(false);
    expect(isPublicationGuardedArtifactKind('code-snippet')).toBe(false);
    expect(isPublicationGuardedArtifactKind('sketch')).toBe(false);
    expect(isPublicationGuardedArtifactKind(undefined)).toBe(false);
    expect(isPublicationGuardedArtifactKind(null)).toBe(false);
  });
});

describe('artifact publication guard — wired into writeProjectFile', () => {
  it('rejects html artifacts that still contain pitch-deck placeholders', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-publication-guard-html-'));
    try {
      await expect(
        writeProjectFile(
          projectsRoot,
          'project-1',
          'pitch-deck.html',
          Buffer.from('<html><body><section>Name to confirm</section><section>$X.XM</section></body></html>'),
          { artifactManifest: htmlManifest } as unknown as Parameters<typeof writeProjectFile>[4],
        ),
      ).rejects.toBeInstanceOf(ArtifactPublicationBlockedError);

      const files = await listFiles(projectsRoot, 'project-1');
      expect(files.map((file) => file.name)).not.toContain('pitch-deck.html');
      expect(files.map((file) => file.name)).not.toContain('pitch-deck.html.artifact.json');
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('rejects deck artifacts that still contain pitch-deck placeholders', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-publication-guard-deck-'));
    try {
      await expect(
        writeProjectFile(
          projectsRoot,
          'project-1',
          'pitch-deck.html',
          Buffer.from('<html><body>Replace this panel with the real chart.</body></html>'),
          { artifactManifest: deckManifest } as unknown as Parameters<typeof writeProjectFile>[4],
        ),
      ).rejects.toMatchObject({
        code: 'ARTIFACT_PUBLICATION_BLOCKED',
        placeholders: ['Replace this panel with'],
      });

      const files = await listFiles(projectsRoot, 'project-1');
      expect(files.map((file) => file.name)).not.toContain('pitch-deck.html');
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('lets non-guarded artifact kinds pass even when their body contains placeholder substrings', async () => {
    // Markdown drafts can legitimately call out unresolved fields with the
    // same words; the guard is HTML/deck only. The body here would have
    // tripped the guard if applied to all kinds.
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-publication-guard-md-'));
    try {
      const meta = await writeProjectFile(
        projectsRoot,
        'project-1',
        'critique.md',
        Buffer.from('# Critique\n\n- Name to confirm\n- $X.XM\n'),
        { artifactManifest: markdownManifest } as unknown as Parameters<typeof writeProjectFile>[4],
      );
      expect(meta).toMatchObject({ name: 'critique.md' });
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('passes a clean deck artifact through writeProjectFile', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-publication-guard-clean-'));
    try {
      const meta = await writeProjectFile(
        projectsRoot,
        'project-1',
        'final-deck.html',
        Buffer.from(
          '<html><body><section>Acme AI · $4.5M seed</section><section>42% MoM growth · 18 enterprise pilots</section></body></html>',
        ),
        { artifactManifest: deckManifest } as unknown as Parameters<typeof writeProjectFile>[4],
      );
      expect(meta).toMatchObject({ name: 'final-deck.html' });

      const files = await listFiles(projectsRoot, 'project-1');
      expect(files.map((file) => file.name)).toContain('final-deck.html');
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });
});
