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

  // 红测(§6.Y 死胡同的第二扇门)。三处注释逐字断言「Personal workspaces always
  // resolve `canManageBilling` true (the user is their own owner)」
  // (`AvatarMenu.tsx`、`InlineModelSwitcher.tsx`、`SettingsDialog.tsx`),而
  // 这里从来没有一条用例验过那个前提。前提不成立时(daemon 的 local/dev 授权
  // 分支就把每一个工作区回成 `role: 'member'`,B 也可以少给或降级 `permissions`),
  // 个人工作区的人拿到的是「余额 $0 → 弹窗叫你升级 → 一颗按钮都没有」。
  //
  // 判据本身才是错的:`canManageBilling` 回答的是「团队里谁能动**团队的**钱」,
  // 个人工作区没有第二个人,钱就是本人的。拿团队成员的概念去关个人用户自己的
  // 入口,关掉的不是别人的权限,是他自己的付款路。
  it('keeps a personal workspace upgrade entry even when billing permission is not granted', () => {
    const context: WorkspaceCollabContext = {
      ...baseContext,
      workspaceType: 'personal',
      role: 'member',
      permissions: { ...baseContext.permissions, canManageBilling: false },
    };
    expect(workspaceUpgradeUrl(context, null)).toBe(PROD_CONSOLE_PLAN_URL);
    expect(
      workspaceUpgradeUrl(context, billingSummary('team_pro'), {
        fallbackProfile: 'prod',
      }),
    ).toBe(PROD_CONSOLE_PLAN_URL);
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

  // ⚠️ 上面那条个人用例的**反向对照**,必须一直绿。团队里的非 owner 本来就不该
  // 外跳:B 的账单接口自己就会拒(`services/api/src/billing/http/routes.ts` 的
  // `if (!context.permissions.canManageBilling)`),放开只会给他一颗点了会被拒
  // 的死按钮。这一档的出口是 `AmrOwnerTopUpDialog`(「找所有者充值」),不是链接。
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
