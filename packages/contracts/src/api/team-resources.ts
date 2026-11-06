import type { ApiErrorCode } from '../errors.js';

// Team-edition resource foundation (地基 — owned by the C/the orchestrator summary lane, per
// the foundation contract). The copy red-line guard is a pure invariant every
// lane calls (D, E, and our own extension surfaces) at each "copy a team
// resource into a personal, editable copy" route. AC-9: a downgraded team must
// not be able to escape the freeze by copying resources out.
//
// Pure TypeScript, dependency-free — safe to import from daemon, web, and CLI.

/**
 * Lifecycle state of a team resource (design system / plugin / skill).
 * Canonical enum (replaces the earlier `downgraded_personal` / `team-shared`
 * wording): `frozen` is set when the owning team is downgraded; the bytes are
 * untouched and `active` is restored on renewal.
 */
export type TeamResourceState = 'active' | 'frozen' | 'deleted';

/** The resource a copy-out route is about to duplicate into a personal copy. */
export interface TeamResourceCopyTarget {
  /** Personal resources copy freely; the red-line only applies to team resources. */
  scope: 'personal' | 'team';
  /** Lifecycle state — consulted only for team-scoped resources. */
  state?: TeamResourceState;
}

export interface TeamResourceCopyDecision {
  allowed: boolean;
  /** The API error code to surface when `allowed` is false. */
  code?: Extract<ApiErrorCode, 'WORKSPACE_RESOURCE_FROZEN' | 'WORKSPACE_RESOURCE_DELETED'>;
  reason?: string;
}

/**
 * Pure decision: may this resource be copied into a personal, editable copy?
 * Personal resources → always. Team resources → only while `active`; a `frozen`
 * or `deleted` team resource is blocked (the AC-9 red-line).
 */
export function evaluateTeamResourceCopy(resource: TeamResourceCopyTarget): TeamResourceCopyDecision {
  if (resource.scope !== 'team') return { allowed: true };
  if (resource.state === 'frozen') {
    return {
      allowed: false,
      code: 'WORKSPACE_RESOURCE_FROZEN',
      reason: 'This team resource is frozen and cannot be copied to a personal copy.',
    };
  }
  if (resource.state === 'deleted') {
    return {
      allowed: false,
      code: 'WORKSPACE_RESOURCE_DELETED',
      reason: 'This team resource has been deleted and cannot be copied.',
    };
  }
  return { allowed: true };
}

/** Error thrown by {@link assertTeamResourceCopyAllowed}; carries the API code. */
export class TeamResourceCopyForbiddenError extends Error {
  readonly code: Extract<ApiErrorCode, 'WORKSPACE_RESOURCE_FROZEN' | 'WORKSPACE_RESOURCE_DELETED'>;
  constructor(decision: TeamResourceCopyDecision & { allowed: false }) {
    super(decision.reason ?? decision.code ?? 'team resource copy forbidden');
    this.name = 'TeamResourceCopyForbiddenError';
    this.code = decision.code ?? 'WORKSPACE_RESOURCE_FROZEN';
  }
}

/**
 * The named invariant callers mount at every copy-out route (design-system
 * install/import/create/copy, plugin duplicate-project, skill edit-shadow, …).
 * Throws {@link TeamResourceCopyForbiddenError} — which the daemon maps to a 403
 * with the carried code — when the copy is not allowed. Must live at the route
 * layer, not just the UI: a CLI or external agent bypasses UI graying.
 */
export function assertTeamResourceCopyAllowed(resource: TeamResourceCopyTarget): void {
  const decision = evaluateTeamResourceCopy(resource);
  if (!decision.allowed) {
    throw new TeamResourceCopyForbiddenError(decision as TeamResourceCopyDecision & { allowed: false });
  }
}
