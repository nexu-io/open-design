import type { OkResponse } from '../common.js';
import type { ProjectMetadata } from './projects.js';
import type { ProjectSyncState } from './project-sync.js';
import type {
  PreviewAnnotationStyle,
  PreviewCommentAnchorState,
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewCommentPosition,
  PreviewCommentSelectionKind,
  PreviewCommentStatus,
} from './comments.js';

// Team-edition collaboration shared DTOs: presence overlay (presence) and
// the sync trigger. Single source of truth for the daemon routes, the web
// CollabClient, and the `od collab` CLI so no surface re-declares these shapes.

export type CollabMemberRole = 'owner' | 'admin' | 'member';

/** Public single-file snapshot returned by the daemon publish routes. */
export interface PublicProjectFilePublication {
  url: string;
  slug: string;
  fileName: string;
}

export const PUBLIC_FILE_MANUAL_REVOKE_REQUIRED =
  'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED' as const;

/** Recovery data returned when a new public snapshot could not be persisted or redacted. */
export interface PublicFileManualRevokeRequiredData extends PublicProjectFilePublication {
  projectId: string;
}

export interface PublicFileManualRevokeRequiredResponse {
  error: {
    code: typeof PUBLIC_FILE_MANUAL_REVOKE_REQUIRED;
    message: string;
    data: PublicFileManualRevokeRequiredData;
  };
}

/** A member present in a shared project (heartbeat identity). */
export interface CollabPresenceMember {
  memberId: string;
  name?: string;
  role?: CollabMemberRole;
  avatarUrl?: string | null;
  filePath?: string | null;
  activity?: string | { label?: string } | Record<string, unknown> | null;
  heartbeatAt?: string;
}

/** GET /api/projects/:id/presence and the heartbeat response body. */
export interface CollabPresenceResponse {
  present: CollabPresenceMember[];
}

/**
 * Daemon-local lifecycle for an inbound shared-project content transfer.
 *
 * This is deliberately transport-agnostic: the UI only needs to know whether
 * bytes are still being fetched/materialized. `updatedAt` lets an SSE update
 * and a racing `/collab/status` response resolve in last-write-wins order.
 */
export interface ProjectContentTransferState {
  status: 'downloading' | 'idle';
  /** Hub version associated with the transfer, when the event supplied one. */
  version?: number;
  /** First observation of this transfer (epoch ms). */
  startedAt: number;
  /** Last transition (epoch ms, monotonic within one daemon process). */
  updatedAt: number;
}

/** POST /api/projects/:id/presence/heartbeat request body. */
export interface CollabPresenceHeartbeatRequest {
  memberId: string;
  name?: string;
  role?: CollabMemberRole;
  clientId?: string;
  /**
   * Monotonic operation number within one clientId lease. New clients send it
   * so a leave tombstone can reject an older heartbeat that arrives late.
   * Optional for compatibility with older web and CLI callers.
   */
  sequence?: number;
  filePath?: string | null;
  activity?: string | { label?: string } | Record<string, unknown> | null;
}

/** POST /api/projects/:id/presence/leave request body. */
export interface CollabPresenceLeaveRequest {
  memberId: string;
  clientId?: string;
  /** See {@link CollabPresenceHeartbeatRequest.sequence}. */
  sequence?: number;
}

export interface CollabPresenceLeaveResponse extends OkResponse {
  present: CollabPresenceMember[];
}

/**
 * GET /api/projects/:id/collab/status. `publishedVersion` is the head version
 * members poll to learn when to pull; null before the first publish.
 * `syncState` is the project sync state (see {@link ProjectSyncState}).
 */
export interface CollabSyncStatusResponse {
  publishedVersion: number | null;
  /**
   * The latest published version this daemon has durably materialized into the
   * local project tree for the current workspace + project owner scope. Null
   * means the local cursor is unavailable, so clients must fail closed and
   * treat a non-null published head as potentially pending.
   */
  materializedVersion: number | null;
  /**
   * Latest daemon-local inbound-transfer state. Null means this daemon has not
   * observed a transfer for the project in its current process lifetime.
   */
  contentTransferState?: ProjectContentTransferState | null;
  /**
   * True while this daemon's only local record for the project is an
   * unmaterialized shared-project placeholder — a row registered so the
   * project's other routes stop 404ing, whose content directory is empty and
   * is NOT the project's content (see the daemon's
   * `sharedProjectPlaceholderAt` stamp).
   *
   * It is the one download signal that does not depend on remote enrichment.
   * `publishedVersion` is null on a fresh install's very first status response
   * — the daemon answers from local state and fetches the real hub head in the
   * background for a later poll — so a client gated only on
   * `publishedVersion`/`contentTransferState` cannot distinguish "empty
   * project" from "content still downloading" on first open, and shows an
   * empty project with create-a-file CTAs instead of a syncing state.
   *
   * Clients must treat this as authoritative over the local file list: while
   * it is true, zero files means "not downloaded yet", never "nothing here".
   */
  awaitingFirstMaterialization?: boolean;
  syncState: ProjectSyncState;
  /**
   * The member who shared this project (its single writer), resolved
   * server-side (from the team hub). A member compares this to their own id to
   * know whether they view the project read-only. Absent for a project that is
   * not team-shared (off-team / hub unconfigured).
   */
  ownerMemberId?: string | null;
  /**
   * Human-friendly display name of {@link ownerMemberId}, resolved from the
   * collab-cloud member directory so the client can render a "这是 麻薯 创建的
   * 共享项目" banner instead of an opaque member id. Absent when the directory
   * is unconfigured or the owner is not registered in it. STUB: the real name
   * source is B's member roster; the collab-cloud directory stands in until B
   * exposes it (see {@link CollabCloudMemberDirectoryEntry}).
   */
  ownerDisplayName?: string;
  /** The owner's team role (owner/admin/member), from the same directory entry. */
  ownerRole?: CollabMemberRole;
}

/** Idempotent local bootstrap for a hub-authorized Team project first open. */
export interface CollabProjectBootstrapResponse {
  ok: true;
  awaitingFirstMaterialization: boolean;
}

/** POST /api/projects/:id/collab/pull response. */
export interface CollabPullResponse extends OkResponse {
  /** The actual hub version materialized by this pull, or null when unpublished. */
  version: number | null;
}

/** POST /api/projects/:id/collab/sync-intent response. */
export interface CollabSyncIntentResponse extends OkResponse {
  syncState: ProjectSyncState;
}

/**
 * A project shared to the caller's team, surfaced from the resource hub so a
 * member can discover + open projects the owner shared. `projectId` is the local
 * project id (the hub `project-` id prefix stripped) a member pulls then opens;
 * `ownerMemberId` is the member who shared it (its single writer); `sharedAt` is
 * when it was first shared (the hub resource's `createdAt`).
 */
export interface TeamProject {
  projectId: string;
  ownerMemberId: string;
  sharedAt: string;
  /** Display name stored on the team resource index; avoids pulling the tree just
   *  to render the team project card. */
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  metadata?: ProjectMetadata;
}

/**
 * GET /api/workspace/projects/team. Team-wide shared-project discovery: every
 * project any member shared to the team, read from the resource hub. A member's
 * own `/api/projects` list is only their LOCAL projects; team-shared projects
 * live on the hub until pulled. Empty off-team or when the hub is not configured.
 *
 * The web client polls this on an interval so teammates see each other's shares
 * without refreshing. Today the read is daemon-local (fast), so it just refetches
 * the whole list. Once D's directory service owns team visibility this read
 * proxies vela over the CLI — a slower cross-network call — and should gain a
 * cheap change probe (vela's version / last-modified) so the poll only pulls the
 * full list when it actually changed.
 */
export interface WorkspaceTeamProjectsResponse {
  projects: TeamProject[];
}

// Workspace context seam onto the B (identity/membership) + D (visibility)
// lanes. A faithful SUBSET of B's `CurrentWorkspaceContext`
// (vela packages/shared/src/workspace-context.ts) — the exact fields C needs to
// decide whether collab runs and who the present member is — so wiring B's real
// context in is a direct field pass-through. Field names mirror B verbatim.

export type WorkspaceType = 'personal' | 'team';
export type WorkspaceMemberStatus = 'active' | 'removed';
export type WorkspaceLifecycleState =
  | 'active'
  | 'billing_past_due'
  | 'locked'
  | 'deleting'
  | 'deleted';

/**
 * How the workspace pays for model calls. `platform_credits` is the AMR/vela
 * cloud path; `personal_byok` is the user's own key. This axis is ORTHOGONAL to
 * whether team collab is on — a `personal_byok` workspace still has full team
 * features (gate on {@link WorkspaceLifecycleState}/role, never on providerMode).
 * Mirrors B's `workspaceProviderMode` (vela packages/shared/src/workspace-context.ts).
 */
export type WorkspaceProviderMode = 'platform_credits' | 'personal_byok';

/** Billing truth (billing UI only). Mirrors B's `workspaceBillingState`. */
export type WorkspaceBillingState =
  | 'free'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'inactive'
  | 'locked';

/**
 * Permission bits — a verbatim mirror of B's `WorkspacePermissions`
 * (vela packages/shared/src/workspace-context.ts, `buildWorkspacePermissions`).
 * C surfaces CONSUME these to gate UI; never re-derive from role/lifecycle so the
 * two lanes cannot drift. `canWriteSyncedFiles` is the read-only gate for collab;
 * `canManageSharedResources`/`canShareProjects` gate resource sharing.
 */
export interface WorkspacePermissions {
  canManageMembers: boolean;
  canManageBilling: boolean;
  canInviteMembers: boolean;
  canManageAutoRecharge: boolean;
  canShareProjects: boolean;
  canWriteSyncedFiles: boolean;
  canViewWorkspaceSettings: boolean;
  canManageSharedResources: boolean;
}

/** Seat accounting summary. Mirrors B's `WorkspaceSeatSummary`. */
export interface WorkspaceSeatSummary {
  seatLimit: number;
  usedSeats: number;
  availableSeats: number;
  isSeatFull: boolean;
}

/**
 * Classify seat accounting from an authoritative capacity projection.
 *
 * Directory-only contexts use 0/0 as an unknown-capacity sentinel because the
 * membership directory does not carry billing seat counts. Consumers must not
 * interpret that synthetic summary as proof that the workspace is full.
 */
export function workspaceSeatCapacityState(
  summary: WorkspaceSeatSummary | null | undefined,
): 'available' | 'full' | 'unknown' {
  if (summary == null || (summary.seatLimit === 0 && summary.usedSeats === 0)) {
    return 'unknown';
  }
  return summary.isSeatFull ? 'full' : 'available';
}

/** Billing-recovery entry (locked/past-due). Mirrors B's `WorkspaceBillingRecovery`. */
export interface WorkspaceBillingRecovery {
  canEnterBillingRecovery: boolean;
  recoveryUrl: string | null;
}

/**
 * The one shared workspace context every workspace surface consumes. In
 * production the daemon resolves it from its local selection plus B's
 * authenticated membership directory; richer flows such as invite continuation
 * may populate the optional billing/display fields from a workspace-context
 * payload. `context` is null when signed out or B is unavailable.
 */
export interface WorkspaceCollabContext {
  workspaceId: string;
  workspaceType: WorkspaceType;
  workspaceMemberId: string;
  role: CollabMemberRole;
  memberStatus: WorkspaceMemberStatus;
  lifecycleState: WorkspaceLifecycleState;
  billingState: WorkspaceBillingState;
  planId: string | null;
  providerMode: WorkspaceProviderMode;
  seatSummary: WorkspaceSeatSummary;
  permissions: WorkspacePermissions;
  billingRecovery?: WorkspaceBillingRecovery;
  /**
   * URL of the team's settings/management console on the cloud web app. Team
   * management (members, billing, dashboard) lives there — the local client only
   * links out to it; it does not embed those views. Absent for a personal
   * workspace or when the console URL is not resolvable.
   */
  workspaceSettingsUrl?: string;
  lastActiveWorkspaceId?: string;
  /** Team id — present for a team workspace, absent for a personal one. Lets the
   *  resource-hub principal derive from this one context (single identity source). */
  teamId?: string;
  /** Human-friendly team name for the workspace switcher (falls back to teamId). */
  teamName?: string;
  /**
   * B's display name for THIS workspace, whatever its type. Mirrors the
   * `workspaceName` in B's membership directory/context payloads and is
   * populated for personal workspaces too — vela derives "«owner»'s
   * workspace" for an unnamed one, and an owner may rename it outright.
   *
   * Distinct from `teamName` on purpose: `teamName` is the TEAM switcher's
   * field and stays absent for a personal workspace, so nothing may read it as
   * an "is a team" signal. Any surface that just wants to LABEL the current
   * workspace reads this one, and therefore gets a correct label from the
   * context the client already fetches at startup — without waiting on the
   * workspace-directory read that only happens when the switcher is opened.
   */
  workspaceName?: string;
  /** Display name for the presence overlay (optional; falls back to the id). */
  displayName?: string;
  /** Signed-in user's profile image for identity surfaces such as project bylines. */
  avatarUrl?: string | null;
}

/**
 * GET /api/workspace/context. The daemon resolves the locally selected entry
 * through B's authenticated membership directory; `context` is null when the
 * caller is signed out or the directory is unavailable.
 */
export interface WorkspaceContextResponse {
  context: WorkspaceCollabContext | null;
}

/** A workspace visible to the signed-in Vela identity. Mirrors B's directory item. */
export interface WorkspaceDirectoryItem {
  workspaceId: string;
  workspaceName: string;
  workspaceIconKey?: string;
  workspaceType: WorkspaceType;
  workspaceMemberId: string;
  role: CollabMemberRole;
  memberStatus: WorkspaceMemberStatus;
  lifecycleState: WorkspaceLifecycleState;
}

/** GET /api/workspace/directory. OD's local workspace switcher data source. */
export interface WorkspaceDirectoryResponse {
  items: WorkspaceDirectoryItem[];
  /**
   * Last workspace deliberately selected by this client, when it is still a
   * visible membership. This is a restart bootstrap hint only; it must never
   * scope data-plane requests, which continue to carry an exact Workspace and
   * member identity.
   */
  activeWorkspaceId: string | null;
}

/**
 * PUT /api/workspace/active.
 * Verifies and resolves this tab's exact Workspace/member selection, then
 * persists the Workspace id as this client's next-start bootstrap hint. It
 * does not create implicit data-plane authority.
 */
export interface WorkspaceActiveRequest {
  workspaceId: string;
  workspaceMemberId: string;
}

export interface WorkspaceActiveResponse {
  /** The verified Workspace id persisted as the client's restart default. */
  activeWorkspaceId: string;
  context: WorkspaceCollabContext;
}

// —— Derivation helpers — a verbatim mirror of B's vela
// packages/shared/src/workspace-context.ts. Both the daemon's dev context stub
// and the real B proxy derive permissions/seat summary through these, so C never
// drifts from B's authorization rules. If B's helper changes, update here too.

export function isWorkspaceLifecycleReadable(state: WorkspaceLifecycleState): boolean {
  return state !== 'deleted';
}

/**
 * Whether a context can address the workspace resource hub.
 *
 * The hub keys every resource by a TEAM workspace: `teamId` is populated only
 * for `workspaceType === 'team'` (see the field's doc above), so a personal or
 * signed-out session has no id to push, snapshot, or redact under. Everything
 * built on the hub USED to be team-only by construction. That is still true of
 * team project SHARING, which needs teammates to share with — but no longer of
 * public single-file links: see {@link workspaceContextHasWorkspaceIdentity}.
 *
 * This is the ONE predicate both sides must agree on: the daemon refuses hub
 * writes when it is false, and the web UI must not render a hub-backed entry
 * point when it is false. Deriving it twice is how a UI grows a button that can
 * only ever fail.
 */
export function workspaceContextHasTeamIdentity(
  context: WorkspaceCollabContext | null | undefined,
): boolean {
  return Boolean(
    context &&
    context.workspaceType === 'team' &&
    context.workspaceId &&
    context.workspaceMemberId,
  );
}

/**
 * Whether this session can address a resource hub partition AT ALL.
 *
 * The hub addresses purely by workspace id, and B mints a principal for any
 * workspace a caller belongs to — a personal one included, where the principal's
 * `teamId` simply IS that workspace id, a partition of one. So the requirement
 * for a hub write is an id to publish under and a member id to own the result
 * with; the workspace TYPE is not part of it.
 *
 * Use this for surfaces that only need somewhere to put a resource — the public
 * single-file link is the one today. Use {@link workspaceContextHasTeamIdentity}
 * where the feature genuinely needs a TEAM, such as sharing a project with
 * teammates.
 *
 * Same rule as its sibling: the daemon refuses the write when this is false and
 * the web UI must not render the entry point when it is false. Deriving it twice
 * is how a UI grows a button that can only ever fail — which is exactly what
 * happened here before this helper existed.
 */
export function workspaceContextHasWorkspaceIdentity(
  context: WorkspaceCollabContext | null | undefined,
): boolean {
  return Boolean(context && context.workspaceId && context.workspaceMemberId);
}

/**
 * The fields that name WHO a workspace context belongs to — and nothing else.
 *
 * ## Why this exists
 *
 * The product resolves the same person's workspace context from two sources,
 * and they legitimately disagree:
 *
 * - The SHELL (`GET /api/workspace/context`, the account membership
 *   directory) reports the member's REAL `role`.
 * - The PROJECT scope fast path (`GET /api/projects/:id/workspace-scope` →
 *   `resolveLocalProjectWorkspaceScope` in apps/daemon) resolves *without
 *   consulting the membership directory* — that is its stated contract and the
 *   reason the read-only decision can paint on the first frame — so it fills
 *   `role` with a least-privilege `member` placeholder. That placeholder is
 *   load-bearing: it is how "creator may write / non-creator is read-only" is
 *   implemented (see `workspaceResourceAccess` in
 *   apps/daemon/src/collab/workspace-resource-mutation.ts). It must not be
 *   "fixed", and it must not be made to wait on the network.
 *
 * Everything else the two sources publish for one member of one workspace is
 * byte-identical: `canShareProjects` / `canWriteSyncedFiles` derive from
 * `memberStatus` + `lifecycleState` only (see {@link buildWorkspacePermissions}),
 * never from `role`. So `role` is the ONLY field that can differ — which is why
 * a naive "are these the same context" comparison silently works for a plain
 * member and silently fails for an owner or an admin.
 *
 * That has produced the same defect seven times so far, always written as an
 * ad-hoc field-by-field or cache-key comparison at the call site:
 *
 *  1. A balance dialog that told the team owner to "ask your team owner"
 *     (§6.V / OPEND-2720) — fixed by {@link workspaceBillingAuthorityContext}.
 *  2. A plan-gated model whose "upgrade to use this" tooltip did nothing when
 *     clicked, on team AND personal workspaces (`AvatarMenu`).
 *  3. "项目不存在" on a team owner's own project, opened from its directory card
 *     (`bootstrapProjectRoute`).
 *  4. The progressive first-open lane dead for every owner/admin, silently
 *     falling back to full materialization (`bootstrapFirstOpenTeamProjectRoute`).
 *  5. A home project grid that never went stale after the owner shared or
 *     unshared, so Back showed the pre-share state (`project-display-cache`).
 *  6. Every project open by an owner/admin discarding the route bootstrap's
 *     pre-fetched scope and refetching it (`useProjectWorkspaceScope`).
 *  7. `App.handleProjectChange`'s route-snapshot match, which compares the
 *     route snapshot's scope-derived context against the directory-derived
 *     project context — still open at the time of writing.
 *
 * ## The rule
 *
 * Asking **"is this the same person in the same workspace?"** goes through this
 * helper — never through a cache key, never through a hand-rolled field
 * comparison. `role` is authorization state, not identity, and the answer to
 * "who is this" may not depend on it.
 *
 * `memberStatus` and `lifecycleState` are excluded for a related reason: the two
 * sources describe DIFFERENT OBJECTS' state (the project's own row versus the
 * workspace's directory entry — a frozen project reads back `locked` while its
 * workspace is `active`). They are state of an identity, not the identity, and
 * every consumer that cares about them still reads them from whichever context
 * is authoritative for its own question.
 *
 * Using `role` to decide **whether this person may change this thing** remains
 * correct and is untouched by this helper — that is what
 * `workspaceResourceAccess`, the `x-od-workspace-role` request header, and the
 * daemon's mutation gate do.
 */
export type WorkspacePrincipal = Pick<
  WorkspaceCollabContext,
  'workspaceId' | 'workspaceType' | 'workspaceMemberId'
>;

/**
 * A stable partition token for one workspace principal, or `null` when the
 * context is absent or its identity incomplete.
 *
 * `null` is deliberately not a token: an absent identity is not equal to
 * another absent identity, so callers that store this key can compare it
 * directly without accidentally letting two unknowns match.
 */
export function workspacePrincipalKey(
  context: WorkspacePrincipal | null | undefined,
): string | null {
  if (!context) return null;
  // Blankness disqualifies, but the token itself keys on the raw values so this
  // stays exactly as strict as the field-by-field `!==` comparisons it
  // replaced. `JSON.stringify` keeps the three fields unambiguous even if an id
  // ever contains the separator.
  if (!context.workspaceId?.trim() || !context.workspaceMemberId?.trim()) return null;
  return JSON.stringify([
    context.workspaceId,
    context.workspaceType,
    context.workspaceMemberId,
  ]);
}

/**
 * Whether two workspace contexts name the same person in the same workspace.
 *
 * Fail-closed: an absent or incomplete identity on either side is never "the
 * same person", including when both sides are absent.
 *
 * See {@link WorkspacePrincipal} for why this exists and why `role` is not part
 * of the answer.
 */
export function isSameWorkspacePrincipal(
  a: WorkspacePrincipal | null | undefined,
  b: WorkspacePrincipal | null | undefined,
): boolean {
  const key = workspacePrincipalKey(a);
  return key !== null && key === workspacePrincipalKey(b);
}

export function isWorkspaceLifecycleWritable(state: WorkspaceLifecycleState): boolean {
  return state === 'active';
}

export function buildWorkspacePermissions(input: {
  role: CollabMemberRole;
  lifecycleState: WorkspaceLifecycleState;
  memberStatus?: WorkspaceMemberStatus;
}): WorkspacePermissions {
  const memberStatus = input.memberStatus ?? 'active';
  const readable =
    memberStatus === 'active' && isWorkspaceLifecycleReadable(input.lifecycleState);
  const writable =
    memberStatus === 'active' && isWorkspaceLifecycleWritable(input.lifecycleState);
  const isOwner = input.role === 'owner';
  const isAdmin = input.role === 'admin';
  return {
    canManageMembers: writable && (isOwner || isAdmin),
    canManageBilling: readable && isOwner,
    canInviteMembers: writable && (isOwner || isAdmin),
    canManageAutoRecharge: writable && isOwner,
    canShareProjects: writable,
    canWriteSyncedFiles: writable,
    canViewWorkspaceSettings: readable,
    canManageSharedResources: writable && (isOwner || isAdmin),
  };
}

/**
 * Whether this context may be shown a billing entrance — an upgrade link, a
 * plan surface, a top-up destination.
 *
 * `canManageBilling` answers a TEAM question: which member of a shared
 * workspace may spend money that is not only theirs. B enforces the same bit
 * server-side (`services/api/src/billing/http/routes.ts` refuses a caller
 * without it), so surfacing an external billing action to a team member
 * without it can only produce a button that fails on arrival. That gate is
 * correct and this predicate keeps it exactly as strict.
 *
 * A PERSONAL workspace has no second member. The wallet is the signed-in
 * user's own, there is nobody to ask, and there is no one to protect the money
 * from. Asking a team-membership permission whether someone may pay for
 * themselves does not gate anything — it only deletes the person's own way to
 * pay. That is how an empty personal wallet ended up looking at a dialog that
 * said "upgrade to keep creating" under a single 「暂不需要」 button
 * (`run-error-catalog.md` §6.Y, reproduced on a real runtime 2026-09-07).
 *
 * This is the ONE predicate every billing entrance must agree on. The audience
 * split that decides WHICH dialog appears (`runtime/amr-balance-branch.ts`) and
 * the resolver that decides whether that dialog HAS a destination
 * (`workspaceUpgradeUrl`) both read it here, because a user who is routed to
 * the upgrade dialog and a user who is handed an upgrade link have to be the
 * same user. Deriving it twice is how a dialog grows a body with no way out.
 *
 * Note this is about the ENTRANCE, not the action. Whether the entrance leads
 * to a plan surface or to auto-recharge is a separate question owned by
 * `canManageAutoRecharge` (`writable && isOwner`, a strictly narrower bit).
 */
export function canReachWorkspaceBillingEntrance(
  context: Pick<WorkspaceCollabContext, 'workspaceType'> & {
    permissions?: Pick<WorkspacePermissions, 'canManageBilling'>;
  },
): boolean {
  if (context.workspaceType !== 'team') return true;
  return context.permissions?.canManageBilling === true;
}

/**
 * The one context a billing entrance may be resolved from, for a run that a
 * specific project's workspace pays for.
 *
 * Two questions get confused here, and they have different authorities.
 *
 * WHICH WORKSPACE PAYS is the project's resolved scope, and only the project's
 * resolved scope. A settled unavailable/forbidden scope produces no context at
 * all, and that absence must stay an absence: substituting whichever workspace
 * the navigation rail happens to be in is how a Team project's empty wallet
 * ends up asking about the viewer's Personal one. So `scoped` is passed through
 * untouched in its identity — there is no input to this function that can make
 * the result name a different `workspaceId`, `workspaceType`, or
 * `workspaceMemberId` than `scoped` did, and a null `scoped` stays null.
 *
 * WHO IS ASKING the project scope cannot answer. `resolveLocalProjectWorkspaceScope`
 * (apps/daemon) resolves a project's scope *without consulting the membership
 * directory* — that is its stated contract and the reason it is fast and
 * local — so it fills `role` with a least-privilege `member` placeholder. That
 * placeholder is load-bearing for writes: the daemon's resource gate derives
 * `privileged` from the role the project request asserts, and a placeholder
 * that said `owner` would let a workspace owner write every project in the
 * workspace, including ones they did not create. It must not be "fixed".
 *
 * What it must not do is answer a MONEY question. Asked whether the viewer may
 * reach a billing entrance, the placeholder demotes a workspace owner to a
 * member and deletes their own way to pay — the dialog becomes "ask your team
 * owner" for the team owner themselves (§6.V / OPEND-2720, reproduced on a
 * real runtime 2026-09-07).
 *
 * So this adopts exactly one thing — the membership role — and only from an
 * authoritative context (`GET /api/workspace/context`) that names the very same
 * workspace AND the very same member. Permissions are re-derived through
 * {@link buildWorkspacePermissions} using the SCOPE's own lifecycle and member
 * status, because those describe this project's state (a frozen project reads
 * back `locked`) rather than the directory's view of the workspace. A frozen
 * project therefore stays unwritable no matter whose role is adopted.
 *
 * Everything else — a mismatch of any identity field, an absent authority —
 * keeps the fail-closed scope exactly as it is.
 *
 * The AUTHORITY's own `memberStatus` is deliberately not consulted (product
 * ruling 2026-09-07). It could only ever change the outcome for the pairing
 * "the directory reports this member removed, yet the project's scope still
 * resolves for them", and the product ships no entrance that removes a member,
 * so that pairing has no way to occur. Adding the branch anyway would only buy
 * an unreachable one: nothing this function returns is an authorization. The
 * permission bits are still re-derived from the SCOPE's own `memberStatus`
 * above, so a scope that does report `removed` stays closed regardless of the
 * role adopted, and every money action behind the entrance is enforced
 * server-side. The residue if the pairing ever became reachable is a removed
 * member seeing an upgrade link — which is not a harm worth a dead branch.
 *
 * The result is for billing entrances only (which dialog, whether an upgrade
 * link exists, where it lands). It must never be used as a project request's
 * workspace identity, nor reach a write/read-only decision.
 */
export function workspaceBillingAuthorityContext(
  scoped: WorkspaceCollabContext | null | undefined,
  authoritative: WorkspaceCollabContext | null | undefined,
): WorkspaceCollabContext | null {
  if (!scoped) return null;
  if (!authoritative) return scoped;
  if (
    !isSameWorkspacePrincipal(authoritative, scoped)
    || authoritative.role === scoped.role
  ) {
    return scoped;
  }
  return {
    ...scoped,
    role: authoritative.role,
    permissions: buildWorkspacePermissions({
      role: authoritative.role,
      lifecycleState: scoped.lifecycleState,
      memberStatus: scoped.memberStatus,
    }),
  };
}

export function buildWorkspaceSeatSummary(input: {
  seatLimit: number;
  usedSeats: number;
}): WorkspaceSeatSummary {
  const availableSeats = Math.max(input.seatLimit - input.usedSeats, 0);
  return {
    seatLimit: input.seatLimit,
    usedSeats: input.usedSeats,
    availableSeats,
    isSeatFull: availableSeats === 0,
  };
}

/** One backend-proven v2 workspace wallet balance. */
export interface WorkspaceWalletBalance {
  workspaceId: string;
  workspaceMemberId: string;
  balanceUsd: string;
  billingScopeVersion: 2;
  expiresAt: string | null;
  updatedAt: string | null;
}

/** Persistent producer cursor for one workspace-billing change domain. */
export interface WorkspaceBillingRevisionClock {
  /** Changes only when the producer's persistent revision sequence is rebuilt. */
  epoch: string;
  /** Unsigned decimal counter, monotonic within one epoch. */
  counter: string;
}

/**
 * One authoritative, explicitly scoped workspace billing snapshot from Vela.
 *
 * Revisions are opaque equality tokens. Clients use events only as invalidation
 * signals and always re-read this snapshot; they never derive money or plan
 * state from an event payload.
 */
export interface WorkspaceBillingSnapshot {
  schemaVersion: 1;
  workspaceId: string;
  workspaceMemberId: string;
  billingScopeVersion: 2;
  billing: {
    billingState: WorkspaceBillingState | null;
    planId: string | null;
  };
  wallet: {
    balanceUsd: string;
    expiresAt: string | null;
    updatedAt: string | null;
  };
  revisions: {
    billing: string;
    wallet: string;
  };
  /**
   * Additive persistent cursors advertised by
   * `billing-revision-clocks-v1`. Missing means the producer/CLI predates the
   * capability, so consumers keep treating `revisions` as opaque equality
   * tokens and rely on reconnect/poll catch-up.
   */
  revisionClocks?: {
    billing: WorkspaceBillingRevisionClock;
    wallet: WorkspaceBillingRevisionClock;
  };
}

/**
 * Daemon-owned freshness metadata for one exact workspace/member billing
 * projection. Additive to the legacy response so older clients keep consuming
 * `workspaceBalance` / `workspaceSnapshot` unchanged.
 */
export type WorkspaceBillingRuntimeStatus =
  | 'loading'
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'error'
  | 'access-revoked';

export interface WorkspaceBillingRuntimeState {
  workspaceId: string;
  workspaceMemberId: string;
  status: WorkspaceBillingRuntimeStatus;
  /** Daemon-local uint64 rendered as a decimal string. */
  revision: string;
  observedAt: string | null;
  /** Last-good data becomes stale after this point and must be revalidated. */
  softExpiresAt: string | null;
  /** Last-good money/plan data must not be consumed after this point. */
  hardExpiresAt: string | null;
  retryAt: string | null;
  errorCode: string | null;
  /** Why the most recent state transition or authoritative read occurred. */
  reason: string;
  /** True when an ordered upstream revision skipped at least one value. */
  sourceGapDetected: boolean;
}

/**
 * Proof that this exact response completed the caller-requested authoritative
 * workspace projection refresh. Its absence is intentional compatibility
 * signaling: a newer client must not treat an older daemon's cached 200 as
 * execution/precharge authority.
 */
export interface WorkspaceBillingAuthoritativeRead {
  workspaceId: string;
  workspaceMemberId: string;
  observedAt: string;
}

/**
 * One exact workspace/member projection a renderer wants the daemon to keep
 * warm. Renderers replace their whole set atomically; the daemon owns
 * authorization, refresh, retries, upstream subscriptions, and expiry.
 */
export interface WorkspaceBillingInterestScope {
  workspaceId: string;
  workspaceMemberId: string;
}

/** PUT /api/workspace/billing/interests/:clientId request body. */
export interface WorkspaceBillingInterestRequest {
  /** Monotonic unsigned decimal scoped to this renderer-lifetime client id. */
  generation: string;
  /** Full replacement set, not a delta. */
  interests: WorkspaceBillingInterestScope[];
}

/** Successful interest declaration/renewal response. */
export interface WorkspaceBillingInterestResponse {
  clientId: string;
  acceptedGeneration: string;
  leaseExpiresAt: string;
}

/**
 * The caller's Vela account billing summary.
 *
 * `vela billing summary` remains account-scoped. The daemon must never turn it
 * into workspace data by copying a requested id onto the response.
 */
export interface WorkspaceBillingSummary {
  /**
   * Deprecated compatibility field. Account summaries are not workspace
   * identities, so this is always null. Use `workspaceBalance.workspaceId`.
   */
  workspaceId: null;
  /** Membership tier, e.g. `team` / `free`. */
  membershipTier: string;
  /** Total available credits (subscription + recharge), as a number. */
  totalAvailableCredits: number;
  /**
   * The subscription-grant bucket of the wallet (`bucket_type =
   * 'subscription_grant'` in B) — the credits the plan itself hands out.
   */
  subscriptionCredits: number;
  /**
   * The top-up bucket of the wallet (every non-subscription-grant bucket in B:
   * purchased recharges, workspace-sponsored grants, promotional credit).
   * Vela Web labels this 充值余额; the account menu surfaces it as 附加积分.
   *
   * `subscriptionCredits + rechargeCredits === totalAvailableCredits`.
   */
  rechargeCredits: number;
  /** Available balance in USD, as reported by vela (kept as a string to avoid
   *  float drift on money values). */
  balanceUsd: string;
  /** Subscription status, e.g. `active` / `canceled`. */
  subscriptionStatus: string;
  /** Actions the caller may take, e.g. `subscription_checkout` / `billing_portal`. */
  availableActions: string[];
  /**
   * Deprecated compatibility field. Workspace money now lives on
   * `WorkspaceBillingResponse.workspaceBalance` so an account-summary outage
   * cannot erase an independently proven workspace balance.
   */
  workspaceBalance: WorkspaceWalletBalance | null;
}

export interface WorkspaceBillingResponse {
  /** Account-scoped metadata; independently nullable from workspace money. */
  summary: WorkspaceBillingSummary | null;
  /**
   * One backend-proven explicit workspace wallet, or null for an account read /
   * failed workspace-wallet read. Never inferred from `summary`.
   */
  workspaceBalance: WorkspaceWalletBalance | null;
  /**
   * Additive v1 workspace snapshot. Absent/null means the installed Vela CLI
   * or backend does not expose the capability, so callers keep using the
   * legacy summary + workspaceBalance fields.
   */
  workspaceSnapshot?: WorkspaceBillingSnapshot | null;
  /**
   * Additive daemon-owned freshness metadata. Missing means the connected
   * daemon predates the runtime coordinator; values above remain authoritative.
   */
  workspaceRuntime?: WorkspaceBillingRuntimeState;
  /**
   * Present only for `freshness=authoritative` after a new projection was
   * observed for the exact workspace/member in this response.
   */
  authoritativeWorkspaceRead?: WorkspaceBillingAuthoritativeRead;
}

export type WorkspaceTeamBillingPlanId = 'team_plus' | 'team_pro' | 'team_max';

export interface WorkspaceTeamBillingPlan {
  planId: WorkspaceTeamBillingPlanId;
  seatUnitAmountCents: number;
  currency: 'usd';
  minSeats: number;
  status: 'active' | 'disabled';
}

/**
 * GET /api/workspace/billing/catalog. Compatibility/diagnostic shape for Vela
 * team subscription plans when A exposes them through the CLI. The local client
 * does not render pricing or own checkout; upgrade opens Vela Web and billing
 * state syncs back through `WorkspaceBillingSummary`.
 */
export interface WorkspaceBillingCatalog {
  workspaceId: string;
  billingInterval: 'monthly';
  plans: WorkspaceTeamBillingPlan[];
}

export interface WorkspaceBillingCatalogResponse {
  catalog: WorkspaceBillingCatalog | null;
}

/**
 * Compatibility request to start a team-subscription checkout via Vela CLI.
 * The current product surface links the user to Vela Web instead of rendering
 * an in-client plan picker.
 */
export interface WorkspaceBillingCheckoutRequest {
  planId?: WorkspaceTeamBillingPlanId;
  seats?: number;
}

/**
 * Result of starting a team-subscription checkout via the vela billing CLI 收口.
 * Kept as a compatibility contract; the primary C-line UI opens Vela Web.
 */
export interface WorkspaceBillingCheckoutResponse {
  checkoutUrl: string | null;
}

// ————————————————————————————————————————————————————————————————————————————
// Collab cloud (C-lane §D2.5 / §D4): cross-daemon comment sync + member directory
// ————————————————————————————————————————————————————————————————————————————
//
// A member's comment on a shared project must reach the OTHER members' daemons
// (chiefly the owner's), and members need a way to turn an opaque
// `ownerMemberId` / `authorMemberId` into a display name + role. The collab
// cloud is the light append-only relay + directory that carries both. Every
// daemon talks to it as a bearer client (auth in §D4.4); a local fixture stub
// stands in for the real vela `services/collab` until it ships.
//
// STUB SCOPE: the spec's identity source is B's token → {memberId, teamId,
// role} plus B's member roster. B does not yet expose names, so the directory
// entry carrying `displayName` (and `role`, redundantly with the token) is a
// C-lane stub supplement to B's missing roster — not a permanent contract.

/**
 * One member's public directory entry: the id → {name, role} mapping the client
 * needs to render "琼羽 · Owner" on a comment card and "这是 麻薯 创建的共享项目"
 * on the shared-project banner. Avatars are derived client-side from the name;
 * the directory carries no avatar.
 */
export interface CollabCloudMemberDirectoryEntry {
  memberId: string;
  displayName: string;
  role: CollabMemberRole;
}

/** PUT /teams/:teamId/members/:memberId request body. Idempotent upsert. */
export interface CollabCloudMemberRegisterRequest {
  displayName: string;
  role: CollabMemberRole;
}

/** PUT /teams/:teamId/members/:memberId response. */
export interface CollabCloudMemberRegisterResponse extends OkResponse {
  member: CollabCloudMemberDirectoryEntry;
}

/** GET /teams/:teamId/members and GET /api/workspace/members response. */
export interface CollabCloudMembersResponse {
  members: CollabCloudMemberDirectoryEntry[];
}

/**
 * The comment sync unit — a faithful serialization of the daemon's local
 * `preview_comments` row (see {@link PreviewComment}) so a pulled comment
 * reinserts locally without a parallel model. The anchoring payload
 * (`selector`/`label`/`position`/`htmlHint`/`selectionKind`/`podMembers`/
 * `slideIndex`) plus the drift-ladder fields (`anchorState`/`anchoredVersion`/
 * `lastGoodPosition`) ride along so a synced comment keeps pointing at the same
 * element on the receiver. The stream carries the comment's full lifecycle: a
 * create/edit is pushed with the current `updatedAt` (receivers apply the newest
 * by `updatedAt`), and a delete is pushed as a tombstone (`deleted: true`) that
 * removes the comment by `id` on every receiver.
 */
export interface CollabCloudComment {
  /**
   * The author daemon's local comment id — the GLOBAL dedup key. A receiver
   * merges idempotently by this id, so a member's own comment pulled back is a
   * no-op and re-pulls never double-insert.
   */
  id: string;
  projectId: string;
  /**
   * The author's local conversation id the comment was filed under.
   * Informational on the wire: a receiver re-homes the comment onto one of its
   * OWN local conversations for the project (conversation ids do not cross
   * daemons), so this is not used as a foreign key on merge.
   */
  conversationId: string;
  /**
   * The AUTHOR's workspaceMemberId — who WROTE this comment, not whoever is
   * currently viewing it. The client resolves it against the member directory
   * to render the author's name + role on the card. Mirrors
   * {@link PreviewComment.authorMemberId}.
   */
  memberId: string;
  /**
   * Cloud-assigned monotonic sequence within a project's comment stream — the
   * pull cursor. Clients ignore it on push (send 0); the cloud assigns the real
   * value and returns it.
   */
  seq: number;
  note: string;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  htmlHint: string;
  position: PreviewCommentPosition;
  style?: PreviewAnnotationStyle;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  slideIndex?: number;
  attachments?: PreviewCommentAttachment[];
  status: PreviewCommentStatus;
  /** Drift-ladder anchor state (see {@link PreviewCommentAnchorState}). */
  anchorState?: PreviewCommentAnchorState;
  /** Content version the comment was anchored to (drives the "based on older vN" badge). */
  anchoredVersion?: number;
  /** Last known-good bbox for the `lost` ghost pin. */
  lastGoodPosition?: PreviewCommentPosition;
  createdAt: number;
  updatedAt: number;
  /**
   * Tombstone marker. When `true`, this record is a delete: receivers remove the
   * comment with this `id` from their local store (delete wins regardless of
   * `updatedAt`). The remaining fields may be a best-effort snapshot of the
   * comment as it last existed and should not be re-materialized.
   */
  deleted?: boolean;
}

/** POST /teams/:teamId/projects/:projectId/comments request body. */
export interface CollabCloudCommentPushRequest {
  comment: CollabCloudComment;
}

/** POST /teams/:teamId/projects/:projectId/comments response. */
export interface CollabCloudCommentPushResponse extends OkResponse {
  /** The monotonic sequence the cloud assigned to the stored comment. */
  seq: number;
}

/**
 * GET /teams/:teamId/projects/:projectId/comments?sinceSeq=N response. Returns
 * only comments with `seq > sinceSeq`, ascending, plus the highest `seq` seen
 * (the caller's next cursor even when `comments` is empty).
 */
export interface CollabCloudCommentsResponse {
  comments: CollabCloudComment[];
  latestSeq: number;
}
