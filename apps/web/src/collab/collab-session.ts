import type {
  CollabPresenceMember,
  WorkspaceCollabContext,
  WorkspaceLifecycleState,
} from '@open-design/contracts';

// The collaboration surface seam onto the B (workspace) + D (visibility) lanes. B owns the
// CurrentWorkspaceContext (identity token → workspaceMemberId + role + lifecycle);
// the visibility surface owns whether a workspace/project is shared. Collab
// (presence + sync) runs for any active live workspace, including a personal
// workspace that can later invite seats. The context shape is the shared
// contract DTO (a faithful subset of B's context), so wiring
// B's real context in is a direct field pass-through.

export type { WorkspaceCollabContext };

export interface CollabSessionDecision {
  /** Whether to start the presence heartbeat + sync poll. */
  enabled: boolean;
  /** Diagnostic reason when disabled (never user-facing copy). */
  reason: string;
  /** The presence identity, when enabled. */
  member: CollabPresenceMember | null;
}

// Lifecycle states in which the workspace is still functional enough to
// collaborate. `locked` (frozen after expiry) / `deleting` / `deleted` are not.
const LIVE_LIFECYCLE: ReadonlySet<WorkspaceLifecycleState> = new Set([
  'active',
  'billing_past_due',
]);

/**
 * Decide whether collab should run for the current workspace context, and who
 * the present member is. Gating (in order):
 * - no context → off
 * - removed member → off
 * - frozen/deleting/deleted lifecycle → off
 * - otherwise → on, identity from workspaceMemberId
 */
export function resolveCollabSession(ctx: WorkspaceCollabContext | null): CollabSessionDecision {
  if (!ctx) return { enabled: false, reason: 'no-workspace-context', member: null };
  if (ctx.memberStatus !== 'active') {
    return { enabled: false, reason: 'member-removed', member: null };
  }
  if (!LIVE_LIFECYCLE.has(ctx.lifecycleState)) {
    return { enabled: false, reason: `lifecycle-${ctx.lifecycleState}`, member: null };
  }
  const member: CollabPresenceMember = { memberId: ctx.workspaceMemberId, role: ctx.role };
  if (ctx.displayName && ctx.displayName.trim()) member.name = ctx.displayName.trim();
  return { enabled: true, reason: 'ok', member };
}
