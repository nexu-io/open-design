import { describe, expect, it, vi } from 'vitest';

import { createVelaResourcePullBatcher } from '../src/collab/vela-cli-resource-pull-batcher.js';

const request = (
  resourceId: string,
  workspaceId = 'workspace-1',
  kind: 'design_system' | 'plugin' | 'skill' = 'plugin',
) => ({
  workspaceId,
  kind,
  resourceId,
  dir: `/staging/${workspaceId}/${resourceId}`,
  ref: 'published',
});

describe('Vela resource pull batcher', () => {
  it('coalesces mixed resource kinds for one workspace into one command', async () => {
    const run = vi.fn(async (requests, _workspaceId: string) =>
      JSON.stringify({
        results: requests.map(({ key }: { key: string }) => ({ key, ok: true })),
        succeeded: requests.length,
        failed: 0,
      }),
    );
    const batcher = createVelaResourcePullBatcher(run);

    await Promise.all([
      batcher.pull(request('plugin-1')),
      batcher.pull(request('skill-1', 'workspace-1', 'skill')),
      batcher.pull(request('design-1', 'workspace-1', 'design_system')),
    ]);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[1]).toBe('workspace-1');
    expect(run.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ kind: 'plugin', resourceId: 'plugin-1' }),
      expect.objectContaining({ kind: 'skill', resourceId: 'skill-1' }),
      expect.objectContaining({ kind: 'design_system', resourceId: 'design-1' }),
    ]);
  });

  it('never combines requests from different workspace identities', async () => {
    const run = vi.fn(async (requests, _workspaceId: string) =>
      JSON.stringify({
        results: requests.map(({ key }: { key: string }) => ({ key, ok: true })),
      }),
    );
    const batcher = createVelaResourcePullBatcher(run);

    await Promise.all([
      batcher.pull(request('plugin-1', 'workspace-1')),
      batcher.pull(request('plugin-2', 'workspace-2')),
    ]);

    expect(run).toHaveBeenCalledTimes(2);
    expect(new Set(run.mock.calls.map((call) => call[1]))).toEqual(
      new Set(['workspace-1', 'workspace-2']),
    );
  });

  it('isolates a failed item without rejecting successful siblings', async () => {
    const run = vi.fn(async (requests, _workspaceId: string) =>
      JSON.stringify({
        results: requests.map(({ key, resourceId }: { key: string; resourceId: string }) =>
          resourceId === 'missing'
            ? { key, ok: false, error: 'resource missing', errorCode: 'resource_not_found' }
            : { key, ok: true },
        ),
      }),
    );
    const batcher = createVelaResourcePullBatcher(run);

    const results = await Promise.allSettled([
      batcher.pull(request('present')),
      batcher.pull(request('missing')),
    ]);

    expect(results[0]).toEqual({ status: 'fulfilled', value: undefined });
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({
        message: 'resource missing (resource_not_found)',
      }),
    });
  });

  it.each([
    ['invalid JSON', 'not-json', 'invalid JSON'],
    ['missing results', '{}', 'missing results'],
    ['omitted item', '{"results":[]}', 'omitted result'],
    [
      'duplicate item',
      '{"results":[{"key":"od-pull-1","ok":true},{"key":"od-pull-1","ok":false}]}',
      'duplicated result',
    ],
  ])('fails closed for %s', async (_case, stdout, message) => {
    const batcher = createVelaResourcePullBatcher(async () => stdout);

    await expect(batcher.pull(request('plugin-1'))).rejects.toThrow(message);
  });
});
