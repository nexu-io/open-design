import { afterEach, describe, expect, it, vi } from 'vitest';

import { patchProject } from '../../src/state/projects';

describe('project persistence helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes pendingPrompt null so the daemon can clear it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          id: 'project-1',
          name: 'Project',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await patchProject('project-1', { pendingPrompt: null });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      pendingPrompt: null,
    });
  });
});
