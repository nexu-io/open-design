// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  WorkspaceBillingResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  lastResolvedWorkspaceContext,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
  shouldRefreshWorkspaceBilling,
  useWorkspaceBilling,
  useWorkspaceBillingResponse,
  workspaceBillingBalanceUsd,
  workspaceBillingSnapshotForContext,
  workspaceBillingSummaryForContext,
} from '../src/collab/useWorkspaceContext';
import { workspaceDirectoryFixture } from './helpers/workspace-context';

function teamContext(workspaceId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: `member-${workspaceId}`,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
  } as WorkspaceCollabContext;
}

function workspaceDirectoryResponse(
  context: WorkspaceCollabContext,
): Response {
  return new Response(JSON.stringify(workspaceDirectoryFixture([context])), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function billingResponse(workspaceId: string, balanceUsd: string) {
  return {
    summary: {
      workspaceId: null,
      membershipTier: 'team_plus',
      totalAvailableCredits: 0,
      subscriptionCredits: 0,
      rechargeCredits: 0,
      balanceUsd: '999.00',
      subscriptionStatus: 'active',
      availableActions: [],
      workspaceBalance: null,
    },
    workspaceBalance: {
      workspaceId,
      workspaceMemberId: `member-${workspaceId}`,
      balanceUsd,
      billingScopeVersion: 2 as const,
      expiresAt: null,
      updatedAt: '2026-07-26T12:00:00Z',
    },
  };
}

function billingInterestResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Response | null {
  const url = String(input);
  if (!url.startsWith('/api/workspace/billing/interests/')) return null;
  if (init?.method === 'DELETE') {
    return new Response(JSON.stringify({ ok: true, released: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  const body = JSON.parse(String(init?.body)) as { generation: string };
  const clientId = decodeURIComponent(
    new URL(url, 'http://open-design.test').pathname.split('/').at(-1)!,
  );
  return new Response(JSON.stringify({
    clientId,
    acceptedGeneration: body.generation,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type EventSourceListener = (event: unknown) => void;
class MockWorkspaceEventSource {
  static instances: MockWorkspaceEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Set<EventSourceListener>>();

  constructor(readonly url: string) {
    MockWorkspaceEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventSourceListener): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  removeEventListener(name: string, listener: EventSourceListener): void {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string, data: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }

  close(): void {}
}

describe('workspaceBillingSummaryForContext — plan is partitioned like money', () => {
  function snapshotFor(
    workspaceId: string,
    billing: { billingState: string | null; planId: string | null },
  ) {
    return {
      schemaVersion: 1 as const,
      workspaceId,
      workspaceMemberId: `member-${workspaceId}`,
      billingScopeVersion: 2 as const,
      billing,
      wallet: { balanceUsd: '0', expiresAt: null, updatedAt: null },
      revisions: { billing: 'b', wallet: 'w' },
    } as unknown as WorkspaceBillingResponse['workspaceSnapshot'];
  }

  const personalPlusAccount = {
    ...billingResponse('workspace-a', '0').summary,
    membershipTier: 'plus',
  };

  // The reported bug: `summary` is an ACCOUNT read, so a personal Plus cannot
  // name a team workspace's subscription however many times it is re-fetched.
  it('never lets a personal account tier name a team workspace plan', () => {
    const projected = workspaceBillingSummaryForContext(
      {
        summary: personalPlusAccount,
        workspaceBalance: null,
        workspaceSnapshot: snapshotFor('workspace-a', {
          billingState: 'free',
          planId: null,
        }),
      } as WorkspaceBillingResponse,
      teamContext('workspace-a'),
    );
    expect(projected?.membershipTier).toBe('free');
  });

  it('blanks a personal account tier when no authorized snapshot exists', () => {
    const projected = workspaceBillingSummaryForContext(
      { summary: personalPlusAccount, workspaceBalance: null } as WorkspaceBillingResponse,
      teamContext('workspace-a'),
    );
    // '' is the contract's "this source does not know", so `resolvePlanTier`
    // falls through to the workspace-scoped context hint.
    expect(projected?.membershipTier).toBe('');
  });

  it('rejects a snapshot proven for a different workspace', () => {
    const projected = workspaceBillingSummaryForContext(
      {
        summary: personalPlusAccount,
        workspaceBalance: null,
        workspaceSnapshot: snapshotFor('workspace-b', {
          billingState: 'active',
          planId: 'team_max',
        }),
      } as WorkspaceBillingResponse,
      teamContext('workspace-a'),
    );
    expect(projected?.membershipTier).toBe('');
  });

  // 飞书 P0 counterpart: B omits planId/billingState for a non-owner, and
  // `workspaceSnapshot` is an additive capability, so a team-namespaced account
  // tier is the only evidence a paying MEMBER's team is subscribed.
  it('keeps a team-namespaced account tier as the member fallback', () => {
    const projected = workspaceBillingSummaryForContext(
      {
        summary: { ...personalPlusAccount, membershipTier: 'team_plus' },
        workspaceBalance: null,
      } as WorkspaceBillingResponse,
      teamContext('workspace-a'),
    );
    expect(projected?.membershipTier).toBe('team_plus');
  });

  // A personal workspace IS the account scope, and `hasTeamPlan` deliberately
  // offers team surfaces to a personal workspace holding a team plan.
  it('passes the account summary through untouched on a personal workspace', () => {
    const personalContext = {
      workspaceId: 'personal-a',
      workspaceType: 'personal',
      workspaceMemberId: 'member-personal',
    } as unknown as WorkspaceCollabContext;
    const projected = workspaceBillingSummaryForContext(
      { summary: personalPlusAccount, workspaceBalance: null } as WorkspaceBillingResponse,
      personalContext,
    );
    expect(projected?.membershipTier).toBe('plus');
  });

  // RUN-013 actual Free Owner shape: directory context is conservatively
  // active/null and the account summary has no tier; only the scoped snapshot
  // proves Free. Keep account money separate from that workspace plan.
  it.each(['free', 'max'])('uses the validated personal %s snapshot before an empty account tier', (tier) => {
    const context = { ...teamContext('personal-a'), workspaceType: 'personal',
      role: 'owner', billingState: 'active', planId: null } as WorkspaceCollabContext;
    const summary = { ...personalPlusAccount, membershipTier: '', subscriptionStatus: '' };
    const response = { summary, workspaceBalance: null,
      workspaceSnapshot: snapshotFor('personal-a', {
        billingState: tier === 'free' ? 'free' : 'active', planId: tier,
      }) } as WorkspaceBillingResponse;
    const projected = workspaceBillingSummaryForContext(response, context);
    expect(projected).toEqual({ ...summary, membershipTier: tier,
      subscriptionStatus: tier === 'free' ? 'free' : 'active' });
    expect(response.summary).toBe(summary);
  });

  it('keeps a proven personal Free plan when the account summary is unavailable', () => {
    const context = { ...teamContext('personal-a'), workspaceType: 'personal' } as WorkspaceCollabContext;
    const response = { summary: null, workspaceBalance: null,
      workspaceSnapshot: snapshotFor('personal-a', { billingState: 'free', planId: 'free' }) } as WorkspaceBillingResponse;
    expect(workspaceBillingSummaryForContext(response, context)?.membershipTier).toBe('free');
  });

  it.each(['missing', 'workspace', 'member', 'scope-version', 'unknown'] as const)(
    'keeps the personal account fallback for %s plan proof', (kind) => {
      const context = { ...teamContext('personal-a'), workspaceType: 'personal' } as WorkspaceCollabContext;
      const snapshot = snapshotFor('personal-a', { billingState: 'free', planId: 'free' });
      expect(snapshot).toBeTruthy();
      const response = { summary: personalPlusAccount, workspaceBalance: null,
        workspaceSnapshot: snapshot } as WorkspaceBillingResponse;
      if (kind === 'missing') response.workspaceSnapshot = null;
      if (kind === 'workspace' && response.workspaceSnapshot) response.workspaceSnapshot.workspaceId = 'other';
      if (kind === 'member' && response.workspaceSnapshot) response.workspaceSnapshot.workspaceMemberId = 'other';
      if (kind === 'scope-version' && response.workspaceSnapshot) Object.assign(response.workspaceSnapshot, { billingScopeVersion: 1 });
      if (kind === 'unknown' && response.workspaceSnapshot) response.workspaceSnapshot.billing = { billingState: 'active', planId: null };
      expect(workspaceBillingSummaryForContext(response, context)).toBe(personalPlusAccount);
    },
  );

  it('requires exact v2 Workspace proof for personal money too', () => {
    const personalContext = {
      workspaceId: 'personal-a',
      workspaceType: 'personal',
      workspaceMemberId: 'member-personal',
    } as WorkspaceCollabContext;
    const response = {
      summary: { ...personalPlusAccount, balanceUsd: '999.00' },
      workspaceBalance: {
        workspaceId: 'personal-a',
        workspaceMemberId: 'member-personal',
        balanceUsd: '12.34',
        billingScopeVersion: 2,
        expiresAt: null,
        updatedAt: null,
      },
    } as WorkspaceBillingResponse;

    expect(workspaceBillingBalanceUsd(response, personalContext)).toBe('12.34');
    expect(workspaceBillingBalanceUsd(
      { ...response, workspaceBalance: null },
      personalContext,
    )).toBeNull();
    expect(workspaceBillingBalanceUsd(
      {
        ...response,
        workspaceBalance: {
          ...response.workspaceBalance!,
          workspaceMemberId: 'different-member',
        },
      },
      personalContext,
    )).toBeNull();
  });
});

describe('useWorkspaceBilling explicit scope', () => {
  it.each(['fresh', 'stale', 'refreshing', 'error'] as const)(
    'stops consuming last-good money and plan after a %s runtime reaches hard TTL',
    (status) => {
      const response = {
        ...billingResponse('workspace-a', '1.25'),
        workspaceSnapshot: {
          schemaVersion: 1 as const,
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-workspace-a',
          billingScopeVersion: 2 as const,
          billing: { billingState: 'active', planId: 'team_pro' },
          wallet: {
            balanceUsd: '1.25',
            expiresAt: null,
            updatedAt: '2026-07-27T00:00:00.000Z',
          },
          revisions: { billing: '1', wallet: '1' },
        },
        workspaceRuntime: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-workspace-a',
          status,
          revision: '8',
          observedAt: '2020-01-01T00:00:00.000Z',
          softExpiresAt: '2020-01-01T00:00:30.000Z',
          hardExpiresAt: '2020-01-01T00:02:00.000Z',
          retryAt: null,
          errorCode: status === 'error' ? 'workspace_billing_unavailable' : null,
          reason: status === 'error' ? 'bounded-retry' : 'poll-floor',
          sourceGapDetected: false,
        },
      } satisfies WorkspaceBillingResponse;

      expect(workspaceBillingBalanceUsd(
        response,
        teamContext('workspace-a'),
      )).toBeNull();
      expect(workspaceBillingSnapshotForContext(
        response,
        teamContext('workspace-a'),
      )).toBeNull();
    },
  );

  it('expires runtime-managed money and plan on a hard-expiry timer and revalidates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
    let billingCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        const interestResponse = billingInterestResponse(input, init);
        if (interestResponse) return interestResponse;
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          if (billingCalls > 1) {
            return new Response(
              JSON.stringify({ error: 'workspace_billing_unavailable' }),
              { status: 503, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(JSON.stringify({
            ...billingResponse('workspace-a', '1.25'),
            workspaceSnapshot: {
              schemaVersion: 1,
              workspaceId: 'workspace-a',
              workspaceMemberId: 'member-workspace-a',
              billingScopeVersion: 2,
              billing: { billingState: 'active', planId: 'team_pro' },
              wallet: {
                balanceUsd: '1.25',
                expiresAt: null,
                updatedAt: '2026-07-27T00:00:00.000Z',
              },
              revisions: { billing: '1', wallet: '1' },
            },
            workspaceRuntime: {
              workspaceId: 'workspace-a',
              workspaceMemberId: 'member-workspace-a',
              status: 'fresh',
              revision: '8',
              observedAt: '2026-07-27T00:00:00.000Z',
              softExpiresAt: '2026-07-27T00:00:30.000Z',
              hardExpiresAt: '2026-07-27T00:00:01.000Z',
              retryAt: null,
              errorCode: null,
              reason: 'explicit-billing-read',
              sourceGapDetected: false,
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await vi.waitFor(() => {
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25');
      expect(hook.result.current?.workspaceSnapshot?.billing.planId).toBe('team_pro');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    await vi.waitFor(() => expect(billingCalls).toBe(2));
    expect(hook.result.current?.workspaceBalance).toBeNull();
    expect(hook.result.current?.workspaceSnapshot).toBeNull();
  });

  beforeEach(() => {
    window.sessionStorage.clear();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
  });

  function personalQuotaFixture() {
    const context = { ...teamContext('personal-a'), workspaceType: 'personal' as const, planId: 'go' };
    let spent = '250';
    let fail = false;
    let member = context.workspaceMemberId;
    let generatedOffset = 0;
    let resetAt: string | null = null;
    let runtimeManaged = false;
    let quotaRealtimeHealthy = false;
    const billingCalls: string[] = [];
    const preflightCalls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      if (url === '/api/workspace/directory') return workspaceDirectoryResponse(context);
      if (url.startsWith('/api/workspace/context')) return new Response(JSON.stringify({ context }));
      if (url.startsWith('/api/workspace/billing?')) {
        if (!url.includes('includePreflight=1')) billingCalls.push(url);
        else preflightCalls.push(url);
        if (fail) return new Response('', { status: 503 });
        return new Response(JSON.stringify({
          ...billingResponse('personal-a', '0'),
          workspaceSnapshot: {
            schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: member,
            billingScopeVersion: 2, billing: { planId: 'go', billingState: 'active' },
            wallet: { balanceUsd: '0', expiresAt: null, updatedAt: null },
            revisions: { billing: spent, wallet: spent },
            designPlanWindows: [{ kind: '7d', remainingCredits: String(1_000 - Number(spent)),
              limitCredits: '1000', windowStart: null, resetsAt: resetAt }],
          },
          ...(runtimeManaged ? { workspaceRuntime: {
            workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
            status: 'fresh', revision: '1', observedAt: new Date().toISOString(),
            hardExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            retryAt: null, errorCode: null, sourceGapDetected: false,
          } } : {}),
          quotaRealtime: { healthy: quotaRealtimeHealthy },
          preflight: {
            workspaceId: context.workspaceId, workspaceMemberId: member,
            generatedAt: new Date(Date.now() + generatedOffset).toISOString(), balanceUsd: '0',
            codingPlan: { eligible: true, tier: 'go', windows: [{ policyId: 'week',
              durationSeconds: 604800, usedCredits: spent, limitCredits: '1000', resetsAt: resetAt }] },
          },
        }));
      }
      return new Response('{}');
    });
    vi.stubGlobal('fetch', fetcher);
    return { context, billingCalls, preflightCalls,
      spend: (value: string) => { spent = value; },
      fail: () => { fail = true; },
      member: (value: string) => { member = value; },
      generatedOffset: (value: number) => { generatedOffset = value; },
      reset: (value: string) => { resetAt = value; },
      runtime: (healthy: boolean) => { runtimeManaged = true; quotaRealtimeHealthy = healthy; },
    };
  }

  it('bounds a shared wallet/quota event burst to one leading and one trailing read per five seconds', async () => {
    vi.useFakeTimers();
    const fixture = personalQuotaFixture();
    fixture.runtime(true);
    const first = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    const second = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await act(async () => {});
    expect(fixture.billingCalls).toHaveLength(1);
    const source = MockWorkspaceEventSource.instances[0]!;
    const emit = (id: number) => source.dispatch(
      id % 2 ? 'wallet-balance-changed' : 'coding-plan-usage-changed',
      { type: id % 2 ? 'wallet-balance-changed' : 'coding-plan-usage-changed',
        workspaceId: fixture.context.workspaceId, workspaceMemberId: fixture.context.workspaceMemberId,
        revision: `wallet-${id}`, eventId: `quota-${id}` },
    );
    fixture.spend('300');
    await act(async () => { emit(1); });
    expect(fixture.billingCalls).toHaveLength(2);
    expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('700');
    for (let id = 2; id <= 5; id += 1) {
      fixture.spend(String(id * 100));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); emit(id); });
      expect(fixture.billingCalls).toHaveLength(2);
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(fixture.billingCalls).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fixture.billingCalls).toHaveLength(3);
    expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('500');
    expect(second.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('500');
    // Continuous events must not keep pushing back the trailing boundary.
    for (let id = 6; id <= 9; id += 1) {
      fixture.spend(String(id * 100));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); emit(id); });
      expect(fixture.billingCalls).toHaveLength(3);
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(fixture.billingCalls).toHaveLength(4);
    expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('100');
    expect(second.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('100');
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fixture.billingCalls).toHaveLength(4);
  });

  it('refreshes personal quota without wallet changes when the daemon only manages wallet freshness', async () => {
    vi.useFakeTimers();
    const fixture = personalQuotaFixture();
    fixture.runtime(false);
    const hook = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await vi.waitFor(() => expect(hook.result.current?.preflight?.codingPlan.windows[0]?.usedCredits).toBe('250'));
    fixture.spend('500');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(hook.result.current?.preflight?.codingPlan.windows[0]?.usedCredits).toBe('500');
    expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('0');
  });

  it('shows a fast snapshot before a deferred preflight and never lets that late preflight replace newer money or windows', async () => {
    vi.useFakeTimers();
    const context = teamContext('split-a');
    const snapshotCalls: string[] = [];
    const preflightCalls: string[] = [];
    const pending: Array<() => void> = [];
    let balance = '10';
    const body = () => ({
      ...billingResponse(context.workspaceId, balance),
      workspaceSnapshot: {
        schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        billingScopeVersion: 2, billing: { planId: 'team_plus', billingState: 'active' },
        wallet: { balanceUsd: balance, expiresAt: null, updatedAt: null },
        revisions: { billing: balance, wallet: balance },
        designPlanWindows: [{ kind: '7d', remainingCredits: balance, limitCredits: '100',
          windowStart: null, resetsAt: null }],
      },
      preflight: { schemaVersion: 1, workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId, generatedAt: new Date().toISOString(),
        billingMode: 'shared', codingPlan: { eligible: true, tier: 'plus', windows: [] } },
      quotaRealtime: { healthy: true },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      const url = String(input);
      if (url === '/api/workspace/directory') return workspaceDirectoryResponse(context);
      if (url.startsWith('/api/workspace/context')) return new Response(JSON.stringify({ context }));
      if (url.startsWith('/api/workspace/billing?')) {
        if (url.includes('includePreflight=1')) {
          preflightCalls.push(url);
          const captured = body();
          return new Promise<Response>((resolve) => pending.push(() => resolve(new Response(JSON.stringify(captured)))));
        }
        snapshotCalls.push(url);
        return new Response(JSON.stringify(body()));
      }
      return new Response('{}');
    }));
    const first = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    await act(async () => {});
    // A later component joins the already-running advisory read, not just a
    // same-render mount burst, and receives its result without another query.
    const second = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    await act(async () => {});
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('10');
    expect(first.result.current?.preflight).toBeUndefined();
    expect(snapshotCalls).toHaveLength(1);
    expect(preflightCalls).toHaveLength(1);
    balance = '20';
    await act(async () => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed', workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId, revision: 'wallet-new',
      });
    });
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    await act(async () => { pending.shift()!(); });
    expect(first.result.current?.preflight).toMatchObject({ billingMode: 'shared' });
    expect(second.result.current?.preflight).toMatchObject({ billingMode: 'shared' });
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('20');
    expect(second.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(preflightCalls).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(preflightCalls).toHaveLength(2);
  });

  it.each(['snapshot', 'preflight'] as const)('shares %s 403 revocation and rejects the other channel completing late', async (revokedChannel) => {
    vi.useFakeTimers();
    const context = teamContext('revoked-split');
    let resolvePreflight!: (response: Response) => void;
    let resolveSnapshot!: (response: Response) => void;
    const pendingPreflight = new Promise<Response>((resolve) => { resolvePreflight = resolve; });
    const pendingSnapshot = new Promise<Response>((resolve) => { resolveSnapshot = resolve; });
    let snapshotCalls = 0;
    let preflightCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      const url = String(input);
      if (url === '/api/workspace/directory') return workspaceDirectoryResponse(context);
      if (url.startsWith('/api/workspace/context')) return new Response(JSON.stringify({ context }));
      if (url.includes('includePreflight=1')) {
        preflightCalls += 1;
        return preflightCalls === 1 ? pendingPreflight
          : new Response(JSON.stringify({ error: 'workspace_member_revoked' }), { status: 403 });
      }
      if (url.startsWith('/api/workspace/billing?')) {
        snapshotCalls += 1;
        if (snapshotCalls === 1) return new Response(JSON.stringify(billingResponse(context.workspaceId, '10')));
        if (snapshotCalls === 2 && revokedChannel === 'preflight') return pendingSnapshot;
        return new Response(JSON.stringify({ error: 'workspace_member_revoked' }), { status: 403 });
      }
      return new Response('{}');
    }));
    const first = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    const second = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    await act(async () => {});
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('10');
    expect(snapshotCalls).toBe(1);
    expect(preflightCalls).toBe(1);
    await act(async () => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed', workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId, revision: 'revoked-read',
      });
    });
    await act(async () => resolvePreflight(revokedChannel === 'preflight'
      ? new Response(JSON.stringify({ error: 'workspace_member_revoked' }), { status: 403 })
      : new Response(JSON.stringify({ ...billingResponse(context.workspaceId, '999'), preflight: {
        schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        generatedAt: new Date().toISOString(), billingMode: 'shared', codingPlan: { windows: [] },
      } }))));
    if (revokedChannel === 'preflight') {
      await act(async () => resolveSnapshot(new Response(JSON.stringify(billingResponse(context.workspaceId, '999')))));
    }
    expect(first.result.current).toBeNull();
    expect(second.result.current).toBeNull();
    // A late successful read cannot be replayed out of the GET coalescer after
    // revocation: the next explicit read must use the new shared read epoch.
    await act(async () => { notifyWorkspaceBillingRefresh(); });
    expect(snapshotCalls).toBe(3);
    expect(first.result.current).toBeNull();
    expect(second.result.current).toBeNull();
    expect(preflightCalls).toBe(2);
  });

  it('shares a genuine post-payment probe and rejects a pre-payment shared probe completing late', async () => {
    vi.useFakeTimers();
    const context = teamContext('payment-probe');
    let finishOld!: (response: Response) => void;
    const oldProbe = new Promise<Response>((resolve) => { finishOld = resolve; });
    let snapshots = 0;
    let probes = 0;
    let balance = '10';
    const evidence = (billingMode: string) => ({ ...billingResponse(context.workspaceId, '999'),
      preflight: { schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        generatedAt: new Date().toISOString(), billingMode, codingPlan: { windows: [] } } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      const url = String(input);
      if (url === '/api/workspace/directory') return workspaceDirectoryResponse(context);
      if (url.startsWith('/api/workspace/context')) return new Response(JSON.stringify({ context }));
      if (url.startsWith('/api/workspace/billing?')) {
        expect(new URL(url, 'http://open-design.test').searchParams.get('workspaceId')).toBe(context.workspaceId);
        expect(new Headers(init?.headers).get('x-od-workspace-runtime-client-id')).toBeTruthy();
        if (url.includes('includePreflight=1')) {
          probes += 1;
          return probes === 1 ? oldProbe : new Response(JSON.stringify(evidence('legacy_team')));
        }
        snapshots += 1;
        return new Response(JSON.stringify(billingResponse(context.workspaceId, balance)));
      }
      return new Response('{}');
    }));
    const first = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    const second = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    await act(async () => {});
    expect(snapshots).toBe(1);
    expect(probes).toBe(1);
    balance = '20';
    await act(async () => { await vi.advanceTimersByTimeAsync(251); notifyWorkspaceBillingRefresh(); });
    expect(snapshots).toBe(2);
    expect(probes).toBe(2);
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    expect(second.result.current?.preflight).toMatchObject({ billingMode: 'legacy_team' });
    await act(async () => finishOld(new Response(JSON.stringify(evidence('shared')))));
    expect(first.result.current?.preflight).toMatchObject({ billingMode: 'legacy_team' });
    expect(second.result.current?.preflight).toMatchObject({ billingMode: 'legacy_team' });
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    await act(async () => {
      // This is a later distinct subscription action, outside the existing
      // 250ms explicit-refresh burst shared by payment surfaces.
      await vi.advanceTimersByTimeAsync(251);
      for (const type of ['billing-subscription-changed', 'billing-changed']) {
        MockWorkspaceEventSource.instances[0]!.dispatch(type, { type,
          workspaceId: context.workspaceId, revision: 'one-purchase' });
      }
    });
    expect(snapshots).toBe(3);
    expect(probes).toBe(3);
  });

  it('retires pending consumption and deferred preflight when the exact scope changes', async () => {
    vi.useFakeTimers();
    const contextA = teamContext('split-scope-a');
    const contextB = teamContext('split-scope-b');
    const snapshots: string[] = [];
    let resolveOld!: (response: Response) => void;
    const oldPreflight = new Promise<Response>((resolve) => { resolveOld = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      const url = String(input);
      if (url === '/api/workspace/directory') return workspaceDirectoryResponse(contextA);
      if (url.startsWith('/api/workspace/context')) return new Response(JSON.stringify({ context: contextA }));
      if (url.startsWith('/api/workspace/billing?')) {
        const selected = new URL(url, 'http://open-design.test').searchParams.get('workspaceId');
        const context = selected === contextA.workspaceId ? contextA : contextB;
        if (url.includes('includePreflight=1')) {
          if (context === contextA) return oldPreflight;
          return new Response(JSON.stringify({ preflight: { schemaVersion: 1,
            workspaceId: contextB.workspaceId, workspaceMemberId: contextB.workspaceMemberId,
            generatedAt: new Date().toISOString(), billingMode: 'legacy_team', codingPlan: { windows: [] } } }));
        }
        snapshots.push(context.workspaceId);
        return new Response(JSON.stringify(billingResponse(context.workspaceId, context === contextA ? '10' : '20')));
      }
      return new Response('{}');
    }));
    const hook = renderHook(({ context, revision }) => useWorkspaceBillingResponse({ context, revision }), {
      initialProps: { context: contextA, revision: 0 },
    });
    await act(async () => {});
    const oldSource = MockWorkspaceEventSource.instances[0]!;
    const emitOld = (revision: string) => oldSource.dispatch('wallet-balance-changed', {
      type: 'wallet-balance-changed', workspaceId: contextA.workspaceId,
      workspaceMemberId: contextA.workspaceMemberId, revision,
    });
    await act(async () => { emitOld('1'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); emitOld('2'); });
    hook.rerender({ context: contextB, revision: 1 });
    await act(async () => {});
    expect(hook.result.current?.workspaceBalance?.workspaceId).toBe(contextB.workspaceId);
    await act(async () => {
      resolveOld(new Response(JSON.stringify({ preflight: { schemaVersion: 1,
        workspaceId: contextA.workspaceId, workspaceMemberId: contextA.workspaceMemberId,
        generatedAt: new Date().toISOString(), billingMode: 'shared', codingPlan: { windows: [] } } })));
      emitOld('late');
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(snapshots.filter((id) => id === contextA.workspaceId)).toHaveLength(2);
    expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    expect(hook.result.current?.preflight).toMatchObject({ workspaceId: contextB.workspaceId, billingMode: 'legacy_team' });
  });

  it('clears account-owned billing during identity confirmation and reads the new account without the consumption delay', async () => {
    vi.useFakeTimers();
    const contextA = teamContext('account-switch-a');
    const contextB = teamContext('account-switch-b');
    let switched = false;
    let resolveDirectory!: (response: Response) => void;
    const pendingDirectory = new Promise<Response>((resolve) => { resolveDirectory = resolve; });
    let resolveOldPreflight!: (response: Response) => void;
    const pendingOldPreflight = new Promise<Response>((resolve) => { resolveOldPreflight = resolve; });
    const snapshots: { workspaceId: string; at: number }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      const url = String(input);
      if (url === '/api/workspace/directory') {
        return switched ? pendingDirectory : workspaceDirectoryResponse(contextA);
      }
      if (url.startsWith('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: switched ? contextB : contextA }));
      }
      if (url.startsWith('/api/workspace/billing?')) {
        const id = new URL(url, 'http://open-design.test').searchParams.get('workspaceId')!;
        if (url.includes('includePreflight=1')) {
          return id === contextA.workspaceId ? pendingOldPreflight : new Response('{}');
        }
        snapshots.push({ workspaceId: id, at: Date.now() });
        return new Response(JSON.stringify(billingResponse(id, id === contextA.workspaceId ? '13.10' : '8.50')));
      }
      return new Response('{}');
    }));
    const hook = renderHook(() => useWorkspaceBillingResponse());
    await vi.waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('13.10'));
    const previousReads = snapshots.filter((read) => read.workspaceId === contextA.workspaceId).length;
    const switchedAt = Date.now();
    await act(async () => {
      switched = true;
      notifyWorkspaceContextRefresh();
      notifyWorkspaceBillingRefresh();
    });
    // The navigation shell may retain A's name, but its account-owned money
    // cannot remain visible or launch a new old-scope read under B's login.
    expect(hook.result.current).toBeNull();
    expect(snapshots.filter((read) => read.workspaceId === contextA.workspaceId)).toHaveLength(previousReads);
    await act(async () => resolveDirectory(workspaceDirectoryResponse(contextB)));
    await vi.waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('8.50'));
    expect(snapshots.find((read) => read.workspaceId === contextB.workspaceId)!.at - switchedAt).toBeLessThan(5_000);
    await act(async () => resolveOldPreflight(new Response(JSON.stringify({
      ...billingResponse(contextA.workspaceId, '999'),
      preflight: { schemaVersion: 1, workspaceId: contextA.workspaceId,
        workspaceMemberId: contextA.workspaceMemberId, generatedAt: new Date().toISOString(),
        billingMode: 'shared', codingPlan: { windows: [] } },
    }))));
    expect(hook.result.current?.workspaceBalance?.workspaceId).toBe(contextB.workspaceId);
    expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('8.50');
  });

  it('keeps idle advisory evidence fresh with one shared visible 30s poll and stops it while hidden or unmounted', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      const fixture = personalQuotaFixture();
      fixture.runtime(true);
      const first = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
      const second = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
      await act(async () => { MockWorkspaceEventSource.instances[0]!.onopen?.(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
      expect(fixture.billingCalls).toHaveLength(1);
      expect(fixture.preflightCalls).toHaveLength(3);
      expect(Date.now() - Date.parse(first.result.current!.preflight!.generatedAt)).toBe(10_000);
      expect(second.result.current?.preflight?.generatedAt).toBe(first.result.current?.preflight?.generatedAt);
      visibility.mockReturnValue('hidden');
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
      expect(fixture.preflightCalls).toHaveLength(3);
      expect(first.result.current?.preflight).toBeUndefined();
      visibility.mockReturnValue('visible');
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(fixture.preflightCalls).toHaveLength(4);
      expect(first.result.current?.preflight?.generatedAt).toBe(new Date().toISOString());
      first.unmount();
      second.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
      expect(fixture.preflightCalls).toHaveLength(4);
    } finally {
      visibility.mockRestore();
    }
  });

  it('joins an in-flight consumption read when another component mounts after the force burst', async () => {
    vi.useFakeTimers();
    const context = teamContext('late-consumer');
    let resolveDisplay!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveDisplay = resolve; });
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const interest = billingInterestResponse(input, init);
      if (interest) return interest;
      const url = String(input);
      if (url === '/api/workspace/directory') return workspaceDirectoryResponse(context);
      if (url.startsWith('/api/workspace/context')) return new Response(JSON.stringify({ context }));
      if (url.includes('includePreflight=1')) return new Response('{}');
      if (url.startsWith('/api/workspace/billing?')) {
        reads += 1;
        return reads === 1 ? new Response(JSON.stringify(billingResponse(context.workspaceId, '10'))) : pending;
      }
      return new Response('{}');
    }));
    const first = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    await act(async () => {});
    await act(async () => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed', workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId, revision: 'late-display',
      });
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const second = renderHook(() => useWorkspaceBillingResponse({ context, revision: 0 }));
    await act(async () => {});
    expect(reads).toBe(2);
    await act(async () => resolveDisplay(new Response(JSON.stringify(billingResponse(context.workspaceId, '20')))));
    expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    expect(second.result.current?.workspaceBalance?.balanceUsd).toBe('20');
    expect(reads).toBe(2);
  });

  it('keeps explicit purchase and subscription refreshes immediate while runtime nudges share the consumption limit', async () => {
    vi.useFakeTimers();
    const fixture = personalQuotaFixture();
    renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await act(async () => {});
    const source = MockWorkspaceEventSource.instances[0]!;
    const emit = (type: string, revision: string) => source.dispatch(type, {
      type, workspaceId: fixture.context.workspaceId,
      workspaceMemberId: fixture.context.workspaceMemberId, revision,
    });
    await act(async () => emit('wallet-balance-changed', 'spend-1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); emit('wallet-balance-changed', 'spend-2'); });
    expect(fixture.billingCalls).toHaveLength(2);
    await act(async () => { notifyWorkspaceBillingRefresh(); });
    expect(fixture.billingCalls).toHaveLength(3);
    await act(async () => emit('billing-subscription-changed', 'purchase-1'));
    expect(fixture.billingCalls).toHaveLength(4);
    await act(async () => emit('billing-changed', 'runtime:7'));
    expect(fixture.billingCalls).toHaveLength(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_499); });
    expect(fixture.billingCalls).toHaveLength(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fixture.billingCalls).toHaveLength(5);
  });

  it('uses member-scoped quota events while healthy and restores the safety floor after disconnect', async () => {
    vi.useFakeTimers();
    const fixture = personalQuotaFixture();
    fixture.runtime(true);
    const hook = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await vi.waitFor(() => expect(hook.result.current?.preflight).toBeTruthy());
    const source = MockWorkspaceEventSource.instances[0]!;
    await act(async () => { source.onopen?.(); });
    const before = fixture.billingCalls.length;
    fixture.spend('500');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fixture.billingCalls).toHaveLength(before);
    const payload = { type: 'coding-plan-usage-changed', workspaceId: fixture.context.workspaceId,
      workspaceMemberId: fixture.context.workspaceMemberId, eventId: '1' };
    await act(async () => { source.dispatch(payload.type, { ...payload, workspaceMemberId: 'other' }); });
    expect(fixture.billingCalls).toHaveLength(before);
    await act(async () => { source.dispatch(payload.type, payload); });
    expect(hook.result.current?.preflight?.codingPlan.windows[0]?.usedCredits).toBe('500');
    fixture.spend('750');
    await act(async () => { source.onerror?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(hook.result.current?.preflight?.codingPlan.windows[0]?.usedCredits).toBe('750');
  });

  it('shares personal quota with the existing cache and refreshes on scoped SSE without clearing it', async () => {
    const fixture = personalQuotaFixture();
    const first = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await waitFor(() => expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('750'));
    expect(fixture.billingCalls).toHaveLength(1);
    const cached = first.result.current;
    const second = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    expect(second.result.current?.preflight).toEqual(cached?.preflight);
    await act(async () => {});
    expect(fixture.billingCalls).toHaveLength(1);
    fixture.spend('500');
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed', workspaceId: 'other', workspaceMemberId: fixture.context.workspaceMemberId, revision: 'wrong',
      });
    });
    expect(fixture.billingCalls).toHaveLength(1);
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed', workspaceId: fixture.context.workspaceId,
        workspaceMemberId: fixture.context.workspaceMemberId, revision: 'quota-new',
      });
      expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('750');
    });
    await waitFor(() => expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('500'));
    expect(fixture.billingCalls).toHaveLength(2);
    expect(second.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('500');
    fixture.fail();
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed', workspaceId: fixture.context.workspaceId, revision: 'quota-offline',
      });
    });
    await act(async () => {});
    expect(first.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('500');
  });

  it.each(['member', 'stale', 'future'])('rejects an invalid personal quota snapshot: %s', async (reason) => {
    const fixture = personalQuotaFixture();
    if (reason === 'member') fixture.member('other');
    else fixture.generatedOffset(reason === 'stale' ? -120000 : 120000);
    const hook = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    expect(hook.result.current?.preflight).toBeUndefined();
  });

  it('refreshes the shared quota once at its server reset without a hover', async () => {
    vi.useFakeTimers();
    const fixture = personalQuotaFixture();
    fixture.reset(new Date(Date.now() + 10000).toISOString());
    const hook = renderHook(() => useWorkspaceBillingResponse({ context: fixture.context, revision: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fixture.billingCalls).toHaveLength(1);
    fixture.spend('0');
    await act(async () => { await vi.advanceTimersByTimeAsync(10249); });
    expect(fixture.billingCalls).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fixture.billingCalls).toHaveLength(2);
    expect(hook.result.current?.workspaceSnapshot?.designPlanWindows?.[0]?.remainingCredits).toBe('1000');
  });

  it('does not request billing before an exact Workspace identity exists', async () => {
    const billingCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return new Response(JSON.stringify(workspaceDirectoryFixture([])), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() =>
      useWorkspaceBillingResponse({ context: null, loading: false }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.result.current).toBeNull();
    expect(billingCalls).toEqual([]);
  });

  it('accepts only v2 invalidations for the selected workspace and member', () => {
    const context = teamContext('workspace-a');
    expect(
      shouldRefreshWorkspaceBilling(
        {
          type: 'billing-subscription-changed',
          workspaceId: 'workspace-a',
          revision: 'billing-2',
        },
        context,
      ),
    ).toBe(true);
    expect(
      shouldRefreshWorkspaceBilling(
        {
          type: 'wallet-balance-changed',
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-workspace-a',
          revision: 'wallet-2',
        },
        context,
      ),
    ).toBe(true);
    expect(
      shouldRefreshWorkspaceBilling(
        {
          type: 'wallet-balance-changed',
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-other',
          revision: 'wallet-3',
        },
        context,
      ),
    ).toBe(false);
    expect(
      shouldRefreshWorkspaceBilling(
        {
          type: 'billing-changed',
          workspaceId: 'workspace-b',
          revision: 'legacy-v2-alias',
        },
        context,
      ),
    ).toBe(false);
    expect(
      shouldRefreshWorkspaceBilling(
        {
          type: 'wallet-balance-changed',
          workspaceId: 'workspace-b',
          workspaceMemberId: 'member-workspace-a',
        },
        context,
      ),
    ).toBe(false);
  });

  it('forces a fresh read for legacy and matching v2 billing invalidations', async () => {
    let balance = '1.25';
    const billingCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
          return new Response(JSON.stringify(billingResponse('workspace-a', balance)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25'));
    expect(MockWorkspaceEventSource.instances).toHaveLength(1);

    balance = '2.50';
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed',
      });
    });
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('2.50'));

    const beforeForeign = billingCalls.length;
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-other',
        revision: 'wallet-foreign',
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(billingCalls).toHaveLength(beforeForeign);

    balance = '3.75';
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-workspace-a',
        revision: 'wallet-current',
      });
    });
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('3.75'));

    balance = '4.00';
    const beforeAliases = billingCalls.length;
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-subscription-changed', {
        type: 'billing-subscription-changed',
        workspaceId: 'workspace-a',
        revision: 'shared-revision',
      });
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed',
        workspaceId: 'workspace-a',
        revision: 'shared-revision',
      });
    });
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('4.00'));
    expect(billingCalls.length - beforeAliases).toBe(1);
  });

  it('keeps ambient B and explicit project A in one renderer interest set', async () => {
    const projectA = teamContext('workspace-a');
    let ambientBalance = '1.25';
    const observedClientIds = new Map<string, string>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        const interestResponse = billingInterestResponse(input, init);
        if (interestResponse) return interestResponse;
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-b'));
        }
        if (url === '/api/workspace/context') {
          return new Response(
            JSON.stringify({ context: teamContext('workspace-b') }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.startsWith('/api/workspace/billing?')) {
          const workspaceId = new URL(
            url,
            'http://open-design.test',
          ).searchParams.get('workspaceId')!;
          const headers = new Headers(init?.headers);
          const clientId =
            headers.get('x-od-workspace-runtime-client-id') ?? '';
          observedClientIds.set(workspaceId, clientId);
          return new Response(
            JSON.stringify(billingResponse(
              workspaceId,
              workspaceId === 'workspace-b' ? ambientBalance : '8.50',
            )),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => ({
      ambient: useWorkspaceBillingResponse(),
      project: useWorkspaceBillingResponse({
        context: projectA,
        loading: false,
        revision: 'project-a',
      }),
    }));
    await waitFor(() => {
      expect(hook.result.current.ambient?.workspaceBalance?.balanceUsd).toBe(
        '1.25',
      );
      expect(hook.result.current.project?.workspaceBalance?.balanceUsd).toBe(
        '8.50',
      );
    });
    expect(observedClientIds.get('workspace-a')).toBeTruthy();
    expect(observedClientIds.get('workspace-b')).toBeTruthy();
    expect(observedClientIds.get('workspace-a')).toBe(
      observedClientIds.get('workspace-b'),
    );

    ambientBalance = '3.75';
    act(() => {
      for (const source of MockWorkspaceEventSource.instances) {
        source.dispatch('wallet-balance-changed', {
          type: 'wallet-balance-changed',
          workspaceId: 'workspace-b',
          workspaceMemberId: 'member-workspace-b',
          revision: 'wallet-b-2',
        });
      }
    });
    await waitFor(() => {
      expect(hook.result.current.ambient?.workspaceBalance?.balanceUsd).toBe(
        '3.75',
      );
    });
    expect(hook.result.current.project?.workspaceBalance?.balanceUsd).toBe(
      '8.50',
    );
  });

  it('idles after the final same-scope consumer unmounts and reactivates on remount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'));
    const context = teamContext('workspace-a');
    const traffic: Array<{
      kind: 'interest' | 'billing';
      method: string;
      generation: string;
    }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url.startsWith('/api/workspace/billing/interests/')) {
          if (init?.method === 'DELETE') {
            traffic.push({
              kind: 'interest',
              method: 'DELETE',
              generation:
                new URL(url, 'http://open-design.test').searchParams.get(
                  'generation',
                ) ?? '',
            });
            return new Response(JSON.stringify({ ok: true, released: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          const body = JSON.parse(String(init?.body)) as {
            generation: string;
          };
          traffic.push({
            kind: 'interest',
            method: init?.method ?? 'GET',
            generation: body.generation,
          });
          const clientId = decodeURIComponent(
            new URL(url, 'http://open-design.test').pathname.split('/').at(-1)!,
          );
          return new Response(JSON.stringify({
            clientId,
            acceptedGeneration: body.generation,
            leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(context);
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          traffic.push({
            kind: 'billing',
            method: init?.method ?? 'GET',
            generation:
              new Headers(init?.headers).get(
                'x-od-workspace-runtime-generation',
              ) ?? '',
          });
          return new Response(
            JSON.stringify(billingResponse('workspace-a', '1.25')),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const firstMount = renderHook(() => ({
      first: useWorkspaceBillingResponse({
        context,
        revision: 'same-scope',
      }),
      second: useWorkspaceBillingResponse({
        context,
        revision: 'same-scope',
      }),
    }));
    await vi.waitFor(() => {
      expect(firstMount.result.current.first?.workspaceBalance?.balanceUsd).toBe(
        '1.25',
      );
      expect(firstMount.result.current.second?.workspaceBalance?.balanceUsd).toBe(
        '1.25',
      );
    });
    expect(traffic.filter(({ kind }) => kind === 'billing')).toEqual([
      { kind: 'billing', method: 'GET', generation: '1' },
    ]);
    expect(
      traffic.filter(
        ({ kind, method }) => kind === 'interest' && method === 'PUT',
      ),
    ).toEqual([{ kind: 'interest', method: 'PUT', generation: '1' }]);

    firstMount.unmount();
    await vi.waitFor(() => {
      expect(
        traffic.filter(
          ({ kind, method }) => kind === 'interest' && method === 'DELETE',
        ),
      ).toEqual([{ kind: 'interest', method: 'DELETE', generation: '2' }]);
    });
    const billingReadsAtIdle = traffic.filter(
      ({ kind }) => kind === 'billing',
    ).length;
    const idleStartedAt = traffic.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(traffic.filter(({ kind }) => kind === 'billing')).toHaveLength(
      billingReadsAtIdle,
    );
    expect(traffic.slice(idleStartedAt)).toEqual([]);

    const remountStartedAt = traffic.length;
    const remount = renderHook(() =>
      useWorkspaceBillingResponse({
        context,
        revision: 'same-scope',
      }),
    );
    await vi.waitFor(() => {
      expect(
        traffic.filter(({ kind }) => kind === 'billing'),
      ).toHaveLength(billingReadsAtIdle + 1);
    });
    expect(traffic.slice(remountStartedAt)).toEqual([
      { kind: 'interest', method: 'PUT', generation: '3' },
      { kind: 'billing', method: 'GET', generation: '3' },
    ]);
    remount.unmount();
    await vi.waitFor(() => {
      expect(
        traffic.filter(
          ({ kind, method }) => kind === 'interest' && method === 'DELETE',
        ),
      ).toEqual([
        { kind: 'interest', method: 'DELETE', generation: '2' },
        { kind: 'interest', method: 'DELETE', generation: '4' },
      ]);
    });
  });

  it('rejects a late response from the first A after switching A to B to A', async () => {
    let currentContext = teamContext('workspace-a');
    let billingACalls = 0;
    let resolveOldA!: (response: Response) => void;
    const oldAResponse = new Promise<Response>((resolve) => {
      resolveOldA = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(currentContext);
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: currentContext }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          const workspaceId = new URL(url, 'http://open-design.test').searchParams.get(
            'workspaceId',
          );
          if (workspaceId === 'workspace-b') {
            return new Response(JSON.stringify(billingResponse('workspace-b', '8.50')), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (workspaceId === 'workspace-a') {
            billingACalls += 1;
            if (billingACalls === 1) {
              return new Response(JSON.stringify(billingResponse('workspace-a', '1.25')), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              });
            }
            if (billingACalls === 2) return oldAResponse;
            return new Response(JSON.stringify(billingResponse('workspace-a', '3.75')), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25'));

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed',
        at: 1,
      });
    });
    await waitFor(() => expect(billingACalls).toBe(2));

    currentContext = teamContext('workspace-b');
    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => {
      expect(hook.result.current?.workspaceBalance?.workspaceId).toBe('workspace-b');
    });

    // Explicit refreshes are burst-coalesced for multi-consumer mounts. This is
    // a separate user switch, outside that one-event burst.
    await new Promise((resolve) => setTimeout(resolve, 300));
    currentContext = teamContext('workspace-a');
    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => {
      expect(hook.result.current?.workspaceBalance).toMatchObject({
        workspaceId: 'workspace-a',
        balanceUsd: '3.75',
      });
    });

    await act(async () => {
      resolveOldA(
        new Response(JSON.stringify(billingResponse('workspace-a', '0.50')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await oldAResponse;
    });
    expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('3.75');
  });

  it('keeps last-good money on a pushed read failure and retries after five seconds', async () => {
    let billingCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          if (billingCalls === 2) throw new Error('temporary daemon read failure');
          const balance = billingCalls >= 3 ? '2.50' : '1.25';
          return new Response(JSON.stringify(billingResponse('workspace-a', balance)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25'));

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed',
        at: 2,
      });
    });
    await waitFor(() => expect(billingCalls).toBe(2));
    expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25');

    await waitFor(
      () => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('2.50'),
      { timeout: 6_000 },
    );
  }, 7_000);

  it('backs off exponentially while billing keeps failing and re-arms at the base delay after a success', async () => {
    // Packaged-client regression (first-open loading spin): the od:// proxy
    // answers billing with synthetic 502s under bursty first-open load, and a
    // FIXED 5s retry cadence kept feeding the burst it was waiting out. The
    // schedule must grow 5s → 10s → 20s → 40s … and reset once a read succeeds.
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden', // silence the 30s compatibility poll — this test meters retries only
    });
    let billingCalls = 0;
    let failBilling = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const interest = billingInterestResponse(input, init);
        if (interest) return interest;
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          if (failBilling) {
            return new Response(JSON.stringify({ error: 'od_protocol_proxy_failed' }), {
              status: 502,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(billingResponse('workspace-a', '2.50')), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const flush = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    try {
      const hook = renderHook(() => useWorkspaceBillingResponse());
      await flush(0);
      await flush(0);
      expect(billingCalls).toBe(1); // mount read failed (502)

      await flush(5_000); // 1st retry at base 5s
      expect(billingCalls).toBe(2);

      await flush(5_000); // t=10s — a fixed 5s cadence would fire here
      expect(billingCalls).toBe(2); // backed off: next retry is 10s out

      await flush(5_000); // t=15s — the 10s retry lands
      expect(billingCalls).toBe(3);

      await flush(20_000); // t=35s — the 20s retry lands
      expect(billingCalls).toBe(4);

      failBilling = false;
      await flush(40_000); // t=75s — the 40s retry lands and SUCCEEDS
      expect(billingCalls).toBe(5);
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('2.50');

      // A later failure starts over at the base delay — the success reset
      // the consecutive-failure count.
      failBilling = true;
      act(() => {
        notifyWorkspaceBillingRefresh();
      });
      await flush(0);
      expect(billingCalls).toBe(6); // pushed refresh failed (502)
      await flush(5_000); // retry at base 5s again, not 60s
      expect(billingCalls).toBe(7);
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  }, 15_000);

  it('a retry joins a concurrent consumer\'s fresh success instead of stampeding another request', async () => {
    // De-forcing the retry path: failures are never cached, so the plain
    // coalesced read is a genuine refetch — and when another mounted consumer
    // just fetched a fresh success, the retry must share it (zero new network
    // requests against a struggling transport) rather than evict it.
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    let billingCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const interest = billingInterestResponse(input, init);
        if (interest) return interest;
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          if (billingCalls === 1) {
            return new Response(JSON.stringify({ error: 'od_protocol_proxy_failed' }), {
              status: 502,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(billingResponse('workspace-a', '2.50')), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const flush = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    try {
      const first = renderHook(() => useWorkspaceBillingResponse());
      await flush(0);
      await flush(0);
      expect(billingCalls).toBe(1); // first consumer's mount read failed → retry armed at +5s

      await flush(4_500);
      const second = renderHook(() => useWorkspaceBillingResponse());
      await flush(0);
      await flush(0);
      expect(billingCalls).toBe(2); // second consumer's mount read succeeded
      expect(second.result.current?.workspaceBalance?.balanceUsd).toBe('2.50');

      await flush(500); // t=5s — the first consumer's retry fires
      expect(billingCalls).toBe(2); // joined the 0.5s-old success; no third request
      expect(first.result.current?.workspaceBalance?.balanceUsd).toBe('2.50');
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  }, 15_000);

  it('keeps daemon-authored last-good state on a retryable directory outage', async () => {
    let billingCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          if (billingCalls === 2) {
            return new Response(
              JSON.stringify({ error: 'workspace_directory_unavailable' }),
              {
                status: 503,
                headers: { 'content-type': 'application/json' },
              },
            );
          }
          return new Response(JSON.stringify({
            ...billingResponse('workspace-a', '1.25'),
            workspaceRuntime: {
              workspaceId: 'workspace-a',
              workspaceMemberId: 'member-workspace-a',
              status: 'fresh',
              revision: '7',
              observedAt: '2026-07-27T00:00:00.000Z',
              softExpiresAt: '2099-07-27T00:00:30.000Z',
              hardExpiresAt: '2099-07-27T00:02:00.000Z',
              retryAt: null,
              errorCode: null,
              reason: 'explicit-billing-read',
              sourceGapDetected: false,
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25'));

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed',
        at: 3,
      });
    });

    await waitFor(() => {
      expect(billingCalls).toBe(2);
      expect(hook.result.current).toMatchObject({
        workspaceBalance: {
          workspaceId: 'workspace-a',
          balanceUsd: '1.25',
        },
        workspaceRuntime: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-workspace-a',
          status: 'fresh',
          errorCode: null,
        },
      });
    });
  });

  it('clears same-scope last-good money on a confirmed 403 revocation', async () => {
    let billingCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          if (billingCalls === 2) {
            return new Response(
              JSON.stringify({ error: 'workspace_not_authorized' }),
              {
                status: 403,
                headers: { 'content-type': 'application/json' },
              },
            );
          }
          return new Response(
            JSON.stringify(billingResponse('workspace-a', '1.25')),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25'));

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('billing-changed', {
        type: 'billing-changed',
        at: 4,
      });
    });

    await waitFor(() => {
      expect(billingCalls).toBe(2);
      expect(hook.result.current).toBeNull();
    });
  });

  it('projects the authoritative workspace plan over stale account metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          return new Response(JSON.stringify({
            ...billingResponse('workspace-a', '1.25'),
            summary: {
              ...billingResponse('workspace-a', '1.25').summary,
              membershipTier: 'free',
              subscriptionStatus: 'inactive',
            },
            workspaceSnapshot: {
              schemaVersion: 1,
              workspaceId: 'workspace-a',
              workspaceMemberId: 'member-workspace-a',
              billingScopeVersion: 2,
              billing: { billingState: 'active', planId: 'team_plus' },
              wallet: {
                balanceUsd: '1.25',
                expiresAt: null,
                updatedAt: '2026-07-27T00:00:00Z',
              },
              revisions: { billing: 'b2', wallet: 'w2' },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBilling());
    await waitFor(() => expect(hook.result.current?.membershipTier).toBe('team_plus'));
    expect(hook.result.current?.subscriptionStatus).toBe('active');
  });

  it('keys A and B separately and never shows A while B is still loading', async () => {
    let currentContext = teamContext('workspace-a');
    let resolveWorkspaceB!: (response: Response) => void;
    const workspaceBResponse = new Promise<Response>((resolve) => {
      resolveWorkspaceB = resolve;
    });
    const billingCalls: string[] = [];
    const runtimeHeaders: Array<{ clientId: string; generation: string }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        const interestResponse = billingInterestResponse(input, init);
        if (interestResponse) return interestResponse;
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(currentContext);
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: currentContext }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
          const headers = new Headers(init?.headers);
          runtimeHeaders.push({
            clientId: headers.get('x-od-workspace-runtime-client-id') ?? '',
            generation: headers.get('x-od-workspace-runtime-generation') ?? '',
          });
          const parsed = new URL(url, 'http://open-design.test');
          const workspaceId = parsed.searchParams.get('workspaceId');
          expect(parsed.searchParams.get('scope')).toBe('workspace');
          if (workspaceId === 'workspace-a') {
            return new Response(JSON.stringify(billingResponse('workspace-a', '1.25')), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (workspaceId === 'workspace-b') return workspaceBResponse;
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => {
      expect(hook.result.current?.workspaceBalance?.workspaceId).toBe('workspace-a');
    });

    currentContext = teamContext('workspace-b');
    await act(async () => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(
        billingCalls.some((url) => url.includes('workspaceId=workspace-b')),
      ).toBe(true);
    });
    expect(hook.result.current).toBeNull();

    await act(async () => {
      resolveWorkspaceB(
        new Response(JSON.stringify(billingResponse('workspace-b', '8.50')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    await waitFor(() => {
      expect(hook.result.current?.workspaceBalance).toMatchObject({
        workspaceId: 'workspace-b',
        balanceUsd: '8.50',
      });
    });

    expect(billingCalls).toEqual([
      '/api/workspace/billing?scope=workspace&workspaceId=workspace-a',
      '/api/workspace/billing?scope=workspace&workspaceId=workspace-b',
    ]);
    expect(runtimeHeaders).toHaveLength(2);
    expect(runtimeHeaders[0]!.clientId).not.toBe('');
    expect(runtimeHeaders[1]!.clientId).toBe(runtimeHeaders[0]!.clientId);
    expect(BigInt(runtimeHeaders[1]!.generation)).toBeGreaterThan(
      BigInt(runtimeHeaders[0]!.generation),
    );
  });

  it('gives each renderer page lifecycle an independent runtime client id', async () => {
    const runtimeHeaders: Array<{ clientId: string; generation: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        const interestResponse = billingInterestResponse(input, init);
        if (interestResponse) return interestResponse;
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          const headers = new Headers(init?.headers);
          runtimeHeaders.push({
            clientId: headers.get('x-od-workspace-runtime-client-id') ?? '',
            generation: headers.get('x-od-workspace-runtime-generation') ?? '',
          });
          return new Response(JSON.stringify(billingResponse('workspace-a', '1.25')), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const firstPage = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(runtimeHeaders).toHaveLength(1));
    firstPage.unmount();

    // The reset seam models a new renderer module/page lifecycle while keeping
    // sessionStorage intact, as Duplicate Tab/window.open may do.
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();

    const secondPage = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(runtimeHeaders).toHaveLength(2));
    secondPage.unmount();

    expect(runtimeHeaders[0]!.clientId).not.toBe('');
    expect(runtimeHeaders[1]!.clientId).not.toBe(runtimeHeaders[0]!.clientId);
    expect(runtimeHeaders.map((header) => header.generation)).toEqual(['1', '1']);
  });

  it('retains additive daemon runtime freshness metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          return new Response(JSON.stringify({
            ...billingResponse('workspace-a', '1.25'),
            workspaceRuntime: {
              workspaceId: 'workspace-a',
              workspaceMemberId: 'member-workspace-a',
              status: 'fresh',
              revision: '7',
              observedAt: '2026-07-27T00:00:00.000Z',
              retryAt: null,
              errorCode: null,
              reason: 'poll-floor',
              sourceGapDetected: false,
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(hook.result.current?.workspaceRuntime).toMatchObject({
      status: 'fresh',
      revision: '7',
      reason: 'poll-floor',
    }));
  });

  it('keeps the browser safety floor only until daemon runtime metadata appears', async () => {
    vi.useFakeTimers();
    let billingCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls += 1;
          return new Response(JSON.stringify({
            ...billingResponse('workspace-a', String(billingCalls)),
            ...(billingCalls > 1
              ? {
                  workspaceRuntime: {
                    workspaceId: 'workspace-a',
                    workspaceMemberId: 'member-workspace-a',
                    status: 'fresh',
                    revision: String(billingCalls),
                    observedAt: '2026-07-27T00:00:00.000Z',
                    retryAt: null,
                    errorCode: null,
                    reason: 'poll-floor',
                    sourceGapDetected: false,
                  },
                }
              : {}),
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await vi.waitFor(() => expect(billingCalls).toBe(1));
    expect(hook.result.current?.workspaceRuntime).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await vi.waitFor(() => expect(billingCalls).toBe(2));
    expect(hook.result.current?.workspaceRuntime?.status).toBe('fresh');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(billingCalls).toBe(2);
  });

  it('keeps explicit project billing pinned while ambient navigation is elsewhere', async () => {
    let balance = '13.10';
    const billingCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-b'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-b') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
          const workspaceId = new URL(url, 'http://localhost').searchParams.get('workspaceId');
          if (workspaceId !== 'workspace-a') {
            return new Response(JSON.stringify({ error: 'wrong_scope' }), { status: 409 });
          }
          return new Response(JSON.stringify(billingResponse('workspace-a', balance)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() =>
      useWorkspaceBillingResponse({
        context: teamContext('workspace-a'),
        revision: 'project-a:workspace-a',
      }),
    );
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('13.10'),
    );
    expect(billingCalls).toEqual([
      '/api/workspace/billing?scope=workspace&workspaceId=workspace-a',
    ]);

    const beforeForeign = billingCalls.length;
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed',
        workspaceId: 'workspace-b',
        workspaceMemberId: 'member-workspace-b',
        revision: 'foreign-b',
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(billingCalls).toHaveLength(beforeForeign);

    balance = '14.20';
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-workspace-a',
        revision: 'project-a-wallet',
      });
    });
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('14.20'),
    );
  });

  it('moves the explicit project cache key when its authoritative member changes', async () => {
    const billingMembers: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-b'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-b') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          const memberId = billingMembers.length === 0 ? 'member-old' : 'member-new';
          billingMembers.push(memberId);
          const response = billingResponse(
            'workspace-a',
            memberId === 'member-old' ? '1.00' : '2.00',
          );
          response.workspaceBalance.workspaceMemberId = memberId;
          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(
      ({ context }) =>
        useWorkspaceBillingResponse({
          context,
          revision: 'project-a:workspace-a',
        }),
      {
        initialProps: {
          context: {
            ...teamContext('workspace-a'),
            workspaceMemberId: 'member-old',
          },
        },
      },
    );
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance?.workspaceMemberId).toBe('member-old'),
    );

    hook.rerender({
      context: {
        ...teamContext('workspace-a'),
        workspaceMemberId: 'member-new',
      },
    });
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance).toMatchObject({
        workspaceMemberId: 'member-new',
        balanceUsd: '2.00',
      }),
    );
    expect(billingMembers).toEqual(['member-old', 'member-new']);
  });

  it('keeps B when the initial A context response arrives after the explicit switch', async () => {
    let resolveWorkspaceAContext!: (response: Response) => void;
    const workspaceAContextResponse = new Promise<Response>((resolve) => {
      resolveWorkspaceAContext = resolve;
    });
    let contextCalls = 0;
    const billingCalls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-b'));
        }
        if (url === '/api/workspace/context') {
          contextCalls += 1;
          if (contextCalls === 1) return workspaceAContextResponse;
          if (contextCalls === 2) {
            return new Response(JSON.stringify({ context: teamContext('workspace-b') }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
          const workspaceId = new URL(url, 'http://open-design.test').searchParams.get(
            'workspaceId',
          );
          if (workspaceId === 'workspace-a' || workspaceId === 'workspace-b') {
            return new Response(
              JSON.stringify(
                billingResponse(
                  workspaceId,
                  workspaceId === 'workspace-a' ? '1.25' : '8.50',
                ),
              ),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          }
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => expect(contextCalls).toBe(1));

    await act(async () => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(hook.result.current?.workspaceBalance).toMatchObject({
        workspaceId: 'workspace-b',
        balanceUsd: '8.50',
      });
    });

    await act(async () => {
      resolveWorkspaceAContext(
        new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await workspaceAContextResponse;
    });

    await waitFor(() => {
      expect(hook.result.current?.workspaceBalance).toMatchObject({
        workspaceId: 'workspace-b',
        balanceUsd: '8.50',
      });
    });
    expect(lastResolvedWorkspaceContext()?.workspaceId).toBe('workspace-b');
    expect(billingCalls).toEqual([
      '/api/workspace/billing?scope=workspace&workspaceId=workspace-b',
    ]);
  });

  it('keeps a proven workspace balance when account metadata is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-a'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-a') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          return new Response(JSON.stringify({
            ...billingResponse('workspace-a', '1.25'),
            summary: null,
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBillingResponse());
    await waitFor(() => {
      expect(hook.result.current?.summary).toBeNull();
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('1.25');
    });
  });

  it('keeps project billing pinned to its explicit workspace while ambient navigation is elsewhere', async () => {
    let balance = '13.10';
    const billingCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-b'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-b') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
          const workspaceId = new URL(url, 'http://localhost').searchParams.get('workspaceId');
          if (workspaceId !== 'workspace-a') {
            return new Response(JSON.stringify({ error: 'wrong scope' }), { status: 409 });
          }
          return new Response(JSON.stringify(billingResponse('workspace-a', balance)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() =>
      useWorkspaceBillingResponse({
        context: teamContext('workspace-a'),
        revision: 'project-a:workspace-a',
      }),
    );
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('13.10'),
    );
    expect(billingCalls).toEqual([
      '/api/workspace/billing?scope=workspace&workspaceId=workspace-a',
    ]);

    const beforeForeign = billingCalls.length;
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed',
        workspaceId: 'workspace-b',
        workspaceMemberId: 'member-workspace-b',
        revision: 'foreign-b',
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(billingCalls).toHaveLength(beforeForeign);

    balance = '14.20';
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('wallet-balance-changed', {
        type: 'wallet-balance-changed',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-workspace-a',
        revision: 'project-a-wallet',
      });
    });
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance?.balanceUsd).toBe('14.20'),
    );
  });

  it('moves the project billing cache key when the exact workspace member changes', async () => {
    const billingMembers: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse(teamContext('workspace-b'));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ context: teamContext('workspace-b') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('/api/workspace/billing?')) {
          const memberId = billingMembers.length === 0 ? 'member-old' : 'member-new';
          billingMembers.push(memberId);
          const response = billingResponse('workspace-a', memberId === 'member-old' ? '1.00' : '2.00');
          response.workspaceBalance.workspaceMemberId = memberId;
          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(
      ({ context }) =>
        useWorkspaceBillingResponse({
          context,
          revision: 'project-a:workspace-a',
        }),
      {
        initialProps: {
          context: {
            ...teamContext('workspace-a'),
            workspaceMemberId: 'member-old',
          },
        },
      },
    );
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance?.workspaceMemberId).toBe('member-old'),
    );

    hook.rerender({
      context: {
        ...teamContext('workspace-a'),
        workspaceMemberId: 'member-new',
      },
    });
    await waitFor(() =>
      expect(hook.result.current?.workspaceBalance).toMatchObject({
        workspaceMemberId: 'member-new',
        balanceUsd: '2.00',
      }),
    );
    expect(billingMembers).toEqual(['member-old', 'member-new']);
  });

  it('uses the exact Workspace route for a personal workspace', async () => {
    const billingCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // This display fixture does not claim any shared-mode preflight evidence.
        if (url.includes('includePreflight=1')) return new Response('{}');
        if (url === '/api/workspace/directory') {
          return workspaceDirectoryResponse({
            ...teamContext('personal-a'),
            workspaceType: 'personal',
            workspaceMemberId: 'member-personal',
          });
        }
        if (url === '/api/workspace/context') {
          return new Response(
            JSON.stringify({
              context: {
                workspaceId: 'personal-a',
                workspaceType: 'personal',
                workspaceMemberId: 'member-personal',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.startsWith('/api/workspace/billing?')) {
          billingCalls.push(url);
          return new Response(
            JSON.stringify({
              summary: {
                ...billingResponse('unused', '0').summary,
                workspaceBalance: null,
              },
              workspaceBalance: {
                workspaceId: 'personal-a',
                workspaceMemberId: 'member-personal',
                balanceUsd: '12.34',
                billingScopeVersion: 2,
                expiresAt: null,
                updatedAt: null,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const hook = renderHook(() => useWorkspaceBilling());
    await waitFor(() => expect(hook.result.current).not.toBeNull());

    expect(billingCalls).toEqual([
      '/api/workspace/billing?scope=workspace&workspaceId=personal-a',
    ]);
  });
});
