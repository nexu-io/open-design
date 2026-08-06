import { afterEach, describe, expect, it } from 'vitest';
import { teamConsoleUrl, workspaceUpgradeUrl } from '../../src/components/EntryNavRail';
import { setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';
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

  // "Upgrade" must land ON a subscription dialog, not on a billing page where
  // the user has to hunt for it. B gates the FIRST-checkout dialog and the
  // change-PLAN dialog on mutually exclusive subscription states
  // (team-dashboard.tsx: `canUpgradeTeam` needs billingState in
  // free/inactive/locked, `ownerBillingActionsAvailable` needs 'active') — so
  // the caller's `hasActivePlan` picks which one actually matches. Default
  // (no options / `hasActivePlan: false`) keeps the never-subscribed-yet
  // behavior so existing callers that have not been taught about the split
  // keep landing on the FIRST-checkout dialog, same as before this test grew
  // the `hasActivePlan` branch.
  it('deep-links upgrade straight into the first-checkout dialog when the team has never subscribed', () => {
    expect(teamConsoleUrl(base, 'upgrade')).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=checkout',
    );
    expect(teamConsoleUrl(base, 'upgrade', { hasActivePlan: false })).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=checkout',
    );
  });

  // recvpYEiH019cD / recvpSQKna0LwR: `billing=checkout` silently opens no
  // dialog for a team that already has an active plan (confirmed live —
  // an already-subscribed "Team Pro" workspace landed on the bare Overview
  // page). `billing=plan` is B's change-plan deep link for that state.
  it('deep-links upgrade into the change-plan dialog when the team already has an active plan', () => {
    expect(teamConsoleUrl(base, 'upgrade', { hasActivePlan: true })).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=plan',
    );
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

  // The personal upgrade path is the console dashboard with B's plan modal
  // auto-opened. `billing=plan` is B's ONE state-aware upgrade intent: its
  // dashboard resolves it against the workspace's real subscription state, so
  // a personal owner gets the personal plan modal (the same one the console's
  // own 「升级订阅」 hero button opens) while a team owner gets checkout or
  // change-plan — this client no longer has to guess which dialog to request,
  // and a wrong guess can no longer silently open nothing (recvpSQKna0LwR).
  it('deep-links plans into the console plan modal', () => {
    expect(teamConsoleUrl(base, 'plans')).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=plan',
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

  // Product requirement: the free-tier 「升级」 button lands on `/dashboard`
  // and opens the SAME modal the console's own 「升级订阅」 hero button opens.
  // `billing=plan` on a personal workspace is exactly that modal
  // (`setPlanSelectionAudience('creator')` in B's `team-dashboard.tsx`).
  it('sends a personal workspace to the dashboard plan modal, never a team billing deep link', () => {
    const context: WorkspaceCollabContext = {
      ...baseContext,
      workspaceType: 'personal',
    };
    expect(workspaceUpgradeUrl(context, null)).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=plan',
    );
  });

  it('sends a never-subscribed team to the first-checkout dialog', () => {
    expect(workspaceUpgradeUrl(baseContext, null)).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=checkout',
    );
    expect(workspaceUpgradeUrl(baseContext, billingSummary(''))).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=checkout',
    );
  });

  it('sends an already-subscribed team to the change-plan dialog', () => {
    expect(
      workspaceUpgradeUrl({ ...baseContext, planId: 'team_pro', billingState: 'active' }, null),
    ).toBe('https://web.example/dashboard?workspaceId=ws-1&billing=plan');
    expect(workspaceUpgradeUrl(baseContext, billingSummary('team_pro'))).toBe(
      'https://web.example/dashboard?workspaceId=ws-1&billing=plan',
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

  it('returns null without a console URL so entry points hide the affordance', () => {
    const context: WorkspaceCollabContext = { ...baseContext };
    delete context.workspaceSettingsUrl;
    expect(workspaceUpgradeUrl(context, null)).toBeNull();
    expect(workspaceUpgradeUrl(null, null)).toBeNull();
  });

  it('falls back to the profile plans deep link for CTA callers that must always link somewhere', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(workspaceUpgradeUrl(null, null, { fallbackProfile: 'feature-test' })).toBe(
      `${RUNTIME_CONSOLE_ORIGIN}/dashboard?source=open_design&billing=plan`,
    );
  });
});
