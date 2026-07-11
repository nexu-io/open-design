import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createResourceHubPublishAdapter } from '../src/collab/resource-hub-publish-adapter.js';
import { ResourceHubError, type ResourceHubPrincipal } from '../src/integrations/resource-hub.js';

const principal: ResourceHubPrincipal = {
  memberId: 'member-1',
  teamId: 'team-1',
  role: 'member',
  lifecycleState: 'active',
};

function adapterWithGetRef(getRef: ReturnType<typeof vi.fn>) {
  return createResourceHubPublishAdapter({
    client: {
      getRef,
      listVersions: vi.fn(),
    } as any,
    getPrincipal: () => principal,
    resolveProjectDir: () => '/project',
  });
}

describe('createResourceHubPublishAdapter', () => {
  it('treats a missing published ref as no remote version', async () => {
    const adapter = adapterWithGetRef(vi.fn(async () => {
      throw new ResourceHubError(404, 'not_found');
    }));

    await expect(adapter.syncLatest!({ projectId: 'p1' })).resolves.toBeNull();
  });

  it('surfaces non-404 published ref failures', async () => {
    const failure = new ResourceHubError(503, 'resource_hub_unavailable');
    const adapter = adapterWithGetRef(vi.fn(async () => {
      throw failure;
    }));

    await expect(adapter.syncLatest!({ projectId: 'p1' })).rejects.toBe(failure);
  });

  it('does not recreate an existing resource when publishing metadata', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'resource-hub-republish-'));
    writeFileSync(path.join(dir, 'index.html'), '<h1>hello</h1>');
    const createResource = vi.fn();
    const publishVersion = vi.fn(async (_principal, _resourceId, input) => ({
      id: 'version-1',
      resourceId: 'res-1',
      version: 2,
      manifestDigest: input.manifestDigest,
      createdByMemberId: principal.memberId,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));
    const adapter = createResourceHubPublishAdapter({
      client: {
        getResource: vi.fn(async () => ({
          id: 'res-1',
          teamId: principal.teamId,
          kind: 'project',
          ownerMemberId: principal.memberId,
          createdAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        })),
        createResource,
        findMissingBlobs: vi.fn(async (_principal, digests: string[]) => digests),
        pushBlob: vi.fn(async () => undefined),
        publishVersion,
      } as any,
      getPrincipal: () => principal,
      resolveProjectDir: () => dir,
      describeProject: () => ({ name: 'Shared Project' }),
    });

    await expect(adapter.publish({ projectId: 'p1', reason: 'change' })).resolves.toEqual({ version: 2 });
    expect(createResource).not.toHaveBeenCalled();
    expect(publishVersion).toHaveBeenCalledTimes(1);
  });

  it('replaces the pulled mirror so files deleted upstream disappear', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'resource-hub-pull-'));
    const pullDir = path.join(parent, 'p1');
    mkdirSync(pullDir);
    writeFileSync(path.join(pullDir, 'stale.txt'), 'old');
    const bytes = Buffer.from('<h1>current</h1>');
    const digest = `sha256:${'a'.repeat(64)}`;
    const adapter = createResourceHubPublishAdapter({
      client: {
        getRef: vi.fn(async () => ({ resourceId: 'project-p1', ref: 'published', versionId: 'v1' })),
        listVersions: vi.fn(async () => [{
          id: 'v1',
          resourceId: 'project-p1',
          version: 1,
          manifestDigest: 'manifest-1',
          createdByMemberId: principal.memberId,
          createdAt: '2026-01-01T00:00:00.000Z',
        }]),
        getManifest: vi.fn(async () => ({
          digest: 'manifest-1',
          entries: [{ path: 'index.html', type: 'file', blobDigest: digest }],
        })),
        pullBlob: vi.fn(async () => bytes),
      } as any,
      getPrincipal: () => principal,
      resolveProjectDir: () => '/project',
      resolvePullDir: () => pullDir,
    });

    await expect(adapter.pull!({ projectId: 'p1' })).resolves.toBeUndefined();

    expect(existsSync(path.join(pullDir, 'stale.txt'))).toBe(false);
    expect(readFileSync(path.join(pullDir, 'index.html'), 'utf8')).toBe('<h1>current</h1>');
  });
});
