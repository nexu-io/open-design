import type { WorkspaceCollabContext } from '@open-design/contracts';

/**
 * The complete workspace identity carried by workspace-aware web requests.
 *
 * Keep this helper independent from React hooks and project state so shared
 * catalog modules can use it without creating an import cycle.
 */
export function workspaceProjectHeaders(context: WorkspaceCollabContext): HeadersInit {
  return {
    'x-od-workspace-id': context.workspaceId,
    'x-od-workspace-type': context.workspaceType,
    'x-od-workspace-member-id': context.workspaceMemberId,
    'x-od-workspace-role': context.role,
    'x-od-workspace-lifecycle-state': context.lifecycleState,
    'x-od-workspace-member-status': context.memberStatus,
    'x-od-workspace-can-share-projects': String(context.permissions.canShareProjects),
    'x-od-workspace-can-write-synced-files': String(context.permissions.canWriteSyncedFiles),
  };
}

/**
 * Browser-owned navigations (iframe/img/a) cannot attach request headers.
 * Preserve the exact authority in the URL for those surfaces; the daemon
 * freshly verifies both values before serving Workspace-owned bytes.
 */
export function workspaceResourceUrl(
  path: string,
  context: WorkspaceCollabContext | null | undefined,
): string {
  if (!context) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}workspaceId=${encodeURIComponent(context.workspaceId)}`
    + `&workspaceMemberId=${encodeURIComponent(context.workspaceMemberId)}`;
}

/** Append a query fragment without corrupting an already workspace-scoped URL. */
export function appendResourceQuery(path: string, query: string): string {
  if (!query) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${query.replace(/^[?&]+/, '')}`;
}

/**
 * Cache partition matching exactly the fields {@link workspaceProjectHeaders}
 * puts on the wire. Billing fields are intentionally excluded because they do
 * not scope these requests.
 */
export function workspaceIdentityCacheKey(
  context: WorkspaceCollabContext | null | undefined,
): string {
  if (!context) return 'none';
  return [
    context.workspaceId,
    context.workspaceType,
    context.workspaceMemberId,
    context.role,
    context.memberStatus,
    context.lifecycleState,
    String(context.permissions?.canShareProjects),
    String(context.permissions?.canWriteSyncedFiles),
  ].join(':');
}

/**
 * Exact authority for a read-only Workspace resource request. The generation
 * is intentionally part of the identity even when every context field stays
 * unchanged: a newer directory witness must supersede work issued under the
 * older witness.
 */
export interface WorkspaceResourceReadIdentity {
  readonly context: WorkspaceCollabContext;
  readonly generation: string;
}

/**
 * Production Workspace state always publishes `resourceReadIdentity`.
 * Keeping the `undefined` compatibility lane lets older focused test doubles
 * continue to describe a settled verified-context read without making an
 * explicit production `null` fall back to a retained/stale context.
 */
export function resolveWorkspaceResourceReadIdentity(state: {
  context: WorkspaceCollabContext | null;
  resourceReadIdentity?: WorkspaceResourceReadIdentity | null;
}): WorkspaceResourceReadIdentity | null {
  if (state.resourceReadIdentity !== undefined) return state.resourceReadIdentity;
  return state.context
    ? { context: state.context, generation: 'verified-context' }
    : null;
}

/**
 * Preserve callers that already own an explicit project Workspace context.
 * There is no ambient directory generation in this lane, so its stable key is
 * derived only from the explicit context fields.
 */
export function workspaceResourceReadIdentityFromContext(
  context: WorkspaceCollabContext | null | undefined,
): WorkspaceResourceReadIdentity | null {
  return context
    ? {
        context,
        generation: `explicit-context:${workspaceIdentityCacheKey(context)}`,
      }
    : null;
}

export function workspaceResourceReadIdentityKey(
  identity: WorkspaceResourceReadIdentity | null | undefined,
): string {
  return identity
    ? JSON.stringify([identity.generation, workspaceIdentityCacheKey(identity.context)])
    : 'none';
}

export interface WorkspaceResourceScopedRead {
  readonly context: WorkspaceCollabContext | null;
  isStillCurrent(current: WorkspaceResourceReadIdentity | null | undefined): boolean;
}

/** Capture both context and witness generation before starting async work. */
export function beginWorkspaceResourceScopedRead(
  identity: WorkspaceResourceReadIdentity | null | undefined,
): WorkspaceResourceScopedRead {
  const context = identity?.context ?? null;
  const key = workspaceResourceReadIdentityKey(identity);
  return {
    context,
    isStillCurrent: (current) => workspaceResourceReadIdentityKey(current) === key,
  };
}

export interface WorkspaceScopedRead {
  readonly context: WorkspaceCollabContext | null;
  isStillCurrent(current: WorkspaceCollabContext | null | undefined): boolean;
}

export function beginWorkspaceScopedRead(
  context: WorkspaceCollabContext | null | undefined,
): WorkspaceScopedRead {
  const issuedFor = context ?? null;
  const identity = workspaceIdentityCacheKey(issuedFor);
  return {
    context: issuedFor,
    isStillCurrent: (current) => workspaceIdentityCacheKey(current ?? null) === identity,
  };
}
