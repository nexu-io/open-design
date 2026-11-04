// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildWorkspacePermissions, type WorkspaceBillingResponse } from '@open-design/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { AmrConcurrencyDialog } from '../../src/components/AmrConcurrencyDialog';
import { workspaceBillingSummaryForContext } from '../../src/collab/useWorkspaceContext';
import { resolveAmrBalanceBranch, resolveAmrConcurrencyPresentation } from '../../src/runtime/amr-balance-branch';
import { workspaceContextFixture } from '../helpers/workspace-context';

const translation = vi.hoisted(() => ({ language: 'en' }));

vi.mock('../../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/i18n')>();
  return { ...actual, useT: () => actual.tForLanguageTag(translation.language)! };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); translation.language = 'en'; });

it.each(['free', 'go', 'plus', 'pro', 'max'].flatMap((tier) =>
  (['owner', 'admin', 'member'] as const).map((role) => ({ tier, role }))))(
  '$tier / $role uses existing upgrade or wait/contact Owner actions, never recharge',
  ({ tier, role }) => {
    const context = workspaceContextFixture({
      workspaceId: 'billing-space', workspaceMemberId: `sender-${role}`, role,
      planId: tier === 'free' ? null : `team_${tier}`,
      permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
    });
    const open = vi.fn(); vi.stubGlobal('open', open);
    const onClose = vi.fn();
    render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
      workspaceContext={context} profile="local" onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(tier === 'max' ? 'Concurrent task limit reached'
      : role === 'owner' ? 'Concurrency limit reached' : 'Team concurrency limit reached');
    if (tier === 'max') expect(dialog).toHaveTextContent('Please wait for other tasks to finish, then try again.');
    expect(dialog.textContent).not.toMatch(/recharge|auto.?recharge/i);
    if (role !== 'owner' && tier !== 'max') expect(dialog).toHaveTextContent('Ask the team workspace Owner to upgrade the subscription.');
    const upgrade = screen.queryByTestId('amr-concurrency-upgrade');
    if (role === 'owner' && tier !== 'max') {
      expect(upgrade).toBeTruthy(); fireEvent.click(upgrade!);
      expect(open).toHaveBeenCalledOnce();
      expect(String(open.mock.calls[0]![0])).toContain('billing=plan');
    } else {
      expect(upgrade).toBeNull(); expect(open).not.toHaveBeenCalled();
    }
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-concurrency-close'));
    expect(onClose).toHaveBeenCalledOnce();
  },
);

// Current QA UISTATE-F04-CLIENT: use the original illustration and the four
// approved Cloud benefits, with manual close/upgrade actions.
it('renders the complete F04 design for a paid upgradable Owner', () => {
  const context = workspaceContextFixture({ workspaceId: 'f04-billing-space', workspaceMemberId: 'f04-owner',
    role: 'owner', planId: 'team_pro',
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
    workspaceContext={context} profile="local" onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog.querySelector('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(dialog).toHaveTextContent('Invite members for free and share allowance');
  expect(screen.getByTestId('amr-concurrency-close')).toHaveTextContent('Not now');
  expect(screen.getByTestId('amr-concurrency-upgrade')).toHaveTextContent('Upgrade plan');
});

// SAFE-004: the upgrade must stay in the current runtime and paying workspace.
it.each([
  ['local', 'http://localhost:5173'],
  ['test', 'https://open-design.powerformer.net'],
  ['prod', 'https://open-design.ai'],
] as const)('keeps the %s concurrency upgrade in the rejected workspace', (profile, origin) => {
  const context = workspaceContextFixture({ workspaceId: 'funding-space-a', workspaceMemberId: 'owner-a',
    role: 'owner', planId: 'team_pro', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
    workspaceContext={context} profile={profile} onClose={vi.fn()} />);
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  const target = new URL(open.mock.calls[0]![0]);
  expect(target.origin).toBe(origin);
  expect(target.searchParams.get('workspaceId')).toBe('funding-space-a');
  expect(target.searchParams.get('billing')).toBe('plan');
});

it('changes the upgrade target with the rejected workspace without inheriting the old one', () => {
  const makeContext = (workspaceId: string) => workspaceContextFixture({ workspaceId, workspaceMemberId: `owner-${workspaceId}`,
    role: 'owner', planId: 'team_pro', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const contextA = makeContext('funding-space-a');
  const contextB = makeContext('funding-space-b');
  const open = vi.fn(); vi.stubGlobal('open', open);
  const view = render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context: contextA })}
    workspaceContext={contextA} profile="test" onClose={vi.fn()} />);
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  view.rerender(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context: contextB })}
    workspaceContext={contextB} profile="test" onClose={vi.fn()} />);
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  expect(new URL(open.mock.calls[0]![0]).searchParams.get('workspaceId')).toBe('funding-space-a');
  expect(new URL(open.mock.calls[1]![0]).searchParams.get('workspaceId')).toBe('funding-space-b');
});

it('does not create an upgrade entrance before a workspace identity is known', () => {
  const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={{ tier: 'below_max', audience: 'owner' }}
    workspaceContext={null} profile="local" onClose={vi.fn()} />);
  expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

// Frozen client F06 / F05: non-purchasing users still get the original image.
// Acknowledgement only dismisses; it never buys, recharges or retries a run.
it.each([
  ...(['free', 'go', 'plus', 'pro', 'max'] as const).flatMap((tier) =>
    (['admin', 'member'] as const).map((role) => ({ tier, role }))),
])('$tier / $role keeps the illustration and a single acknowledgement', ({ tier, role }) => {
  const context = workspaceContextFixture({ workspaceId: `f06-${tier}`, workspaceMemberId: `f06-${role}`,
    role, planId: tier === 'free' ? null : `team_${tier}`, permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) });
  const onClose = vi.fn(); const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })} workspaceContext={context}
    profile="local" consoleOrigin="http://127.0.0.1:57457" onClose={onClose} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog.querySelector('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Got it' })).toBe(screen.getByTestId('amr-concurrency-close'));
  expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(onClose).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  expect(onClose).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
});

it('retains the explicit console origin when an upgradable Owner chooses a plan', () => {
  const context = workspaceContextFixture({ workspaceId: 'explicit-origin-owner', workspaceMemberId: 'origin-owner',
    role: 'owner', planId: 'team_plus', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })} workspaceContext={context}
    profile="local" consoleOrigin="http://127.0.0.1:57457" onClose={vi.fn()} />);
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  const target = new URL(open.mock.calls[0]![0]);
  expect(target.origin).toBe('http://127.0.0.1:57457');
  expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
  expect(target.searchParams.get('billing')).toBe('plan');
});

it('uses the frozen Chinese F06 message and acknowledgement without adding purchase actions', () => {
  translation.language = 'zh-CN';
  const context = workspaceContextFixture({ workspaceId: 'f06-zh', workspaceMemberId: 'f06-zh-admin',
    role: 'admin', planId: 'team_pro', permissions: buildWorkspacePermissions({ role: 'admin', lifecycleState: 'active' }) });
  const onClose = vi.fn();
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })} workspaceContext={context} onClose={onClose} />);
  expect(screen.getByRole('heading', { name: '团队并发不足' })).toBeTruthy();
  expect(screen.getByRole('dialog')).toHaveTextContent('当前团队并发不足，请联系团队空间所有者升级订阅。');
  expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '知道了' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it.each(['admin', 'member'] as const)('invited Personal %s receives frozen F06 and no upgrade action', (role) => {
  translation.language = 'zh-CN';
  const context = workspaceContextFixture({
    workspaceId: 'shared-personal-f06', workspaceType: 'personal', memberCount: 2,
    workspaceMemberId: `personal-${role}`, role, planId: 'go',
    permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
  });
  const open = vi.fn(); vi.stubGlobal('open', open);
  const onClose = vi.fn();
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
    workspaceContext={context} profile="local" onClose={onClose} />);

  expect(screen.getByRole('heading', { name: '团队并发不足' })).toBeTruthy();
  expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '知道了' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
});

it('retains production origin pinning even when an explicit origin is supplied', () => {
  const context = workspaceContextFixture({ workspaceId: 'prod-pinned-space', workspaceMemberId: 'prod-owner',
    role: 'owner', planId: 'team_plus', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })} workspaceContext={context}
    profile="prod" consoleOrigin="http://127.0.0.1:57457" onClose={vi.fn()} />);
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  expect(new URL(open.mock.calls[0]![0]).origin).toBe('https://open-design.ai');
});

// Identity readiness must not fall back to a guessed production upgrade URL.
it.each([undefined, null, '', '  '])('does not offer an upgrade before profile %s is ready', (profile) => {
  const context = workspaceContextFixture({ workspaceId: 'known-space', workspaceMemberId: 'known-owner',
    role: 'owner', planId: 'team_pro', permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
    workspaceContext={context} profile={profile} onClose={vi.fn()} />);
  expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

// RUN-013 original Free Owner upgrade dialog. This reproduces the actual
// directory + account-summary + authorized snapshot combination, including
// the presentation guard used by EntryShell/ProjectView rather than relying
// on the dialog component's default upgradeAllowed=true.
it('keeps the frozen Free Owner upgrade action from the exact personal workspace snapshot', () => {
  translation.language = 'zh-CN';
  const context = workspaceContextFixture({ workspaceId: 'run013-free-w1', workspaceMemberId: 'run013-owner',
    workspaceType: 'personal', memberCount: 2, role: 'owner', planId: null, billingState: 'active',
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const response: WorkspaceBillingResponse = {
    summary: { workspaceId: null, membershipTier: '', subscriptionStatus: '',
      totalAvailableCredits: 0, subscriptionCredits: 0, rechargeCredits: 0,
      balanceUsd: '0', availableActions: [], workspaceBalance: null },
    workspaceBalance: null,
    workspaceSnapshot: { schemaVersion: 1, workspaceId: context.workspaceId,
      workspaceMemberId: context.workspaceMemberId, billingScopeVersion: 2,
      billing: { billingState: 'free', planId: 'free' },
      wallet: { balanceUsd: '0.4985', expiresAt: null, updatedAt: null },
      revisions: { billing: 'billing-1', wallet: 'wallet-1' } },
  };
  const presentation = resolveAmrConcurrencyPresentation({ context,
    billing: workspaceBillingSummaryForContext(response, context) });
  const open = vi.fn(); vi.stubGlobal('open', open);
  const onClose = vi.fn();
  render(<AmrConcurrencyDialog {...presentation} workspaceContext={context}
    profile="local" consoleOrigin="http://127.0.0.1:57457" onClose={onClose} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog.querySelector('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(screen.getByTestId('amr-concurrency-close')).toHaveTextContent('暂不需要');
  expect(screen.getByTestId('amr-concurrency-upgrade')).toHaveTextContent('升级套餐');
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  const target = new URL(open.mock.calls[0]![0]);
  expect(target.origin).toBe('http://127.0.0.1:57457');
  expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
  expect(target.searchParams.get('billing')).toBe('plan');
  expect(onClose).not.toHaveBeenCalled();
});

it.each(['max', 'member', 'unknown', 'other-workspace', 'other-member'] as const)(
  'keeps the concurrency upgrade guard for personal %s proof', (proof) => {
    const role = proof === 'member' ? 'member' : 'owner';
    const context = workspaceContextFixture({ workspaceId: 'personal-current', workspaceMemberId: 'current-member',
      workspaceType: 'personal', memberCount: 2, role, planId: null, billingState: 'active',
      permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) });
    let snapshotBilling = { billingState: 'free', planId: 'free' } as NonNullable<WorkspaceBillingResponse['workspaceSnapshot']>['billing'];
    if (proof === 'unknown') snapshotBilling = { billingState: 'active', planId: null };
    else if (proof === 'max') snapshotBilling = { billingState: 'active', planId: 'max' };
    const response: WorkspaceBillingResponse = { summary: {
      workspaceId: null, membershipTier: '', subscriptionStatus: '', totalAvailableCredits: 0,
      subscriptionCredits: 0, rechargeCredits: 0, balanceUsd: '0', availableActions: [], workspaceBalance: null,
    }, workspaceBalance: null, workspaceSnapshot: { schemaVersion: 1,
      workspaceId: proof === 'other-workspace' ? 'other-space' : context.workspaceId,
      workspaceMemberId: proof === 'other-member' ? 'other-member' : context.workspaceMemberId,
      billingScopeVersion: 2,
      billing: snapshotBilling,
      wallet: { balanceUsd: '0.4985', expiresAt: null, updatedAt: null },
      revisions: { billing: 'b', wallet: 'w' },
    } };
    const presentation = resolveAmrConcurrencyPresentation({ context,
      billing: workspaceBillingSummaryForContext(response, context) });
    expect(presentation.upgradeAllowed).toBe(false);
    if (proof === 'max') expect(presentation.branch.tier).toBe('max');
    if (proof === 'member') expect(presentation.branch.audience).toBe('member');
    const open = vi.fn(); vi.stubGlobal('open', open);
    render(<AmrConcurrencyDialog {...presentation} workspaceContext={context}
      profile="local" consoleOrigin="http://127.0.0.1:57457" onClose={vi.fn()} />);
    expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  },
);

// User confirmation 2026-10-27: Max uses the same illustrated concurrency
// frame; reaching the top tier must not invent another plan or auto-retry.
it.each(['max', 'team_max'])('Max Owner %s keeps the unified illustration with manual dismissal only', (planId) => {
  const context = workspaceContextFixture({ workspaceId: 'max-unified-frame', workspaceMemberId: 'max-owner',
    role: 'owner', planId,
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  const onClose = vi.fn(); const open = vi.fn(); vi.stubGlobal('open', open);
  render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
    workspaceContext={context} profile="local" onClose={onClose} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog.querySelector('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  expect(dialog.className).toContain('frozenPanel');
  expect(dialog).toHaveTextContent('Please wait for other tasks to finish, then try again.');
  expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('amr-concurrency-close'));
  expect(onClose).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
});

// The user also removed the plain fallback entirely. Missing purchase proof
// changes available actions, never the shared dialog frame or its artwork.
it.each(['workspace', 'profile', 'upgrade-permission'] as const)(
  'keeps the unified frame without %s purchase readiness', (missing) => {
    const context = workspaceContextFixture({ workspaceId: 'unified-fallback', workspaceMemberId: 'fallback-owner',
      role: 'owner', planId: 'team_pro',
      permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
    const onClose = vi.fn(); const open = vi.fn(); vi.stubGlobal('open', open);
    render(<AmrConcurrencyDialog branch={resolveAmrBalanceBranch({ context })}
      workspaceContext={missing === 'workspace' ? null : context}
      profile={missing === 'profile' ? null : 'local'} upgradeAllowed={missing !== 'upgrade-permission'} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
    expect(dialog.className).toContain('frozenPanel');
    expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('amr-concurrency-close'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  },
);

// OPEND-4462: Max has no higher plan, regardless of workspace role or type.
it.each((['personal', 'team'] as const).flatMap((workspaceType) =>
  (['owner', 'admin', 'member'] as const).map((role) => ({ workspaceType, role }))))(
  'Max $workspaceType / $role uses the approved task-limit notice', ({ workspaceType, role }) => {
    translation.language = 'zh-CN';
    const context = workspaceContextFixture({ workspaceId: `max-${workspaceType}`, workspaceMemberId: `max-${role}`,
      workspaceType, memberCount: 3, role,
      planId: workspaceType === 'team' ? 'team_max' : 'max',
      permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) });
    const onClose = vi.fn(); const open = vi.fn(); vi.stubGlobal('open', open);
    render(<AmrConcurrencyDialog {...resolveAmrConcurrencyPresentation({ context })}
      workspaceContext={context} profile="local" onClose={onClose} />);
    expect(screen.getByRole('heading', { name: '同时运行的任务已达上限' })).toBeTruthy();
    expect(screen.getByRole('dialog')).toHaveTextContent('当前工作空间同时运行的任务数已达上限，请等待其他任务结束后重试。');
    expect(screen.getByRole('dialog').textContent).not.toMatch(/升级|所有者/);
    expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(onClose).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
  },
);
