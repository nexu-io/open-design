import { describe, expect, it } from 'vitest';
import { createVelaWorkspaceContextProvider } from '../../src/collab/vela-workspace-context.js';

// Two OD clients may share one vela account, but workspace selection is a
// client-local concern. Both clients read the same authenticated membership
// directory and resolve different entries through their own persisted pins;
// B's account-global current-workspace state is never read or written.

const TEAM = 'ws-team-1';
const PERSONAL = 'ws-personal-1';

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

function createDirectoryAuthority() {
  let failDirectory = false;
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const value = String(url);
    calls.push({ url: value, method });
    if (!value.endsWith('/api/v1/workspaces') || method !== 'GET') {
      throw new Error(`unexpected fetch ${method} ${value}`);
    }
    if (failDirectory) throw new Error('directory blip');
    return jsonResponse(200, DIRECTORY);
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    calls,
    setDirectoryFailure(value: boolean) {
      failDirectory = value;
    },
  };
}

/** One OD daemon: its own local pin over the account's shared vela session. */
function createClient(fetchImpl: typeof fetch, pinned: string) {
  let pin: string | null = pinned;
  const provider = createVelaWorkspaceContextProvider({
    fetch: fetchImpl,
    readSession: () => SESSION,
    getActiveWorkspaceId: () => pin,
    replaceLocalSelection: (expectedWorkspaceId, workspaceId) => {
      if (pin !== expectedWorkspaceId) return pin;
      pin = workspaceId;
      return pin;
    },
  });
  return {
    pin: () => pin,
    context: () => provider.current({}),
    exact: (workspaceId: string) => provider.resolveExact!({ workspaceId }),
    /** Mirrors `PUT /api/workspace/active`: move only this client's local pin. */
    switchTo(workspaceId: string) {
      pin = workspaceId;
    },
  };
}

describe('one account, two clients with independent local workspace selections', () => {
  it('serves both clients from their own pins using only the membership directory', async () => {
    const authority = createDirectoryAuthority();
    const clientA = createClient(authority.fetchImpl, TEAM);
    const clientB = createClient(authority.fetchImpl, PERSONAL);

    expect((await clientA.context())?.workspaceId).toBe(TEAM);
    expect((await clientB.context())?.workspaceId).toBe(PERSONAL);
    expect(clientA.pin()).toBe(TEAM);
    expect(clientB.pin()).toBe(PERSONAL);
    expect(authority.calls).toHaveLength(2);
    expect(authority.calls.every((call) =>
      call.method === 'GET' && call.url.endsWith('/api/v1/workspaces')
    )).toBe(true);
  });

  it('switching one client never changes the other client', async () => {
    const authority = createDirectoryAuthority();
    const clientA = createClient(authority.fetchImpl, TEAM);
    const clientB = createClient(authority.fetchImpl, PERSONAL);

    clientA.switchTo(PERSONAL);
    clientA.switchTo(TEAM);

    expect((await clientA.context())?.workspaceId).toBe(TEAM);
    expect((await clientB.context())?.workspaceId).toBe(PERSONAL);
    expect(clientB.pin()).toBe(PERSONAL);
    expect(authority.calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('resolves an exact request without changing the client restart pin', async () => {
    const authority = createDirectoryAuthority();
    const client = createClient(authority.fetchImpl, PERSONAL);

    expect((await client.exact(TEAM))?.workspaceId).toBe(TEAM);
    expect(client.pin()).toBe(PERSONAL);
  });

  it('preserves both local pins across a transient directory outage', async () => {
    const authority = createDirectoryAuthority();
    const clientA = createClient(authority.fetchImpl, TEAM);
    const clientB = createClient(authority.fetchImpl, PERSONAL);
    authority.setDirectoryFailure(true);

    expect(await clientA.context()).toBeNull();
    expect(await clientB.context()).toBeNull();
    expect(clientA.pin()).toBe(TEAM);
    expect(clientB.pin()).toBe(PERSONAL);

    authority.setDirectoryFailure(false);
    expect((await clientA.context())?.workspaceId).toBe(TEAM);
    expect((await clientB.context())?.workspaceId).toBe(PERSONAL);
  });
});
