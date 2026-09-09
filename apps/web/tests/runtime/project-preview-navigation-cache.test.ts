import { describe, expect, it, vi } from 'vitest';
import type { ProjectScopedPreviewNavigation } from '../../src/providers/registry';
import {
  ProjectPreviewNavigationCache,
  type ProjectPreviewNavigationRequest,
} from '../../src/runtime/project-preview-navigation-cache';

const request: ProjectPreviewNavigationRequest = {
  projectId: 'project-1',
  fileName: 'pages/index.html',
  revisionKey: '10:20',
  authorizationKey: 'local',
};

function navigation(sessionId: string, expiresAt: number): ProjectScopedPreviewNavigation {
  return {
    sessionId,
    normalUrl: `http://n-${sessionId}.localhost:17456/pages/index.html`,
    poweredUrl: `http://p-${sessionId}.localhost:17456/pages/index.html`,
    documentVersion: '10:20',
    runtimeProtocol: 'universal',
    renewalScope: {
      href: `http://host/api/projects/project-1/preview/${sessionId}/pages/`,
      expiresAt,
    },
  };
}

describe('ProjectPreviewNavigationCache', () => {
  it('deduplicates concurrent minting and reuses the exact scoped session', async () => {
    const minted = navigation('scope-0001', 20_000);
    let resolveMint: (value: ProjectScopedPreviewNavigation) => void = () => {};
    const mint = vi.fn(() => new Promise<ProjectScopedPreviewNavigation>((resolve) => {
      resolveMint = resolve;
    }));
    const cache = new ProjectPreviewNavigationCache({
      now: () => 1_000,
      refreshAheadMs: 1_000,
      mint,
      renew: vi.fn(),
    });

    const first = cache.get(request);
    const second = cache.get(request);
    expect(mint).toHaveBeenCalledTimes(1);
    resolveMint(minted);
    await expect(Promise.all([first, second])).resolves.toEqual([minted, minted]);
    await expect(cache.get(request)).resolves.toBe(minted);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('renews the same session in place before minting a replacement', async () => {
    let now = 1_000;
    const first = navigation('scope-0001', 5_000);
    const mint = vi.fn(async () => first);
    const renew = vi.fn(async () => 20_000);
    const cache = new ProjectPreviewNavigationCache({
      now: () => now,
      refreshAheadMs: 1_000,
      mint,
      renew,
    });

    await expect(cache.get(request)).resolves.toBe(first);
    now = 4_500;
    const renewed = await cache.get(request);
    expect(renew).toHaveBeenCalledWith('project-1', first.renewalScope.href);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(renewed).toMatchObject({
      sessionId: 'scope-0001',
      renewalScope: { expiresAt: 20_000 },
    });
  });

  it('mints a new standby identity only after renewal fails', async () => {
    let now = 1_000;
    const first = navigation('scope-0001', 5_000);
    const replacement = navigation('scope-0002', 30_000);
    const mint = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(replacement);
    const cache = new ProjectPreviewNavigationCache({
      now: () => now,
      refreshAheadMs: 1_000,
      mint,
      renew: vi.fn(async () => null),
    });

    await cache.get(request);
    now = 4_500;
    await expect(cache.get(request)).resolves.toBe(replacement);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('separates content and authorization revisions and evicts oldest settled entries', async () => {
    const mint = vi.fn(async (_projectId: string, fileName: string) => (
      navigation(`scope-${fileName.replace(/\W/gu, '')}`, 20_000)
    ));
    const cache = new ProjectPreviewNavigationCache({
      now: () => 1_000,
      maxEntries: 1,
      refreshAheadMs: 1_000,
      mint,
      renew: vi.fn(),
    });

    await cache.get(request);
    await cache.get({ ...request, fileName: 'other.html' });
    await cache.get(request);
    await cache.get({ ...request, authorizationKey: 'team-member-2' });

    expect(mint).toHaveBeenCalledTimes(4);
  });

  it('does not let an in-flight request repopulate the cache after clear', async () => {
    const first = navigation('scope-0001', 20_000);
    const second = navigation('scope-0002', 20_000);
    let resolveFirst: (value: ProjectScopedPreviewNavigation) => void = () => {};
    const mint = vi.fn()
      .mockImplementationOnce(() => new Promise<ProjectScopedPreviewNavigation>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(second);
    const cache = new ProjectPreviewNavigationCache({
      now: () => 1_000,
      refreshAheadMs: 1_000,
      mint,
      renew: vi.fn(),
    });

    const staleRequest = cache.get(request);
    cache.clear();
    await expect(cache.get(request)).resolves.toBe(second);
    resolveFirst(first);
    await expect(staleRequest).resolves.toBe(first);
    await expect(cache.get(request)).resolves.toBe(second);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('does not retain a newly minted scope that is already expired', async () => {
    const expired = navigation('scope-expired', 1_000);
    const valid = navigation('scope-valid', 20_000);
    const mint = vi.fn()
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(valid);
    const cache = new ProjectPreviewNavigationCache({
      now: () => 1_000,
      refreshAheadMs: 1_000,
      mint,
      renew: vi.fn(),
    });

    await expect(cache.get(request)).resolves.toBeNull();
    await expect(cache.get(request)).resolves.toBe(valid);
    expect(mint).toHaveBeenCalledTimes(2);
  });
});
