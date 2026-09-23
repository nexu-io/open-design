import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { ProjectPublicFilePublicationStore } from './public-file-publication-store.js';
import type { LocalProjectCommentWorkspaceBinding } from './project-comment-workspace-context.js';

export interface CommentRelayScope {
  workspaceId: string;
  teamId: string;
  ownerMemberId: string;
  relayScope: 'team' | 'personal';
}

/**
 * The relay eligibility channel is deliberately separate from team-directory
 * identity. A personal project may relay only when its persisted creator owns
 * an active publication for the comment's exact file; no commenter identity
 * and no member-directory lookup can widen that scope.
 */
export function personalCommentRelayFilePaths(input: {
  binding: LocalProjectCommentWorkspaceBinding | undefined;
  context: WorkspaceCollabContext | null;
  projectId: string;
  publications: ProjectPublicFilePublicationStore;
}): ReadonlySet<string> {
  const { binding, context } = input;
  const workspaceId = binding?.workspaceId?.trim() ?? '';
  const ownerMemberId = binding?.createdByWorkspaceMemberId?.trim() ?? '';
  if (
    !context
    || !workspaceId
    || !ownerMemberId
    || binding?.resourceState === 'deleted'
    || binding?.visibility !== 'personal'
    || context.workspaceType !== 'personal'
    || context.workspaceId !== workspaceId
    || context.workspaceMemberId !== ownerMemberId
    || context.memberStatus !== 'active'
    || context.lifecycleState === 'deleted'
  ) return new Set();
  return new Set(input.publications.listByProject({
    resourceTeamId: workspaceId,
    ownerMemberId,
    projectId: input.projectId,
  }).map((publication) => publication.filePath));
}

export function commentRelayScope(input: {
  binding: LocalProjectCommentWorkspaceBinding | undefined;
  context: WorkspaceCollabContext | null;
  projectId: string;
  filePath: string;
  publications: ProjectPublicFilePublicationStore;
}): CommentRelayScope | null {
  const { binding, context } = input;
  const workspaceId = binding?.workspaceId?.trim() ?? '';
  const ownerMemberId = binding?.createdByWorkspaceMemberId?.trim() ?? '';
  const memberId = context?.workspaceMemberId?.trim() ?? '';
  if (!context || !workspaceId || !memberId || binding?.resourceState === 'deleted') return null;
  if (context.workspaceId !== workspaceId || context.memberStatus !== 'active' || context.lifecycleState === 'deleted') return null;
  if (binding?.visibility === 'team' && context.workspaceType === 'team') {
    // Pulled team mirrors have no persisted creator: the authenticated member
    // is the relay principal, while creator identity is personal-only.
    return { workspaceId, teamId: context.teamId?.trim() || workspaceId, ownerMemberId: memberId, relayScope: 'team' };
  }
  if (!ownerMemberId || !personalCommentRelayFilePaths(input).has(input.filePath)) return null;
  return { workspaceId, teamId: workspaceId, ownerMemberId, relayScope: 'personal' };
}
