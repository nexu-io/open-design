import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let links: typeof import('../../src/runtime/in-project-link');
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_OD_WEB_BASE_PATH', '/open-design');
  vi.resetModules();
  links = await import('../../src/runtime/in-project-link');
});
afterAll(() => vi.unstubAllEnvs());

describe('chat links under a configured web base path', () => {
  it('resolves a prefixed project API route to its owning project', () => {
    expect(
      links.resolveChatFileLink(
        '/open-design/api/projects/other-project/raw/deck-outline.md',
        undefined,
        'project-1',
      ),
    ).toEqual({
      kind: 'project-file',
      projectId: 'other-project',
      filePath: 'deck-outline.md',
    });
  });

  it('keeps prefixed daemon routes out of the inert filesystem-link path', () => {
    expect(links.isPathLikeChatHref('/open-design/api/projects/project-1/export/image')).toBe(false);
    expect(links.isPathLikeChatHref('/open-design/artifacts/report.html')).toBe(false);
    expect(links.isPathLikeChatHref('/open-design/frames/iphone-15-pro.html')).toBe(false);
  });
});
