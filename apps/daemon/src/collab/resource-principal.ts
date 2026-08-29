import {
  workspaceContextHasTeamIdentity,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

/**
 * Workspace identity used to scope collaboration state. Authentication is
 * owned by the Vela login session; these fields are routing context only.
 */
export interface ResourceHubPrincipal {
  memberId: string;
  /** Workspace-scoped resource id. Historically named teamId by the Vela CLI. */
  teamId: string;
  role: WorkspaceCollabContext['role'];
  lifecycleState: WorkspaceCollabContext['lifecycleState'];
  workspaceType?: WorkspaceCollabContext['workspaceType'];
}

/** Derive resource scope from the one login-backed workspace context. */
export function contextToResourceHubPrincipal(
  context: WorkspaceCollabContext | null,
): ResourceHubPrincipal | null {
  if (!context || !workspaceContextHasTeamIdentity(context)) return null;
  return {
    memberId: context.workspaceMemberId,
    teamId: context.teamId ?? context.workspaceId,
    role: context.role,
    lifecycleState: context.lifecycleState,
    workspaceType: context.workspaceType,
  };
}
