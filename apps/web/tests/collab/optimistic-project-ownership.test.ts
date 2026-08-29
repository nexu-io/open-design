import { describe, expect, it } from 'vitest';
import type {
  TeamProject,
  WorkspaceCollabContext,
  WorkspaceProjectSummary,
} from '@open-design/contracts';

import {
  forgetOptimisticProjectOwnership,
  optimisticProjectOwnershipScopeKey,
  projectOwnerMemberIdsWithOptimisticWitnesses,
  reconcileOptimisticProjectOwnership,
  recordOptimisticProjectOwnership,
} from '../../src/collab/optimistic-project-ownership';

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-a',
    workspaceType: 'team',
    workspaceMemberId: 'wm-self',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    providerMode: 'platform_credits',
    planId: 'team_basic',
    seatSummary: { seatLimit: 3, usedSeats: 2, availableSeats: 1, isSeatFull: false },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
    teamId: 'team-a',
    ...overrides,
  };
}

function movedProject(
  overrides: Partial<WorkspaceProjectSummary> = {},
): WorkspaceProjectSummary {
  return {
    id: 'project-1',
    name: 'Shared project',
    workspaceId: 'ws-a',
    visibility: 'team',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'wm-self',
    currentUserAccess: {
      canOpen: true,
      canRename: true,
      canDelete: true,
      canDuplicate: true,
      canMoveToTeam: false,
      canMoveToPersonal: true,
      canExport: true,
      canSendTo: true,
      canRestoreVersion: true,
    },
    createdAt: 1,
    updatedAt: 2,
    project: {
      id: 'project-1',
      name: 'Shared project',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 2,
    },
    ...overrides,
  };
}

function catalogProject(overrides: Partial<TeamProject> = {}): TeamProject {
  return {
    projectId: 'project-1',
    ownerMemberId: 'wm-self',
    sharedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('optimistic project ownership witness', () => {
  it('keeps an unknown pre-existing shared project ownerless and fail-closed', () => {
    const scopeKey = optimisticProjectOwnershipScopeKey(context(), 1);
    const owners = projectOwnerMemberIdsWithOptimisticWitnesses({
      scopeKey,
      teamProjects: [],
      witnesses: new Map(),
    });

    expect(owners.has('project-1')).toBe(false);
  });

  it('uses the exact successful move owner only when move-out capability was granted', () => {
    const workspace = context();
    const scopeKey = optimisticProjectOwnershipScopeKey(workspace, 1);
    const witnesses = recordOptimisticProjectOwnership(new Map(), {
      scopeKey,
      context: workspace,
      project: movedProject(),
    });

    expect(projectOwnerMemberIdsWithOptimisticWitnesses({
      scopeKey,
      teamProjects: [],
      witnesses,
    }).get('project-1')).toBe('wm-self');

    const denied = recordOptimisticProjectOwnership(new Map(), {
      scopeKey,
      context: workspace,
      project: movedProject({
        currentUserAccess: {
          ...movedProject().currentUserAccess,
          canMoveToPersonal: false,
        },
      }),
    });
    expect(projectOwnerMemberIdsWithOptimisticWitnesses({
      scopeKey,
      teamProjects: [],
      witnesses: denied,
    }).has('project-1')).toBe(false);
  });

  it('lets the catalog replace the witness and retires the optimistic proof', () => {
    const workspace = context();
    const scopeKey = optimisticProjectOwnershipScopeKey(workspace, 1);
    const witnesses = recordOptimisticProjectOwnership(new Map(), {
      scopeKey,
      context: workspace,
      project: movedProject(),
    });
    const teamProjects = [catalogProject({ ownerMemberId: 'wm-authoritative' })];

    expect(projectOwnerMemberIdsWithOptimisticWitnesses({
      scopeKey,
      teamProjects,
      witnesses,
    }).get('project-1')).toBe('wm-authoritative');
    expect(reconcileOptimisticProjectOwnership(witnesses, {
      scopeKey,
      teamProjects,
    }).has('project-1')).toBe(false);
  });

  it('does not carry a witness across Workspace or account identity changes', () => {
    const workspace = context();
    const scopeKey = optimisticProjectOwnershipScopeKey(workspace, 1);
    const witnesses = recordOptimisticProjectOwnership(new Map(), {
      scopeKey,
      context: workspace,
      project: movedProject(),
    });
    const anotherWorkspace = optimisticProjectOwnershipScopeKey(
      context({ workspaceId: 'ws-b', teamId: 'team-b' }),
      1,
    );
    const anotherAccount = optimisticProjectOwnershipScopeKey(workspace, 2);

    for (const changedScopeKey of [anotherWorkspace, anotherAccount]) {
      expect(projectOwnerMemberIdsWithOptimisticWitnesses({
        scopeKey: changedScopeKey,
        teamProjects: [],
        witnesses,
      }).has('project-1')).toBe(false);
      expect(reconcileOptimisticProjectOwnership(witnesses, {
        scopeKey: changedScopeKey,
        teamProjects: [],
      }).size).toBe(0);
    }
  });

  it('forgets the witness when the project is moved out or a later share fails', () => {
    const workspace = context();
    const scopeKey = optimisticProjectOwnershipScopeKey(workspace, 1);
    const witnesses = recordOptimisticProjectOwnership(new Map(), {
      scopeKey,
      context: workspace,
      project: movedProject(),
    });

    expect(forgetOptimisticProjectOwnership(witnesses, 'project-1').size).toBe(0);
  });
});
