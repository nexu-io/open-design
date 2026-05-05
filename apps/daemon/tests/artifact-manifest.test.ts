import { describe, expect, it } from 'vitest';

import { inferLegacyManifest, validateArtifactManifestInput } from '../src/artifact-manifest.js';

function validBase() {
  return {
    kind: 'html',
    renderer: 'html',
    title: 'Test',
    exports: ['html'],
  };
}

describe('validateArtifactManifestInput', () => {
  it('rejects empty exports', () => {
    const res = validateArtifactManifestInput({ ...validBase(), exports: [] }, 'index.html');
    expect(res.ok).toBe(false);
  });

  it('rejects invalid kind and renderer and export', () => {
    expect(
      validateArtifactManifestInput(
        { ...validBase(), kind: 'evil-kind', renderer: 'html', exports: ['html'] },
        'index.html',
      ).ok,
    ).toBe(false);
    expect(
      validateArtifactManifestInput(
        { ...validBase(), kind: 'html', renderer: 'evil-renderer', exports: ['html'] },
        'index.html',
      ).ok,
    ).toBe(false);
    expect(
      validateArtifactManifestInput(
        { ...validBase(), kind: 'html', renderer: 'html', exports: ['exe'] },
        'index.html',
      ).ok,
    ).toBe(false);
  });

  it('rejects traversal in supportingFiles', () => {
    const res = validateArtifactManifestInput(
      { ...validBase(), supportingFiles: ['../secret.txt'] },
      'index.html',
    );
    expect(res.ok).toBe(false);
  });

  it('defaults status to complete when missing', () => {
    const res = validateArtifactManifestInput(validBase(), 'index.html');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value?.status).toBe('complete');
  });

  it('preserves valid status values', () => {
    const res = validateArtifactManifestInput({ ...validBase(), status: 'streaming' }, 'index.html');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value?.status).toBe('streaming');
  });
});

describe('inferLegacyManifest', () => {
  it('infers markdown manifest for .md files', () => {
    const out = inferLegacyManifest('README.md');
    expect(out?.kind).toBe('markdown-document');
    expect(out?.renderer).toBe('markdown');
    expect(out?.status).toBe('complete');
    expect(out?.exports).toEqual(['md', 'html', 'pdf', 'zip']);
  });

  it('infers svg manifest for .svg files', () => {
    const out = inferLegacyManifest('logo.svg');
    expect(out?.kind).toBe('svg');
    expect(out?.renderer).toBe('svg');
    expect(out?.status).toBe('complete');
    expect(out?.exports).toEqual(['svg', 'zip']);
  });
});
