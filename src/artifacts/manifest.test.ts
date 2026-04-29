import { describe, expect, it } from 'vitest';

import {
  artifactManifestNameFor,
  createHtmlArtifactManifest,
  inferLegacyManifest,
  parseArtifactManifest,
} from './manifest';

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
});

describe('inferLegacyManifest', () => {
  it('returns null for non-artifact file types', () => {
    expect(inferLegacyManifest({ entry: 'photo.png' })).toBeNull();
    expect(inferLegacyManifest({ entry: 'archive.bin' })).toBeNull();
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
    expect(out.exports).toEqual(['html', 'pdf', 'zip']);
    expect(out.entry).toBe('index.html');
    expect(out.title).toBe('Landing');
    expect(typeof out.createdAt).toBe('string');
    expect(typeof out.updatedAt).toBe('string');
  });
});
