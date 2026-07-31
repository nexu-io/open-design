import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';
import type { ResourcePublishAdapter } from '../src/collab/publish-scheduler.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

describe('shared-project metadata refresh', () => {
  let runtime: CollabRuntime | null = null;

  afterEach(() => {
    runtime?.dispose();
    runtime = null;
  });

  it('re-upserts an owner rename for every remembered Team share without publishing content', async () => {
    let projectName = 'Before rename';
    const publish = vi.fn();
    const upsert = vi.fn(async () => {});
    const adapter: ResourcePublishAdapter = {
      publish,
    };
    const principal: ResourceHubPrincipal = {
      memberId: 'owner-member',
      teamId: 'team-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    runtime = createCollabRuntime({
      adapter,
      describeProject: () => ({ name: projectName }),
      teamProjectCatalog: {
        upsert,
        remove: vi.fn(async () => {}),
      },
    });
    runtime.rememberTeamShare('shared-project', principal, 'synced');

    projectName = 'Owner renamed project';
    runtime.refreshTeamProjectMetadata('shared-project');

    await vi.waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'shared-project',
          displayName: 'Owner renamed project',
          metadata: expect.objectContaining({ name: 'Owner renamed project' }),
          syncState: 'synced',
        }),
        principal,
      );
    });
    expect(publish).not.toHaveBeenCalled();
  });
});
