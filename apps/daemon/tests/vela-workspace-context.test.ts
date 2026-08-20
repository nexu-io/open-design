import fs, { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';
import {
  createCachedWorkspaceDirectoryFetcher,
  createFreshWorkspaceDirectoryFetcher,
  createWorkspaceDirectoryAuthorityBroker,
  createVelaWorkspaceContextProvider,
  fetchVelaWorkspaceDirectory,
  mapVelaWorkspaceContext,
  resolveVelaWorkspaceHubEventsEndpoint,
  velaWorkspaceDirectoryIdentityForSession,
  workspaceContextFromDirectoryItem,
} from '../src/collab/vela-workspace-context.js';
import { createActiveWorkspaceSelectionStore } from '../src/collab/active-workspace-selection.js';
import {
  clearVelaAuthorizationState,
  readVelaControlApiContext,
  readVelaLoginStatus,
} from '../src/integrations/vela.js';

// A well-formed rich workspace-context body, as returned inside flows such as
// invite continuation — a team member on a BYOK provider.
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

const B_DIRECTORY_ITEM: WorkspaceDirectoryItem = {
  workspaceId: 'ws-team-1',
  workspaceName: 'Team 1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const SESSION = { profile: 'prod', apiUrl: 'https://vela.example', controlKey: 'ck-1', user: null, configMtimeMs: null };
const tempDirs: string[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  clearVelaAuthorizationState();
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
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
  it('builds hub URL, authorization, and identity from the same merged session', () => {
    const inherited = {
      VELA_API_URL: 'https://account-a.example',
      VELA_CONTROL_KEY: 'account-a-control-key',
    } as NodeJS.ProcessEnv;
    const configured = { VELA_API_URL: 'https://account-b.example' };
    const accountA = readVelaControlApiContext(inherited);
    const accountB = readVelaControlApiContext(inherited, configured);

    const endpoint = resolveVelaWorkspaceHubEventsEndpoint(
      ' workspace-b ',
      inherited,
      configured,
    );

    expect(endpoint).toEqual({
      url: 'https://account-b.example/api/v1/collab/events',
      workspaceId: 'workspace-b',
      identityKey: velaWorkspaceDirectoryIdentityForSession(accountB),
      headers: {
        authorization: 'Bearer account-a-control-key',
        'x-vela-workspace-id': 'workspace-b',
      },
    });
    expect(endpoint?.identityKey).not.toBe(
      velaWorkspaceDirectoryIdentityForSession(accountA),
    );
  });

  it('treats a missing local session as authoritative signed-out, not an outage', async () => {
    await expect(
      fetchVelaWorkspaceDirectory({ readSession: () => null }),
    ).resolves.toEqual({ ok: true, items: [] });
  });

  it.each([401, 403])(
    'preserves an authoritative %s as an expired authorization result',
    async (status) => {
      await expect(fetchVelaWorkspaceDirectory({
        readSession: () => SESSION,
        fetch: async () => jsonResponse(status, { error: 'unauthenticated' }),
      })).resolves.toEqual({
        ok: false,
        items: [],
        reason: 'unauthorized',
        status,
      });
    },
  );

  it('marks the Settings-backed credential revision when the directory rejects its file control key', async () => {
    const amrHome = mkdtempSync(join(tmpdir(), 'od-vela-directory-auth-'));
    tempDirs.push(amrHome);
    vi.stubEnv('AMR_HOME', amrHome);
    writeFileSync(
      join(amrHome, 'config.json'),
      JSON.stringify({
        profiles: {
          prod: {
            apiUrl: 'https://vela.example',
            controlKey: 'file-control-key',
          },
        },
      }),
      'utf8',
    );
    const configuredEnv = {
      VELA_LINK_URL: 'https://settings.example/link',
      VELA_RUNTIME_KEY: 'settings-runtime-key',
    };

    await expect(fetchVelaWorkspaceDirectory({
      configuredEnv,
      fetch: async () => jsonResponse(401, { error: 'unauthenticated' }),
    })).resolves.toMatchObject({
      ok: false,
      reason: 'unauthorized',
      status: 401,
    });

    expect(readVelaLoginStatus(process.env, configuredEnv)).toMatchObject({
      loggedIn: true,
      sessionState: 'reauth_required',
    });
  });

  it('keeps a transport failure distinct from an expired authorization result', async () => {
    await expect(fetchVelaWorkspaceDirectory({
      readSession: () => SESSION,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    })).resolves.toEqual({
      ok: false,
      items: [],
      reason: 'network',
    });
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

  it('backs off a failed directory read and probes again after the outage lease', async () => {
    let now = 0;
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, items: [] })
      .mockResolvedValueOnce({ ok: true, items: [] });
    const read = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory,
      failureBackoffMinMs: 100,
      failureBackoffMaxMs: 100,
      now: () => now,
      random: () => 0,
    });

    await expect(read()).resolves.toEqual({ ok: false, items: [] });
    await expect(read()).resolves.toEqual({ ok: false, items: [] });
    expect(fetchDirectory).toHaveBeenCalledOnce();

    now = 100;
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

  it('reports directory lease hits and mutation invalidation without identity labels', async () => {
    let now = 1_000;
    const onDecision = vi.fn();
    const onSuppressedRequest = vi.fn();
    const onInvalidation = vi.fn();
    const broker = createWorkspaceDirectoryAuthorityBroker({
      now: () => now,
      ttlMs: 5_000,
      fetchDirectory: async () => ({ ok: true, items: [] }),
      onDecision,
      onSuppressedRequest,
      onInvalidation,
    });

    await broker.read();
    now += 250;
    await broker.read();
    expect(onDecision).toHaveBeenLastCalledWith({
      source: 'cache',
      reason: 'lease_hit',
      outcome: 'allow',
      ageMs: 250,
    });
    expect(onSuppressedRequest).toHaveBeenCalledOnce();

    await broker.refreshAfterMutation();
    expect(onInvalidation).toHaveBeenCalledWith({
      source: 'cache',
      reason: 'mutation',
    });
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
  it('keeps a successful lease past 15s while realtime is healthy, then expires it after disconnect', async () => {
    let now = 0;
    const first = { ok: true as const, items: [{ ...B_DIRECTORY_ITEM }] };
    const second = { ok: true as const, items: [] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      ttlMs: 15_000,
      now: () => now,
    });

    await expect(authority.read()).resolves.toEqual(first);
    authority.setRealtimeHealthy(true);
    now = 120_000;
    await expect(authority.read()).resolves.toEqual(first);
    expect(fetchDirectory).toHaveBeenCalledOnce();

    authority.setRealtimeHealthy(false);
    await expect(authority.read()).resolves.toEqual(second);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('preserves the outage circuit when event storms invalidate successful state', async () => {
    let now = 0;
    const unavailable = {
      ok: false as const,
      items: [],
      reason: 'network' as const,
    };
    const fetchDirectory = vi.fn(async () => unavailable);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      failureBackoffMinMs: 15_000,
      now: () => now,
      random: () => 0,
    });

    await authority.backgroundFresh();
    for (let index = 0; index < 100; index += 1) {
      authority.invalidate('event_dirty');
      await authority.backgroundFresh();
    }
    expect(fetchDirectory).toHaveBeenCalledOnce();

    now = 15_000;
    await authority.backgroundFresh();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('invalidates the current account lease and forces the next read to refresh', async () => {
    const first = {
      ok: true as const,
      items: [{ ...B_DIRECTORY_ITEM }],
    };
    const second = { ok: true as const, items: [] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
    });

    await expect(authority.read()).resolves.toEqual(first);
    await expect(authority.read()).resolves.toEqual(first);
    authority.invalidate();
    await expect(authority.read()).resolves.toEqual(second);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('retires every settled lease across an observed A -> B -> A identity round trip', async () => {
    let identity = 'account-a:config-a';
    const accountA = {
      ok: true as const,
      items: [{ ...B_DIRECTORY_ITEM }],
    };
    const refreshedAccountA = { ok: true as const, items: [] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(accountA)
      .mockResolvedValueOnce(refreshedAccountA);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => identity,
    });

    await expect(authority.read()).resolves.toEqual(accountA);
    authority.setRealtimeHealthy(true);
    identity = 'account-b:config-b';
    authority.resetIdentity();
    identity = 'account-a:config-a';

    await expect(authority.read()).resolves.toEqual(refreshedAccountA);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('does not let an invalidated in-flight result seed or satisfy the new generation', async () => {
    const pending: Array<
      (result: { ok: true; items: WorkspaceDirectoryItem[] }) => void
    > = [];
    const fetchDirectory = vi.fn(
      () =>
        new Promise<{ ok: true; items: WorkspaceDirectoryItem[] }>(
          (resolve) => pending.push(resolve),
        ),
    );
    const onAcceptedResult = vi.fn();
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      onAcceptedResult,
    });

    const staleRead = authority.read();
    authority.invalidate();
    const currentRead = authority.read();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);

    const stale = { ok: true as const, items: [{ ...B_DIRECTORY_ITEM }] };
    pending[0]!(stale);
    await expect(staleRead).resolves.toEqual(stale);
    expect(onAcceptedResult).not.toHaveBeenCalled();

    let currentSettled = false;
    void currentRead.then(() => {
      currentSettled = true;
    });
    await Promise.resolve();
    expect(currentSettled).toBe(false);

    const current = {
      ok: true as const,
      items: [{ ...B_DIRECTORY_ITEM, workspaceId: 'ws-team-2' }],
    };
    pending[1]!(current);
    await expect(currentRead).resolves.toEqual(current);
    expect(onAcceptedResult).toHaveBeenCalledOnce();
    expect(onAcceptedResult).toHaveBeenCalledWith(
      current,
      'account-a:config-a',
    );
    await expect(authority.read()).resolves.toEqual(current);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('exposes a cached-only lease that never starts I/O and is partitioned by account identity and expiry', async () => {
    let identity = 'account-a:config-a';
    let now = 0;
    const accepted = {
      ok: true as const,
      items: [{
        workspaceId: 'ws-team-1',
        workspaceName: 'Team',
        workspaceType: 'team' as const,
        workspaceMemberId: 'wm-1',
        role: 'member' as const,
        memberStatus: 'active' as const,
        lifecycleState: 'active' as const,
      }],
    };
    const fetchDirectory = vi.fn(async () => accepted);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => identity,
      now: () => now,
      ttlMs: 100,
    });

    await expect(authority.cached()).resolves.toEqual({ ok: false, items: [] });
    expect(fetchDirectory).not.toHaveBeenCalled();

    await authority.read();
    await expect(authority.cached()).resolves.toEqual(accepted);
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    identity = 'account-b:config-b';
    await expect(authority.cached()).resolves.toEqual({ ok: false, items: [] });
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    identity = 'account-a:config-a';
    now = 100;
    await expect(authority.cached()).resolves.toEqual({ ok: false, items: [] });
    expect(fetchDirectory).toHaveBeenCalledTimes(1);
  });

  it('single-flights shell and project bootstrap reads per account generation and shares outage backoff', async () => {
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
    expect(failedFetch).toHaveBeenCalledOnce();
  });

  it('uses one account-wide exponential outage circuit across read and fresh callers', async () => {
    let now = 0;
    const onDecision = vi.fn();
    const onSuppressedRequest = vi.fn();
    const networkFailure = {
      ok: false as const,
      items: [],
      reason: 'network' as const,
    };
    const recovered = { ok: true as const, items: [{ ...B_DIRECTORY_ITEM }] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(networkFailure)
      .mockResolvedValueOnce(networkFailure)
      .mockResolvedValueOnce(recovered);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      failureBackoffMinMs: 100,
      failureBackoffMaxMs: 400,
      now: () => now,
      random: () => 0,
      onDecision,
      onSuppressedRequest,
    });

    await expect(authority.read()).resolves.toEqual(networkFailure);
    await expect(Promise.all([
      authority.read(),
      authority.backgroundFresh(),
      authority.read(),
    ])).resolves.toEqual([networkFailure, networkFailure, networkFailure]);
    expect(fetchDirectory).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith({
      source: 'cache',
      reason: 'failure_backoff',
      outcome: 'unavailable',
    });
    expect(onSuppressedRequest).toHaveBeenCalledWith({
      source: 'directory',
      reason: 'failure_backoff',
    });

    now = 99;
    await authority.read();
    expect(fetchDirectory).toHaveBeenCalledOnce();
    now = 100;
    await authority.backgroundFresh();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);

    // The second failed probe doubles the floor to 200ms. Positive jitter never
    // probes faster than that floor.
    now = 299;
    await authority.read();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    now = 300;
    await expect(authority.read()).resolves.toEqual(recovered);
    expect(fetchDirectory).toHaveBeenCalledTimes(3);

    // A genuine recovery rewinds both the failure depth and the normal success
    // lease, so later reads return immediately without another upstream call.
    await expect(authority.read()).resolves.toEqual(recovered);
    expect(fetchDirectory).toHaveBeenCalledTimes(3);
  });

  it('lets a user-initiated fresh authority read recover immediately through an open read circuit', async () => {
    const networkFailure = {
      ok: false as const,
      items: [],
      reason: 'network' as const,
    };
    const recovered = { ok: true as const, items: [{ ...B_DIRECTORY_ITEM }] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(networkFailure)
      .mockResolvedValueOnce(recovered);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      failureBackoffMinMs: 120_000,
      random: () => 0,
    });

    await expect(authority.read()).resolves.toEqual(networkFailure);
    await expect(authority.fresh()).resolves.toEqual(recovered);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
    await expect(authority.read()).resolves.toEqual(recovered);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('does not outage-cache authorization rejection and lets authoritative invalidation probe immediately', async () => {
    let now = 0;
    const unauthorized = {
      ok: false as const,
      items: [],
      reason: 'unauthorized' as const,
      status: 401,
    };
    const networkFailure = {
      ok: false as const,
      items: [],
      reason: 'network' as const,
    };
    const recovered = { ok: true as const, items: [{ ...B_DIRECTORY_ITEM }] };
    const fetchDirectory = vi
      .fn()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(networkFailure)
      .mockResolvedValueOnce(recovered);
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'account-a:config-a',
      failureBackoffMinMs: 100,
      now: () => now,
      random: () => 0,
    });

    await expect(authority.read()).resolves.toEqual(unauthorized);
    await expect(authority.read()).resolves.toEqual(networkFailure);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);

    authority.invalidate('catch_up');
    await expect(authority.fresh()).resolves.toEqual(recovered);
    expect(fetchDirectory).toHaveBeenCalledTimes(3);
  });

  it('avoids directory reads for status and heartbeat while realtime stays healthy', async () => {
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

    await authority.read();
    authority.setRealtimeHealthy(true);
    // Model the production order pessimistically: status first every 5s, then
    // heartbeat at each 10s boundary. Both are idempotent display/presence
    // reads of the same directory authority while the strict account event
    // stream remains healthy.
    for (now = 0; now <= 30_000; now += 5_000) {
      await authority.read();
      if (now % 10_000 === 0) await authority.read();
    }

    expect(fetchDirectory).toHaveBeenCalledOnce();
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
  it('adds the signed-in user name and profile image to the workspace identity', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      items: [B_DIRECTORY_ITEM],
    })) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => ({
        ...SESSION,
        user: {
          id: 'auth-user-1',
          email: 'elian@example.com',
          name: 'Elian Zhang',
          image: 'https://example.com/elian.png',
        },
      }),
      getActiveWorkspaceId: () => 'ws-team-1',
    });

    await expect(provider.current({})).resolves.toMatchObject({
      displayName: 'Elian Zhang',
      avatarUrl: 'https://example.com/elian.png',
    });
  });

  it('fetches the membership directory with the vela session bearer token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      items: [B_DIRECTORY_ITEM],
    })) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => 'ws-team-1',
    });
    const context = await provider.current({});
    expect(context?.workspaceMemberId).toBe('wm-1');
    expect(context?.teamId).toBe('ws-team-1');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe('https://vela.example/api/v1/workspaces');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer ck-1' });
  });

  it('returns null without calling B when there is no vela session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, B_TEAM_CONTEXT)) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({ fetch: fetchImpl, readSession: () => null });
    expect(await provider.current({})).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('reads the current configured AMR environment on every workspace request', async () => {
    let profile = 'prod';
    const readSession = vi.fn((
      _env?: NodeJS.ProcessEnv,
      _configuredEnv?: Record<string, string>,
    ) => SESSION as ReturnType<typeof readVelaControlApiContext>);
    const provider = createVelaWorkspaceContextProvider({
      fetch: (async () => jsonResponse(200, B_TEAM_CONTEXT)) as unknown as typeof fetch,
      configuredEnv: () => ({ OPEN_DESIGN_AMR_PROFILE: profile }),
      readSession,
    });

    await provider.current({});
    profile = 'test';
    await provider.current({});

    expect(readSession.mock.calls.map((call) => call[1])).toEqual([
      { OPEN_DESIGN_AMR_PROFILE: 'prod' },
      { OPEN_DESIGN_AMR_PROFILE: 'test' },
    ]);
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

// B-line explicit-workspace handoff: the client does not perceive or write B's
// account-level Active Workspace. The provider resolves its LOCALLY selected
// workspace exclusively through the authenticated membership directory. A
// client with no saved selection picks and persists a local bootstrap default.
describe('createVelaWorkspaceContextProvider explicit local scope', () => {
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

  function scriptedFetch(handlers: { directory?: () => Response }) {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      calls.push({ url: u, method });
      if (u.endsWith('/api/v1/workspaces') && method === 'GET' && handlers.directory) return handlers.directory();
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('picks a LOCAL bootstrap default (personal first) with no server write', async () => {
    vi.stubEnv('OD_VELA_WEB_URL', 'https://web.example.com/console');
    const { fetchImpl, calls } = scriptedFetch({
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const selected: string[] = [];
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      replaceLocalSelection: (expected, id) => {
        expect(expected).toBeNull();
        selected.push(id);
        return id;
      },
    });
    const context = await provider.current({});
    expect(selected).toEqual(['ws-personal-1']);
    expect(context?.workspaceId).toBe('ws-personal-1');
    expect(context?.workspaceType).toBe('personal');
    expect(context?.workspaceMemberId).toBe('wm-p1');
    expect(context?.workspaceSettingsUrl).toBe(
      'https://web.example.com/console/settings?workspaceId=ws-personal-1&source=open_design',
    );
    // Resource semantics from the handoff: a plain read NEVER writes the
    // account-level Active Workspace.
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('restores the saved local workspace after recreating the provider', async () => {
    let localSelection: string | null = 'ws-team-1';
    const { fetchImpl, calls } = scriptedFetch({
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const createProvider = () => createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => localSelection,
      replaceLocalSelection: (expectedWorkspaceId, workspaceId) => {
        if (localSelection !== expectedWorkspaceId) return localSelection;
        localSelection = workspaceId;
        return localSelection;
      },
    });

    expect((await createProvider().current({}))?.workspaceId).toBe('ws-team-1');
    expect((await createProvider().current({}))?.workspaceId).toBe('ws-team-1');
    expect(localSelection).toBe('ws-team-1');
    expect(calls.every((call) => call.url.endsWith('/api/v1/workspaces'))).toBe(true);
  });

  it('keeps Personal workspace actions stable across directory refreshes', async () => {
    vi.stubEnv('OD_VELA_WEB_URL', 'https://web.example.com/console');
    const { fetchImpl } = scriptedFetch({
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
      'https://web.example.com/console/settings?workspaceId=ws-personal-1&source=open_design',
    );
    expect(refreshed?.workspaceSettingsUrl).toBe(initial?.workspaceSettingsUrl);
  });

  it('serves the local selection regardless of directory ordering', async () => {
    const { fetchImpl } = scriptedFetch({
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => 'ws-team-1',
    });
    const context = await provider.current({});
    expect(context?.workspaceId).toBe('ws-team-1');
    expect(context?.workspaceType).toBe('team');
    expect(context?.teamId).toBe('ws-team-1');
    expect(context?.workspaceMemberId).toBe('wm-1');
  });

  it('derives the selected context entirely from the membership directory', async () => {
    const { fetchImpl } = scriptedFetch({
      directory: () => jsonResponse(200, DIRECTORY),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => 'ws-team-1',
    });
    const context = await provider.current({});
    expect(context?.workspaceId).toBe('ws-team-1');
    expect(context?.workspaceName).toBe('Team');
    expect(context?.planId).toBeNull();
  });

  it('routes current and exact reads through the injected directory authority broker', async () => {
    const fetchWorkspaceDirectory = vi.fn(async () => ({
      ok: true as const,
      items: [B_DIRECTORY_ITEM],
    }));
    const directFetch = vi.fn(async () => {
      throw new Error('direct directory fetch must stay behind the broker');
    }) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({
      fetch: directFetch,
      fetchWorkspaceDirectory,
      readSession: () => SESSION,
      getActiveWorkspaceId: () => B_DIRECTORY_ITEM.workspaceId,
    });

    await expect(provider.current({})).resolves.toMatchObject({
      workspaceId: B_DIRECTORY_ITEM.workspaceId,
    });
    await expect(provider.resolveExact?.({
      workspaceId: B_DIRECTORY_ITEM.workspaceId,
    })).resolves.toMatchObject({
      workspaceId: B_DIRECTORY_ITEM.workspaceId,
    });
    expect(fetchWorkspaceDirectory).toHaveBeenCalledTimes(2);
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('does not bootstrap when the directory returns 401', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'unauthenticated' })) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({ fetch: fetchImpl, readSession: () => SESSION });
    expect(await provider.current({})).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('keeps an empty directory unselected and retries on the next read', async () => {
    const { fetchImpl, calls } = scriptedFetch({
      directory: () => jsonResponse(200, { items: [] }),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
    });
    expect(await provider.current({})).toBeNull();
    expect(await provider.current({})).toBeNull();
    const directoryCalls = calls.filter((c) => c.url.endsWith('/api/v1/workspaces'));
    expect(directoryCalls.length).toBe(2);
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
  const CONCURRENT_WORKSPACE = {
    workspaceId: 'ws-team-2',
    workspaceName: 'Other team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-2',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
  } satisfies WorkspaceDirectoryItem;
  const DIRECTORY_WITH_CONCURRENT_WORKSPACE = {
    items: [...DIRECTORY_WITHOUT_TEAM.items, CONCURRENT_WORKSPACE],
  };

  /** A stateful local-pin double whose conditional replacement mutates the
   *  SAME backing value `getActiveWorkspaceId` reads, exactly like the real
   *  `ActiveWorkspaceSelectionStore`. */
  function statefulPin(initial: string | undefined) {
    let value = initial;
    const setCalls: string[] = [];
    const replaceCalls: Array<[string | null, string]> = [];
    return {
      getActiveWorkspaceId: () => value,
      replaceLocalSelection: (expectedWorkspaceId: string | null, id: string) => {
        if ((value ?? null) !== expectedWorkspaceId) return value ?? null;
        value = id;
        setCalls.push(id);
        replaceCalls.push([expectedWorkspaceId, id]);
        return value;
      },
      setCalls,
      replaceCalls,
    };
  }

  function scriptedFetch(handlers: { directory?: () => Response }) {
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (u.endsWith('/api/v1/workspaces') && method === 'GET' && handlers.directory) return handlers.directory();
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;
    return fetchImpl;
  }

  it('RED→GREEN: replaces the pin with personal when the workspace vanished from the directory', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = scriptedFetch({
      directory: () => jsonResponse(200, DIRECTORY_WITHOUT_TEAM),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      replaceLocalSelection: pin.replaceLocalSelection,
    });

    const context = await provider.current({});

    // Before the fix this returned null forever (the front end reads a null
    // context as "signed out"), even though the user still has a usable
    // personal workspace.
    expect(context).not.toBeNull();
    expect(context?.workspaceId).toBe('ws-personal-1');
    expect(context?.workspaceType).toBe('personal');
    expect(pin.replaceCalls).toEqual([['ws-team-1', 'ws-personal-1']]);
    expect(pin.setCalls).toEqual(['ws-personal-1']);
    expect(pin.getActiveWorkspaceId()).toBe('ws-personal-1');
  });

  it('RED→GREEN: replaces the pin when the membership is listed but no longer active', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = scriptedFetch({
      directory: () => jsonResponse(200, DIRECTORY_TEAM_MEMBER_REMOVED),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      replaceLocalSelection: pin.replaceLocalSelection,
    });

    const context = await provider.current({});

    expect(context?.workspaceId).toBe('ws-personal-1');
    expect(pin.replaceCalls).toEqual([['ws-team-1', 'ws-personal-1']]);
    expect(pin.setCalls).toEqual(['ws-personal-1']);
  });

  it('preserves a concurrent selection that wins before stale replacement starts', async () => {
    let pin = 'ws-team-1';
    const replaceLocalSelection = vi.fn(() => {
      pin = CONCURRENT_WORKSPACE.workspaceId;
      return pin;
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: scriptedFetch({
        directory: () => jsonResponse(200, DIRECTORY_WITH_CONCURRENT_WORKSPACE),
      }),
      readSession: () => SESSION,
      getActiveWorkspaceId: () => pin,
      replaceLocalSelection,
    });

    const context = await provider.current({});

    expect(context?.workspaceId).toBe(CONCURRENT_WORKSPACE.workspaceId);
    expect(pin).toBe(CONCURRENT_WORKSPACE.workspaceId);
    expect(replaceLocalSelection).toHaveBeenCalledWith(
      'ws-team-1',
      'ws-personal-1',
    );
  });

  it('keeps a user switch queued while stale recovery persists its fallback', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-stale-workspace-recovery-'));
    tempDirs.push(root);
    const activeWorkspace = createActiveWorkspaceSelectionStore(root);
    await activeWorkspace.set('ws-team-1');

    let releaseRename!: () => void;
    const renameGate = new Promise<void>((resolve) => {
      releaseRename = resolve;
    });
    let renameStarted!: () => void;
    const renameWasStarted = new Promise<void>((resolve) => {
      renameStarted = resolve;
    });
    const originalRename = fs.promises.rename.bind(fs.promises);
    let pauseNextRename = true;
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(
      async (oldPath, newPath) => {
        if (pauseNextRename) {
          pauseNextRename = false;
          renameStarted();
          await renameGate;
        }
        return originalRename(oldPath, newPath);
      },
    );

    const provider = createVelaWorkspaceContextProvider({
      fetch: scriptedFetch({
        directory: () => jsonResponse(200, DIRECTORY_WITH_CONCURRENT_WORKSPACE),
      }),
      readSession: () => SESSION,
      getActiveWorkspaceId: () => activeWorkspace.get(),
      replaceLocalSelection: (expectedWorkspaceId, workspaceId) =>
        activeWorkspace.replaceIf(expectedWorkspaceId, workspaceId),
    });

    try {
      const recovering = provider.current({});
      await renameWasStarted;
      const userSwitch = activeWorkspace.set(CONCURRENT_WORKSPACE.workspaceId);
      releaseRename();

      const [context] = await Promise.all([recovering, userSwitch]);

      expect(context?.workspaceId).toBe(CONCURRENT_WORKSPACE.workspaceId);
      expect(activeWorkspace.get()).toBe(CONCURRENT_WORKSPACE.workspaceId);
      expect(createActiveWorkspaceSelectionStore(root).get()).toBe(
        CONCURRENT_WORKSPACE.workspaceId,
      );
    } finally {
      releaseRename();
      renameSpy.mockRestore();
    }
  });

  it('does NOT clear the pin when the directory request fails (network error) — preserve on B outage', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const u = String(url);
      if (u.endsWith('/api/v1/workspaces') && method === 'GET') {
        throw new Error('network down');
      }
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      replaceLocalSelection: pin.replaceLocalSelection,
    });

    const context = await provider.current({});

    // A transient B outage degrades to null for this one read, exactly like
    // the existing network-error contract — but the pin itself must survive
    // untouched so the NEXT successful poll can still recover the real
    // workspace instead of having already been evicted to a fallback.
    expect(context).toBeNull();
    expect(pin.replaceCalls.length).toBe(0);
    expect(pin.setCalls.length).toBe(0);
    expect(pin.getActiveWorkspaceId()).toBe('ws-team-1');
  });

  it('does NOT clear the pin when the directory request itself returns a non-2xx', async () => {
    const pin = statefulPin('ws-team-1');
    const fetchImpl = scriptedFetch({
      directory: () => jsonResponse(500, { error: 'internal' }),
    });
    const provider = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => SESSION,
      getActiveWorkspaceId: pin.getActiveWorkspaceId,
      replaceLocalSelection: pin.replaceLocalSelection,
    });

    const context = await provider.current({});

    expect(context).toBeNull();
    expect(pin.replaceCalls.length).toBe(0);
    expect(pin.setCalls.length).toBe(0);
    expect(pin.getActiveWorkspaceId()).toBe('ws-team-1');
  });
});
