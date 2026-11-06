import { describe, expect, it } from 'vitest';
import { resolveCollabSession, type WorkspaceCollabContext } from '../src/collab/collab-session';

function ctx(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team',
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
    displayName: 'Ma Shu',
    ...overrides,
  };
}

describe('resolveCollabSession', () => {
  it('enables collab for an active member of a live team workspace', () => {
    const decision = resolveCollabSession(ctx());
    expect(decision.enabled).toBe(true);
    expect(decision.member).toEqual({ memberId: 'wm-1', role: 'member', name: 'Ma Shu' });
  });

  it('still runs during a billing grace period (past_due)', () => {
    expect(resolveCollabSession(ctx({ lifecycleState: 'billing_past_due' })).enabled).toBe(true);
  });

  it('is off with no workspace context', () => {
    const decision = resolveCollabSession(null);
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe('no-workspace-context');
    expect(decision.member).toBeNull();
  });

  it('enables collab for a personal workspace that can later invite seats', () => {
    const decision = resolveCollabSession(ctx({ workspaceType: 'personal' }));
    expect(decision.enabled).toBe(true);
    expect(decision.reason).toBe('ok');
  });

  it('is off for a removed member', () => {
    expect(resolveCollabSession(ctx({ memberStatus: 'removed' })).reason).toBe('member-removed');
  });

  it.each(['locked', 'deleting', 'deleted'] as const)(
    'is off when the workspace lifecycle is %s (frozen/gone)',
    (lifecycleState) => {
      const decision = resolveCollabSession(ctx({ lifecycleState }));
      expect(decision.enabled).toBe(false);
      expect(decision.reason).toBe(`lifecycle-${lifecycleState}`);
    },
  );

  it('falls back to the member id when there is no display name', () => {
    const decision = resolveCollabSession(ctx({ displayName: '   ' }));
    expect(decision.member).toEqual({ memberId: 'wm-1', role: 'member' });
  });
});
