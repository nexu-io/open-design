import { describe, expect, it, vi } from 'vitest';

import { resolveProjectShareDir } from '../src/collab/project-share-dir.js';

describe('resolveProjectShareDir', () => {
  it('passes project metadata through when resolving a team-share source directory', () => {
    const metadata = { kind: 'prototype', baseDir: '/external/project-root' };
    const resolveProjectDir = vi.fn(() => '/external/project-root');

    const dir = resolveProjectShareDir(
      '/managed/projects',
      'project-imported',
      { id: 'project-imported', metadata },
      resolveProjectDir,
    );

    expect(dir).toBe('/external/project-root');
    expect(resolveProjectDir).toHaveBeenCalledWith('/managed/projects', 'project-imported', metadata);
  });

  it('fails when the project row is missing', () => {
    expect(() =>
      resolveProjectShareDir('/managed/projects', 'missing-project', null, vi.fn()),
    ).toThrow('Project missing-project not found');
  });
});
