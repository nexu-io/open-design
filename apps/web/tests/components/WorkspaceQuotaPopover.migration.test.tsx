// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { WorkspaceBillingPreflight, WorkspaceBillingResponse } from '@open-design/contracts';
import { workspaceQuotaView } from '../../src/collab/workspace-quota-view';
import { WorkspaceQuotaPopover } from '../../src/components/WorkspaceQuotaPopover';
import { I18nProvider } from '../../src/i18n';
import { workspaceContextFixture } from '../helpers/workspace-context';
import { quotaPopoverConsoleUrl } from '../../src/runtime/workspace-quota-links';

const context = workspaceContextFixture({ workspaceId: 'a', workspaceMemberId: 'member-a', planId: 'free', billingState: 'free', role: 'owner' });
function response(mode: unknown = 'shared', tier = 'free', balance = '0'): WorkspaceBillingResponse {
  const at = new Date().toISOString();
  const preflight: WorkspaceBillingPreflight & { billingMode: unknown } = {
    schemaVersion: 1, billingMode: mode, workspaceId: 'a', workspaceMemberId: 'member-a',
    modelId: null, generatedAt: at, balanceUsd: balance, modelCovered: false, funding: 'wallet',
    codingPlan: { workspaceId: 'a', generatedAt: at, eligible: false, tier: null, windows: [] },
  };
  return { summary: null, preflight,
    workspaceBalance: { workspaceId: 'a', workspaceMemberId: 'member-a', billingScopeVersion: 2, balanceUsd: balance, expiresAt: null, updatedAt: null },
    workspaceSnapshot: { schemaVersion: 1, workspaceId: 'a', workspaceMemberId: 'member-a', billingScopeVersion: 2,
      billing: { billingState: tier === 'free' ? 'free' : 'active', planId: tier },
      wallet: { balanceUsd: balance, expiresAt: null, updatedAt: null }, revisions: { billing: 'b1', wallet: 'w1' },
      designPlanWindows: [{ kind: '7d', windowStart: null, resetsAt: null, remainingCredits: '75', limitCredits: '100' }] },
  };
}
function state(body: WorkspaceBillingResponse | null, ctx = context) { return workspaceQuotaView({ context: ctx, response: body, tier: ctx.planId }); }
function panel(body: WorkspaceBillingResponse | null, role: 'owner' | 'admin' | 'member' = 'owner') {
  return <I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={{ ...context, role }} view={state(body)} profile="local" /></I18nProvider>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(['legacy', undefined, null, true, 1, 'SHARED', 'unknown'])('does not infer migration from mode %s or a v2 snapshot', mode => {
  const body = response(mode);
  if (mode === undefined) Reflect.deleteProperty(body.preflight!, 'billingMode');
  Reflect.set(body.workspaceSnapshot!, 'billingMode', 'shared');
  expect(state(body).sharedBilling).toBe(false);
});
it('only a fresh preflight for the exact principal proves shared presentation', () => {
  const body = response();
  expect(state(body).sharedBilling).toBe(true);
  expect(state(body, { ...context, workspaceId: 'b' }).sharedBilling).toBe(false);
  expect(state(body, { ...context, workspaceMemberId: 'member-b' }).sharedBilling).toBe(false);
  expect(workspaceQuotaView({ context: null, response: body, tier: 'free' }).sharedBilling).toBe(false);
  body.preflight!.generatedAt = new Date(Date.now() - 60_001).toISOString();
  expect(state(body).sharedBilling).toBe(false);
  body.preflight!.generatedAt = new Date(Date.now() + 61_000).toISOString();
  expect(state(body).sharedBilling).toBe(false);
  body.preflight!.generatedAt = 'invalid';
  expect(state(body).sharedBilling).toBe(false);
});
it('expired or revoked runtime cannot reactivate the shared card', () => {
  const body = response();
  body.workspaceRuntime = { workspaceId: 'a', workspaceMemberId: 'member-a', status: 'access-revoked', revision: '1', observedAt: null,
    softExpiresAt: null, hardExpiresAt: new Date(Date.now() + 60_000).toISOString(), retryAt: null, errorCode: null, reason: 'test', sourceGapDetected: false };
  expect(state(body).sharedBilling).toBe(false);
  body.workspaceRuntime.status = 'fresh';
  body.workspaceRuntime.hardExpiresAt = new Date(Date.now() - 1).toISOString();
  expect(state(body).sharedBilling).toBe(false);
});
it('shows unavailable values after a successful scoped read without wallet or quota data', () => {
  const body = response('shared', 'plus');
  body.workspaceBalance = null;
  delete body.workspaceSnapshot;
  const activeContext = { ...context, planId: 'plus', billingState: 'active' as const };
  const view = state(body, activeContext);
  expect(view.sharedBilling).toBe(true);
  expect(view.loading).toBe(false);
  render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={activeContext} view={view} profile="local" /></I18nProvider>);
  expect(screen.queryByTestId('workspace-quota-skeleton')).toBeNull();
  expect(screen.getByText('暂未获取用量')).toBeTruthy();
  expect(screen.queryByText('$0.00')).toBeNull();
});
it.each(['owner', 'admin', 'member'] as const)('%s keeps zero wallet while shared Free uses the HTML availability and zero bar', role => {
  const mounted = render(panel(response('legacy'), role));
  expect(screen.getByText('未订阅')).toBeTruthy();
  expect(screen.getByText('$0.00')).toBeTruthy();
  mounted.rerender(panel(response('shared'), role));
  expect(screen.getByRole('region', { name: 'Design Plan 额度' })).toBeTruthy();
  expect(screen.getByText('订阅套餐后可用')).toBeTruthy();
  expect(screen.queryByText('未订阅')).toBeNull();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  expect(screen.getByRole('region', { name: '按量额度' })).toBeTruthy();
  expect(screen.getByText('$0.00')).toBeTruthy();
  if (role !== 'owner') expect(screen.queryByRole('button', { name: /^(升级|充值|管理)$/ })).toBeNull();
  mounted.rerender(panel(response('legacy'), role));
  expect(screen.getByText('未订阅')).toBeTruthy();
  expect(screen.getByText('$0.00')).toBeTruthy();
});
it('legacy Max keeps Manage/console; shared Max uses Recharge without leaking the previous mode', () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  const mounted = render(panel(response('legacy', 'max', '24')));
  fireEvent.click(screen.getByRole('button', { name: '管理' }));
  expect(window.open).toHaveBeenLastCalledWith(quotaPopoverConsoleUrl('local', 'a'), '_blank', 'noopener,noreferrer');
  mounted.rerender(panel(response('shared', 'max', '24')));
  fireEvent.click(screen.getByRole('button', { name: '充值' }));
  expect(window.open).toHaveBeenLastCalledWith(quotaPopoverConsoleUrl('local', 'a', 'recharge'), '_blank', 'noopener,noreferrer');
  const unknown = response('shared', 'max', '24'); delete unknown.preflight;
  mounted.rerender(panel(unknown));
  expect(screen.getByRole('button', { name: '管理' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '充值' })).toBeNull();
});
