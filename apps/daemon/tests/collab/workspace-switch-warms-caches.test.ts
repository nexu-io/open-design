import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary } from '@open-design/contracts';
import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import {
  registerCollabContextRoutes,
  type RegisterCollabContextRoutesDeps,
} from '../../src/routes/collab-context.js';
import {
  createCachedWorkspaceDirectoryFetcher,
  createVelaWorkspaceContextProvider,
  fetchVelaWorkspaceDirectory,
} from '../../src/collab/vela-workspace-context.js';

// Every workspace-scoped cache in the daemon keys on the active workspace, so a
// switch leaves all of them cold and the FIRST consumer in the new workspace
// pays the refill inline on its own request path. `onWorkspaceSwitched` is the
// seam that lets the owner of those caches warm them during the idle beat right
// after the user switches.
//
// The contract this file pins is deliberately narrow, because getting it wrong
// is worse than not warming at all: the announcement must fire for a CONFIRMED
// switch and for nothing else. Warming on a rejected or rolled-back switch would
// refill the caches against the workspace the daemon just refused to move to.

let server: http.Server | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

const PERSONAL = 'ws-personal';
const TEAM = 'ws-team';

function directoryItem(workspaceId: string): WorkspaceDirectoryItem {
  return {
    workspaceId,
    workspaceName: workspaceId === TEAM ? 'Acme' : "Ma Shu's workspace",
    workspaceType: workspaceId === TEAM ? 'team' : 'personal',
    workspaceMemberId: `wm-${workspaceId}`,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  };
}

function contextFor(workspaceId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: workspaceId === TEAM ? 'team' : 'personal',
    workspaceMemberId: `wm-${workspaceId}`,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
}

/** A switch harness with the client-local restart-default store. */
async function startSwitchServer(options: {
  /** What the follow-up context read answers. Default: agrees with the pin. */
  currentContext?: (pinned: string | null) => WorkspaceCollabContext | null;
  initial?: string;
  /** What the membership directory lists. Default: both workspaces, live. */
  directory?: WorkspaceDirectoryItem[];
  configuredEnv?: () => Record<string, string>;
}) {
  let pinned: string | null = options.initial ?? PERSONAL;
  const onWorkspaceSwitched = vi.fn<(workspaceId: string) => void>();

  const activeWorkspace: NonNullable<RegisterCollabContextRoutesDeps['activeWorkspace']> = {
    get: () => pinned,
    set: async (workspaceId: string) => {
      pinned = workspaceId;
    },
    clear: async () => {
      pinned = null;
    },
    clearIf: async (workspaceId: string) => {
      if (pinned !== workspaceId) return false;
      pinned = null;
      return true;
    },
  };

  const app = express();
  app.use(express.json());
  const workspaceContext = {
    current: async () =>
      options.currentContext
        ? options.currentContext(pinned)
        : pinned
          ? contextFor(pinned)
          : null,
  };
  registerCollabContextRoutes(app, {
    workspaceContext:
      workspaceContext as unknown as RegisterCollabContextRoutesDeps['workspaceContext'],
    activeWorkspace,
    listWorkspaceDirectory: async () =>
      options.directory ?? [directoryItem(PERSONAL), directoryItem(TEAM)],
    onWorkspaceSwitched,
    ...(options.configuredEnv ? { configuredEnv: options.configuredEnv } : {}),
  });

  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  const base = `http://127.0.0.1:${address.port}`;

  return {
    onWorkspaceSwitched,
    pinnedWorkspace: () => pinned,
    /** Proof the route has no backend-selection seam left to call. */
    hasBackendSelectionSeam: () => 'selectWorkspace' in workspaceContext,
    async switchTo(workspaceId: string) {
      const response = await fetch(`${base}/api/workspace/active`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          workspaceMemberId: `wm-${workspaceId}`,
        }),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    async directory() {
      const response = await fetch(`${base}/api/workspace/directory`);
      return (await response.json()) as { activeWorkspaceId: string | null };
    },
  };
}

describe('PUT /api/workspace/active announces a confirmed switch for cache warming', () => {
  it('announces the new workspace exactly once when the switch is confirmed', async () => {
    const api = await startSwitchServer({});

    const result = await api.switchTo(TEAM);

    expect(result.status).toBe(200);
    expect(api.pinnedWorkspace()).toBe(TEAM);
    // The announcement is what lets the daemon refill the `catalog` and
    // `members` digest faces during the idle beat after the switch, instead of
    // making the first project load or agent run in the new workspace pay for
    // it.
    expect(api.onWorkspaceSwitched).toHaveBeenCalledTimes(1);
    expect(api.onWorkspaceSwitched).toHaveBeenCalledWith(TEAM);
  });

  // Choosing a workspace is a local decision authorized by the membership
  // directory, so there is no backend selection to reject and nothing to roll
  // back. This replaces the old 502 `workspace_switch_rejected` contract: that
  // gate made a purely local action fail on an account-scoped backend write,
  // and that write could only ever name ONE workspace per account.
  it('does not depend on a backend workspace selection at all', async () => {
    const api = await startSwitchServer({});

    const result = await api.switchTo(TEAM);

    expect(result.status).toBe(200);
    expect(api.hasBackendSelectionSeam()).toBe(false);
  });

  it('keeps the switch when the context read cannot confirm it, answering from the directory', async () => {
    // An unreadable context is an unconfirmed READ, never evidence that the
    // user's choice was wrong. Reverting here used to undo a switch the
    // directory had already authorized, and the user saw their click do nothing.
    const api = await startSwitchServer({ currentContext: () => null });

    const result = await api.switchTo(TEAM);

    expect(result.status).toBe(200);
    expect(api.pinnedWorkspace()).toBe(TEAM);
    expect(result.body.activeWorkspaceId).toBe(TEAM);
    // Synthesized from the directory entry the route already validated, so the
    // response still describes the workspace the user picked.
    expect((result.body.context as { workspaceId?: string }).workspaceId).toBe(TEAM);
    expect(api.onWorkspaceSwitched).toHaveBeenCalledWith(TEAM);
  });

  it('uses the selected AMR profile origin when the response is synthesized from the directory', async () => {
    vi.stubEnv('OPEN_DESIGN_AMR_PROFILE', 'prod');
    vi.stubEnv('OD_VELA_WEB_URL', 'https://prod.example');
    vi.stubEnv('OD_VELA_WEB_URLS', JSON.stringify({
      prod: 'https://prod.example',
      'feature-test': 'https://feature.example',
    }));
    const api = await startSwitchServer({
      currentContext: () => null,
      configuredEnv: () => ({ OPEN_DESIGN_AMR_PROFILE: 'feature-test' }),
    });

    const result = await api.switchTo(TEAM);

    expect((result.body.context as { workspaceSettingsUrl?: string }).workspaceSettingsUrl).toBe(
      'https://feature.example/settings?workspaceId=ws-team&source=open_design',
    );
  });

  it('keeps the switch when the context read still describes the old workspace', async () => {
    // A stale/lagging context read is likewise not a refusal. The pin is the
    // truth; the web closes the billing plane out on its next context poll.
    const api = await startSwitchServer({ currentContext: () => contextFor(PERSONAL) });

    const result = await api.switchTo(TEAM);

    expect(result.status).toBe(200);
    expect(api.pinnedWorkspace()).toBe(TEAM);
    expect((result.body.context as { workspaceId?: string }).workspaceId).toBe(TEAM);
    expect(api.onWorkspaceSwitched).toHaveBeenCalledWith(TEAM);
  });

  it('returns the saved workspace as the next headerless startup default', async () => {
    const api = await startSwitchServer({});

    await api.switchTo(TEAM);

    expect((await api.directory()).activeWorkspaceId).toBe(TEAM);
  });

  it('stays silent for a workspace the directory does not show', async () => {
    const api = await startSwitchServer({});

    const result = await api.switchTo('ws-not-mine');

    expect(result.status).toBe(404);
    expect(api.onWorkspaceSwitched).not.toHaveBeenCalled();
  });
});

// The compatibility route authorizes the tab-local choice from its directory
// read and may ask `resolveExact()` for richer context. `resolveExact()` is
// deliberately read-only: only the verified route persists the restart
// default. The route's directory read can be a cached success while the exact
// enrichment performs a fresh read and returns null; that disagreement must not
// change which exact workspace the route verified.
//
// These cases wire the production provider against the production cached
// directory fetcher so the two reads genuinely disagree instead of a stub
// pretending they do.
describe('PUT /api/workspace/active keeps exact enrichment tab-local', () => {
  function velaDirectoryBody(items: WorkspaceDirectoryItem[]) {
    return { items };
  }

  async function startRealProviderServer() {
    let pinned: string | null = PERSONAL;
    let directoryCalls = 0;
    const onWorkspaceSwitched = vi.fn<(workspaceId: string) => void>();

    // Restart-default store: the route writes it only after membership checks;
    // resolveExact remains read-only.
    const activeWorkspace: NonNullable<RegisterCollabContextRoutesDeps['activeWorkspace']> = {
      get: () => pinned,
      set: async (workspaceId: string) => {
        pinned = workspaceId;
      },
      clear: async () => {
        pinned = null;
      },
      clearIf: async (workspaceId: string) => {
        if (pinned !== workspaceId) return false;
        pinned = null;
        return true;
      },
    };

    const jsonResponse = (status: number, body: unknown): Response =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

    // Call 1 (the route's read, which gets cached) still lists TEAM.
    // Call 2+ (resolveExact's fresh read) no longer does — enrichment returns
    // null without mutating the legacy pin.
    const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.endsWith('/api/v1/workspaces') && method === 'GET') {
        directoryCalls += 1;
        return jsonResponse(
          200,
          velaDirectoryBody(
            directoryCalls === 1
              ? [directoryItem(PERSONAL), directoryItem(TEAM)]
              : [directoryItem(PERSONAL)],
          ),
        );
      }
      throw new Error(`unexpected fetch ${method} ${u}`);
    }) as unknown as typeof fetch;

    const session = {
      profile: 'prod',
      apiUrl: 'https://vela.example',
      controlKey: 'ck-1',
      user: null,
      configMtimeMs: null,
    };

    const workspaceContext = createVelaWorkspaceContextProvider({
      fetch: fetchImpl,
      readSession: () => session as never,
      getActiveWorkspaceId: () => activeWorkspace.get(),
      replaceLocalSelection: async (expectedWorkspaceId, workspaceId) => {
        if (activeWorkspace.get() !== expectedWorkspaceId) return activeWorkspace.get();
        await activeWorkspace.set(workspaceId);
        return activeWorkspace.get();
      },
    });

    // The production cached fetcher: the route's read is served from cache for
    // 5s, which is precisely how it can disagree with the provider's fresh one.
    const cachedDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory: () => fetchVelaWorkspaceDirectory({ fetch: fetchImpl, readSession: () => session as never }),
      identityKey: () => 'ck-1',
    });

    const app = express();
    app.use(express.json());
    registerCollabContextRoutes(app, {
      workspaceContext,
      activeWorkspace,
      listWorkspaceDirectory: async () => (await cachedDirectory()).items,
      onWorkspaceSwitched,
    } as unknown as RegisterCollabContextRoutesDeps);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');
    const base = `http://127.0.0.1:${address.port}`;

    return {
      onWorkspaceSwitched,
      pinnedWorkspace: () => pinned,
      async switchTo(workspaceId: string) {
        const response = await fetch(`${base}/api/workspace/active`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            workspaceMemberId: `wm-${workspaceId}`,
          }),
        });
        return {
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        };
      },
    };
  }

  it('uses cached directory authorization and persists the restart default', async () => {
    const api = await startRealProviderServer();

    const result = await api.switchTo(TEAM);

    expect(api.pinnedWorkspace()).toBe(TEAM);
    expect(result.status).toBe(200);
    expect(result.body.activeWorkspaceId).toBe(TEAM);
    expect((result.body.context as { workspaceId?: string }).workspaceId).toBe(TEAM);
    expect(api.onWorkspaceSwitched).toHaveBeenCalledOnce();
    expect(api.onWorkspaceSwitched).toHaveBeenCalledWith(TEAM);
  });

  it('does not let exact enrichment overwrite the verified restart default', async () => {
    const api = await startRealProviderServer();

    await api.switchTo(TEAM);

    expect(api.pinnedWorkspace()).toBe(TEAM);
  });
});

describe('PUT /api/workspace/active authorizes on a live membership', () => {
  it('refuses a workspace the directory lists with a removed membership', async () => {
    const api = await startSwitchServer({
      directory: [directoryItem(PERSONAL), { ...directoryItem(TEAM), memberStatus: 'removed' }],
    });

    const result = await api.switchTo(TEAM);

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('workspace_not_visible');
    expect(api.pinnedWorkspace()).toBe(PERSONAL);
    expect(api.onWorkspaceSwitched).not.toHaveBeenCalled();
  });

  it('refuses a workspace the directory lists as deleted', async () => {
    const api = await startSwitchServer({
      directory: [directoryItem(PERSONAL), { ...directoryItem(TEAM), lifecycleState: 'deleted' }],
    });

    const result = await api.switchTo(TEAM);

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('workspace_not_visible');
    expect(api.onWorkspaceSwitched).not.toHaveBeenCalled();
  });
});
