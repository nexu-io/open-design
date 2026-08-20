// Workspace-resource mutation gate, shared by every resource type that binds
// into the generic `workspace_resources` table (see `db.ts`): project,
// plugin, and (later) skill / design system.
//
// This module is an EXTRACTION, not a new design. It used to live entirely
// inside `apps/daemon/src/routes/project/index.ts` as
// `enforceWorkspaceProjectMutation` / `projectAccess`, hard-coded to
// "project". Project's own logic has been fixed three times this week alone
// from dogfood feedback — a mistake here is easy to make and expensive to
// repeat, so every other resource type should call THIS module rather than
// forking its own copy. Project's route file still owns the project-specific
// affordances (canMoveToTeam / canMoveToPersonal / canOpen / canExport /
// canSendTo) that only make sense for a project; this module owns the part
// that generalizes cleanly: reading the caller's workspace identity off
// headers, and deciding whether a caller may mutate a bound resource row.
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { Response } from 'express';

export type WorkspaceResourceContext = {
  workspaceId: string;
  workspaceType: 'personal' | 'team';
  /**
   * The caller's RAW `x-od-workspace-type` claim, before it is collapsed into
   * `workspaceType` above. `workspaceType` defaults an absent header to
   * 'personal', which is the right default for view filtering but must never
   * be read as the caller ASSERTING "personal" — only an explicit header is
   * evidence. Null means the caller made no claim.
   */
  workspaceTypeAsserted: 'personal' | 'team' | null;
  appUserId: string;
  workspaceMemberId: string;
  role: 'owner' | 'admin' | 'member';
  memberStatus: 'active' | 'removed';
  lifecycleState: 'active' | 'billing_past_due' | 'locked' | 'deleting' | 'deleted';
  canShareProjects: boolean;
  canWriteSyncedFiles: boolean;
};

export type WorkspaceResourceMutationCapability =
  | 'rename'
  | 'delete'
  | 'duplicate'
  | 'writeFiles'
  | 'comment';

export type WorkspaceRequestAuthorityResult =
  | { ok: true; context: WorkspaceCollabContext }
  | {
      ok: false;
      status: 400 | 401 | 403 | 503;
      code: string;
      message: string;
      retryable?: true;
    };

export type VerifyWorkspaceRequestAuthority = (
  req: unknown,
) => Promise<WorkspaceRequestAuthorityResult>;

export type ResolveWorkspaceResourceReadAuthority = (
  resourceId: string,
) => Promise<WorkspaceRequestAuthorityResult>;

type RequestAuthorityCacheEntry = {
  identity: string;
  promise: Promise<WorkspaceRequestAuthorityResult>;
};

const REQUEST_AUTHORITY_CACHE = Symbol('open-design.workspace-request-authority');

/**
 * One mutation request can pass through more than one independent resource
 * gate (for example, a project gate followed by a plugin gate when starting a
 * run). Those gates must agree on one fresh directory witness without turning
 * that witness into a process-wide or cross-request membership cache.
 *
 * The cache lives on the Express request itself, is partitioned by verifier
 * identity, and includes every request-claimed authority field. A different
 * HTTP request always starts empty; changing the claimed identity on the same
 * request also forces a new verification rather than reusing stale standing.
 */
function verifyWorkspaceRequestAuthorityForRequest(
  req: any,
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority,
): Promise<WorkspaceRequestAuthorityResult> {
  const claimed = workspaceResourceContextFromRequest(req);
  const identity = claimed === null
    ? 'none'
    : claimed === 'missing'
      ? [
          'missing',
          req?.get?.('x-od-workspace-id')?.trim?.() ?? '',
          req?.get?.('x-od-workspace-member-id')?.trim?.() ?? '',
        ].join('\u0000')
      : [
          claimed.workspaceId,
          claimed.workspaceType,
          claimed.workspaceTypeAsserted ?? '',
          claimed.appUserId,
          claimed.workspaceMemberId,
          claimed.role,
          claimed.memberStatus,
          claimed.lifecycleState,
          String(claimed.canShareProjects),
          String(claimed.canWriteSyncedFiles),
        ].join('\u0000');
  const holder = req && (typeof req === 'object' || typeof req === 'function')
    ? req as Record<PropertyKey, unknown>
    : null;
  const existing = holder?.[REQUEST_AUTHORITY_CACHE] instanceof Map
    ? holder[REQUEST_AUTHORITY_CACHE] as Map<VerifyWorkspaceRequestAuthority, RequestAuthorityCacheEntry>
    : null;
  const cached = existing?.get(verifyWorkspaceRequestAuthority);
  if (cached?.identity === identity) return cached.promise;

  const promise = Promise.resolve().then(() => verifyWorkspaceRequestAuthority(req));
  if (!holder) return promise;
  const cache = existing ?? new Map<VerifyWorkspaceRequestAuthority, RequestAuthorityCacheEntry>();
  cache.set(verifyWorkspaceRequestAuthority, { identity, promise });
  if (!existing) {
    try {
      Object.defineProperty(holder, REQUEST_AUTHORITY_CACHE, {
        configurable: true,
        enumerable: false,
        value: cache,
      });
    } catch {
      // Exotic request facades may be non-extensible. They retain the secure
      // legacy behavior (a fresh verification per gate), only without the
      // request-local performance optimization.
    }
  }
  return promise;
}

/**
 * Browser navigation transports such as EventSource and iframe/src URLs
 * cannot attach custom headers. For those read-only routes only, accept the
 * same exact Workspace/member pair from query parameters and present it to the
 * normal verifier as request headers. A mixed header/query request must agree
 * exactly; callers cannot use query scope to override an existing identity.
 */
export function requestWithWorkspaceNavigationScope(
  req: any,
): any | 'conflict' {
  const workspaceId = typeof req.query?.workspaceId === 'string'
    ? req.query.workspaceId.trim()
    : '';
  const workspaceMemberId = typeof req.query?.workspaceMemberId === 'string'
    ? req.query.workspaceMemberId.trim()
    : '';
  if (!workspaceId && !workspaceMemberId) return req;
  const headerWorkspaceId = req.get('x-od-workspace-id')?.trim() ?? '';
  const headerWorkspaceMemberId =
    req.get('x-od-workspace-member-id')?.trim() ?? '';
  if (
    (headerWorkspaceId || headerWorkspaceMemberId)
    && (
      headerWorkspaceId !== workspaceId
      || headerWorkspaceMemberId !== workspaceMemberId
    )
  ) {
    return 'conflict';
  }
  return {
    get(name: string) {
      const normalized = name.toLowerCase();
      if (normalized === 'x-od-workspace-id') return workspaceId || undefined;
      if (normalized === 'x-od-workspace-member-id') {
        return workspaceMemberId || undefined;
      }
      return req.get(name);
    },
  };
}

export type OptionalWorkspaceRequestAuthorityResult =
  | { ok: true; context: WorkspaceCollabContext | null }
  | Exclude<WorkspaceRequestAuthorityResult, { ok: true }>;

/**
 * Resolve Workspace identity for daemon-local data-plane work.
 *
 * The browser's Workspace headers are attribution and namespace selectors on
 * this boundary, not a remote authorization token. Local files, conversations,
 * terminals, Skills, Plugins, and Design Systems must remain usable while Vela
 * is offline. Consequently this resolver validates only that the identity pair
 * is complete; it never calls the membership directory and deliberately does
 * not inherit stale role/lifecycle/permission claims from the browser.
 *
 * Operations that publish, share, sync, bill, or otherwise mutate remote Team
 * state must continue to use `resolveOptionalWorkspaceRequestAuthority` (or a
 * narrower fresh verifier) at that actual cloud boundary.
 */
export function resolveOptionalLocalWorkspaceRequestAuthority(
  req: any,
): OptionalWorkspaceRequestAuthorityResult {
  const claimed = workspaceResourceContextFromRequest(req);
  if (claimed === null) return { ok: true, context: null };
  if (claimed === 'missing') {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
      message: 'both workspace and member identity are required',
    };
  }
  return {
    ok: true,
    context: {
      workspaceId: claimed.workspaceId,
      workspaceType: claimed.workspaceType,
      workspaceMemberId: claimed.workspaceMemberId,
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'personal_byok',
      seatSummary: {
        seatLimit: 0,
        usedSeats: 0,
        availableSeats: 0,
        isSeatFull: false,
      },
      permissions: {
        canManageMembers: false,
        canManageBilling: false,
        canInviteMembers: false,
        canManageAutoRecharge: false,
        canShareProjects: true,
        canWriteSyncedFiles: true,
        canViewWorkspaceSettings: false,
        canManageSharedResources: false,
      },
      ...(claimed.workspaceType === 'team'
        ? { teamId: claimed.workspaceId }
        : {}),
    },
  };
}

/**
 * Resolve the three request-scope states shared by resource reads and writes:
 *
 * - no Workspace/member headers: the legacy Personal/global lane;
 * - a partial identity: a structured 400;
 * - a complete identity: fresh directory-backed authority.
 *
 * The caller-provided verifier is intentionally invoked for every complete
 * request. Resource mutations must not reuse a previously settled membership
 * success after the member has been removed.
 */
export async function resolveOptionalWorkspaceRequestAuthority(
  req: any,
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority | undefined,
): Promise<OptionalWorkspaceRequestAuthorityResult> {
  const claimed = workspaceResourceContextFromRequest(req);
  if (claimed === null) return { ok: true, context: null };
  if (claimed === 'missing') {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
      message: 'both workspace and member identity are required',
    };
  }
  if (!verifyWorkspaceRequestAuthority) {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_REQUIRED',
      message: 'an explicit workspace context is required',
    };
  }
  return verifyWorkspaceRequestAuthorityForRequest(
    req,
    verifyWorkspaceRequestAuthority,
  );
}

/**
 * Compatibility snapshot used only by the deprecated synchronous gate below.
 * No production route calls that gate; its remaining direct tests document
 * legacy behavior while current client data-plane routes use
 * `enforceVerifiedWorkspaceResourceMutation`, which performs a fresh exact
 * Workspace/member authority check and never consults this snapshot.
 */
export type WorkspaceMembershipSnapshot = {
  workspaceId: string;
  memberStatus: 'active' | 'removed';
};

export type GetLastKnownWorkspaceMembership = () => WorkspaceMembershipSnapshot | null;

/**
 * Ambient identity shape retained only by the deprecated synchronous gate.
 * It is absent from authoritative request gates and must never choose a
 * client's Workspace.
 */
export type AmbientWorkspaceSnapshot = {
  workspaceId: string;
  workspaceType: 'personal' | 'team';
  workspaceMemberId: string;
  role: WorkspaceResourceContext['role'];
  memberStatus: WorkspaceResourceContext['memberStatus'];
  lifecycleState: WorkspaceResourceContext['lifecycleState'];
  permissions: { canShareProjects: boolean; canWriteSyncedFiles: boolean };
};

export type GetAmbientWorkspace = () => AmbientWorkspaceSnapshot | null | undefined;

/**
 * The daemon's ambient identity as a resource context, or null when it has none.
 *
 * `workspaceTypeAsserted` is null and `appUserId` empty on purpose: both record
 * what a CALLER claimed, and nobody claimed anything here.
 */
export function ambientWorkspaceResourceContext(
  getAmbientWorkspace: GetAmbientWorkspace | undefined,
): WorkspaceResourceContext | null {
  const ambient = getAmbientWorkspace?.();
  if (!ambient) return null;
  const workspaceId = ambient.workspaceId?.trim();
  const workspaceMemberId = ambient.workspaceMemberId?.trim();
  if (!workspaceId || !workspaceMemberId) return null;
  return {
    workspaceId,
    workspaceType: ambient.workspaceType === 'team' ? 'team' : 'personal',
    workspaceTypeAsserted: null,
    appUserId: '',
    workspaceMemberId,
    role: ambient.role,
    memberStatus: ambient.memberStatus,
    lifecycleState: ambient.lifecycleState,
    canShareProjects: ambient.permissions.canShareProjects,
    canWriteSyncedFiles: ambient.permissions.canWriteSyncedFiles,
  };
}

/**
 * Deprecated compatibility cross-check for the synchronous gate below.
 *
 * Current routes instead perform a fresh exact directory check. This helper
 * remains for direct legacy tests and must not be wired into new routes.
 */
export function withLastKnownMembership(
  ctx: WorkspaceResourceContext,
  getLastKnownMembership: GetLastKnownWorkspaceMembership | undefined,
): WorkspaceResourceContext {
  if (!getLastKnownMembership) return ctx;
  const known = getLastKnownMembership();
  if (!known || known.workspaceId !== ctx.workspaceId) return ctx;
  if (known.memberStatus === 'removed' && ctx.memberStatus !== 'removed') {
    return { ...ctx, memberStatus: 'removed' };
  }
  return ctx;
}

export type WorkspaceResourceAccessInput = {
  workspaceId?: string | null;
  visibility?: string | null;
  resourceState?: string | null;
  createdByWorkspaceMemberId?: string | null;
  resourceHubResourceId?: string | null;
  syncState?: string | null;
};

export type WorkspaceMutationAuthorityLease = {
  verify: VerifyWorkspaceRequestAuthority;
  allow: (
    row: WorkspaceResourceAccessInput,
    context: WorkspaceCollabContext,
  ) => boolean;
};

export function headerValue(req: any, name: string): string | null {
  const value = req.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function headerBool(req: any, name: string, fallback: boolean): boolean {
  const value = headerValue(req, name);
  if (value === null) return fallback;
  if (value === 'false') return false;
  if (value === 'true') return true;
  return fallback;
}

// Temporary adapter until the B-owned CurrentWorkspaceContext is wired into
// the daemon. Keep resource CRUD behind this seam so the header fallback can
// be replaced without changing visibility and permission logic.
export function workspaceResourceContext(req: any, workspaceId: string): WorkspaceResourceContext | null {
  const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
  if (!workspaceMemberId) return null;
  const workspaceTypeHeader = headerValue(req, 'x-od-workspace-type');
  const lifecycleState = headerValue(req, 'x-od-workspace-lifecycle-state') ?? 'active';
  const role = headerValue(req, 'x-od-workspace-role') ?? 'member';
  const legacyWriteEnabled = headerBool(req, 'x-od-workspace-write-enabled', true);
  const canWriteSyncedFiles = headerBool(req, 'x-od-workspace-can-write-synced-files', legacyWriteEnabled);
  return {
    workspaceId,
    workspaceType: workspaceTypeHeader === 'team' ? 'team' : 'personal',
    workspaceTypeAsserted:
      workspaceTypeHeader === 'team' || workspaceTypeHeader === 'personal' ? workspaceTypeHeader : null,
    appUserId: headerValue(req, 'x-od-app-user-id') ?? 'local-user',
    workspaceMemberId,
    role: role === 'owner' || role === 'admin' ? role : 'member',
    memberStatus: headerValue(req, 'x-od-workspace-member-status') === 'removed' ? 'removed' : 'active',
    lifecycleState: lifecycleState === 'billing_past_due' || lifecycleState === 'locked' || lifecycleState === 'deleting' || lifecycleState === 'deleted'
      ? lifecycleState
      : 'active',
    canShareProjects: headerBool(req, 'x-od-workspace-can-share-projects', canWriteSyncedFiles),
    canWriteSyncedFiles,
  };
}

export function workspaceResourceContextFromRequest(req: any): WorkspaceResourceContext | 'missing' | null {
  const workspaceId = headerValue(req, 'x-od-workspace-id');
  const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
  if (!workspaceId && !workspaceMemberId) return null;
  if (!workspaceId || !workspaceMemberId) return 'missing';
  return workspaceResourceContext(req, workspaceId) ?? 'missing';
}

export function workspaceResourceContextFromVerified(
  context: WorkspaceCollabContext,
): WorkspaceResourceContext {
  return {
    workspaceId: context.workspaceId,
    workspaceType: context.workspaceType,
    workspaceTypeAsserted: context.workspaceType,
    appUserId: '',
    workspaceMemberId: context.workspaceMemberId,
    role: context.role,
    memberStatus: context.memberStatus,
    lifecycleState: context.lifecycleState,
    canShareProjects: context.permissions.canShareProjects,
    canWriteSyncedFiles: context.permissions.canWriteSyncedFiles,
  };
}

export function isWorkspaceResourceLocked(ctx: WorkspaceResourceContext): boolean {
  return ctx.lifecycleState === 'locked' || ctx.lifecycleState === 'deleted';
}

/**
 * The core frozen/privilege/mutate computation shared by every resource
 * type. Deliberately narrower than project's own `projectAccess` in
 * `routes/project/index.ts` — it does not compute
 * canMoveToTeam/canMoveToPersonal/canOpen/canExport/canSendTo, which are
 * project-specific UX affordances project's own wrapper still builds on top
 * of this. What it DOES compute is the part every resource type needs
 * identically, and the part a correctness fix tends to land in.
 */
export function workspaceResourceAccess(
  wp: WorkspaceResourceAccessInput,
  ctx: WorkspaceResourceContext,
): {
  frozen: boolean;
  selfCreated: boolean;
  privileged: boolean;
  canMutate: boolean;
  unattributed: boolean;
  canShareLocal: boolean;
  disabledReason?: 'workspace_deleted' | 'workspace_locked' | 'permission_denied';
} {
  const frozen = wp.resourceState === 'frozen' || wp.resourceState === 'deleted' || isWorkspaceResourceLocked(ctx);
  const selfCreated = wp.createdByWorkspaceMemberId != null && wp.createdByWorkspaceMemberId === ctx.workspaceMemberId;
  const privileged = ctx.role === 'owner' || ctx.role === 'admin';
  const canMutate = !frozen && ctx.canWriteSyncedFiles && ctx.memberStatus === 'active' && (privileged || selfCreated);
  // Sharing is the one mutation that must ALSO work on an unattributed
  // Project row: lazy projection never assigns ownership to the reader, yet a
  // local project physically exists only on this user's disk and sharing it
  // stamps the sharer as owner. Resource types whose Personal rows are stored
  // in shared registries apply a stricter creator check below, where the
  // resource type is available.
  const unattributed = wp.createdByWorkspaceMemberId == null;
  const canShareLocal =
    !frozen && ctx.canWriteSyncedFiles && ctx.memberStatus === 'active' &&
    (privileged || selfCreated || unattributed);
  const disabledReason: 'workspace_deleted' | 'workspace_locked' | 'permission_denied' | undefined = frozen
    ? ctx.lifecycleState === 'deleted' || wp.resourceState === 'deleted'
      ? 'workspace_deleted'
      : 'workspace_locked'
    : canMutate
      ? undefined
      : 'permission_denied';
  return {
    frozen,
    selfCreated,
    privileged,
    canMutate,
    unattributed,
    canShareLocal,
    ...(disabledReason ? { disabledReason } : {}),
  };
}

function workspaceResourceMutationAllowed(
  resourceType: string,
  row: WorkspaceResourceAccessInput | null | undefined,
  ctx: WorkspaceResourceContext,
  capability: WorkspaceResourceMutationCapability,
): boolean {
  if (!row) return false;
  const access = workspaceResourceAccess(row, ctx);
  const strictPersonalCreator =
    row.visibility === 'personal'
    && (
      resourceType === 'plugin'
      || resourceType === 'skill'
      || resourceType === 'design_system'
      || (resourceType === 'project' && row.createdByWorkspaceMemberId != null)
    );
  // `comment` is the one capability the product grants MORE WIDELY than
  // resource ownership: sharing a resource into the team explicitly invites
  // every active member to comment (the member-facing read-only banner
  // promises "view and comment"), while rename/delete/duplicate/writeFiles
  // stay creator/privileged-only. Gating comments on the strict `canMutate`
  // bit 403'd every plain member's comment on someone else's shared project
  // at the workspace layer (2026-07-28 dogfood: “评论保存失败，请重试。”),
  // before the per-comment author rules in routes/project/comments.ts ever
  // ran. Comments are intentionally independent from
  // `canWriteSyncedFiles`: shared-project viewers are read-only for project
  // files but the product still promises that they can comment. The sharing
  // act (`visibility: 'team'`) grants comment standing to every active
  // workspace member, while frozen resources and unshared personal bindings
  // remain closed.
  if (capability === 'comment') {
    return (
      access.canMutate ||
      (!access.frozen &&
        ctx.memberStatus === 'active' &&
        row.visibility === 'team')
    );
  }
  // Plugin, Skill, and Design System bytes live in shared daemon registries.
  // A same-Workspace owner/admin therefore must not mutate another member's
  // Personal resource, and an unattributed row is not an adoption witness.
  // Project is intentionally excluded: legacy local Projects rely on the
  // existing unattributed share-adoption lane.
  if (strictPersonalCreator) {
    return access.canMutate && access.selfCreated;
  }
  // A shared Team project is a single-writer resource. Workspace governance
  // (`owner` / `admin`) may manage the Team, but it does not transfer the
  // project owner's authorship: every project-content mutation must come from
  // the member recorded on the shared project row. Comments deliberately keep
  // the broader rule above. Personal/unshared projects and non-project
  // resources retain the ordinary privileged-or-creator mutation policy.
  if (resourceType === 'project' && row.visibility === 'team') {
    return access.canMutate && access.selfCreated;
  }
  // Every other mutation capability collapses to the same `canMutate` bit.
  return access.canMutate;
}

/**
 * Deprecated synchronous mutation gate retained for direct legacy tests.
 *
 * `resourceType` ('project' | 'plugin' | 'skill' | 'design_system') feeds
 * both the lookup callbacks' semantics and the permission-denied error code
 * (`WORKSPACE_<RESOURCE_TYPE>_PERMISSION_DENIED`) — for `resourceType:
 * 'project'` that reproduces the exact `WORKSPACE_PROJECT_PERMISSION_DENIED`
 * code the project route already shipped and has tests pinned against.
 *
 * `getWorkspaceResource`/`getWorkspaceResourceByResourceId` are caller-bound
 * closures over the specific resource's storage (e.g. `workspace_projects` or
 * `workspace_resources` filtered to `resource_type = 'plugin'`) so this
 * module never has to know which table backs which resource type.
 *
 * No production route calls this function. New code must use
 * `enforceVerifiedWorkspaceResourceMutation`.
 */
/**
 * The shape `createEnforceWorkspaceProjectMutation` (routes/project/index.ts)
 * returns: `enforceWorkspaceResourceMutation` with `resourceType` (and, for
 * project, the last-known-membership cross-check) already bound. Exported so a
 * resource type with no workspace binding of its own — a project comment — can
 * borrow another resource type's ALREADY-BUILT gate instance instead of
 * re-deriving one, and so the two ends of that hand-off (the builder in
 * routes/project/index.ts, the consumer in routes/project/comments.ts) share
 * one type instead of drifting.
 */
export type BoundWorkspaceResourceMutationGate = (
  req: any,
  res: Response,
  sendApiError: (
    res: Response,
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => unknown,
  getWorkspaceResource: (db: unknown, workspaceId: string, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  getWorkspaceResourceByResourceId: (db: unknown, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  capability: WorkspaceResourceMutationCapability,
) => Promise<boolean>;

/**
 * Deprecated synchronous counterpart retained for legacy tests. Production
 * routes use `requestCanMutateVerifiedWorkspaceResource`.
 *
 * For a READ route that writes as a side effect. The version-history GET
 * bootstraps a baseline version whenever a file has no manifest yet
 * (`ensureCurrentProjectFileVersion`), and on a member's mirror of someone
 * else's shared project that write is doubly wrong: it writes into a project
 * whose own banner says the member cannot modify it, and the version it
 * creates then presents itself as the owner's history even though the owner's
 * real history can never be there — `.file-versions` is in
 * `MEMBER_MIRROR_EXCLUDED_ENTRIES`, so a mirror never receives it. Measured
 * live (2026-07-27): owner 4 versions, member's panel 1, timestamped at the
 * moment the member opened the panel.
 *
 * The read itself stays open. Browsing history is a read action and the entry
 * point is deliberately un-gated (飞书 recvq56vFjQKfT); this answers only
 * "may this read leave a write behind?", never "may this caller read?".
 *
 * Fail-open on absent or unrecognized identity, which is where it deliberately
 * DIVERGES from `enforceWorkspaceResourceMutation`: that gate 401s a headerless
 * caller on a bound resource, because a mutation must prove membership. Here
 * the same absence must NOT suppress the bootstrap, or every legacy client,
 * `od` CLI invocation, and signed-out read would silently lose version history
 * for no security gain — the suppressed write is local-only either way
 * (`.file-versions` never publishes). Only an authenticated "this member
 * cannot write here" suppresses it.
 */
export function requestCanMutateWorkspaceResource(
  req: any,
  getWorkspaceResource: (db: unknown, workspaceId: string, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  getLastKnownMembership?: GetLastKnownWorkspaceMembership,
): boolean {
  const requestCtx = workspaceResourceContextFromRequest(req);
  if (requestCtx === null || requestCtx === 'missing') return true;
  const ctx = withLastKnownMembership(requestCtx, getLastKnownMembership);
  const row = getWorkspaceResource(db, ctx.workspaceId, resourceId);
  if (!row) return true;
  return workspaceResourceAccess(row, ctx).canMutate;
}

/**
 * Authoritative counterpart used by Workspace-bound project data-plane
 * routes. A persisted binding makes explicit Workspace/member identity
 * mandatory; every authority-bearing field comes from the signed-in
 * membership directory, never from request headers or daemon-global
 * active/last-known state. Truly unbound legacy local resources keep their
 * existing local-only behavior.
 */
export async function requestCanMutateVerifiedWorkspaceResource(
  req: any,
  getWorkspaceResource: (
    db: unknown,
    workspaceId: string,
    resourceId: string,
  ) => WorkspaceResourceAccessInput | null | undefined,
  getWorkspaceResourceByResourceId: (
    db: unknown,
    resourceId: string,
  ) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority | undefined,
): Promise<boolean> {
  if (!getWorkspaceResourceByResourceId(db, resourceId)) return true;
  if (!verifyWorkspaceRequestAuthority) return false;
  const verified = await verifyWorkspaceRequestAuthority(req);
  if (!verified.ok) return false;
  const context = workspaceResourceContextFromVerified(verified.context);
  const row = getWorkspaceResource(db, context.workspaceId, resourceId);
  return workspaceResourceMutationAllowed(
    'project',
    row,
    context,
    'writeFiles',
  );
}

export async function enforceVerifiedWorkspaceResourceMutation(
  resourceType: string,
  req: any,
  res: Response,
  sendApiError: (
    res: Response,
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => unknown,
  getWorkspaceResource: (
    db: unknown,
    workspaceId: string,
    resourceId: string,
  ) => WorkspaceResourceAccessInput | null | undefined,
  getWorkspaceResourceByResourceId: (
    db: unknown,
    resourceId: string,
  ) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  capability: WorkspaceResourceMutationCapability,
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority | undefined,
  options: { authorityLease?: WorkspaceMutationAuthorityLease } = {},
): Promise<boolean> {
  // No persisted Workspace binding means this is a genuine legacy/local
  // resource. Preserve that path without inventing a Workspace from ambient
  // navigation state.
  const persistedRow = getWorkspaceResourceByResourceId(db, resourceId);
  if (!persistedRow) return true;
  if (!verifyWorkspaceRequestAuthority) {
    sendApiError(res, 400, 'WORKSPACE_CONTEXT_REQUIRED', 'an explicit workspace context is required');
    return false;
  }

  let verified: Awaited<ReturnType<VerifyWorkspaceRequestAuthority>> | undefined;
  if (options.authorityLease) {
    const leased = await verifyWorkspaceRequestAuthorityForRequest(
      req,
      options.authorityLease.verify,
    );
    const leasedRow = leased.ok
      ? getWorkspaceResource(
          db,
          leased.context.workspaceId,
          resourceId,
        )
      : null;
    if (
      leased.ok
      && leasedRow
      && options.authorityLease.allow(leasedRow, leased.context)
    ) {
      verified = leased;
    }
  }
  verified ??= await verifyWorkspaceRequestAuthorityForRequest(
    req,
    verifyWorkspaceRequestAuthority,
  );
  if (!verified.ok) {
    sendApiError(
      res,
      verified.status,
      verified.code,
      verified.message,
      verified.retryable ? { retryable: true } : {},
    );
    return false;
  }

  const context = workspaceResourceContextFromVerified(verified.context);
  const row = getWorkspaceResource(db, context.workspaceId, resourceId);
  if (!workspaceResourceMutationAllowed(
    resourceType,
    row,
    context,
    capability,
  )) {
    const code = row && isWorkspaceResourceLocked(context)
      ? 'WORKSPACE_LOCKED'
      : `WORKSPACE_${resourceType.toUpperCase()}_PERMISSION_DENIED`;
    sendApiError(res, 403, code, `workspace ${resourceType} mutation is not allowed`);
    return false;
  }
  return true;
}

/**
 * Exact authority gate for the data plane of a Workspace-bound resource.
 *
 * Reads deliberately do not require creator/admin mutation standing: every
 * active member may read a resource bound to the exact Workspace resolved by
 * the server. Explicit request claims are checked rather than trusted, while a
 * headerless read derives its Workspace from persisted ownership. Locked or
 * frozen Team resources intentionally remain readable but read-only; removed
 * members, authority outages, cross-Workspace identities, and deleted
 * resources fail closed. Truly unbound legacy local resources remain
 * compatible.
 */
export async function enforceVerifiedWorkspaceResourceRead(
  resourceType: string,
  req: any,
  res: Response,
  sendApiError: (
    res: Response,
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => unknown,
  getWorkspaceResource: (
    db: unknown,
    workspaceId: string,
    resourceId: string,
  ) => WorkspaceResourceAccessInput | null | undefined,
  getWorkspaceResourceByResourceId: (
    db: unknown,
    resourceId: string,
  ) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority | undefined,
  options: {
    allowNavigationQuery?: boolean;
    resolveAuthority?: ResolveWorkspaceResourceReadAuthority;
  } = {},
): Promise<boolean> {
  if (!getWorkspaceResourceByResourceId(db, resourceId)) return true;
  const scopedRequest = options.allowNavigationQuery
    ? requestWithWorkspaceNavigationScope(req)
    : req;
  if (scopedRequest === 'conflict') {
    sendApiError(
      res,
      400,
      'WORKSPACE_CONTEXT_CONFLICT',
      'workspace header and navigation scope must match',
    );
    return false;
  }
  const claimed = workspaceResourceContextFromRequest(scopedRequest);
  const verified = claimed === null && options.resolveAuthority
    ? await options.resolveAuthority(resourceId)
    : verifyWorkspaceRequestAuthority
      ? await verifyWorkspaceRequestAuthority(scopedRequest)
      : {
          ok: false as const,
          status: 400 as const,
          code: 'WORKSPACE_CONTEXT_REQUIRED',
          message: 'an explicit workspace context is required',
        };
  if (!verified.ok) {
    sendApiError(
      res,
      verified.status,
      verified.code,
      verified.message,
      verified.retryable ? { retryable: true } : {},
    );
    return false;
  }
  const context = workspaceResourceContextFromVerified(verified.context);
  const row = getWorkspaceResource(db, context.workspaceId, resourceId);
  const strictPersonalCreator =
    row?.visibility === 'personal'
    && (
      resourceType === 'plugin'
      || resourceType === 'skill'
      || resourceType === 'design_system'
      || (resourceType === 'project' && row.createdByWorkspaceMemberId != null)
    );
  if (
    !row
    || context.memberStatus !== 'active'
    || (
      strictPersonalCreator
      && row.createdByWorkspaceMemberId !== context.workspaceMemberId
    )
  ) {
    sendApiError(
      res,
      403,
      `WORKSPACE_${resourceType.toUpperCase()}_PERMISSION_DENIED`,
      `workspace ${resourceType} read is not allowed`,
    );
    return false;
  }
  if (context.lifecycleState === 'deleted' || row.resourceState === 'deleted') {
    sendApiError(
      res,
      403,
      `WORKSPACE_${resourceType.toUpperCase()}_PERMISSION_DENIED`,
      `workspace ${resourceType} read is not allowed`,
    );
    return false;
  }
  return true;
}

/**
 * Decide a mutation whose request carries NO workspace identity at all.
 *
 * INVARIANT: every mutation resolves to a workspace identity. A request that
 * ASSERTS one is judged on that assertion; a request that asserts NOTHING is the
 * local daemon's own signed-in user, and is judged as that identity. Being
 * unable to name a workspace is not the same as having no standing in one.
 *
 * Headerless is the `od` CLI's normal shape, not an anomaly: nothing in
 * `apps/daemon/src/cli.ts` attaches `x-od-workspace-*` outside `od workspace …`,
 * and `AGENTS.md` makes the CLI the embeddability contract that external agents
 * drive OpenDesign through. This branch used to answer 401 for ANY bound
 * resource, which was survivable only while headerless creates left projects
 * unbound. Once every created project got a workspace home (#6201), the two
 * rules combined into a project its own creator could not touch:
 * `od project create` then `od project duplicate` -> 401.
 *
 * Resolving to the daemon's ambient identity — rather than to the request's
 * claim, of which there is none — is the same fallback the create path already
 * applies ("nothing asserted -> ambient"), so the gate and the creation paths
 * now agree about what a headerless caller is. It does NOT weaken the two
 * contracts that look adjacent: `authorizeCreatedProjectWorkspace` still refuses
 * to let ambient stand in for a pair someone explicitly CLAIMED, and
 * `resolveProjectWorkspaceScope` still resolves a PERSISTED binding without
 * consulting ambient. Both govern cases where something was asserted; this is
 * the third case.
 *
 * What stays refused, because the original branch protected something real
 * (recvqbeDjAsejl / recvqbklNGDqYY, spec 04 §10):
 *
 *   - a resource bound to a workspace the daemon is NOT currently in — a
 *     teammate's shared project, or one left behind by a previous identity. A
 *     headerless caller has no standing there and still gets 401.
 *   - a resource in the daemon's own workspace that the daemon's own identity
 *     may not mutate anyway. The SAME `workspaceResourceMutationAllowed`
 *     computation runs, so a plain member still cannot rename a teammate's
 *     project that happens to be shared into this workspace.
 *   - everything, when the daemon has no signed-in identity to resolve. Nothing
 *     can vouch for the caller, so the pre-existing answer stands.
 *
 * An unbound resource stays allowed, exactly as before.
 */
function headerlessMutationAllowed(
  resourceType: string,
  res: Response,
  sendApiError: (res: Response, status: number, code: string, message: string) => unknown,
  getWorkspaceResource: (db: unknown, workspaceId: string, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  getWorkspaceResourceByResourceId: (db: unknown, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  capability: WorkspaceResourceMutationCapability,
  getAmbientWorkspace: GetAmbientWorkspace | undefined,
): boolean {
  const anyRow = getWorkspaceResourceByResourceId(db, resourceId);
  // Never bound anywhere: nothing to have standing in.
  if (!anyRow) return true;

  const ambient = ambientWorkspaceResourceContext(getAmbientWorkspace);
  if (!ambient) {
    sendApiError(res, 401, 'WORKSPACE_CONTEXT_REQUIRED', 'workspace context is required');
    return false;
  }
  const ownRow = getWorkspaceResource(db, ambient.workspaceId, resourceId);
  if (!ownRow) {
    // Bound, but to some other workspace. This is the case the 401 exists for.
    sendApiError(res, 401, 'WORKSPACE_CONTEXT_REQUIRED', 'workspace context is required');
    return false;
  }
  if (!workspaceResourceMutationAllowed(
    resourceType,
    ownRow,
    ambient,
    capability,
  )) {
    const code = isWorkspaceResourceLocked(ambient)
      ? 'WORKSPACE_LOCKED'
      : `WORKSPACE_${resourceType.toUpperCase()}_PERMISSION_DENIED`;
    sendApiError(res, 403, code, `workspace ${resourceType} mutation is not allowed`);
    return false;
  }
  return true;
}

export function enforceWorkspaceResourceMutation(
  resourceType: string,
  req: any,
  res: Response,
  sendApiError: (res: Response, status: number, code: string, message: string) => unknown,
  getWorkspaceResource: (db: unknown, workspaceId: string, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  getWorkspaceResourceByResourceId: (db: unknown, resourceId: string) => WorkspaceResourceAccessInput | null | undefined,
  db: unknown,
  resourceId: string,
  capability: WorkspaceResourceMutationCapability,
  getLastKnownMembership?: GetLastKnownWorkspaceMembership,
  getAmbientWorkspace?: GetAmbientWorkspace,
): boolean {
  const requestCtx = workspaceResourceContextFromRequest(req);
  if (requestCtx === null) {
    return headerlessMutationAllowed(
      resourceType,
      res,
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      db,
      resourceId,
      capability,
      getAmbientWorkspace,
    );
  }
  if (requestCtx === 'missing') {
    sendApiError(res, 401, 'WORKSPACE_CONTEXT_REQUIRED', 'workspace context is required');
    return false;
  }
  const ctx = withLastKnownMembership(requestCtx, getLastKnownMembership);
  const row = getWorkspaceResource(db, ctx.workspaceId, resourceId);
  // "No row in MY workspace" is two different facts, and only one of them is a
  // refusal. A resource NO workspace has claimed is outside the isolation regime
  // altogether — the design's "no retroactive tagging" rule, which
  // `routes/plugins/index.ts` already applies by skipping this gate entirely for
  // an unbound plugin so it cannot become "permanently un-uninstallable the
  // moment a caller happens to carry workspace headers", and which design
  // systems' `designSystemVisibleFromWorkspace` follows too.
  //
  // Treating it as a refusal made the gate ASYMMETRIC: `headerlessMutationAllowed`
  // short-circuits on "no row anywhere" before it even asks for an identity, so
  // the same caller was allowed when it sent NO headers and refused when it
  // identified itself. That protected nothing — dropping headers is trivial — and
  // it is what forced the web client to tiptoe about when it may name itself,
  // surfacing as 401 WORKSPACE_CONTEXT_REQUIRED on a first send.
  //
  // This only PERMITS the operation. Nothing here writes, so the resource is not
  // adopted into the asserting caller's workspace; silently rebinding a
  // pre-existing orphan (#6213) remains out of bounds.
  if (!row && !getWorkspaceResourceByResourceId(db, resourceId)) return true;
  if (!workspaceResourceMutationAllowed(
    resourceType,
    row,
    ctx,
    capability,
  )) {
    const code = row && isWorkspaceResourceLocked(ctx)
      ? 'WORKSPACE_LOCKED'
      : `WORKSPACE_${resourceType.toUpperCase()}_PERMISSION_DENIED`;
    sendApiError(res, 403, code, `workspace ${resourceType} mutation is not allowed`);
    return false;
  }
  return true;
}
