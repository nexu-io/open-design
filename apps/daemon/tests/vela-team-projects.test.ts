import { describe, expect, it, vi } from 'vitest';

import {
  createVelaTeamProjectCatalogClient,
  projectResourceIdFor,
} from '../src/integrations/vela-team-projects.js';
import type { ResourceHubPrincipal } from '../src/integrations/resource-hub.js';

const principalA: ResourceHubPrincipal = {
  memberId: 'member-a',
  teamId: 'team-1',
  role: 'admin',
  lifecycleState: 'active',
};

const principalB: ResourceHubPrincipal = {
  memberId: 'member-b',
  teamId: 'team-1',
  role: 'admin',
  lifecycleState: 'active',
};

describe('team project catalog identity', () => {
  it('derives collision-safe project resource ids from the workspace principal', () => {
    expect(projectResourceIdFor('landing', principalA)).not.toBe(projectResourceIdFor('landing', principalB));
    expect(projectResourceIdFor('landing', principalA)).toMatch(/^project-[A-Za-z0-9_-]+$/);
  });

  it('keys catalog upserts by the scoped resource id while preserving the local project id', async () => {
    const resourceId = projectResourceIdFor('landing', principalA);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: resourceId,
          workspaceId: principalA.teamId,
          projectId: 'landing',
          resourceId,
          ownerMemberId: principalA.memberId,
          displayName: null,
          syncState: 'pending_upload',
          lastSyncedVersionId: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: true,
            frozen: false,
          },
        }),
      ),
    );
    const client = createVelaTeamProjectCatalogClient({
      env: { OD_RESOURCE_HUB_URL: 'https://hub.example.test' },
      fetch: fetchImpl as never,
    });

    await client.upsert({ projectId: 'landing', resourceId }, principalA);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/v1/team-projects/${encodeURIComponent(resourceId)}`);
    expect(JSON.parse(String(init.body))).toMatchObject({
      projectId: 'landing',
      resourceId,
    });
  });
});
