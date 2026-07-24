import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/runtime/web-path', () => ({
  stripWebBasePath: (path: string) => {
    if (path === '/open-design') return '/';
    return path.startsWith('/open-design/') ? path.slice('/open-design'.length) : null;
  },
}));

import {
  isPathLikeChatHref,
  resolveChatFileLink,
} from '../../src/runtime/in-project-link';

describe('chat links under a configured web base path', () => {
  it('resolves a prefixed project API route to its owning project', () => {
    expect(
      resolveChatFileLink(
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
    expect(isPathLikeChatHref('/open-design/api/projects/project-1/export/image')).toBe(false);
    expect(isPathLikeChatHref('/open-design/artifacts/report.html')).toBe(false);
    expect(isPathLikeChatHref('/open-design/frames/iphone-15-pro.html')).toBe(false);
  });
});
