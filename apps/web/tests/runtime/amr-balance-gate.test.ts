// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  AMR_HARD_BLOCK_BALANCE_USD,
  AMR_LOW_BALANCE_WARN_USD,
  HOME_AMR_BALANCE_RETRY_DELAYS_MS,
  amrBalanceGateScopeForWorkspaceContext,
  amrBalanceGateScopesMatch,
  amrWalletBalanceInsufficient,
  amrWalletBalanceUsd,
  checkAmrBalanceGate,
  isAmrLowBalanceWarnOptedOut,
  retryUnavailableAmrBalanceGate,
  setAmrLowBalanceWarnOptedOut,
} from '../../src/runtime/amr-balance-gate';
import { fetchAmrWalletSnapshot } from '../../src/providers/daemon';

vi.mock('../../src/providers/daemon', () => ({
  fetchAmrWalletSnapshot: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAmrWalletSnapshot);

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
});

afterEach(() => {
  mockedFetch.mockReset();
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
  it('allows a healthy balance without a refresh roundtrip', async () => {
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '50.00' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith();
  });

  it('soft-warns between the hard-block and low-balance lines', async () => {
    expect(AMR_LOW_BALANCE_WARN_USD).toBe(2);
    const low = snapshot({ balanceUsd: '1.20' });
    mockedFetch.mockResolvedValueOnce(low);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: low });
    // Soft trusts the cache — no upstream refresh for a dismissible reminder.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('soft-warns exactly at the low-balance line and allows just above it', async () => {
    const atLine = snapshot({ balanceUsd: '2.00' });
    mockedFetch.mockResolvedValueOnce(atLine);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: atLine });
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '2.01' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('skips the soft warning once the user opted out — but never the hard block', async () => {
    expect(isAmrLowBalanceWarnOptedOut()).toBe(false);
    setAmrLowBalanceWarnOptedOut();
    expect(isAmrLowBalanceWarnOptedOut()).toBe(true);
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '1.20' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
    mockedFetch.mockReset();
    const empty = snapshot({ balanceUsd: '0' });
    mockedFetch.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: empty,
    });
  });

  it('confirms a hard-block candidate against the live wallet before blocking', async () => {
    const fresh = snapshot({ balanceUsd: '0' });
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(fresh);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: fresh,
    });
    expect(mockedFetch).toHaveBeenNthCalledWith(2, { refresh: true });
  });

  it('hard-blocks a signed-out account after refresh confirmation', async () => {
    const signedOut = snapshot({ status: 'signed_out', balanceUsd: null, user: null });
    mockedFetch.mockResolvedValueOnce(signedOut).mockResolvedValueOnce(signedOut);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'signed_out',
      snapshot: signedOut,
    });
  });

  it('lets a just-recharged wallet through (stale-empty cache, healthy refresh)', async () => {
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(snapshot({ balanceUsd: '20.00' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('downgrades a stale-empty cache to soft when the refresh lands low', async () => {
    const low = snapshot({ balanceUsd: '2.00' });
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(low);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: low });
  });

  it('never gates when the wallet endpoint fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('does not hard-block when the refresh only returns a stale cached snapshot', async () => {
    // A failed upstream refresh hands back the previous cached snapshot with
    // stale=true and an error — not a fresh definitive answer. The gate must
    // fail open instead of stranding a user who just topped up while the
    // wallet endpoint hiccuped.
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(
        snapshot({
          balanceUsd: '0',
          stale: true,
          source: 'daemon_cache',
          error: { code: 'upstream', message: 'wallet fetch failed' },
        }),
      );
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('still hard-blocks a signed-out snapshot despite its explanatory error', async () => {
    // The daemon's signed-out snapshot always carries
    // error={code:'signed_out'} (and no balance). That error explains WHY
    // the balance is unavailable — it is not a failed-refresh echo, and the
    // signed-out determination comes from the local profile read, so it
    // stays definitive. Regression test: a blanket "any error is
    // indefinite" guard silently disabled the signed-out hard block.
    const signedOut = snapshot({
      status: 'signed_out',
      balanceUsd: null,
      user: null,
      source: 'unavailable',
      error: { code: 'signed_out', message: 'Sign in to view wallet balance.' },
    });
    mockedFetch.mockResolvedValueOnce(signedOut).mockResolvedValueOnce(signedOut);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'signed_out',
      snapshot: signedOut,
    });
  });

  it('starts the authoritative workspace request in parallel with the account snapshot', async () => {
    const accountRead = deferred<AmrWalletSnapshot>();
    mockedFetch.mockReturnValue(accountRead.promise);
    let workspaceReadStarted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        workspaceReadStarted = true;
        expect(input.toString()).toBe(
          '/api/workspace/billing?scope=workspace&workspaceId=ws-team-a&freshness=authoritative',
        );
        return new Response(
          JSON.stringify({
            summary: null,
            workspaceBalance: {
              billingScopeVersion: 2,
              workspaceId: 'ws-team-a',
              workspaceMemberId: 'wm-a',
              balanceUsd: '1.25',
              expiresAt: null,
              updatedAt: '2026-07-26T00:00:00.000Z',
            },
            workspaceRuntime: {
              workspaceId: 'ws-team-a',
              workspaceMemberId: 'wm-a',
              status: 'fresh',
              revision: '4',
              observedAt: '2026-07-26T00:00:00.000Z',
              softExpiresAt: '2099-07-26T00:00:30.000Z',
              hardExpiresAt: '2099-07-26T00:02:00.000Z',
              retryAt: null,
              errorCode: null,
              reason: 'authoritative-action-read',
              sourceGapDetected: false,
            },
            authoritativeWorkspaceRead: {
              workspaceId: 'ws-team-a',
              workspaceMemberId: 'wm-a',
              observedAt: '2026-07-26T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const pendingResult = checkAmrBalanceGate({
      workspaceType: 'team',
      workspaceId: 'ws-team-a',
      workspaceMemberId: 'wm-a',
    });
    await Promise.resolve();
    expect(workspaceReadStarted).toBe(true);
    accountRead.resolve(snapshot({ balanceUsd: '247.50' }));
    const result = await pendingResult;
    expect(result.kind).toBe('soft');
    if (result.kind === 'soft') {
      expect(result.snapshot.balanceUsd).toBe('1.25');
    }
    expect(mockedFetch).toHaveBeenCalledTimes(1);
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
    const resultA = await teamA;
    expect(resultA.kind).toBe('soft');
    if (resultA.kind === 'soft') expect(resultA.snapshot.balanceUsd).toBe('1.50');
  });
});

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
