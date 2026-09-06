import { afterEach, describe, expect, it } from 'vitest';
import { teamConsoleUrl, workspaceUpgradeUrl } from '../../src/components/EntryNavRail';
import { setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';

// Stand-in for an internal deployment's console origin — the real hostnames are
// injected at build time and reported by the daemon, never literals in source.
const RUNTIME_CONSOLE_ORIGIN = 'https://vela.example.invalid';

/**
 * Where 升级 lands on the prod profile since spec T54 (product 2026-09-06):
 * the console's own plan surface, not public Pricing. These expectations used
 * to read the public Pricing URL — that was #7122's Go-launch routing, and
 * the ruling put the upgrade entries back on the console.
 */
const PROD_CONSOLE_PLAN_URL =
  'https://open-design.ai/amr/dashboard?source=open_design&billing=plan';

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

  it('sends a personal workspace to the console plan surface', () => {
    const context: WorkspaceCollabContext = {
      ...baseContext,
      workspaceType: 'personal',
    };
    expect(workspaceUpgradeUrl(context, null)).toBe(PROD_CONSOLE_PLAN_URL);
  });

  it('sends a never-subscribed team to the console plan surface', () => {
    expect(workspaceUpgradeUrl(baseContext, null)).toBe(PROD_CONSOLE_PLAN_URL);
    expect(workspaceUpgradeUrl(baseContext, billingSummary(''))).toBe(
      PROD_CONSOLE_PLAN_URL,
    );
  });

  it('sends an already-subscribed team to the console plan surface', () => {
    expect(
      workspaceUpgradeUrl({ ...baseContext, planId: 'team_pro', billingState: 'active' }, null),
    ).toBe(PROD_CONSOLE_PLAN_URL);
    expect(workspaceUpgradeUrl(baseContext, billingSummary('team_pro'))).toBe(
      PROD_CONSOLE_PLAN_URL,
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
    expect(workspaceUpgradeUrl(context, null)).toBe(PROD_CONSOLE_PLAN_URL);
    expect(workspaceUpgradeUrl(null, null)).toBeNull();
  });

  // The fallback path is where T54's profile-awareness actually shows: with no
  // workspace identity to authorize yet, the caller's profile is the ONLY thing
  // choosing the origin. While this returned a hardcoded Pricing URL a
  // feature-test build linked production checkout.
  it('follows the caller profile for CTA callers that must always link somewhere', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(workspaceUpgradeUrl(null, null, { fallbackProfile: 'feature-test' })).toBe(
      `${RUNTIME_CONSOLE_ORIGIN}/dashboard?source=open_design&billing=plan`,
    );
    expect(workspaceUpgradeUrl(null, null, { fallbackProfile: 'prod' })).toBe(
      PROD_CONSOLE_PLAN_URL,
    );
  });
});
