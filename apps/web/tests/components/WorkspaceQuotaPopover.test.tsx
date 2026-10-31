// @vitest-environment jsdom
// VIEW-001/002/003/010-CLIENT/012/017/021; latest confirmed HTML E/A11 states.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceQuotaPopover } from '../../src/components/WorkspaceQuotaPopover';
import { workspaceQuotaView, type WorkspaceQuotaTier, type WorkspaceQuotaView } from '../../src/collab/workspace-quota-view';
import { WORKSPACE_BILLING_REFRESH_EVENT } from '../../src/collab/useWorkspaceContext';
import { quotaPopoverConsoleUrl } from '../../src/runtime/workspace-quota-links';
import { I18nProvider } from '../../src/i18n';
import { workspaceContextFixture } from '../helpers/workspace-context';

const context = workspaceContextFixture({ workspaceId: 'workspace-a', workspaceMemberId: 'member-a', role: 'owner' });
function view(tier: WorkspaceQuotaTier, balanceUsd = '24', remainingPercent = 75, resetsAt: string | null = '2026-10-22T06:00:00Z'): WorkspaceQuotaView {
  return {
    tier, planKnown: true, sharedBilling: true, loading: false, balanceUsd, planStatus: null,
    windows: tier === 'free' ? [] : (tier === 'go' ? [18_000, 604_800] : [604_800]).map(durationSeconds => ({
      durationSeconds, remainingPercent, resetsAt, ...(remainingPercent === 0 ? { exhausted: true as const } : {}),
    })),
    breakdown: null, modelRestriction: null,
  };
}
function panel(value: WorkspaceQuotaView, role: 'owner' | 'admin' | 'member' = 'owner') {
  return <I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={{ ...context, role }} view={value} profile="local" /></I18nProvider>;
}
beforeEach(() => { vi.spyOn(window, 'open').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('Free metered help names its supported model rather than the paid models', () => {
  render(panel(view('free')));
  expect(screen.getByRole('button', { name: 'Free 仅支持 DeepSeek V4.1 Flash' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /顶级模型/ })).toBeNull();
});

it('quota help clamps to the viewport and closes on Escape, scroll and pointer exit', () => {
  render(panel(view('go')));
  const trigger = screen.getByRole('button', { name: /性价比模型/ });
  const tip = document.getElementById(trigger.getAttribute('aria-describedby')!)!;
  const showPopover = vi.fn();
  const hidePopover = vi.fn();
  Object.assign(tip, { showPopover, hidePopover });
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(window.innerWidth - 20, 100, 18, 18));
  vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 34));
  fireEvent.pointerEnter(trigger);
  expect(showPopover).toHaveBeenCalledTimes(1);
  expect(tip.style.left).toBe(`${window.innerWidth - 332}px`);
  expect(tip.style.top).toBe('63.5px');
  expect(tip.style.getPropertyValue('--arrow-left')).toBe('310px');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(hidePopover).toHaveBeenCalledTimes(1);
  fireEvent.scroll(window);
  expect(hidePopover).toHaveBeenCalledTimes(2);
  fireEvent.pointerLeave(trigger.parentElement!);
  expect(hidePopover).toHaveBeenCalledTimes(3);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 12, 18, 18));
  fireEvent.focus(trigger);
  expect(tip.dataset.below).toBe('true');
  expect(tip.style.top).toBe('32.5px');
});

describe.each(['zh-CN', 'en'] as const)('K6 C-01 reset rows (U001/UI-002) — %s', locale => {
  function renderQuota(value: WorkspaceQuotaView) {
    render(<I18nProvider initial={locale}><WorkspaceQuotaPopover context={context} view={value} profile="local" /></I18nProvider>);
    return within(screen.getByRole('region', { name: locale === 'en' ? 'Design Plan allowance' : 'Design Plan 额度' }));
  }
  function expectQuotaWithoutReset(value: WorkspaceQuotaView, percent: number, count: number) {
    const plan = renderQuota(value);
    expect(plan.getAllByText(locale === 'en' ? `${percent}% left` : `剩余 ${percent}%`)).toHaveLength(count);
    const bars = plan.getAllByRole('progressbar');
    expect(bars).toHaveLength(count);
    for (const bar of bars) expect(bar.getAttribute('aria-valuenow')).toBe(String(percent));
    expect(plan.queryByText(/重置|Resets/)).toBeNull();
    expect(plan.queryByText(/明细暂不可用|Details unavailable/)).toBeNull();
  }

  it.each(['go', 'plus', 'pro', 'max'] as const)('%s keeps quota and progress with resetsAt=null and no reset placeholder', tier => {
    expectQuotaWithoutReset(view(tier, '24', 75, null), 75, tier === 'go' ? 2 : 1);
  });
  it('keeps explicit zero quota and progress with resetsAt=null', () => {
    expectQuotaWithoutReset(view('go', '0', 0, null), 0, 2);
  });
  it('omits reset rows for an invalid date string', () => {
    expectQuotaWithoutReset(view('go', '24', 75, 'invalid-date'), 75, 2);
  });
  it('omits reset rows when resetsAt is missing at runtime', () => {
    const value = view('go');
    for (const window of value.windows ?? []) Reflect.deleteProperty(window, 'resetsAt');
    expectQuotaWithoutReset(value, 75, 2);
  });
  it('shows a relative reset countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T00:00:00Z'));
    const plan = renderQuota(view('go'));
    expect(plan.getAllByText(locale === 'en' ? 'Resets in 6 hours' : '6 小时后重置')).toHaveLength(2);
    expect(plan.getAllByRole('progressbar')).toHaveLength(2);
    vi.useRealTimers();
  });
});

const cases: Array<[string, WorkspaceQuotaTier, string, number]> = [
  ['E01', 'free', '0.50', 75], ['E03', 'go', '24', 75], ['E04', 'pro', '24', 75],
  ['E06', 'pro', '24', 0], ['E07', 'go', '0', 0], ['E09', 'free', '24', 75],
  ['E13', 'plus', '24', 75], ['E14', 'max', '24', 75], ['E15', 'go', '0', 75],
  ['E16', 'plus', '0', 75], ['E17', 'pro', '0', 75], ['E18', 'max', '0', 75], ['A11', 'free', '0', 75],
];
describe('C-01 state and role matrix (VIEW-001/002/021)', () => {
  for (const [id, tier, balance, percent] of cases) {
    it.each(['owner', 'admin', 'member'] as const)(`${id} ${tier}: %s sees the shared amount and its role action`, role => {
      render(panel(view(tier, balance, percent), role));
      expect(screen.getByRole('region', { name: 'Design Plan 额度' })).toBeTruthy();
      expect(screen.getByRole('region', { name: '按量额度' })).toBeTruthy();
      expect(screen.getByText(`$${Number(balance).toFixed(2)}`)).toBeTruthy();
      expect(screen.queryAllByRole('progressbar').length).toBe(tier === 'go' ? 2 : 1);
      expect(screen.queryByText('未订阅')).toBeNull();
      expect(Boolean(screen.queryByText('订阅套餐后可用'))).toBe(tier === 'free');
      for (const bar of screen.queryAllByRole('progressbar')) expect(bar.getAttribute('aria-valuenow')).toBe(String(tier === 'free' ? 0 : percent));
      const action = tier === 'max' ? '充值' : '升级';
      if (role === 'owner') {
        expect(screen.getByText('额度全员共用')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: action }));
        expect(window.open).toHaveBeenLastCalledWith(quotaPopoverConsoleUrl('local', 'workspace-a', tier === 'max' ? 'recharge' : 'plans'), '_blank', 'noopener,noreferrer');
      } else {
        expect(screen.getByText('升级或充值请联系 Owner')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /升级|充值/ })).toBeNull();
      }
      // VIEW-003: every role's arrow is a view link, never a recharge intent.
      fireEvent.click(screen.getByRole('button', { name: '查看余额' }));
      expect(window.open).toHaveBeenLastCalledWith(quotaPopoverConsoleUrl('local', 'workspace-a'), '_blank', 'noopener,noreferrer');
    });
  }
});

it.each(['free', 'go', 'plus', 'pro', 'max'] as const)('E12 %s uses the supplied HTML loading shape', tier => {
  render(panel({ ...view(tier), loading: true }));
  expect(screen.getByRole('img', { name: tier })).toBeTruthy();
  expect(screen.getByTestId('workspace-quota-skeleton').getAttribute('aria-busy')).toBe('true');
  expect(screen.queryAllByTestId('workspace-quota-window-skeleton')).toHaveLength(tier === 'go' ? 2 : 1);
  expect(screen.queryAllByTestId('workspace-quota-wallet-skeleton')).toHaveLength(1);
  expect(screen.queryByText(/加载|重试|刷新|错误|明细暂不可用|\$0/)).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('E12 unknown tier keeps one neutral loading block without inventing Free', () => {
  render(panel({ ...view('free'), tier: null, loading: true }));
  expect(screen.queryAllByTestId('workspace-quota-window-skeleton')).toHaveLength(1);
  expect(screen.queryAllByTestId('workspace-quota-wallet-skeleton')).toHaveLength(1);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByText(/暂不可用|\$0/)).toBeNull();
});

it('does not call an unknown plan unavailable when a scoped balance has loaded', () => {
  render(panel({ ...view('free'), tier: null, balanceUsd: '24' }));
  expect(screen.getByText('$24.00')).toBeTruthy();
  expect(screen.queryByText('明细暂不可用')).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
});

it('E03 missing breakdown/modelRestriction/windows stays unavailable, never fake $0 (VIEW-012)', () => {
  render(panel({ ...view('go'), windows: null, balanceUsd: null }));
  expect(within(screen.getByRole('region', { name: '按量额度' })).getByText('—')).toBeTruthy();
  expect(screen.queryByText('明细暂不可用')).toBeNull();
  expect(within(screen.getByRole('region', { name: 'Design Plan 额度' })).getAllByText('暂未获取用量')).toHaveLength(2);
  expect(screen.getByRole('button', { name: /性价比模型/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /顶级模型/ })).toBeTruthy();
  expect(screen.queryByText('5 小时')).toBeNull();
  expect(screen.queryByText('7 天')).toBeNull();
  expect(screen.queryByText('$0.00')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});
it('E09 displays server merged total without adding gift/recharge or expiring them (VIEW-021)', () => {
  render(panel({ ...view('free', '40.30'), breakdown: 'gift + recharge', modelRestriction: 'supported models' }));
  expect(screen.queryByRole('button', { name: 'supported models' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Free 仅支持 DeepSeek V4.1 Flash' })).toBeTruthy();
  expect(screen.queryByText(/gift \+ recharge|模型说明/)).toBeNull();
  expect(screen.queryByRole('button', { name: '刷新' })).toBeNull();
  expect(screen.getByText('$40.30')).toBeTruthy();
  expect(screen.queryByText('$0.50')).toBeNull();
});
it('E03 C-04 open, workspace/member change and reopen signal the existing reader', () => {
  const refresh = vi.fn();
  window.addEventListener(WORKSPACE_BILLING_REFRESH_EVENT, refresh);
  const mounted = render(panel(view('pro')));
  expect(refresh).toHaveBeenCalledTimes(1);
  mounted.rerender(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover view={view('pro')} context={{ ...context, workspaceId: 'workspace-b', workspaceMemberId: 'member-b' }} /></I18nProvider>);
  expect(refresh).toHaveBeenCalledTimes(2);
  mounted.unmount();
  render(panel(view('pro')));
  expect(refresh).toHaveBeenCalledTimes(3);
  window.removeEventListener(WORKSPACE_BILLING_REFRESH_EVENT, refresh);
});
it('E09 no workspace id hides links/actions and never fabricates a destination', () => {
  render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={null} view={view('free', '0')} /></I18nProvider>);
  expect(screen.queryByRole('button', { name: /升级|管理|查看余额/ })).toBeNull();
  expect(quotaPopoverConsoleUrl('local', null)).toBeNull();
});
it.each(['expired', 'canceled'])('E04 C-05 preserves neutral presentation for server status %s, never infers from reset dates', status => {
  render(panel({ ...view('pro'), planStatus: status }));
  expect(document.querySelector('[data-plan-status]')?.getAttribute('data-plan-status')).toBe(status);
  expect(screen.getByRole('img', { name: 'pro' })).toBeTruthy();
  expect(screen.queryByText(/已到期|已取消/)).toBeNull();
});

it('E03 adapter ignores account buckets and rejects foreign workspace/member balances (VIEW-012)', () => {
  const foreign = { summary: null, workspaceBalance: { workspaceId: 'b', workspaceMemberId: 'b-member', billingScopeVersion: 2 as const, balanceUsd: '99', expiresAt: null, updatedAt: null } };
  const state = workspaceQuotaView({ context: { ...context, planId: 'team_go' }, response: foreign, tier: 'team_go', balanceUsd: '88' });
  expect(state.balanceUsd).toBeNull();
  expect(state.tier).toBe('go');
  expect(state.windows).toBeNull();
  expect(state.planStatus).toBeNull();
  render(panel(state));
  expect(screen.queryByText(/\$99|\$88|\$0.00/)).toBeNull();
});
it('A11 adapter distinguishes explicit server zero from absent balance (VIEW-012)', () => {
  const response = { summary: null, workspaceBalance: { workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId, billingScopeVersion: 2 as const, balanceUsd: '0', expiresAt: null, updatedAt: null } };
  const state = workspaceQuotaView({ context: { ...context, planId: null, billingState: 'free' }, response, tier: 'free' });
  expect(state.balanceUsd).toBe('0');
  expect(state.loading).toBe(false);
  expect(workspaceQuotaView({ context: workspaceContextFixture({ ...context, planId: null, billingState: undefined }), response: null, tier: null }).tier).toBeNull();
  expect(workspaceQuotaView({ context, response: null, tier: null }).balanceUsd).toBeNull();
});

it('E09 current workspace Free overrides an account advisory Max tier (VIEW-012)', () => {
  const free = { ...context, planId: null, billingState: 'free' as const };
  const state = workspaceQuotaView({ context: free, response: { summary: null, workspaceBalance: null }, tier: 'team_max' });
  expect(state.tier).toBe('free');
  expect(state.balanceUsd).toBeNull();
});
it('E04 a matching workspace snapshot outranks an older context plan (VIEW-012)', () => {
  const state = workspaceQuotaView({ context: { ...context, planId: 'free' }, tier: 'free', response: {
    summary: null, workspaceBalance: null,
    workspaceSnapshot: { schemaVersion: 1, billingScopeVersion: 2, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      billing: { billingState: 'active', planId: 'team_pro' }, wallet: { balanceUsd: '24', expiresAt: null, updatedAt: null }, revisions: { billing: 'b1', wallet: 'w1' } },
  } });
  expect(state.tier).toBe('pro');
});
it('E04 preserves the existing readable locked-workspace billing entrance', () => {
  render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={{ ...context, lifecycleState: 'locked' }} view={view('pro')} /></I18nProvider>);
  expect(screen.getByRole('button', { name: '升级' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '查看余额' })).toBeTruthy();
});

it('E12 keeps a scoped host Go header and the unified loading block while a directory-only read is pending', () => {
  const unknown = workspaceContextFixture({ ...context, workspaceType: 'personal', planId: null, billingState: undefined });
  const state = workspaceQuotaView({ context: unknown, response: null, tier: 'go' });
  render(panel(state));
  expect(screen.getByRole('img', { name: 'go' })).toBeTruthy();
  expect(screen.getAllByTestId('workspace-quota-window-skeleton')).toHaveLength(1);
});

it('E04 owner action preserves locked-workspace recovery priority and falls back to the scoped wrapper (MAIN-REVIEW F-2)', () => {
  const recoveryUrl = 'https://billing.example.test/recover';
  const locked = { ...context, lifecycleState: 'locked' as const,
    billingRecovery: { canEnterBillingRecovery: true, recoveryUrl: `  ${recoveryUrl}  ` } };
  const mounted = render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={locked} view={view('pro')} profile="local" /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '升级' }));
  expect(window.open).toHaveBeenLastCalledWith(recoveryUrl, '_blank', 'noopener,noreferrer');
  fireEvent.click(screen.getByRole('button', { name: '查看余额' }));
  expect(window.open).toHaveBeenLastCalledWith(quotaPopoverConsoleUrl('local', context.workspaceId), '_blank', 'noopener,noreferrer');
  mounted.rerender(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={{ ...locked,
    billingRecovery: { canEnterBillingRecovery: true, recoveryUrl: '  ' } }} view={view('pro')} profile="local" /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '升级' }));
  expect(window.open).toHaveBeenLastCalledWith(quotaPopoverConsoleUrl('local', context.workspaceId, 'plans'), '_blank', 'noopener,noreferrer');
});

// Either Go window can exhaust the plan; unknown/debt must never promise funded fallback.
describe.each(['go', 'plus', 'pro', 'max'] as const)('HTML zero window %s', tier => {
  it.each(['24', '0', '0.00', '-1.25', null])('uses the server wallet %s without hiding debt or inventing fallback', balance => {
    const value = { ...view(tier, '24', 75), balanceUsd: balance };
    value.windows = value.windows!.map((window, index) => ({ ...window, remainingPercent: index === 0 ? 0 : 75, ...(index === 0 ? { exhausted: true as const } : {}) }));
    render(panel(value));
    expect(screen.getAllByText('剩余 0%')).toHaveLength(1);
    expect(screen.queryByText('已用完')).toBeNull();
    expect(screen.queryByText('重置前将自动使用按量额度继续生成')).toBeNull();
    expect(screen.getByRole('region', { name: '按量额度' })).toBeTruthy();
    if (balance === '0' || balance === '0.00') expect(screen.getByText('$0.00')).toBeTruthy();
    if (balance == null) expect(screen.getByText('—')).toBeTruthy();
    if (balance === '-1.25') expect(screen.getByText('-$1.25')).toBeTruthy();
  });
});
it('Go weekly zero keeps its percentage without adding a fallback message', () => {
  const value = view('go');
  value.windows = value.windows!.map(window => ({ ...window, remainingPercent: window.durationSeconds === 604_800 ? 0 : 75, ...(window.durationSeconds === 604_800 ? { exhausted: true as const } : {}) }));
  render(panel(value));
  expect(screen.getAllByText('剩余 0%')).toHaveLength(1);
    expect(screen.queryByText('已用完')).toBeNull();
  expect(screen.queryByText('重置前将自动使用按量额度继续生成')).toBeNull();
});

it('rounded 0% with positive server credits never promises exhaustion or metered fallback', () => {
  const value = view('go', '24', 1);
  value.windows = value.windows!.map(window => ({ ...window, remainingPercent: 0 }));
  render(panel(value));
  expect(screen.getAllByText('剩余 0%')).toHaveLength(2);
  expect(screen.queryByText('已用完')).toBeNull();
  expect(screen.queryByText('重置前将自动使用按量额度继续生成')).toBeNull();
});
