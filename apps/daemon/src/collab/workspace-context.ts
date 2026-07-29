import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
} from '@open-design/contracts';
import type {
  CollabMemberRole,
  WorkspaceBillingState,
  WorkspaceCollabContext,
  WorkspaceLifecycleState,
  WorkspaceMemberStatus,
  WorkspaceProviderMode,
  WorkspaceType,
} from '@open-design/contracts';

// The daemon's single B-integration point . Presence + sync need the
// caller's workspace identity (workspaceMemberId + role + lifecycle). In
// production this provider verifies the request's auth against the B service and
// returns B's CurrentWorkspaceContext for that user; until B is reachable, the
// dev provider below holds an in-memory context that a demo/tools-dev run can
// set. Swapping the provider is the only change when B ships — routes and the
// web client stay put.

export interface WorkspaceContextRequest {
  /** The caller's bearer token (a real provider verifies this against B). */
  authorization?: string | undefined;
}

export interface WorkspaceContextProvider {
  current(req: WorkspaceContextRequest): Promise<WorkspaceCollabContext | null>;
  /**
   * Dev/demo seam: override the returned context. Absent on a real B-backed
   * provider (whose context is derived per-request from the token).
   */
  set?(context: WorkspaceCollabContext | null): void;
  /**
   * Switch the ACCOUNT-LEVEL active workspace on the backend. B's 2026-07-16
   * deploy moved workspace selection server-side (`GET /workspaces/current`
   * ignores per-request workspace hints), so a local-only selection leaves
   * every follow-up read and CLI call scoped to the previous workspace —
   * which read back as 403 missing_principal on the collab plane. Providers
   * without a backend (dev) omit this. Resolves false when the backend
   * refused the switch.
   */
  selectWorkspace?(workspaceId: string): Promise<boolean>;
  /**
   * Synchronous read of the most recently resolved context — NO network I/O,
   * ever. Populated as a side effect of the ordinary `.current()` traffic this
   * provider already serves: the web client's `GET /api/workspace/context`
   * poll (every 15s) plus every other in-daemon `.current()` caller. Absent on
   * a bare provider; `withLastKnownWorkspaceContext` below adds it. A caller
   * that needs a same-request cross-check against real membership state — a
   * mutation gate that must not spend a fresh vela round-trip on every write —
   * reads this instead of awaiting `.current()`.
   */
  lastKnown?(): WorkspaceCollabContext | null;
  /**
   * Same cached identity plus a monotonic generation that advances whenever
   * an observed authorization identity changes, including A -> B -> A between
   * two callers' snapshots.
   */
  lastKnownSnapshot?(): {
    context: WorkspaceCollabContext | null;
    generation: number;
  };
}

/**
 * Wrap a provider so every `.current()` result is also remembered for a later
 * synchronous `.lastKnown()` read, with no extra network I/O of its own. This
 * is the ONLY sanctioned way to get a same-request read of "what does the
 * daemon actually believe about this workspace right now" — see
 * `collab/workspace-resource-mutation.ts`'s membership cross-check, which
 * refuses to trust a client's `x-od-workspace-member-status` header once the
 * daemon's own last-verified state says the caller has been removed.
 *
 * `lastKnown()` reflects whichever workspace the wrapped provider most
 * recently resolved — normally the account's one active workspace, since a
 * single daemon process serves a single signed-in user. It is deliberately
 * NOT scoped per-workspace-id: a caller must compare `lastKnown().workspaceId`
 * against the workspace it cares about and treat a mismatch as "no opinion",
 * exactly like a cache miss.
 *
 * Authorization generations have a narrower meaning than raw availability.
 * Vela maps both a transient timeout and a real signed-out response to `null`,
 * so treating every null as a new identity turns A -> transient null -> A into
 * a false workspace switch. The raw context still becomes null (and therefore
 * fails closed while unavailable), but generation advances only when a
 * non-null authoritative identity differs. A later successful A read restores
 * availability without fabricating drift. Dev/demo `set(null)` remains an
 * explicit authoritative clear and does advance the generation.
 */
export function withLastKnownWorkspaceContext(
  provider: WorkspaceContextProvider,
): WorkspaceContextProvider {
  let lastKnown: WorkspaceCollabContext | null = null;
  let lastIdentityKey: string | null | undefined;
  let generation = 0;
  const observe = (
    context: WorkspaceCollabContext | null,
    nullIsAuthoritative: boolean,
  ): void => {
    lastKnown = context;
    if (context === null && !nullIsAuthoritative) return;
    const identityKey = context
      ? JSON.stringify([
          context.workspaceId,
          context.teamId ?? context.workspaceId,
          context.workspaceMemberId,
          context.memberStatus,
          context.lifecycleState,
        ])
      : null;
    if (identityKey !== lastIdentityKey) {
      generation += 1;
      lastIdentityKey = identityKey;
    }
  };
  return {
    ...provider,
    async current(req: WorkspaceContextRequest): Promise<WorkspaceCollabContext | null> {
      const context = await provider.current(req);
      observe(context, false);
      return context;
    },
    // Dev/demo provider only (see `set?` above): a direct override is also a
    // same-process source of truth, so it should update the cache immediately
    // rather than waiting for the next `.current()` poll tick to catch up.
    ...(provider.set
      ? {
          set: (context: WorkspaceCollabContext | null) => {
            observe(context, true);
            provider.set!(context);
          },
        }
      : {}),
    lastKnown: () => lastKnown,
    lastKnownSnapshot: () => ({ context: lastKnown, generation }),
  };
}

const WORKSPACE_TYPES: ReadonlySet<WorkspaceType> = new Set(['personal', 'team']);
const ROLES: ReadonlySet<CollabMemberRole> = new Set(['owner', 'admin', 'member']);
const MEMBER_STATUSES: ReadonlySet<WorkspaceMemberStatus> = new Set(['active', 'removed']);
const LIFECYCLE_STATES: ReadonlySet<WorkspaceLifecycleState> = new Set([
  'active',
  'billing_past_due',
  'locked',
  'deleting',
  'deleted',
]);
const PROVIDER_MODES: ReadonlySet<WorkspaceProviderMode> = new Set([
  'platform_credits',
  'personal_byok',
]);
const BILLING_STATES: ReadonlySet<WorkspaceBillingState> = new Set([
  'free',
  'active',
  'past_due',
  'canceled',
  'inactive',
  'locked',
]);

/** Fallback billing state derived from lifecycle, used when a dev payload omits
 *  it. Production always carries B's authoritative `billingState`. */
function billingStateForLifecycle(lifecycle: WorkspaceLifecycleState): WorkspaceBillingState {
  switch (lifecycle) {
    case 'active':
      return 'active';
    case 'billing_past_due':
      return 'past_due';
    case 'locked':
      return 'locked';
    default:
      return 'inactive';
  }
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * The URL of the workspace settings/management console on the cloud web app.
 * Team actions (create, invite, members, billing) live there — the local client
 * only links out to them. Prefers an explicit value the upstream context carries;
 * otherwise builds one from `OD_VELA_WEB_URL` when configured. Undefined when
 * neither is available (the client then hides the settings entry).
 */
export function resolveWorkspaceSettingsUrl(
  workspaceId: string,
  explicit: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  // B's web console supports workspace deep links (?workspaceId=…): the target
  // page opens directly when it matches the account's Active Workspace, and
  // otherwise asks the user to confirm the switch — the confirmation IS the
  // explicit user action that may change B's Active Workspace (the client
  // itself never PUTs it). A bare /settings link would depend on whatever
  // workspace another device left active, so every console link pins the id.
  if (typeof explicit === 'string' && explicit.trim()) {
    return withWorkspaceDeepLink(explicit.trim(), workspaceId);
  }
  const base = env.OD_VELA_WEB_URL?.trim();
  if (!base) return undefined;
  return withWorkspaceDeepLink(`${base.replace(/\/$/, '')}/settings`, workspaceId);
}

function withWorkspaceDeepLink(url: string, workspaceId: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.get('workspaceId') && workspaceId.trim()) {
      parsed.searchParams.set('workspaceId', workspaceId.trim());
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Validate an untrusted workspace-context payload (dev PUT body / env). Returns
 * the typed context or null if any required enum field is missing or out of enum.
 * Permissions and the seat summary are DERIVED through the contract helpers
 * (B's `buildWorkspacePermissions`/`buildWorkspaceSeatSummary` mirror) so a dev
 * payload only needs role + lifecycle + seat counts; the real B proxy passes
 * B's already-derived values straight through.
 */
export function parseWorkspaceCollabContext(input: unknown): WorkspaceCollabContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const workspaceMemberId = typeof raw.workspaceMemberId === 'string' ? raw.workspaceMemberId.trim() : '';
  if (!workspaceMemberId) return null;
  if (!WORKSPACE_TYPES.has(raw.workspaceType as WorkspaceType)) return null;
  if (!ROLES.has(raw.role as CollabMemberRole)) return null;
  if (!MEMBER_STATUSES.has(raw.memberStatus as WorkspaceMemberStatus)) return null;
  if (!LIFECYCLE_STATES.has(raw.lifecycleState as WorkspaceLifecycleState)) return null;

  const workspaceType = raw.workspaceType as WorkspaceType;
  const role = raw.role as CollabMemberRole;
  const memberStatus = raw.memberStatus as WorkspaceMemberStatus;
  const lifecycleState = raw.lifecycleState as WorkspaceLifecycleState;
  const teamId = typeof raw.teamId === 'string' && raw.teamId.trim() ? raw.teamId.trim() : undefined;
  const workspaceId =
    typeof raw.workspaceId === 'string' && raw.workspaceId.trim()
      ? raw.workspaceId.trim()
      : (teamId ?? workspaceMemberId);
  const providerMode = PROVIDER_MODES.has(raw.providerMode as WorkspaceProviderMode)
    ? (raw.providerMode as WorkspaceProviderMode)
    : 'platform_credits';
  const billingState = BILLING_STATES.has(raw.billingState as WorkspaceBillingState)
    ? (raw.billingState as WorkspaceBillingState)
    : billingStateForLifecycle(lifecycleState);
  const planId = typeof raw.planId === 'string' && raw.planId.trim() ? raw.planId.trim() : null;
  const seatLimit = nonNegativeInt(raw.seatLimit, workspaceType === 'team' ? 5 : 1);
  const usedSeats = nonNegativeInt(raw.usedSeats, 1);

  const context: WorkspaceCollabContext = {
    workspaceId,
    workspaceType,
    workspaceMemberId,
    role,
    memberStatus,
    lifecycleState,
    billingState,
    planId,
    providerMode,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit, usedSeats }),
    permissions: buildWorkspacePermissions({ role, lifecycleState, memberStatus }),
  };
  if (teamId) {
    context.teamId = teamId;
  } else if (workspaceType === 'team') {
    // Invariant (matches the vela provider): a team context always carries
    // teamId — the workspace IS the team scope. Collab gates on `teamId`, so
    // a dev PUT that omits it must not silently disable the collab plane.
    context.teamId = workspaceId;
  }
  const settingsUrl = resolveWorkspaceSettingsUrl(workspaceId, raw.workspaceSettingsUrl);
  if (settingsUrl) context.workspaceSettingsUrl = settingsUrl;
  if (typeof raw.teamName === 'string' && raw.teamName.trim()) {
    context.teamName = raw.teamName.trim();
  }
  // Any workspace type may carry a name here — the dev/demo lane must be able
  // to drive a personal workspace's label the same way B does.
  if (typeof raw.workspaceName === 'string' && raw.workspaceName.trim()) {
    context.workspaceName = raw.workspaceName.trim();
  }
  if (typeof raw.displayName === 'string' && raw.displayName.trim()) {
    context.displayName = raw.displayName.trim();
  }
  if (typeof raw.lastActiveWorkspaceId === 'string' && raw.lastActiveWorkspaceId.trim()) {
    context.lastActiveWorkspaceId = raw.lastActiveWorkspaceId.trim();
  }
  return context;
}

/**
 * Dev/demo provider: holds a single in-memory context, optionally seeded from
 * `OD_DEV_WORKSPACE_CONTEXT` (JSON). Ignores the request — a real B-backed
 * provider derives the context per-caller from the token instead.
 */
export function createDevWorkspaceContextProvider(
  seed?: WorkspaceCollabContext | null,
): WorkspaceContextProvider {
  let context: WorkspaceCollabContext | null = seed ?? readEnvContext();
  return {
    current: () => Promise.resolve(context),
    set: (next) => {
      context = next;
    },
  };
}

function readEnvContext(): WorkspaceCollabContext | null {
  const raw = process.env.OD_DEV_WORKSPACE_CONTEXT;
  if (!raw) return null;
  try {
    return parseWorkspaceCollabContext(JSON.parse(raw));
  } catch {
    return null;
  }
}
