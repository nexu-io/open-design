import type { WorkspaceCollabContext } from '@open-design/contracts';

// Settings shell role gating (E-frontend, D4.3). The base SettingsDialog renders
// every personal section unconditionally; this is the new layer that decides
// which *workspace* entries the Settings shell shows. E (our lane) owns ONLY the
// shell-level visibility + the entry points — the destinations themselves belong
// to their lanes: members = B, billing/auto-recharge = A, team space = D. Personal
// settings are always shown and are not modeled here.
//
// Gating reads the folded permission bits on `WorkspaceCollabContext.permissions`
// DIRECTLY (never re-derived from role/lifecycle here) so this shell can never
// drift from B's authorization rules — the contract already folds role + member
// status + lifecycle into each bit. See `packages/contracts/src/api/collab.ts`.
//
// Note (D4.3): there is no team-level BYOK/provider this cycle, so "member can't
// edit the workspace provider" has no object — BYOK/provider stays personal and
// lives in the untouched personal sections. The entries that actually need gating
// are these other-lane workspace destinations.

export type WorkspaceSettingsEntryId = 'members' | 'billing' | 'autoRecharge' | 'teamSpace';

export const WORKSPACE_SETTINGS_ENTRY_IDS: readonly WorkspaceSettingsEntryId[] = [
  'members',
  'billing',
  'autoRecharge',
  'teamSpace',
];

/**
 * Whether the Settings shell shows the Workspace region at all. True for any
 * workspace whose viewer may see workspace settings (`canViewWorkspaceSettings`
 * — a read-level bit, so it stays true when the workspace is locked). Signed
 * out / B-unavailable → no Workspace region.
 */
export function canShowWorkspaceSettings(
  context: WorkspaceCollabContext | null | undefined,
): boolean {
  return Boolean(
    context &&
      context.permissions.canViewWorkspaceSettings,
  );
}

/**
 * Whether a single Workspace entry is visible, gating on the folded permission
 * bits directly. Membership shows for members who can manage or invite; billing
 * and auto-recharge for the billing owner; team space whenever the workspace has
 * a team id (D provides the destination). Never re-derive from role here.
 */
export function isWorkspaceSettingsEntryVisible(
  context: WorkspaceCollabContext,
  entry: WorkspaceSettingsEntryId,
): boolean {
  const p = context.permissions;
  switch (entry) {
    case 'members':
      return p.canManageMembers || p.canInviteMembers;
    case 'billing':
      return p.canManageBilling;
    case 'autoRecharge':
      return p.canManageAutoRecharge;
    case 'teamSpace':
      return Boolean(context.teamId);
  }
}

/** The workspace entries the shell renders, in canonical order. */
export function visibleWorkspaceSettingsEntries(
  context: WorkspaceCollabContext,
): WorkspaceSettingsEntryId[] {
  return WORKSPACE_SETTINGS_ENTRY_IDS.filter((entry) =>
    isWorkspaceSettingsEntryVisible(context, entry),
  );
}

/**
 * Whether opening an entry is a write-shaped action, so the shell can grey it out
 * when the workspace is not writable (locked / past-due) — mirroring how the nav
 * shell disables its write affordances while a locked banner explains why. Billing
 * stays enabled while non-writable so the owner can still reach recovery.
 */
export function isWorkspaceSettingsEntryWriteAction(entry: WorkspaceSettingsEntryId): boolean {
  return entry !== 'billing';
}
