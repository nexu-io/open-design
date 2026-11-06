import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchTeamProjectsCatalog } from '../src/collab/team-projects-catalog';
import { resetCoalescedGet } from '../src/lib/coalesced-get';
import { workspaceContextFixture } from './helpers/workspace-context';

const CONTEXT_A = workspaceContextFixture({
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a',
});
const CONTEXT_B = workspaceContextFixture({
  workspaceId: 'workspace-b',
  workspaceMemberId: 'member-b',
});
const CONTEXT_A_OTHER_MEMBER = workspaceContextFixture({
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a-2',
});

describe('team project catalog request scope', () => {
  beforeEach(() => {
    resetCoalescedGet();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const workspaceId = headers.get('x-od-workspace-id');
        const memberId = headers.get('x-od-workspace-member-id');
        return new Response(JSON.stringify({
          projects: [{
            projectId: `project-${workspaceId}`,
            ownerMemberId: memberId,
            name: workspaceId,
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCoalescedGet();
  });

  it('sends each caller identity and partitions the cache by that full identity', async () => {
    const [projectsA, projectsB, projectsAOtherMember] = await Promise.all([
      fetchTeamProjectsCatalog({ context: CONTEXT_A }),
      fetchTeamProjectsCatalog({ context: CONTEXT_B }),
      fetchTeamProjectsCatalog({ context: CONTEXT_A_OTHER_MEMBER }),
    ]);

    expect(projectsA[0]).toMatchObject({
      projectId: 'project-workspace-a',
      ownerMemberId: 'member-a',
    });
    expect(projectsB[0]).toMatchObject({
      projectId: 'project-workspace-b',
      ownerMemberId: 'member-b',
    });
    expect(projectsAOtherMember[0]).toMatchObject({
      projectId: 'project-workspace-a',
      ownerMemberId: 'member-a-2',
    });
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);

    await fetchTeamProjectsCatalog({ context: CONTEXT_A });
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
  });
});
