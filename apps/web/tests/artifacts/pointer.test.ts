import { describe, expect, it } from 'vitest';

import { resolveHtmlPointerArtifactTarget } from '../../src/artifacts/pointer';

describe('resolveHtmlPointerArtifactTarget', () => {
  it('resolves a short Chinese pointer artifact to an existing HTML file', () => {
    const result = resolveHtmlPointerArtifactTarget({
      content: '见 worker-edition-v2.html',
      candidateFileName: 'worker-edition-v2-3.html',
      projectFiles: [
        { name: 'worker-edition-v2.html' },
        { name: 'worker-edition-v2-3.html' },
      ],
    });

    expect(result).toBe('worker-edition-v2.html');
  });

  it('resolves a minimal HTML wrapper whose visible body only points elsewhere', () => {
    const result = resolveHtmlPointerArtifactTarget({
      content:
        '<!doctype html><html><body>见 <a href="worker-edition-v2.html">worker-edition-v2.html</a></body></html>',
      candidateFileName: 'worker-edition-v2-3.html',
      projectFiles: [{ name: 'worker-edition-v2.html' }],
    });

    expect(result).toBe('worker-edition-v2.html');
  });

  it('returns null when the pointer target is not an existing project HTML file', () => {
    const result = resolveHtmlPointerArtifactTarget({
      content: '见 worker-edition-v2.html',
      candidateFileName: 'worker-edition-v2-3.html',
      projectFiles: [{ name: 'summary.html' }],
    });

    expect(result).toBeNull();
  });

  it('returns null when a basename pointer would match multiple nested files', () => {
    const result = resolveHtmlPointerArtifactTarget({
      content: 'see index.html',
      candidateFileName: 'index-2.html',
      projectFiles: [
        { name: 'desktop/index.html' },
        { name: 'mobile/index.html' },
      ],
    });

    expect(result).toBeNull();
  });

  it('does not treat real prose that mentions an HTML file as a pointer artifact', () => {
    const result = resolveHtmlPointerArtifactTarget({
      content: 'I updated worker-edition-v2.html with the final responsive layout and accessibility fixes.',
      candidateFileName: 'worker-edition-v2-3.html',
      projectFiles: [{ name: 'worker-edition-v2.html' }],
    });

    expect(result).toBeNull();
  });
});
