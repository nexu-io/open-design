import { describe, expect, it } from 'vitest';

import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';
import {
  projectResourceIdFor,
  projectSyncStateToVela,
  velaProjectSyncStateToProject,
} from '../src/integrations/vela-team-projects.js';

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
    expect(projectResourceIdFor('landing', principalA)).not.toBe(
      projectResourceIdFor('landing', principalB),
    );
    expect(projectResourceIdFor('landing', principalA)).toMatch(
      /^project-[A-Za-z0-9_-]+$/,
    );
  });

  it('maps local and Vela sync states without an HTTP client', () => {
    expect(projectSyncStateToVela('sync_failed')).toBe('failed');
    expect(velaProjectSyncStateToProject('synced')).toBe('synced');
    expect(velaProjectSyncStateToProject('syncing')).toBe('pending_upload');
  });
});
