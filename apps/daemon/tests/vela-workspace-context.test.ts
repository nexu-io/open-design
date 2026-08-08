import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCachedWorkspaceDirectoryFetcher,
  createFreshWorkspaceDirectoryFetcher,
  createWorkspaceDirectoryAuthorityBroker,
  createVelaWorkspaceContextProvider,
  fetchVelaWorkspaceDirectory,
  mapVelaWorkspaceContext,
  workspaceContextFromDirectoryItem,
} from '../src/collab/vela-workspace-context.js';

// A well-formed body as B's GET /api/v1/workspaces/current returns it — a team
// member on a BYOK provider (workspace features stay on regardless of provider).
const B_TEAM_CONTEXT = {
  userId: 'auth-user-1',
  appUserId: 'app-user-1',
  workspaceId: 'ws-team-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team-pro',
  providerMode: 'personal_byok',
  seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: false,
  },
  lastActiveWorkspaceId: 'ws-team-1',
};

const SESSION = { profile: 'prod', apiUrl: 'https://vela.example', controlKey: 'ck-1', user: null, configMtimeMs: null };

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mapVelaWorkspaceContext', () => {
  it('maps a team context, deriving teamId from workspaceId and preserving BYOK', () => {
    const mapped = mapVelaWorkspaceContext(B_TEAM_CONTEXT);
    expect(mapped).not.toBeNull();
    // The team workspace IS the team scope → teamId mirrors workspaceId.
    expect(mapped?.teamId).toBe('ws-team-1');
    // BYOK provider must not disable team features — provider is carried verbatim.
    expect(mapped?.providerMode).toBe('personal_byok');
    // B's permissions are trusted (passed through), not re-derived.
    expect(mapped?.permissions.canWriteSyncedFiles).toBe(true);
    expect(mapped?.seatSummary).toEqual({ seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false });
    // B-only identity fields are dropped from the collab context.
    expect(mapped).not.toHaveProperty('userId');
    expect(mapped).not.toHaveProperty('appUserId');
  });

  it('does not attach teamId for a personal workspace', () => {
    const mapped = mapVelaWorkspaceContext({ ...B_TEAM_CONTEXT, workspaceType: 'personal' });
    expect(mapped?.workspaceType).toBe('personal');
    expect(mapped?.teamId).toBeUndefined();
  });

  // recvpkuLOujgAm follow-up: B names EVERY workspace, personal included
  // (vela #964 derives "<owner>'s workspace" for an unnamed personal one, and
  // an owner may rename it outright). Dropping that name for the personal case
  // left the switcher's collapsed label with nothing but a hardcoded English
  // fallback until the user opened the dropdown and the directory read landed.
  it('carries the workspace name for a personal workspace', () => {
    const mapped = mapVelaWorkspaceContext({
      ...B_TEAM_CONTEXT,
      workspaceType: 'personal',
      workspaceName: "Ada's workspace",
    });
    expect(mapped?.workspaceName).toBe("Ada's workspace");
    // `teamName` stays team-only — it is the team switcher's field.
    expect(mapped?.teamName).toBeUndefined();
  });

  it('carries the workspace name for a team workspace alongside teamName', () => {
    const mapped = mapVelaWorkspaceContext({ ...B_TEAM_CONTEXT, workspaceName: '1321' });
    expect(mapped?.workspaceName).toBe('1321');
    expect(mapped?.teamName).toBe('1321');
  });

  it('carries a personal workspace name synthesized from a directory item', () => {
    const context = workspaceContextFromDirectoryItem({
      workspaceId: 'ws-personal-1',
      workspaceName: "Ada's workspace",
      workspaceType: 'personal',
      workspaceMemberId: 'wm-9',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
    });
    expect(context.workspaceName).toBe("Ada's workspace");
    expect(context.teamName).toBeUndefined();
  });

  it('re-derives an inconsistent seat summary from the authoritative counts', () => {
    const mapped = mapVelaWorkspaceContext({
      ...B_TEAM_CONTEXT,
      seatSummary: { seatLimit: 5, usedSeats: 5, availableSeats: 99, isSeatFull: false },
    });
    expect(mapped?.seatSummary).toEqual({ seatLimit: 5, usedSeats: 5, availableSeats: 0, isSeatFull: true });
  });

  it('accepts member contexts that hide billing-only fields', () => {
    const mapped = mapVelaWorkspaceContext({
      ...B_TEAM_CONTEXT,
      billingState: undefined,
      planId: undefined,
      seatSummary: undefined,
    });
    expect(mapped).not.toBeNull();
    expect(mapped?.billingState).toBe('active');
    expect(mapped?.planId).toBeNull();
    expect(mapped?.seatSummary).toEqual({ seatLimit: 0, usedSeats: 0, availableSeats: 0, isSeatFull: true });
    expect(mapped?.permissions.canShareProjects).toBe(true);
  });

  it('returns null on a bad enum or a missing id', () => {
    expect(mapVelaWorkspaceContext({ ...B_TEAM_CONTEXT, role: 'viewer' })).toBeNull();
    expect(mapVelaWorkspaceContext({ ...B_TEAM_CONTEXT, lifecycleState: 'frozen' })).toBeNull();
    expect(mapVelaWorkspaceContext({ ...B_TEAM_CONTEXT, workspaceMemberId: '' })).toBeNull();
    expect(mapVelaWorkspaceContext(null)).toBeNull();
  });
});

describe('createCachedWorkspaceDirectoryFetcher', () => {
  it('treats a missing local session as authoritative signed-out, not an outage', async () => {
    await expect(
      fetchVelaWorkspaceDirectory({ readSession: () => null }),
    ).resolves.toEqual({ ok: true, items: [] });
  });

  it('coalesces concurrent readers and briefly reuses one authoritative success', async () => {
    let now = 1_000;
    let resolveRead:
      | ((result: { ok: true; items: [] }) => void)
      | undefined;
    const fetchDirectory = vi.fn(
      () =>
        new Promise<{ ok: true; items: [] }>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const read = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory,
      ttlMs: 5_000,
      now: () => now,
    });

    const first = read();
    const concurrent = read();
    expect(fetchDirectory).toHaveBeenCalledTimes(1);
    resolveRead?.({ ok: true, items: [] });
    await expect(first).resolves.toEqual({ ok: true, items: [] });
    await expect(concurrent).resolves.toEqual({ ok: true, items: [] });

    await expect(read()).resolves.toEqual({ ok: true, items: [] });
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    now += 5_000;
    const refreshed = read();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    resolveRead?.({ ok: true, items: [] });
    await expect(refreshed).resolves.toEqual({ ok: true, items: [] });
  });

  it('does not cache a failed directory read', async () => {
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, items: [] })
      .mockResolvedValueOnce({ ok: true, items: [] });
    const read = createCachedWorkspaceDirectoryFetcher({ fetchDirectory });

    await expect(read()).resolves.toEqual({ ok: false, items: [] });
    await expect(read()).resolves.toEqual({ ok: true, items: [] });
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('never serves account A cache or in-flight data after identity changes to B', async () => {
    let identity = 'account-a';
    const reads: Array<{
      identity: string;
      resolve: (result: { ok: true; items: [] }) => void;
    }> = [];
    const fetchDirectory = vi.fn(
      () =>
        new Promise<{ ok: true; items: [] }>((resolve) => {
          reads.push({ identity, resolve });
        }),
    );
    const read = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory,
      identityKey: () => identity,
    });

    const accountA = read();
    identity = 'account-b';
    const accountB = read();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    expect(reads.map((entry) => entry.identity)).toEqual(['account-a', 'account-b']);

    reads[0]!.resolve({ ok: true, items: [] });
    await expect(accountA).resolves.toEqual({ ok: true, items: [] });
    let accountBResolved = false;
    void accountB.then(() => {
      accountBResolved = true;
    });
    await Promise.resolve();
    expect(accountBResolved).toBe(false);

    reads[1]!.resolve({ ok: true, items: [] });
    await expect(accountB).resolves.toEqual({ ok: true, items: [] });
  });
});

describe('createFreshWorkspaceDirectoryFetcher', () => {
  it('isolates in-flight mutation authority reads by session and never caches a settled result', async () => {
    let identity = 'account-a';
    const reads: Array<{
      identity: string;
      resolve: (result: { ok: true; items: [] }) => void;
    }> = [];
    const fetchDirectory = vi.fn(
      () =>
        new Promise<{ ok: true; items: [] }>((resolve) => {
          reads.push({ identity, resolve });
        }),
    );
    const read = createFreshWorkspaceDirectoryFetcher({
      fetchDirectory,
      identityKey: () => identity,
    });

    const accountA = read();
    const concurrentAccountA = read();
    expect(concurrentAccountA).toBe(accountA);
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    identity = 'account-b';
    const accountB = read();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    expect(reads.map((entry) => entry.identity)).toEqual(['account-a', 'account-b']);

    reads[0]!.resolve({ ok: true, items: [] });
    await expect(accountA).resolves.toEqual({ ok: true, items: [] });
    await expect(concurrentAccountA).resolves.toEqual({ ok: true, items: [] });
    let accountBResolved = false;
    void accountB.then(() => {
      accountBResolved = true;
    });
    await Promise.resolve();
    expect(accountBResolved).toBe(false);

    reads[1]!.resolve({ ok: true, items: [] });
    await expect(accountB).resolves.toEqual({ ok: true, items: [] });

    const freshAccountB = read();
    expect(fetchDirectory).toHaveBeenCalledTimes(3);
    expect(reads[2]!.identity).toBe('account-b');
    reads[2]!.resolve({ ok: true, items: [] });
    await expect(freshAccountB).resolves.toEqual({ ok: true, items: [] });
  });
});

describe('createWorkspaceDirectoryAuthorityBroker', () => {
  it('single-flights shell and project bootstrap reads per account generation without caching failures', async () => {
    let identity = 'account-a:config-a';
    const fetchDirectory = vi.fn(async () => ({
      ok: true as const,
      items: [],
    }));
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => identity,
    });

    const [shellDirectory, projectBootstrap] = await Promise.all([
      authority.read(),
      authority.read(),
    ]);
    expect(shellDirectory).toEqual(projectBootstrap);
    expect(fetchDirectory).toHaveBeenCalledTimes(1);
    await authority.read();
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    identity = 'account-b:config-b';
    await authority.read();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);

    const failedFetch = vi.fn(async () => ({ ok: false as const, items: [] }));
    const failedAuthority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory: failedFetch,
      identityKey: () => 'account-failing',
    });
    await failedAuthority.read();
    await failedAuthority.read();
    expect(failedFetch).toHaveBeenCalledTimes(2);
  });

  it('bounds 30s of status polls while every heartbeat mutation stays fresh', async () => {
    let now = 0;
    let activeReads = 0;
    let maxActiveReads = 0;
    const fetchDirectory = vi.fn(async () => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await Promise.resolve();
      activeReads -= 1;
      return { ok: true as const, items: [] };
    });
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      now: () => now,
    });

    // Model the production order pessimistically: status first every 5s, then
    // heartbeat at each 10s boundary. A fresh heartbeat seeds the next read
    // lease, but never consumes a settled lease itself.
    for (now = 0; now <= 30_000; now += 5_000) {
      await authority.read();
      if (now % 10_000 === 0) await authority.fresh();
    }

    expect(fetchDirectory).toHaveBeenCalledTimes(5);
    expect(maxActiveReads).toBe(1);
  });

  it('coalesces unsettled read and mutation checks without reusing settled authority', async () => {
    let resolveRead:
      | ((result: { ok: true; items: [] }) => void)
      | undefined;
    const fetchDirectory = vi.fn(
      () =>
        new Promise<{ ok: true; items: [] }>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
    });

    const read = authority.read();
    const concurrentMutation = authority.fresh();
    expect(fetchDirectory).toHaveBeenCalledTimes(1);
    resolveRead?.({ ok: true, items: [] });
    await Promise.all([read, concurrentMutation]);

    const nextMutation = authority.fresh();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    resolveRead?.({ ok: true, items: [] });
    await nextMutation;
  });

  it('starts a post-mutation fetch after draining an older in-flight directory read', async () => {
    let resolvePreMutation:
      | ((result: { ok: true; items: [] }) => void)
      | undefined;
    const accepted = {
      ok: true as const,
      items: [{ ...B_TEAM_CONTEXT }],
    };
    const fetchDirectory = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<{ ok: true; items: [] }>((resolve) => {
          resolvePreMutation = resolve;
        }),
      )
      .mockResolvedValueOnce(accepted);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
    });

    const preMutationRead = authority.read();
    const postMutationRefresh = authority.refreshAfterMutation();
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    resolvePreMutation?.({ ok: true, items: [] });
    await expect(preMutationRead).resolves.toEqual({ ok: true, items: [] });
    await expect(postMutationRefresh).resolves.toEqual(accepted);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    await expect(authority.read()).resolves.toEqual(accepted);
  });

  it('publishes a fresh revocation result into the subsequent read lease', async () => {
    const active = {
      ok: true as const,
      items: [{ ...B_TEAM_CONTEXT }],
    };
    const revoked = { ok: true as const, items: [] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(revoked);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
    });

    await expect(authority.read()).resolves.toEqual(active);
    await expect(authority.read()).resolves.toEqual(active);
    await expect(authority.fresh()).resolves.toEqual(revoked);
    await expect(authority.read()).resolves.toEqual(revoked);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });
});

describe('createVelaWorkspaceContextProvider', () => {
  it('fetches B with the vela session bearer token and maps the result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, B_TEAM_CONTEXT)) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
    });
    const context = await provider.current({});
    expect(context?.workspaceMemberId).toBe('wm-1');
    expect(context?.teamId).toBe('ws-team-1');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe('https://vela.example/api/v1/workspaces/current');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer ck-1' });
  });

  it('returns null without calling B when there is no vela session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, B_TEAM_CONTEXT)) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({ fetch: fetchImpl, readSession: () => null });
    expect(await provider.current({})).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('degrades to null on a 401 (signed out) or a network error', async () => {
    const unauthorized = createVelaWorkspaceContextProvider({
      fetch: (async () => jsonResponse(401, { error: 'unauthenticated' })) as unknown as typeof fetch,
      readSession: () => SESSION,
    });
    expect(await unauthorized.current({})).toBeNull();

    const broken = createVelaWorkspaceContextProvider({
      fetch: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
      readSession: () => SESSION,
    });
    expect(await broken.current({})).toBeNull();
  });
});

// B-line explicit-workspace handoff: the client must not perceive (or write)
// B's account-level Active Workspace. The provider serves the LOCALLY selected
// workspace — enriched from B when B agrees, synthesized from the workspace
// directory when it does not — and only falls back to B's current when the
// client has no selection at all. A fresh account (no current anywhere) picks
// a LOCAL default (personal first) without ever PUTting server state.
describe('createVelaWorkspaceContextProvider explicit local scope', () => {
  const B_PERSONAL_CONTEXT = {
    ...B_TEAM_CONTEXT,
    workspaceId: 'ws-personal-1',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-p1',
    role: 'owner',
  };
  const DIRECTORY = {
    items: [
      {
        workspaceId: 'ws-team-1',
        workspaceName: 'Team',
        workspaceType: 'team',
        workspaceMemberId: 'wm-1',
        role: 'member',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
      {
        workspaceId: 'ws-personal-1',
        workspaceName: 'Personal',
        workspaceType: 'personal',
        workspaceMemberId: 'wm-p1',
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
    ],
  };

  function scriptedFetch(handlers: {
    current?: () => Response;
    directory?: () => Response;
    put?: () => Response;
  }) {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      calls.push({ url: u, method });
      if (u.includes('/workspaces/current') && method === 'GET' && handlers.current) return handlers.current();
      if (u.endsWith('/api/v1/workspaces') && method === 'GET' && handlers.directory) return handlers.directory();
      if (u.includes('/workspaces/current') && method === 'PUT' && handlers.put) return handlers.put();
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('picks a LOCAL default (personal first) with no server write when B has no current', async () => {
    vi.stubEnv('OD_VELA_WEB_URL', 'https://web.example.com/console');
    const { fetchImpl, calls } = scriptedFetch({
      current: () => jsonResponse(403, { error: 'missing_principal' }),
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const selected: string[] = [];
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      setLocalSelection: (id) => { selected.push(id); },
    });
    const context = await provider.current({});
    expect(selected).toEqual(['ws-personal-1']);
    expect(context?.workspaceId).toBe('ws-personal-1');
    expect(context?.workspaceType).toBe('personal');
    expect(context?.workspaceMemberId).toBe('wm-p1');
    expect(context?.workspaceSettingsUrl).toBe(
      'https://web.example.com/console/settings?workspaceId=ws-personal-1',
    );
    // Resource semantics from the handoff: a plain read NEVER writes the
    // account-level Active Workspace.
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('keeps Personal workspace actions stable from a synthesized context to a rich refresh', async () => {
    vi.stubEnv('OD_VELA_WEB_URL', 'https://web.example.com/console');
    let currentRead = 0;
    const { fetchImpl } = scriptedFetch({
      // First read disagrees with OD's Personal pin and forces directory
      // synthesis. The next read models the rich response after switching away
      // and back, when B's account-level current finally matches the local pin.
      current: () => jsonResponse(200, currentRead++ === 0 ? B_TEAM_CONTEXT : B_PERSONAL_CONTEXT),
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => 'ws-personal-1',
    });

    const initial = await provider.current({});
    const refreshed = await provider.current({});

    expect(initial?.workspaceType).toBe('personal');
    expect(initial?.workspaceSettingsUrl).toBe(
      'https://web.example.com/console/settings?workspaceId=ws-personal-1',
    );
    expect(refreshed?.workspaceSettingsUrl).toBe(initial?.workspaceSettingsUrl);
  });

  it('serves the local selection and ignores a mismatched server current', async () => {
    const { fetchImpl } = scriptedFetch({
      current: () => jsonResponse(200, B_PERSONAL_CONTEXT),
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => 'ws-team-1',
    });
    const context = await provider.current({});
    // Another device switched B's Active Workspace to personal; this daemon's
    // pinned scope must not follow it.
    expect(context?.workspaceId).toBe('ws-team-1');
    expect(context?.workspaceType).toBe('team');
    expect(context?.teamId).toBe('ws-team-1');
    expect(context?.workspaceMemberId).toBe('wm-1');
  });

  it('enriches from B when the server current matches the local selection', async () => {
    const { fetchImpl } = scriptedFetch({
      current: () => jsonResponse(200, B_TEAM_CONTEXT),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => 'ws-team-1',
    });
    const context = await provider.current({});
    expect(context?.workspaceId).toBe('ws-team-1');
    // Rich billing data only B carries — proof the mapped body was used.
    expect(context?.planId).toBe('team-pro');
  });

  it('does not bootstrap on 401 (signed out is not a missing principal)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'unauthenticated' })) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({ fetch: fetchImpl, readSession: () => SESSION });
    expect(await provider.current({})).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('cools down after a failed default pick instead of hammering the directory', async () => {
    const { fetchImpl, calls } = scriptedFetch({
      current: () => jsonResponse(403, { error: 'missing_principal' }),
      directory: () => jsonResponse(200, { items: [] }),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
    });
    expect(await provider.current({})).toBeNull();
    expect(await provider.current({})).toBeNull();
    const directoryCalls = calls.filter((c) => c.url.endsWith('/api/v1/workspaces'));
    expect(directoryCalls.length).toBe(1);
  });
});

// recvqbbQ4yljNC: a member removed from a team workspace stayed pinned to it
// forever. `current()` must tell apart "the directory CONFIRMS the pin is
// gone" (safe to clear + fall back) from "B could not be asked right now"
// (must NOT touch the pin — a network blip must never evict an online user).
describe('createVelaWorkspaceContextProvider — stale pin recovery', () => {
  const DIRECTORY_WITHOUT_TEAM = {
    items: [
      {
        workspaceId: 'ws-personal-1',
        workspaceName: 'Personal',
        workspaceType: 'personal',
        workspaceMemberId: 'wm-p1',
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
    ],
  };
  const DIRECTORY_TEAM_MEMBER_REMOVED = {
    items: [
      {
        workspaceId: 'ws-team-1',
        workspaceName: 'Team',
        workspaceType: 'team',
        workspaceMemberId: 'wm-1',
        role: 'member',
        memberStatus: 'removed',
        lifecycleState: 'active',
      },
      {
        workspaceId: 'ws-personal-1',
        workspaceName: 'Personal',
        workspaceType: 'personal',
        workspaceMemberId: 'wm-p1',
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
    ],
  };

  /** A stateful local-pin double: `clearLocalSelection`/`setLocalSelection`
   *  mutate the SAME backing value `getActiveWorkspaceId` reads, exactly like
   *  the real `ActiveWorkspaceSelectionStore` — so a clear takes effect for
   *  the very same `current()` call's fallback pick, not just the next one. */
  function statefulPin(initial: string | undefined) {
    let value = initial;
    const setCalls: string[] = [];
    const clearCalls: number[] = [];
    return {
      getActiveWorkspaceId: () => value,
      setLocalSelection: (id: string) => {
        value = id;
        setCalls.push(id);
      },
      clearLocalSelection: () => {
        value = undefined;
        clearCalls.push(1);
      },
      setCalls,
      clearCalls,
    };
  }

  function scriptedFetch(handlers: { current?: () => Response; directory?: () => Response }) {
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (u.includes('/workspaces/current') && method === 'GET' && handlers.current) return handlers.current();
      if (u.endsWith('/api/v1/workspaces') && method === 'GET' && handlers.directory) return handlers.directory();
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;
    return fetchImpl;
  }

  it('RED→GREEN: clears the pin and falls back to personal when the workspace vanished from the directory', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = scriptedFetch({
      // B also refuses this pinned scope now (not a 401 — the vela session
      // itself is still fine, just this workspace is no longer usable).
      current: () => jsonResponse(403, { error: 'membership_not_found' }),
      directory: () => jsonResponse(200, DIRECTORY_WITHOUT_TEAM),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      setLocalSelection: pin.setLocalSelection,
      clearLocalSelection: pin.clearLocalSelection,
    });

    const context = await provider.current({});

    // Before the fix this returned null forever (the front end reads a null
    // context as "signed out"), even though the user still has a usable
    // personal workspace.
    expect(context).not.toBeNull();
    expect(context?.workspaceId).toBe('ws-personal-1');
    expect(context?.workspaceType).toBe('personal');
    expect(pin.clearCalls.length).toBe(1);
    expect(pin.setCalls).toEqual(['ws-personal-1']);
    expect(pin.getActiveWorkspaceId()).toBe('ws-personal-1');
  });

  it('RED→GREEN: clears the pin when the membership is listed but no longer active', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = scriptedFetch({
      current: () => jsonResponse(403, { error: 'membership_not_found' }),
      directory: () => jsonResponse(200, DIRECTORY_TEAM_MEMBER_REMOVED),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      setLocalSelection: pin.setLocalSelection,
      clearLocalSelection: pin.clearLocalSelection,
    });

    const context = await provider.current({});

    expect(context?.workspaceId).toBe('ws-personal-1');
    expect(pin.clearCalls.length).toBe(1);
    expect(pin.setCalls).toEqual(['ws-personal-1']);
  });

  it('does NOT clear the pin when the directory request fails (network error) — preserve on B outage', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (u.includes('/workspaces/current') && method === 'GET') {
        return jsonResponse(403, { error: 'membership_not_found' });
      }
      if (u.endsWith('/api/v1/workspaces') && method === 'GET') {
        throw new Error('network down');
      }
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      setLocalSelection: pin.setLocalSelection,
      clearLocalSelection: pin.clearLocalSelection,
    });

    const context = await provider.current({});

    // A transient B outage degrades to null for this one read, exactly like
    // the existing network-error contract — but the pin itself must survive
    // untouched so the NEXT successful poll can still recover the real
    // workspace instead of having already been evicted to a fallback.
    expect(context).toBeNull();
    expect(pin.clearCalls.length).toBe(0);
    expect(pin.setCalls.length).toBe(0);
    expect(pin.getActiveWorkspaceId()).toBe('ws-team-1');
  });

  it('does NOT clear the pin when the directory request itself returns a non-2xx', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = scriptedFetch({
      current: () => jsonResponse(403, { error: 'membership_not_found' }),
      directory: () => jsonResponse(500, { error: 'internal' }),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      setLocalSelection: pin.setLocalSelection,
      clearLocalSelection: pin.clearLocalSelection,
    });

    const context = await provider.current({});

    expect(context).toBeNull();
    expect(pin.clearCalls.length).toBe(0);
    expect(pin.setCalls.length).toBe(0);
    expect(pin.getActiveWorkspaceId()).toBe('ws-team-1');
  });
});
