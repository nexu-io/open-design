import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
  WorkspaceDirectoryResponse,
} from '@open-design/contracts';

/**
 * A complete `WorkspaceCollabContext` whose workspace + member identity the
 * caller chooses and whose remaining fields are valid, uninteresting defaults.
 *
 * Specs about identity-scoped read caches only care about which workspace and
 * which member a read was issued for; spelling the other ~10 contract fields
 * out per case buries that.
 */
export function workspaceContextFixture(
  overrides: Partial<WorkspaceCollabContext> &
    Pick<WorkspaceCollabContext, 'workspaceId' | 'workspaceMemberId'>,
): WorkspaceCollabContext {
  return {
    workspaceType: 'team',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_pro',
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    },
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
    ...overrides,
  };
}

export function workspaceDirectoryItemFixture(
  context: Pick<
    WorkspaceCollabContext,
    | 'workspaceId'
    | 'workspaceType'
    | 'workspaceMemberId'
    | 'role'
    | 'memberStatus'
    | 'lifecycleState'
  > & Partial<Pick<WorkspaceCollabContext, 'workspaceName' | 'teamName'>>,
): WorkspaceDirectoryItem {
  return {
    workspaceId: context.workspaceId,
    workspaceName:
      context.workspaceName?.trim()
      || context.teamName?.trim()
      || context.workspaceId,
    workspaceType: context.workspaceType,
    workspaceMemberId: context.workspaceMemberId,
    role: context.role,
    memberStatus: context.memberStatus,
    lifecycleState: context.lifecycleState,
  };
}

export function workspaceDirectoryFixture(
  contexts: Array<Parameters<typeof workspaceDirectoryItemFixture>[0]>,
): WorkspaceDirectoryResponse {
  return {
    items: contexts.map(workspaceDirectoryItemFixture),
    // Most tests do not model a saved next-start default.
    activeWorkspaceId: null,
  };
}
