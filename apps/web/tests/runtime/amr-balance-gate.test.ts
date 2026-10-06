// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  AMR_HARD_BLOCK_BALANCE_USD,
  HOME_AMR_BALANCE_RETRY_DELAYS_MS,
  amrBalanceGateScopeForWorkspaceContext,
  amrBalanceGateScopesMatch,
  amrWalletBalanceInsufficient,
  amrWalletBalanceUsd,
  checkAmrBalanceGate,
  retryUnavailableAmrBalanceGate,
  amrBalanceGateFromMemory,
  hasAmrFundingRecovered,
} from '../../src/runtime/amr-balance-gate';
import {
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
} from '../../src/providers/daemon';

vi.mock('../../src/providers/daemon', () => ({
  fetchAmrWalletSnapshot: vi.fn(),
  fetchVelaLoginStatus: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAmrWalletSnapshot);
const mockedFetchStatus = vi.mocked(fetchVelaLoginStatus);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function snapshot(overrides: Partial<AmrWalletSnapshot> = {}): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0',
    updatedAt: '2026-07-02T00:00:00.000Z',
    fetchedAt: '2026-07-02T00:00:00.000Z',
    stale: false,
    source: 'vela_api',
    ...overrides,
  };
}

function authoritativeWorkspaceBillingResponse(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  const observedAt = '2026-07-26T00:00:00.000Z';
  return {
    summary: null,
    workspaceBalance: {
      billingScopeVersion: 2,
      workspaceId,
      workspaceMemberId,
      balanceUsd,
      expiresAt: null,
      updatedAt: observedAt,
    },
    workspaceRuntime: {
      workspaceId,
      workspaceMemberId,
      status: 'fresh',
      revision: '4',
      observedAt,
      softExpiresAt: '2099-07-26T00:00:30.000Z',
      hardExpiresAt: '2099-07-26T00:02:00.000Z',
      retryAt: null,
      errorCode: null,
      reason: 'authoritative-action-read',
      sourceGapDetected: false,
    },
    authoritativeWorkspaceRead: {
      workspaceId,
      workspaceMemberId,
      observedAt,
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockedFetchStatus.mockRejectedValue(new Error('status unavailable'));
});

afterEach(() => {
  mockedFetch.mockReset();
  mockedFetchStatus.mockReset();
  vi.unstubAllGlobals();
});

describe('amrWalletBalanceUsd', () => {
  it('parses only definitive answers', () => {
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: '12.3' }))).toBe(12.3);
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: '-1.25' }))).toBe(-1.25);
    expect(amrWalletBalanceUsd(null)).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: null }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: 'not-a-number' }))).toBeNull();
    // Number(' ') is 0 — whitespace must stay indefinite, not read as $0.
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: ' ' }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: '\n\t' }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ status: 'signed_out', balanceUsd: '0' }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ status: 'unavailable', balanceUsd: '0' }))).toBeNull();
  });
});

describe('amrWalletBalanceInsufficient', () => {
  it('is true only for a definitive balance at or below the hard-block line', () => {
    expect(AMR_HARD_BLOCK_BALANCE_USD).toBe(0);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '-1.25' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0.01' }))).toBe(false);
    expect(amrWalletBalanceInsufficient(null)).toBe(false);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: ' ' }))).toBe(false);
  });
});

describe('AMR balance gate workspace witness', () => {
  const teamA = {
    workspaceType: 'team' as const,
    workspaceId: 'ws-team-a',
    workspaceMemberId: 'wm-a',
  };

  it('matches only the exact workspace and member epoch', () => {
    const witness = amrBalanceGateScopeForWorkspaceContext(teamA);
    expect(witness).toEqual(teamA);
    expect(amrBalanceGateScopesMatch(witness, { ...teamA })).toBe(true);
    expect(
      amrBalanceGateScopesMatch(witness, {
        ...teamA,
        workspaceId: 'ws-team-b',
      }),
    ).toBe(false);
    expect(
      amrBalanceGateScopesMatch(witness, {
        ...teamA,
        workspaceMemberId: 'wm-new-epoch',
      }),
    ).toBe(false);
    expect(amrBalanceGateScopesMatch(witness, undefined)).toBe(false);
  });

  it('does not mint a reusable witness from an unresolved workspace', () => {
    expect(amrBalanceGateScopeForWorkspaceContext(null)).toBeUndefined();
    expect(
      amrBalanceGateScopeForWorkspaceContext({
        ...teamA,
        workspaceMemberId: ' ',
      }),
    ).toBeUndefined();
  });
});

describe('checkAmrBalanceGate', () => {
  it.each(['0', '-1', '0.001', '1.2', '42'])('leaves funding to Link for wallet %s', async (balanceUsd) => {
    mockedFetch.mockResolvedValue(snapshot({ balanceUsd }));
    await expect(checkAmrBalanceGate(undefined, 'model')).resolves.toEqual({ kind: 'allow' });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetchStatus).not.toHaveBeenCalled();
  });

  it('confirms sign-out before blocking', async () => {
    mockedFetch.mockResolvedValue(snapshot({ status: 'signed_out' }));
    await expect(checkAmrBalanceGate()).resolves.toMatchObject({ kind: 'hard', reason: 'signed_out' });
    expect(mockedFetch).toHaveBeenLastCalledWith({ refresh: true });
  });

  it('allows a freshly signed-in account even with zero wallet', async () => {
    mockedFetch.mockResolvedValueOnce(snapshot({ status: 'signed_out' })).mockResolvedValueOnce(snapshot());
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('retains legacy fail-open on an unavailable account read', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it.each(['coding_plan', 'wallet', 'gateway', undefined])('does not turn advisory funding %s into a local rejection', async (funding) => {
    mockedFetch.mockResolvedValue(snapshot());
    const body = authoritativeWorkspaceBillingResponse('ws', 'member', '0');
    const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify({ ...body, ...(funding ? { preflight: { funding } } : {}) })));
    vi.stubGlobal('fetch', fetcher);
    await expect(checkAmrBalanceGate({ workspaceType: 'team', workspaceId: 'ws', workspaceMemberId: 'member' }, 'model/a+b')).resolves.toEqual({ kind: 'allow' });
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('includePreflight=1');
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('modelId=');
  });

  it('does not authorize a positive balance from a daemon that cannot prove an authoritative read', async () => {
    mockedFetch.mockResolvedValue(snapshot({ balanceUsd: '247.50' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        summary: null,
        workspaceBalance: {
          billingScopeVersion: 2,
          workspaceId: 'ws-team-a',
          workspaceMemberId: 'wm-a',
          balanceUsd: '50',
          expiresAt: null,
          updatedAt: '2026-07-26T00:00:00.000Z',
        },
        workspaceRuntime: {
          workspaceId: 'ws-team-a',
          workspaceMemberId: 'wm-a',
          status: 'fresh',
          revision: '3',
          observedAt: '2026-07-26T00:00:00.000Z',
          softExpiresAt: '2099-07-26T00:00:30.000Z',
          hardExpiresAt: '2099-07-26T00:02:00.000Z',
          retryAt: null,
          errorCode: null,
          reason: 'explicit-billing-read',
          sourceGapDetected: false,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );

    await expect(checkAmrBalanceGate({
      workspaceType: 'team',
      workspaceId: 'ws-team-a',
      workspaceMemberId: 'wm-a',
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('fails closed for an unavailable team workspace balance without using account zero', async () => {
    const emptyAccount = snapshot({ balanceUsd: '0' });
    mockedFetch.mockResolvedValueOnce(emptyAccount).mockResolvedValueOnce(emptyAccount);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );

    await expect(
      checkAmrBalanceGate({
        workspaceType: 'team',
        workspaceId: 'ws-team-a',
        workspaceMemberId: 'wm-a',
      }),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('does not use a last-good balance when the authoritative runtime is in error', async () => {
    mockedFetch.mockResolvedValue(snapshot({ balanceUsd: '247.50' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({
          summary: null,
          workspaceBalance: {
            billingScopeVersion: 2,
            workspaceId: 'ws-team-a',
            workspaceMemberId: 'wm-a',
            balanceUsd: '50',
            expiresAt: null,
            updatedAt: '2026-07-26T00:00:00.000Z',
          },
          workspaceRuntime: {
            workspaceId: 'ws-team-a',
            workspaceMemberId: 'wm-a',
            status: 'error',
            revision: '4',
            observedAt: '2026-07-26T00:00:00.000Z',
            softExpiresAt: '2026-07-26T00:00:30.000Z',
            hardExpiresAt: '2026-07-26T00:02:00.000Z',
            retryAt: null,
            errorCode: 'workspace_billing_unavailable',
            reason: 'authoritative-action-read',
            sourceGapDetected: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )),
    );

    await expect(checkAmrBalanceGate({
      workspaceType: 'team',
      workspaceId: 'ws-team-a',
      workspaceMemberId: 'wm-a',
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('rejects a response from an older workspace-member epoch', async () => {
    mockedFetch.mockResolvedValue(snapshot({ balanceUsd: '247.50' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({
          summary: null,
          workspaceBalance: {
            billingScopeVersion: 2,
            workspaceId: 'ws-team-a',
            workspaceMemberId: 'wm-old',
            balanceUsd: '50',
            expiresAt: null,
            updatedAt: '2026-07-26T00:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )),
    );

    await expect(checkAmrBalanceGate({
      workspaceType: 'team',
      workspaceId: 'ws-team-a',
      workspaceMemberId: 'wm-new',
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('keeps concurrent team A/B checks keyed by explicit workspace id', async () => {
    mockedFetch.mockResolvedValue(snapshot({ balanceUsd: '247.50' }));
    let resolveA!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('workspaceId=ws-team-a')) {
        return new Promise<Response>((resolve) => {
          resolveA = resolve;
        });
      }
      if (url.includes('workspaceId=ws-team-b')) {
        return Promise.resolve(
          new Response(
            JSON.stringify(authoritativeWorkspaceBillingResponse(
              'ws-team-b',
              'wm-b',
              '50',
            )),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const teamA = checkAmrBalanceGate({
      workspaceType: 'team',
      workspaceId: 'ws-team-a',
      workspaceMemberId: 'wm-a',
    });
    const teamB = checkAmrBalanceGate({
      workspaceType: 'team',
      workspaceId: 'ws-team-b',
      workspaceMemberId: 'wm-b',
    });

    await expect(teamB).resolves.toEqual({ kind: 'allow' });
    expect(resolveA).toBeTypeOf('function');
    resolveA(
      new Response(
        JSON.stringify(authoritativeWorkspaceBillingResponse(
          'ws-team-a',
          'wm-a',
          '1.50',
        )),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(teamA).resolves.toEqual({ kind: 'allow' });
  });
});

/**
 * The Personal fail-open path must not swallow the hard block.
 *
 * #7187 stood the preflight down for a run the wallet was never going to fund,
 * asking two questions: is the caller on a Coding Plan, and is this model
 * unlimited on it. #7544 retired the model half along with the entitlement
 * catalog it read, leaving `modelId?.trim()` — which is true on nearly every
 * send, because an unset model falls back to the agent's default id. That
 * turned "this run does not touch the wallet" into "the user has a model
 * selected", and because $0 <= $2 the early return started eating the $0 hard
 * block too.
 *
 * These cases pin the half that is still knowable: a READABLE tier at $0 has
 * nothing left to spend, so its empty wallet is a real block.
 *
 * OPEND-2600 narrowed WHAT the stand-down is allowed to cancel. It used to end
 * the whole gate in `allow`, which also deleted the soft reminder for every
 * subscriber below the warning line (the reported Pro account at $1.79 saw
 * nothing at all). It now cancels the hard branch only, so the low-balance cases
 * read `soft` where they used to read `allow`.
 *
 * T55 (product 2026-09-06) then overturned #7187's premise itself. "A
 * subscriber's $0 is never blocked" was the invariant this block used to defend;
 * the out-of-credits matrix now governs Personal workspaces, so a readable paid
 * tier blocks exactly like a free one. What remains of the stand-down is
 * `amrPlanTierUnreadable`: a tier we could not read at all still fails open, and
 * that is what the last cases here pin.
 */
describe('retryUnavailableAmrBalanceGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps one Home submit pending across the bounded cold-start retries', async () => {
    const check = vi.fn()
      .mockResolvedValueOnce({ kind: 'unavailable' } as const)
      .mockResolvedValueOnce({ kind: 'unavailable' } as const)
      .mockResolvedValueOnce({ kind: 'allow' } as const);

    const result = retryUnavailableAmrBalanceGate(check);
    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOME_AMR_BALANCE_RETRY_DELAYS_MS[0] - 1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(HOME_AMR_BALANCE_RETRY_DELAYS_MS[1] - 1);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ kind: 'allow' });
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('returns a definitive decision immediately without scheduling a retry', async () => {
    const check = vi.fn().mockResolvedValue({ kind: 'allow' } as const);

    await expect(retryUnavailableAmrBalanceGate(check)).resolves.toEqual({ kind: 'allow' });

    expect(check).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns unavailable after exhausting the bounded retry budget', async () => {
    const check = vi.fn().mockResolvedValue({ kind: 'unavailable' } as const);

    const result = retryUnavailableAmrBalanceGate(check);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ kind: 'unavailable' });
    expect(check).toHaveBeenCalledTimes(3);
  });
});

describe('amrBalanceGateFromMemory', () => {
  it.each(['0', '-1', '1', '', 'bad', null, undefined])('never treats wallet %s as funding authority', (balance) => {
    expect(amrBalanceGateFromMemory(balance)).toBeNull();
  });
});

describe('funding recovery', () => {
  const scope = { workspaceType: 'team' as const, workspaceId: 'ws', workspaceMemberId: 'member' };
  const codingPlan = {
    workspaceId: 'ws',
    generatedAt: new Date().toISOString(),
    eligible: true,
    tier: 'go',
    windows: [{
      policyId: '5h',
      durationSeconds: 18_000,
      resetMode: 'activity_triggered',
      usedCredits: '0',
      remainingCredits: '100',
      limitCredits: '100',
      windowStart: null,
      resetsAt: null,
    }],
  };
  it.each([
    { funding: 'coding_plan', modelCovered: true, recovered: true },
    { funding: 'wallet', modelCovered: false, recovered: true },
    { funding: 'gateway', modelCovered: true, recovered: false },
    { funding: 'coding_plan', modelCovered: null, recovered: false },
  ])('requires positive funding evidence: $funding / $modelCovered', async ({ funding, modelCovered, recovered }) => {
    const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify({
      ...authoritativeWorkspaceBillingResponse('ws', 'member', '0'),
      preflight: { workspaceId: 'ws', workspaceMemberId: 'member', modelId: 'model', generatedAt: new Date().toISOString(), funding, modelCovered, codingPlan },
    })));
    vi.stubGlobal('fetch', fetcher);
    expect(await hasAmrFundingRecovered(scope, 'model')).toBe(recovered);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('includePreflight=1');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('modelId=model');
  });
  it.each([
    { ...codingPlan, windows: [] },
    { ...codingPlan, eligible: false },
    { ...codingPlan, windows: [{ ...codingPlan.windows[0], remainingCredits: '0' }] },
  ])('does not recover without usable coding-plan quota', async (plan) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...authoritativeWorkspaceBillingResponse('ws', 'member', '0'),
      preflight: {
        workspaceId: 'ws', workspaceMemberId: 'member', modelId: 'model',
        generatedAt: new Date().toISOString(), funding: 'coding_plan', modelCovered: true,
        codingPlan: plan,
      },
    }))));
    expect(await hasAmrFundingRecovered(scope, 'model')).toBe(false);
  });
  it('does not recover on old capability or a mismatched model/member', async () => {
    for (const preflight of [undefined,
      { workspaceId: 'ws', workspaceMemberId: 'other', modelId: 'model', generatedAt: new Date().toISOString(), funding: 'coding_plan', modelCovered: true },
      { workspaceId: 'ws', workspaceMemberId: 'member', modelId: 'other', generatedAt: new Date().toISOString(), funding: 'coding_plan', modelCovered: true },
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...authoritativeWorkspaceBillingResponse('ws', 'member', '0'), preflight }))));
      expect(await hasAmrFundingRecovered(scope, 'model')).toBe(false);
    }
  });
});
