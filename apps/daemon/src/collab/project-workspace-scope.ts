import type {
  ProjectVisibility,
  ProjectWorkspaceScope,
} from '@open-design/contracts';
import {
  workspaceContextFromDirectoryItem,
  type WorkspaceDirectoryFetchResult,
} from './vela-workspace-context.js';

interface ProjectWorkspaceBinding {
  workspaceId?: unknown;
  visibility?: unknown;
}

/**
 * Resolve a project's persisted workspace binding against the signed-in
 * caller's authoritative membership directory.
 *
 * Directory ordering and the daemon's ambient/active workspace are
 * intentionally irrelevant. A missing or failed exact membership lookup
 * stays `unavailable`; it must never borrow another workspace's member id.
 */
export function resolveProjectWorkspaceScope(input: {
  projectId: string;
  binding: ProjectWorkspaceBinding | null | undefined;
  directory: WorkspaceDirectoryFetchResult;
}): ProjectWorkspaceScope {
  const projectId = input.projectId.trim();
  const workspaceId =
    typeof input.binding?.workspaceId === 'string'
      ? input.binding.workspaceId.trim()
      : '';
  if (!workspaceId) {
    return {
      kind: 'unbound',
      projectId,
      workspaceId: null,
      context: null,
    };
  }

  const visibility: ProjectVisibility =
    input.binding?.visibility === 'team' ? 'team' : 'personal';
  const unavailable = (): ProjectWorkspaceScope => ({
    kind: 'unavailable',
    projectId,
    workspaceId,
    visibility,
    context: null,
  });
  if (!input.directory.ok) return unavailable();

  const item = input.directory.items.find(
    (candidate) =>
      candidate.workspaceId === workspaceId &&
      candidate.memberStatus === 'active' &&
      candidate.lifecycleState === 'active',
  );
  if (!item) return unavailable();

  const context = workspaceContextFromDirectoryItem(item);
  if (
    context.workspaceId !== workspaceId ||
    !context.workspaceMemberId ||
    context.memberStatus !== 'active'
  ) {
    return unavailable();
  }
  if (context.workspaceType === 'team') {
    return {
      kind: 'team',
      projectId,
      workspaceId,
      visibility,
      context: { ...context, workspaceType: 'team' },
    };
  }
  return {
    kind: 'personal',
    projectId,
    workspaceId,
    visibility,
    context: { ...context, workspaceType: 'personal' },
  };
}

/**
 * Resolve one project's workspace scope for a SPECIFIC caller.
 *
 * Every project resolves to a workspace, and when the project itself does not
 * name one the answer is the workspace the caller is currently acting in —
 * there is nothing else an unbound project could sensibly belong to. Answering
 * `unbound` instead makes `projectWorkspaceScopeAuthorizesAmr` false, which
 * disables the chat composer's send button for an AMR run on that project
 * permanently, with nothing the user can do to clear it.
 *
 * A project that IS bound is resolved by {@link resolveProjectWorkspaceScope}
 * alone and the caller's own workspace is irrelevant to it. That asymmetry is
 * the billing-integrity rule, not an oversight: the scope carries
 * `workspaceMemberId`, which is the wallet that pays for the project's runs, so
 * a project pinned to workspace X read by a member of Y must answer X — or
 * `unavailable` — and never Y.
 *
 * The fallback resolves THROUGH the membership directory, so the
 * `workspaceMemberId` it hands back is always B's for that workspace and never
 * the request header's. A caller can therefore only select among workspaces
 * their signed-in identity is genuinely an active member of. Anything the
 * directory cannot confirm — B unreachable, the claimed workspace not an active
 * membership, or no caller identity at all — stays `unbound`: reporting "no
 * workspace" is strictly better than inventing a billing subject.
 */
export function resolveProjectWorkspaceScopeForCaller(input: {
  projectId: string;
  binding: ProjectWorkspaceBinding | null | undefined;
  directory: WorkspaceDirectoryFetchResult;
  /** The caller's current workspace, or null when the request carries no workspace identity. */
  callerWorkspaceId: string | null | undefined;
}): ProjectWorkspaceScope {
  const bound = resolveProjectWorkspaceScope(input);
  if (bound.kind !== 'unbound') return bound;
  const callerWorkspaceId =
    typeof input.callerWorkspaceId === 'string' ? input.callerWorkspaceId.trim() : '';
  if (!callerWorkspaceId) return bound;
  const fallback = resolveProjectWorkspaceScope({
    projectId: input.projectId,
    // An unbound project is a private local draft. It is not shared with the
    // team even when the workspace hosting it is one — the same `personal`
    // visibility every other "claim this orphan into the current workspace"
    // path writes (`ensureWorkspaceProjection`, `bindDuplicateIntoRequestWorkspace`).
    binding: { workspaceId: callerWorkspaceId, visibility: 'personal' },
    directory: input.directory,
  });
  return fallback.kind === 'personal' || fallback.kind === 'team' ? fallback : bound;
}
