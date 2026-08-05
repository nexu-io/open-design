import { describe, expect, it } from 'vitest';
import { createVelaWorkspaceContextProvider } from '../../src/collab/vela-workspace-context.js';

// Two OD clients, ONE vela account. These suites model B from its source so the
// account-level Active Workspace can be reasoned about without a live backend:
//
//  - `active_workspace_selections` is keyed by app_user_id ALONE
//    (db/schema/public.hcl `primary_key { columns = [column.app_user_id] }`),
//    so an account has exactly one selection — there is no client axis.
//  - `GET /api/v1/workspaces` (the membership directory) is scoped by app user,
//    NOT by that selection, so it answers the same for every client.
//  - `GET /api/v1/workspaces/current` USED to answer only from that selection.
//    It now also honours `x-vela-workspace-id`, the per-request workspace scope
//    B already accepted on its resource plane, its billing scope routes and the
//    Link gateway. URL query hints stay ignored either way — B asserts that in
//    its own suite ("ignores URL workspace hints...").

const TEAM = 'ws-team-1';
const PERSONAL = 'ws-personal-1';

const B_TEAM_CONTEXT = {
  userId: 'auth-user-1',
  appUserId: 'app-user-1',
  workspaceId: TEAM,
  workspaceName: 'Team',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team-pro',
  providerMode: 'platform_credits',
  seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
};

const B_PERSONAL_CONTEXT = {
  ...B_TEAM_CONTEXT,
  workspaceId: PERSONAL,
  workspaceName: 'Personal',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-p1',
  role: 'owner',
  planId: 'personal-pro',
};

const DIRECTORY = {
  items: [
    {
      workspaceId: TEAM,
      workspaceName: 'Team',
      workspaceType: 'team',
      workspaceMemberId: 'wm-1',
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
    },
    {
      workspaceId: PERSONAL,
      workspaceName: 'Personal',
      workspaceType: 'personal',
      workspaceMemberId: 'wm-p1',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
    },
  ],
};

const SESSION = {
  profile: 'prod',
  apiUrl: 'https://vela.example',
  controlKey: 'ck-1',
  user: null,
  configMtimeMs: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const BODIES: Record<string, unknown> = {
  [TEAM]: B_TEAM_CONTEXT,
  [PERSONAL]: B_PERSONAL_CONTEXT,
};

/**
 * One vela account: one account-level selection row, shared by every client
 * signed into it. `honoursWorkspaceHeader` is the only difference between B
 * before and after the current-context scoping change.
 */
function createOneAccountVela(options: {
  selection: string;
  honoursWorkspaceHeader: boolean;
}) {
  let selection = options.selection;
  let directoryReads = 0;
  let putCount = 0;

  const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.includes('/workspaces/current') && method === 'PUT') {
      putCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as { workspaceId?: string };
      if (body.workspaceId) selection = body.workspaceId;
      return jsonResponse(200, BODIES[selection]);
    }
    if (u.includes('/workspaces/current') && method === 'GET') {
      // A `?workspaceId=` hint is ignored by B in both eras; only the header
      // can scope this read, and only after the scoping change.
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const requested = options.honoursWorkspaceHeader
        ? headers['x-vela-workspace-id']
        : undefined;
      return jsonResponse(200, BODIES[requested ?? selection]);
    }
    if (u.endsWith('/api/v1/workspaces') && method === 'GET') {
      directoryReads += 1;
      return jsonResponse(200, DIRECTORY);
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    selection: () => selection,
    directoryReads: () => directoryReads,
    putCount: () => putCount,
  };
}

/** One OD daemon: its own local pin over the account's shared vela session. */
function createClient(fetchImpl: typeof fetch, pinned: string) {
  let pin: string | null = pinned;
  const provider = createVelaWorkspaceContextProvider({
    fetch: fetchImpl,
    readSession: () => SESSION,
    getActiveWorkspaceId: () => pin,
    setLocalSelection: (id) => {
      pin = id;
    },
    clearLocalSelection: () => {
      pin = null;
    },
  });
  return {
    pin: () => pin,
    context: () => provider.current({}),
    exact: (workspaceId: string) => provider.resolveExact!({ workspaceId }),
    /**
     * What `PUT /api/workspace/active` does now: move the LOCAL pin. There is
     * no backend selection call left to make.
     */
    switchTo(workspaceId: string) {
      pin = workspaceId;
    },
  };
}

describe('one account, two clients, against a B that only knows an account-level workspace', () => {
  it('holds each client on its own pin rather than following the account row', async () => {
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: false });
    const clientA = createClient(vela.fetchImpl, TEAM);

    // The account row names the OTHER client's workspace. This daemon must not
    // follow it.
    const a = await clientA.context();
    expect(a?.workspaceId).toBe(TEAM);
    expect(clientA.pin()).toBe(TEAM);
  });

  it('degrades the losing client to a directory synthesis, which reads as seats-full', async () => {
    const winning = createOneAccountVela({ selection: TEAM, honoursWorkspaceHeader: false });
    const enriched = await createClient(winning.fetchImpl, TEAM).context();
    // While the account row happens to name THIS client's workspace, B can
    // describe it fully.
    expect(enriched?.planId).toBe('team-pro');
    expect(enriched?.seatSummary.isSeatFull).toBe(false);

    const losing = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: false });
    const clientA = createClient(losing.fetchImpl, TEAM);
    const degraded = await clientA.context();

    // Same workspace, same membership, same seats in reality...
    expect(degraded?.workspaceId).toBe(TEAM);
    // ...but the billing plane is gone, because one row cannot describe two
    // workspaces and OD has to synthesize this one from the directory.
    expect(degraded?.planId).toBeNull();
    // Worse than blank: a 0/0 seat summary derives isSeatFull, so a workspace
    // with three free seats reads as full to this client. The seat gate is a
    // client-side check, so that is a user-visible block on inviting.
    expect(degraded?.seatSummary).toEqual({
      seatLimit: 0,
      usedSeats: 0,
      availableSeats: 0,
      isSeatFull: true,
    });
    // And it costs a second round-trip the winning client never makes.
    expect(losing.directoryReads()).toBeGreaterThan(winning.directoryReads());
  });

  it('leaves the losing client with no context at all when that extra call blips', async () => {
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: false });
    let failDirectory = true;
    const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
      if (String(url).endsWith('/api/v1/workspaces') && failDirectory) {
        throw new Error('directory blip');
      }
      return (vela.fetchImpl as unknown as typeof fetch)(url as never, init as never);
    }) as unknown as typeof fetch;
    const clientA = createClient(fetchImpl, TEAM);

    // Pinned to TEAM while the account row says PERSONAL, this client can only
    // resolve its own scope through the directory — which just failed.
    expect(await clientA.context()).toBeNull();
    // The pin survives, because nothing was confirmed.
    expect(clientA.pin()).toBe(TEAM);

    failDirectory = false;
    expect((await clientA.context())?.workspaceId).toBe(TEAM);
  });
});

describe('one account, two clients, against a B that honours a per-request workspace', () => {
  it('resolves A and B concurrently without reading or mutating the daemon pin', async () => {
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: true });
    const client = createClient(vela.fetchImpl, 'unrelated-daemon-pin');

    const [a, b] = await Promise.all([
      client.exact(TEAM),
      client.exact(PERSONAL),
    ]);

    expect(a?.workspaceId).toBe(TEAM);
    expect(a?.planId).toBe('team-pro');
    expect(b?.workspaceId).toBe(PERSONAL);
    expect(b?.planId).toBe('personal-pro');
    expect(client.pin()).toBe('unrelated-daemon-pin');
    expect(vela.putCount()).toBe(0);
  });

  it('rejects a mismatched upstream current answer and falls back only to the exact directory item', async () => {
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: false });
    const client = createClient(vela.fetchImpl, 'unrelated-daemon-pin');

    const resolved = await client.exact(TEAM);

    expect(resolved).toMatchObject({
      workspaceId: TEAM,
      workspaceMemberId: 'wm-1',
      role: 'member',
    });
    // The Personal response must not leak into Team. Directory synthesis has no
    // Personal plan enrichment and does not touch the unrelated daemon pin.
    expect(resolved?.planId).toBeNull();
    expect(client.pin()).toBe('unrelated-daemon-pin');
    expect(vela.directoryReads()).toBe(1);
  });

  it('serves BOTH clients their own workspace, fully enriched', async () => {
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: true });
    const clientA = createClient(vela.fetchImpl, TEAM);
    const clientB = createClient(vela.fetchImpl, PERSONAL);

    const a = await clientA.context();
    const b = await clientB.context();

    expect(a?.workspaceId).toBe(TEAM);
    expect(b?.workspaceId).toBe(PERSONAL);
    // Neither client is second-class: the billing plane survives for both,
    // which is the whole point of scoping the read per request.
    expect(a?.planId).toBe('team-pro');
    expect(a?.seatSummary).toEqual({
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    });
    expect(b?.planId).toBe('personal-pro');
    // No directory synthesis was needed for either of them.
    expect(vela.directoryReads()).toBe(0);
  });

  it('never writes the account-level selection, so no client can yank another', async () => {
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: true });
    const clientA = createClient(vela.fetchImpl, TEAM);
    const clientB = createClient(vela.fetchImpl, PERSONAL);

    clientA.switchTo(PERSONAL);
    clientA.switchTo(TEAM);
    await clientA.context();
    await clientB.context();

    // The account row is never touched — not on a switch, not on a read. This
    // is the regression guard: reintroducing a server-side selection write
    // brings back the cross-client yank.
    expect(vela.putCount()).toBe(0);
    expect(vela.selection()).toBe(PERSONAL);
    expect(clientB.pin()).toBe(PERSONAL);
  });

  it('still ignores a mismatched account row when the header path is available', async () => {
    // Defence in depth: even if B answered for the wrong workspace, the pin
    // stays authoritative.
    const vela = createOneAccountVela({ selection: PERSONAL, honoursWorkspaceHeader: false });
    const clientA = createClient(vela.fetchImpl, TEAM);
    expect((await clientA.context())?.workspaceId).toBe(TEAM);
  });
});
