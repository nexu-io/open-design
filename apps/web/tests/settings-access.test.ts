import { describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type CollabMemberRole,
  type WorkspaceCollabContext,
  type WorkspaceLifecycleState,
} from '@open-design/contracts';
import {
  canShowWorkspaceSettings,
  isWorkspaceSettingsEntryWriteAction,
  visibleWorkspaceSettingsEntries,
} from '../src/collab/settings-access';

// The Settings shell gates the Workspace region on the folded permission bits
// (never a role re-derivation), so these tests build a real context via the
// contract's `buildWorkspacePermissions` — the same fold B ships — and assert on
// what the shell shows. If B's fold changes, these move with it by construction.
function teamContext(opts: {
  role: CollabMemberRole;
  lifecycleState?: WorkspaceLifecycleState;
  teamId?: string | null;
  workspaceType?: 'team' | 'personal';
}): WorkspaceCollabContext {
  const lifecycleState = opts.lifecycleState ?? 'active';
  const teamId = opts.teamId === undefined ? 'team-1' : opts.teamId;
  return {
    workspaceId: 'ws-1',
    workspaceType: opts.workspaceType ?? 'team',
    workspaceMemberId: 'm-1',
    role: opts.role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: 'team',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: opts.role, lifecycleState }),
    ...(teamId ? { teamId } : {}),
  };
}

describe('workspace settings shell gating (D4.3)', () => {
  it('shows the region for any active team member (read-level bit)', () => {
    expect(canShowWorkspaceSettings(teamContext({ role: 'owner' }))).toBe(true);
    expect(canShowWorkspaceSettings(teamContext({ role: 'member' }))).toBe(true);
  });

  it('shows the region for a personal workspace but hides it without context', () => {
    expect(canShowWorkspaceSettings(teamContext({ role: 'owner', workspaceType: 'personal' }))).toBe(true);
    expect(canShowWorkspaceSettings(null)).toBe(false);
    expect(canShowWorkspaceSettings(undefined)).toBe(false);
  });

  it('shows every entry to an owner', () => {
    expect(visibleWorkspaceSettingsEntries(teamContext({ role: 'owner' }))).toEqual([
      'members',
      'billing',
      'autoRecharge',
      'teamSpace',
    ]);
  });

  it('hides billing + auto-recharge from an admin (owner-only) but keeps members + team space', () => {
    expect(visibleWorkspaceSettingsEntries(teamContext({ role: 'admin' }))).toEqual([
      'members',
      'teamSpace',
    ]);
  });

  it('shows a plain member only the team space entry', () => {
    expect(visibleWorkspaceSettingsEntries(teamContext({ role: 'member' }))).toEqual(['teamSpace']);
    expect(visibleWorkspaceSettingsEntries(teamContext({ role: 'member', teamId: null }))).toEqual([]);
  });

  it('drops write entries when locked but keeps billing (recovery) + team space visible', () => {
    const locked = teamContext({ role: 'owner', lifecycleState: 'locked' });
    expect(canShowWorkspaceSettings(locked)).toBe(true);
    expect(visibleWorkspaceSettingsEntries(locked)).toEqual(['billing', 'teamSpace']);
  });

  it('marks every entry except billing as a write action (greyed when not writable)', () => {
    expect(isWorkspaceSettingsEntryWriteAction('members')).toBe(true);
    expect(isWorkspaceSettingsEntryWriteAction('autoRecharge')).toBe(true);
    expect(isWorkspaceSettingsEntryWriteAction('teamSpace')).toBe(true);
    expect(isWorkspaceSettingsEntryWriteAction('billing')).toBe(false);
  });
});
