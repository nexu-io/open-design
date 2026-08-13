import type { WorkspaceDirectoryItem } from '@open-design/contracts';

/**
 * Choosing a membership out of an already-fetched Workspace directory.
 *
 * Every caller that has an account but no explicit `x-od-workspace-*` header
 * has to answer the same question — which membership am I acting as? — and the
 * answer has to be identical everywhere, or the MCP bridge, the UI and the run
 * gate disagree about which Workspace a project belongs to.
 *
 * This lived as a closure-local `selectDefaultCandidate` in
 * vela-workspace-context.ts, so the MCP bridge could not reach it and shipped a
 * commented "verbatim port" instead. Two copies kept in sync by hand is one
 * edit away from divergence; the rule lives here now and both call it.
 */

/** Memberships that are usable at all — the precondition for every rule below. */
export function activeWorkspaceCandidates(
  items: WorkspaceDirectoryItem[],
): WorkspaceDirectoryItem[] {
  return items.filter(
    (item) => item.memberStatus === 'active' && item.lifecycleState === 'active',
  );
}

/**
 * The default membership to act as: the preferred one when it is still active,
 * else the personal Workspace, else any active membership.
 *
 * The trailing "any" is what makes this a *default* rather than a decision. It
 * is right for presenting a starting point the user can change, and wrong for
 * anything that silently writes a durable binding — see `selectPersonalWorkspace`.
 */
export function selectDefaultWorkspaceCandidate(
  items: WorkspaceDirectoryItem[],
  preferredId?: string,
): WorkspaceDirectoryItem | undefined {
  const candidates = activeWorkspaceCandidates(items);
  return (
    (preferredId
      ? candidates.find((item) => item.workspaceId === preferredId)
      : undefined) ??
    candidates.find((item) => item.workspaceType === 'personal') ??
    candidates[0]
  );
}

/**
 * The account's personal Workspace, or nothing.
 *
 * Deliberately not a "default": a caller adopting an unbound project needs the
 * one Workspace that is unambiguously the account's own. Falling back to an
 * arbitrary active membership would silently bind someone's project into a
 * team. No personal membership means the caller must be told, not guessed for.
 */
export function selectPersonalWorkspace(
  items: WorkspaceDirectoryItem[],
): WorkspaceDirectoryItem | undefined {
  const personal = activeWorkspaceCandidates(items).filter(
    (item) => item.workspaceType === 'personal',
  );
  // More than one personal Workspace is not a shape the account model produces.
  // If it ever appears, it is ambiguity, and guessing would bind the wrong one.
  return personal.length === 1 ? personal[0] : undefined;
}
