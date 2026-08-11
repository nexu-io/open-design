import { describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { workspaceEventsUrl } from '../src/collab/workspace-events';

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: 'team-a',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
  };
}

describe('workspace invalidation EventSource scope', () => {
  it('encodes the exact workspace/member pair into the browser-owned URL', () => {
    const url = workspaceEventsUrl(teamContext());
    if (!url) throw new Error('expected a scoped workspace events URL');
    const parsed = new URL(url, 'https://od.local');
    expect(parsed.pathname).toBe('/api/workspace/events');
    expect(parsed.searchParams.get('workspaceId')).toBe('workspace-a');
    expect(parsed.searchParams.get('workspaceMemberId')).toBe('member-a');
  });

  it('does not create a headerless workspace stream without a resolved identity', () => {
    expect(workspaceEventsUrl(null)).toBeNull();
  });
});
