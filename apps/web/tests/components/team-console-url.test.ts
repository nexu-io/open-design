import { afterEach, describe, expect, it } from 'vitest';
import { teamConsoleUrl, workspaceUpgradeUrl } from '../../src/components/EntryNavRail';
import {
  OPEN_DESIGN_PRICING_URL,
  setRuntimeAmrConsoleOrigin,
} from '../../src/runtime/amr-guidance';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';

// Stand-in for an internal deployment's console origin — the real hostnames are
// injected at build time and reported by the daemon, never literals in source.
const RUNTIME_CONSOLE_ORIGIN = 'https://vela.example.invalid';

afterEach(() => {
  setRuntimeAmrConsoleOrigin(null);
});

// The context's settings URL carries B's ?workspaceId deep-link param; section
// derivation must land on B's REAL console routes (members live at /team, the
// billing entry is the dashboard) and keep the pinned workspace param.
describe('teamConsoleUrl', () => {
  const base = 'https://web.example/settings?workspaceId=ws-1';

  it('maps sections onto the real console routes, keeping the deep-link param', () => {
    expect(teamConsoleUrl(base, 'members')).toBe('https://web.example/team?workspaceId=ws-1');
    expect(teamConsoleUrl(base, 'dashboard')).toBe(
      'https://web.example/dashboard?workspaceId=ws-1',
    );
    expect(teamConsoleUrl(base, 'settings')).toBe(
      'https://web.example/settings?workspaceId=ws-1',
    );
  });

  // Product decision: the console has no wallet page in its information
  // architecture any more. The team 「额度」 row opens the console dashboard,
  // which is where balance, top-up and the auto-recharge policy now report
  // (vela #1055 rehomed them off the wallet route).
  it('sends the team billing row to the console dashboard, not a wallet page', () => {
    expect(teamConsoleUrl(base, 'billing')).toBe('https://web.example/dashboard?workspaceId=ws-1');
  });

  // recvq725Kx0rM4 / recvqfXzHtY5wg: B's create-workspace dialog opens from a
  // `?workspace=create` deep link (vela `sidebar-actions.tsx`, PR #905 /
  // commit 501c0069, live on the `feat/workspace-team` branch the
  // feature-test deployment serves). A prior fix removed this param on the
  // premise that B's route source had no handler for it — true of the repo
  // checkout that fix read at the time, but stale once B shipped the handler.
  it('deep-links create-team into the create-workspace dialog', () => {
    expect(teamConsoleUrl(base, 'create-team')).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&workspace=create',
    );
  });

  it('falls back to the raw URL when it cannot be parsed', () => {
    expect(teamConsoleUrl('not-a-url', 'members')).toBe('not-a-url');
  });
});

// recvpYEiH019cD (failed acceptance round): B returns `workspaceSettingsUrl`
// for a PERSONAL workspace too, so "console URL present" must never be the
// team/personal axis — `workspaceType` is. One helper decides for all five
// upgrade entry points (EntryNavRail credits chip + invite dialog,
// AmrBalanceDialog, RecentProjectsStrip invite dialog, SettingsDialog AMR
// cards), so the three states cannot drift apart per entry point.
describe('workspaceUpgradeUrl', () => {
  const settingsUrl = 'https://web.example/settings?workspaceId=ws-1';
  const baseContext: WorkspaceCollabContext = {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'member-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'free',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
    permissions: {
      canManageBilling: true,
      canManageMembers: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
    workspaceSettingsUrl: settingsUrl,
  };
  const billingSummary = (membershipTier: string): WorkspaceBillingSummary => ({
    workspaceId: null,
    membershipTier,
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '0.00',
    subscriptionStatus: membershipTier ? 'active' : 'none',
    availableActions: [],
    workspaceBalance: null,
  });

  it('sends a personal workspace to public Pricing', () => {
    const context: WorkspaceCollabContext = {
      ...baseContext,
      workspaceType: 'personal',
    };
    expect(workspaceUpgradeUrl(context, null)).toBe(OPEN_DESIGN_PRICING_URL);
  });

  it('sends a never-subscribed team to public Pricing', () => {
    expect(workspaceUpgradeUrl(baseContext, null)).toBe(OPEN_DESIGN_PRICING_URL);
    expect(workspaceUpgradeUrl(baseContext, billingSummary(''))).toBe(
      OPEN_DESIGN_PRICING_URL,
    );
  });

  it('sends an already-subscribed team to public Pricing', () => {
    expect(
      workspaceUpgradeUrl({ ...baseContext, planId: 'team_pro', billingState: 'active' }, null),
    ).toBe(OPEN_DESIGN_PRICING_URL);
    expect(workspaceUpgradeUrl(baseContext, billingSummary('team_pro'))).toBe(
      OPEN_DESIGN_PRICING_URL,
    );
  });

  it.each(['admin', 'member'] as const)(
    'fails closed for a %s without workspace billing permission',
    (role) => {
      const context: WorkspaceCollabContext = {
        ...baseContext,
        role,
        permissions: {
          ...baseContext.permissions,
          canManageBilling: false,
        },
      };

      expect(workspaceUpgradeUrl(context, billingSummary('team_pro'))).toBeNull();
      expect(
        workspaceUpgradeUrl(context, billingSummary('team_pro'), {
          fallbackProfile: 'feature-test',
        }),
      ).toBeNull();
    },
  );

  it('does not require a console URL when workspace ownership is known', () => {
    const context: WorkspaceCollabContext = { ...baseContext };
    delete context.workspaceSettingsUrl;
    expect(workspaceUpgradeUrl(context, null)).toBe(OPEN_DESIGN_PRICING_URL);
    expect(workspaceUpgradeUrl(null, null)).toBeNull();
  });

  it('falls back to Pricing for CTA callers that must always link somewhere', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(workspaceUpgradeUrl(null, null, { fallbackProfile: 'feature-test' })).toBe(
      OPEN_DESIGN_PRICING_URL,
    );
  });
});
