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
});
