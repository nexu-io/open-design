// @vitest-environment jsdom
// C-04 / DD:1316, division:65, VIEW-001/012: real shared hook, no second read chain.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceBillingResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { WorkspaceQuotaPopover } from '../../src/components/WorkspaceQuotaPopover';
import { workspaceQuotaView } from '../../src/collab/workspace-quota-view';
import { notifyWorkspaceBillingRefresh, resetWorkspaceBillingCache, resetWorkspaceContextCache, useWorkspaceBillingResponse } from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { I18nProvider } from '../../src/i18n';
import { workspaceContextFixture, workspaceDirectoryFixture } from '../helpers/workspace-context';

const a = workspaceContextFixture({ workspaceId: 'a', workspaceMemberId: 'member-a', role: 'owner' });
const b = workspaceContextFixture({ workspaceId: 'b', workspaceMemberId: 'member-b', role: 'member', planId: 'free', billingState: 'free' });
function response(context: WorkspaceCollabContext, balanceUsd: string): WorkspaceBillingResponse {
  return { summary: null, workspaceBalance: { workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId, balanceUsd, billingScopeVersion: 2, expiresAt: null, updatedAt: null } };
}
class Events {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
let read: (workspaceId: string) => Promise<Response>;
let selected = a;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
function Harness({ context, open = true }: { context: WorkspaceCollabContext; open?: boolean }) {
  const billing = useWorkspaceBillingResponse({ context });
  return <I18nProvider initial="zh-CN">{open ? <WorkspaceQuotaPopover context={context}
    view={workspaceQuotaView({ context, response: billing, tier: context.planId ?? 'free' })} /> : null}</I18nProvider>;
}
beforeEach(() => {
  vi.useFakeTimers();
  resetWorkspaceContextCache();
  resetWorkspaceBillingCache();
  resetCoalescedGet();
  selected = a;
  read = async id => Response.json(response(id === 'a' ? a : b, id === 'a' ? '100' : '7'));
  request = vi.fn(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/workspace/billing/interests/')) {
      const body = init?.body ? JSON.parse(String(init.body)) as { generation: string } : null;
      return Response.json(body ? { clientId: url.split('/').at(-1), acceptedGeneration: body.generation, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() } : { ok: true });
    }
    if (url.startsWith('/api/workspace/billing?')) return read(new URL(url, 'http://test.invalid').searchParams.get('workspaceId')!);
    if (url === '/api/workspace/context') return Response.json({ context: selected });
    if (url === '/api/workspace/directory') return Response.json(workspaceDirectoryFixture([a, b]));
    return Response.json({});
  });
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('EventSource', Events);
});
afterEach(() => {
  cleanup();
  resetWorkspaceContextCache();
  resetWorkspaceBillingCache();
  resetCoalescedGet();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const calls = () => request.mock.calls.filter(([url]) => String(url).startsWith('/api/workspace/billing?')).length;

it('E03 -> E09 switch discards the delayed previous workspace read (VIEW-001/012)', async () => {
  let finishA!: (value: Response) => void;
  const pendingA = new Promise<Response>(resolve => { finishA = resolve; });
  read = async id => id === 'a' ? pendingA : Response.json(response(b, '7'));
  let mounted!: ReturnType<typeof render>;
  await act(async () => { mounted = render(<Harness context={a} />); });
  expect(screen.getByTestId('workspace-quota-skeleton')).toBeTruthy();
  selected = b;
  await act(async () => { mounted.rerender(<Harness context={b} />); });
  expect(screen.getByText('$7.00')).toBeTruthy();
  expect(screen.getByText('升级或充值请联系 Owner')).toBeTruthy();
  await act(async () => { finishA(Response.json(response(a, '100'))); });
  expect(screen.getByText('$7.00')).toBeTruthy();
  expect(screen.queryByText('$100.00')).toBeNull();
  expect(screen.queryByRole('button', { name: '升级' })).toBeNull();
});
it('E04 re-reads on open/reopen, foreground/payment signal and visibility (C-04)', async () => {
  let amount = '24';
  read = async () => Response.json(response(a, amount));
  let mounted!: ReturnType<typeof render>;
  await act(async () => { mounted = render(<Harness context={a} />); });
  expect(screen.getByText('$24.00')).toBeTruthy();
  const initial = calls();
  // The existing shared reader coalesces forced refresh bursts for 250ms.
  // These are distinct user actions; advance its virtual clock past that boundary.
  await act(async () => { await vi.advanceTimersByTimeAsync(251); });
  await act(async () => { mounted.rerender(<Harness context={a} open={false} />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(251); });
  amount = '26';
  await act(async () => { mounted.rerender(<Harness context={a} />); });
  expect(screen.getByText('$26.00')).toBeTruthy();
  expect(calls()).toBeGreaterThan(initial);
  amount = '27';
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); window.dispatchEvent(new Event('focus')); });
  expect(screen.getByText('$27.00')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(251); });
  amount = '28';
  await act(async () => { notifyWorkspaceBillingRefresh(); });
  expect(screen.getByText('$28.00')).toBeTruthy();
  amount = '29';
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.getByText('$29.00')).toBeTruthy();
});
it('E12 failure keeps skeleton until data arrives; later failed refresh retains last-good (VIEW-017)', async () => {
  read = async () => new Response(null, { status: 503 });
  await act(async () => { render(<Harness context={a} />); });
  expect(screen.getByTestId('workspace-quota-skeleton')).toBeTruthy();
  expect(screen.queryByText(/\$0.00|错误|重试/)).toBeNull();
  read = async () => Response.json(response(a, '24'));
  await act(async () => { notifyWorkspaceBillingRefresh(); });
  expect(screen.getByText('$24.00')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(251); });
  const beforeFailure = calls();
  read = async () => new Response(null, { status: 503 });
  await act(async () => { notifyWorkspaceBillingRefresh(); });
  expect(screen.getByText('$24.00')).toBeTruthy();
  expect(screen.queryByText('$0.00')).toBeNull();
  expect(calls()).toBeGreaterThan(beforeFailure);
});

function snapshotWithWindows(designPlanWindows?: unknown) {
  return {
    schemaVersion: 1,
    workspaceId: a.workspaceId,
    workspaceMemberId: a.workspaceMemberId,
    billingScopeVersion: 2,
    billing: { billingState: 'active', planId: 'team_go' },
    wallet: { balanceUsd: '100', expiresAt: null, updatedAt: null },
    revisions: { billing: 'b1', wallet: 'w1' },
    ...(designPlanWindows === undefined ? {} : { designPlanWindows }),
  };
}

it('renders shared Design Plan windows as remaining percentages (UI-002(a))', async () => {
  read = async () => Response.json({
    ...response(a, '100'),
    workspaceSnapshot: snapshotWithWindows([
      { kind: '5h', windowStart: null, resetsAt: null, remainingCredits: '40', limitCredits: '100' },
      { kind: '7d', windowStart: null, resetsAt: null, remainingCredits: '1', limitCredits: '3' },
    ]),
  });
  await act(async () => { render(<Harness context={a} />); });
  expect(screen.getByText('剩余 40%')).toBeTruthy();
  expect(screen.getByText('剩余 33%')).toBeTruthy();
  expect(screen.getAllByRole('progressbar').map(bar => bar.getAttribute('aria-valuenow'))).toEqual(['40', '33']);
  expect(screen.queryByText('明细暂不可用')).toBeNull();
});

it('keeps both shared Design Plan windows unavailable when the field is absent', async () => {
  read = async () => Response.json({
    ...response(a, '100'),
    workspaceSnapshot: snapshotWithWindows(),
  });
  await act(async () => { render(<Harness context={a} />); });
  expect(screen.getAllByText('暂未获取用量')).toHaveLength(2);
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
});

it('keeps both shared Design Plan windows unavailable for an explicit empty array', async () => {
  read = async () => Response.json({
    ...response(a, '100'),
    workspaceSnapshot: snapshotWithWindows([]),
  });
  await act(async () => { render(<Harness context={a} />); });
  expect(screen.getAllByText('暂未获取用量')).toHaveLength(2);
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
});

it('team migration shares one immediate snapshot and advisory read per payment, without card-owned reads', async () => {
  const team = { ...a, workspaceType: 'team' as const, planId: 'team_max' };
  let billingMode = 'legacy';
  read = async () => {
    const generatedAt = new Date().toISOString();
    return Response.json({ ...response(team, '24'),
      workspaceSnapshot: { ...snapshotWithWindows(), billing: { billingState: 'active', planId: 'team_max' }, wallet: { balanceUsd: '24', expiresAt: null, updatedAt: null } },
      preflight: { schemaVersion: 1, billingMode, workspaceId: team.workspaceId, workspaceMemberId: team.workspaceMemberId,
        generatedAt, modelId: null, balanceUsd: '24', modelCovered: false, funding: 'wallet',
        codingPlan: { workspaceId: team.workspaceId, generatedAt, eligible: false, tier: null, windows: [] } },
    });
  };
  await act(async () => { render(<Harness context={team} />); });
  expect(screen.getByRole('button', { name: '管理' })).toBeTruthy();
  expect(request.mock.calls.some(([url]) => String(url).includes('includePreflight=1'))).toBe(true);
  const before = calls();
  const probesBefore = request.mock.calls.filter(([url]) => String(url).includes('includePreflight=1')).length;
  billingMode = 'shared';
  await act(async () => { await vi.advanceTimersByTimeAsync(251); notifyWorkspaceBillingRefresh(); });
  expect(screen.getByRole('button', { name: '充值' })).toBeTruthy();
  expect(calls()).toBe(before + 2);
  expect(request.mock.calls.filter(([url]) => String(url).includes('includePreflight=1'))).toHaveLength(probesBefore + 1);
  billingMode = 'legacy';
  await act(async () => { await vi.advanceTimersByTimeAsync(251); notifyWorkspaceBillingRefresh(); });
  expect(screen.getByRole('button', { name: '管理' })).toBeTruthy();
  expect(calls()).toBe(before + 4);
  expect(request.mock.calls.filter(([url]) => String(url).includes('includePreflight=1'))).toHaveLength(probesBefore + 2);
});
