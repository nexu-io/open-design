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

/** POST /api/projects/:id/presence/heartbeat request body. */
export interface CollabPresenceHeartbeatRequest {
  memberId: string;
  name?: string;
  role?: CollabMemberRole;
  clientId?: string;
  filePath?: string | null;
  activity?: string | { label?: string } | Record<string, unknown> | null;
}

/** POST /api/projects/:id/presence/leave request body. */
export interface CollabPresenceLeaveRequest {
  memberId: string;
  clientId?: string;
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

/** Billing-recovery entry (locked/past-due). Mirrors B's `WorkspaceBillingRecovery`. */
export interface WorkspaceBillingRecovery {
  canEnterBillingRecovery: boolean;
  recoveryUrl: string | null;
}

/**
 * The one shared workspace context every team surface consumes. A faithful mirror
 * of B's `CurrentWorkspaceContext` (vela packages/shared/src/workspace-context.ts,
 * shipped in powerformer/vela#615) so the daemon's `/api/workspace/context` proxy
 * is a straight field pass-through and no C surface re-derives role/plan/permission
 * judgements. `context` is null off-team (personal, signed out, or B unavailable).
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
  /** Display name for the presence overlay (optional; falls back to the id). */
  displayName?: string;
}

/**
 * GET /api/workspace/context. The daemon's single B-integration point: in
 * production it proxies B's context for the caller; `context` is null when there
 * is no team-workspace context (personal, signed out, or B unavailable).
 */
export interface WorkspaceContextResponse {
  context: WorkspaceCollabContext | null;
}

// —— Derivation helpers — a verbatim mirror of B's vela
// packages/shared/src/workspace-context.ts. Both the daemon's dev context stub
// and the real B proxy derive permissions/seat summary through these, so C never
// drifts from B's authorization rules. If B's helper changes, update here too.

export function isWorkspaceLifecycleReadable(state: WorkspaceLifecycleState): boolean {
  return state !== 'deleted';
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

/**
 * A caller's Vela billing summary (A-lane data), surfaced through the vela CLI
 * 收口 (`vela billing summary --format json`) so the client can show real
 * credits + plan tier instead of a placeholder. `null` when the CLI or the
 * signed-in billing session is unavailable — the client falls back to the
 * plan-tier hint it already has from the workspace context.
 */
export interface WorkspaceBillingSummary {
  /** Membership tier, e.g. `team` / `free`. */
  membershipTier: string;
  /** Total available credits (subscription + recharge), as a number. */
  totalAvailableCredits: number;
  /** Available balance in USD, as reported by vela (kept as a string to avoid
   *  float drift on money values). */
  balanceUsd: string;
  /** Subscription status, e.g. `active` / `canceled`. */
  subscriptionStatus: string;
  /** Actions the caller may take, e.g. `subscription_checkout` / `billing_portal`. */
  availableActions: string[];
}

export interface WorkspaceBillingResponse {
  summary: WorkspaceBillingSummary | null;
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
