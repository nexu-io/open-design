import { buildWorkspacePermissions, type WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_PROJECT_DISPLAY_SNAPSHOTS,
  markProjectDisplaySnapshotsDirty,
  patchProjectDisplaySnapshots,
  projectDisplaySnapshotCount,
  projectDisplaySnapshotKey,
  readProjectDisplaySnapshot,
  removeProjectFromDisplaySnapshots,
  resetProjectDisplaySnapshots,
  writeProjectDisplaySnapshot,
} from '../../src/state/project-display-cache';
import type { Project } from '../../src/types';

function context(memberId: string): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: memberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    },
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
    displayName: 'Workspace A',
  };
}

function project(id: string): Project {
  return {
    id,
    name: id,
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('project display snapshots', () => {
  afterEach(() => resetProjectDisplaySnapshots());

  it('partitions snapshots by account, complete workspace identity, and view', () => {
    const memberA = context('member-a');
    const memberB = context('member-b');
    const keys = new Set([
      projectDisplaySnapshotKey({ accountGeneration: 1, context: memberA, view: 'drafts' }),
      projectDisplaySnapshotKey({ accountGeneration: 2, context: memberA, view: 'drafts' }),
      projectDisplaySnapshotKey({ accountGeneration: 1, context: memberB, view: 'drafts' }),
      projectDisplaySnapshotKey({ accountGeneration: 1, context: memberA, view: 'all' }),
    ]);

    expect(keys.size).toBe(4);
  });

  it('marks only the exact principal dirty while retaining its last-good value', () => {
    const memberA = context('member-a');
    const memberB = context('member-b');
    const scopeA = { accountGeneration: 1, context: memberA, view: 'drafts' as const };
    const scopeB = { accountGeneration: 1, context: memberB, view: 'drafts' as const };
    writeProjectDisplaySnapshot(scopeA, [project('project-a')]);
    writeProjectDisplaySnapshot(scopeB, [project('project-b')]);

    markProjectDisplaySnapshotsDirty({ context: memberA, accountGeneration: 1 });

    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(scopeA))).toMatchObject({
      projects: [{ id: 'project-a' }],
      dirty: true,
    });
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(scopeB))).toMatchObject({
      projects: [{ id: 'project-b' }],
      dirty: false,
    });
  });

  it('patches and removes a project across exact-principal views only', () => {
    const memberA = context('member-a');
    const memberB = context('member-b');
    const draftsA = { accountGeneration: 1, context: memberA, view: 'drafts' as const };
    const allA = { accountGeneration: 1, context: memberA, view: 'all' as const };
    const draftsB = { accountGeneration: 1, context: memberB, view: 'drafts' as const };
    writeProjectDisplaySnapshot(draftsA, [project('shared')]);
    writeProjectDisplaySnapshot(allA, [project('shared')]);
    writeProjectDisplaySnapshot(draftsB, [project('shared')]);

    patchProjectDisplaySnapshots({
      context: memberA,
      accountGeneration: 1,
      patch: (projects) => projects.map((item) =>
        item.id === 'shared' ? { ...item, name: 'renamed' } : item),
    });
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(draftsA)))
      .toMatchObject({ projects: [{ name: 'renamed' }], dirty: true });
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(allA)))
      .toMatchObject({ projects: [{ name: 'renamed' }], dirty: true });
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(draftsB)))
      .toMatchObject({ projects: [{ name: 'shared' }], dirty: false });

    removeProjectFromDisplaySnapshots({
      context: memberA,
      accountGeneration: 1,
      projectId: 'shared',
    });
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(draftsA))?.projects).toEqual([]);
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(allA))?.projects).toEqual([]);
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(draftsB))?.projects)
      .toMatchObject([{ id: 'shared' }]);
  });

  it('bounds snapshots with LRU eviction', () => {
    const memberA = context('member-a');
    const firstScope = { accountGeneration: 0, context: memberA, view: 'recent' as const };
    writeProjectDisplaySnapshot(firstScope, [project('project-first')]);
    for (let generation = 1; generation < MAX_PROJECT_DISPLAY_SNAPSHOTS; generation += 1) {
      writeProjectDisplaySnapshot({
        accountGeneration: generation,
        context: memberA,
        view: 'recent',
      }, [project(`project-${generation}`)]);
    }
    // Touch the first entry so generation 1 becomes the least recently used.
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(firstScope))).not.toBeNull();
    writeProjectDisplaySnapshot({
      accountGeneration: MAX_PROJECT_DISPLAY_SNAPSHOTS,
      context: memberA,
      view: 'recent',
    }, [project('project-overflow')]);

    expect(projectDisplaySnapshotCount()).toBe(MAX_PROJECT_DISPLAY_SNAPSHOTS);
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey(firstScope))).not.toBeNull();
    expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey({
      accountGeneration: 1,
      context: memberA,
      view: 'recent',
    }))).toBeNull();
  });
});
