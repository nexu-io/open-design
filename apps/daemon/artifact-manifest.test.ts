import { describe, expect, it } from 'vitest';

import { validateArtifactManifestInput } from './artifact-manifest.js';

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
});
