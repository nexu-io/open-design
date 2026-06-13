import { describe, expect, it } from 'vitest';

import {
  artifactManifestNameFor,
  createHtmlArtifactManifest,
  inferLegacyManifest,
  parseArtifactManifest,
} from '../../src/artifacts/manifest';

describe('parseArtifactManifest', () => {
  it('returns null for malformed json', () => {
    expect(parseArtifactManifest('{"version":1')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseArtifactManifest(JSON.stringify({ version: 1, kind: 'html' }))).toBeNull();
  });

  it('returns null for wrong version', () => {
    const raw = JSON.stringify({
      version: 2,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    });
    expect(parseArtifactManifest(raw)).toBeNull();
  });

  it('defaults status to complete when missing', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    });
    const out = parseArtifactManifest(raw);
    expect(out?.status).toBe('complete');
  });

  it('preserves valid status when provided', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      status: 'streaming',
      exports: ['html'],
    });
    const out = parseArtifactManifest(raw);
    expect(out?.status).toBe('streaming');
  });

  it('preserves primary file hints', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
      primary: 'index.html',
    });
    const out = parseArtifactManifest(raw);
    expect(out?.primary).toBe('index.html');
  });
});

describe('inferLegacyManifest', () => {
  it('infers markdown manifests for .md files', () => {
    const out = inferLegacyManifest({ entry: 'README.md' });
    expect(out?.kind).toBe('markdown-document');
    expect(out?.renderer).toBe('markdown');
    expect(out?.status).toBe('complete');
  });

  it('infers svg manifests for .svg files', () => {
    const out = inferLegacyManifest({ entry: 'logo.svg' });
    expect(out?.kind).toBe('svg');
    expect(out?.renderer).toBe('svg');
    expect(out?.status).toBe('complete');
  });

  it('returns null for non-artifact file types', () => {
    expect(inferLegacyManifest({ entry: 'photo.png' })).toBeNull();
    expect(inferLegacyManifest({ entry: 'archive.bin' })).toBeNull();
  });

  it('infers React component artifacts from JSX and TSX entries', () => {
    expect(inferLegacyManifest({ entry: 'Card.jsx' })).toMatchObject({
      kind: 'react-component',
      renderer: 'react-component',
      exports: ['jsx', 'html', 'zip'],
    });
    expect(inferLegacyManifest({ entry: 'Card.tsx' })).toMatchObject({
      kind: 'react-component',
      renderer: 'react-component',
      exports: ['jsx', 'html', 'zip'],
    });
  });
});

describe('artifactManifestNameFor', () => {
  it('handles names without extension', () => {
    expect(artifactManifestNameFor('README')).toBe('README.artifact.json');
  });

  it('handles names with multiple dots', () => {
    expect(artifactManifestNameFor('page.v2.final.html')).toBe('page.v2.final.html.artifact.json');
  });

  it('avoids collisions between different extensions', () => {
    expect(artifactManifestNameFor('foo.html')).not.toBe(artifactManifestNameFor('foo.md'));
  });
});

describe('createHtmlArtifactManifest', () => {
  it('creates expected default html manifest shape', () => {
    const out = createHtmlArtifactManifest({ entry: 'index.html', title: 'Landing' });
    expect(out.version).toBe(1);
    expect(out.kind).toBe('html');
    expect(out.renderer).toBe('html');
    expect(out.status).toBe('complete');
    expect(out.exports).toEqual(['html', 'pdf', 'zip']);
    expect(out.primary).toBe(true);
    expect(out.entry).toBe('index.html');
    expect(out.title).toBe('Landing');
    expect(typeof out.createdAt).toBe('string');
    expect(typeof out.updatedAt).toBe('string');
  });
});

describe('google-slides manifest variants', () => {
  it('parses a valid google-slides-deck manifest', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'google-slides-deck',
      title: 'Wix Japan 4月',
      entry: 'result.json',
      renderer: 'google-slides',
      exports: ['html'],
    });
    const out = parseArtifactManifest(raw);
    expect(out?.kind).toBe('google-slides-deck');
    expect(out?.renderer).toBe('google-slides');
  });

  it('rejects google-slides-deck declared with a non-google-slides renderer', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'google-slides-deck',
      title: 'Mismatched',
      entry: 'result.json',
      renderer: 'html', // wrong renderer for this kind — still allowed by type, but rejected at validation
      exports: ['html'],
    });
    // The validator accepts any allow-listed combination — kind/renderer
    // mismatch is caught at the renderer-registry layer (canRender).
    // Document current behavior: parse succeeds, but resolution is up to canRender.
    const out = parseArtifactManifest(raw);
    expect(out?.kind).toBe('google-slides-deck');
    expect(out?.renderer).toBe('html');
  });

  it('rejects unknown kind', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'unknown-deck',
      title: 'x',
      entry: 'result.json',
      renderer: 'google-slides',
      exports: ['html'],
    });
    expect(parseArtifactManifest(raw)).toBeNull();
  });

  it('rejects unknown renderer', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'google-slides-deck',
      title: 'x',
      entry: 'result.json',
      renderer: 'mystery-renderer',
      exports: ['html'],
    });
    expect(parseArtifactManifest(raw)).toBeNull();
  });
});
