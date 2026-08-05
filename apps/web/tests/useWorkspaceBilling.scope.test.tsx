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

  it('does not request billing before an exact Workspace identity exists', async () => {
    const billingCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
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
