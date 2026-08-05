import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { registerTeamResourceShareRoutes } from '../src/routes/team-resource-share.js';
import { createSwrCache } from '../src/collab/swr-cache.js';
import { invalidateTeamResourceListingCaches } from '../src/collab/team-resource-list-cache.js';
import type {
  TeamResourceRequestScope,
  TeamResourceShareRecord,
  TeamResourceShareService,
} from '../src/collab/team-resource-share.js';
import { TeamResourceAuthorityUnavailableError } from '../src/collab/team-resource-share.js';

let server: http.Server | null = null;
const SCOPE: TeamResourceRequestScope = {
  principal: {
    memberId: 'wm-1',
    teamId: 'ws-1',
    role: 'owner',
    lifecycleState: 'active',
    workspaceType: 'team',
  },
  canShare: true,
};
const SCOPE_B: TeamResourceRequestScope = {
  principal: {
    memberId: 'wm-2',
    teamId: 'ws-2',
    role: 'member',
    lifecycleState: 'active',
    workspaceType: 'team',
  },
  canShare: true,
};

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

function fakeShare(records: TeamResourceShareRecord[]): {
  service: TeamResourceShareService;
  calls: () => number;
} {
  let calls = 0;
  const service = {
    async sharedResources() {
      calls += 1;
      return records;
    },
    async share() {
      return null;
    },
    async unshare() {
      return false;
    },
  } as unknown as TeamResourceShareService;
  return { service, calls: () => calls };
}

interface TestServer {
  base: string;
  get(route: string, headers?: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }>;
  post(route: string, headers?: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }>;
  del(route: string, headers?: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }>;
}

type RouteDeps = Parameters<typeof registerTeamResourceShareRoutes>[1];

async function startServer(
  deps: Omit<RouteDeps, 'resolveScope'> & Partial<Pick<RouteDeps, 'resolveScope'>>,
): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  registerTeamResourceShareRoutes(app, {
    resolveScope: async () => ({ ok: true, scope: SCOPE }),
    ...deps,
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (method: string, route: string, headers?: Record<string, string>) => {
    const response = await fetch(`${base}${route}`, {
      method,
      ...(headers ? { headers } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return {
    base,
    get: (route, headers) => call('GET', route, headers),
    post: (route, headers) => call('POST', route, headers),
    del: (route, headers) => call('DELETE', route, headers),
  };
}

const record = (id: string): TeamResourceShareRecord =>
  ({ id, localId: id, version: 1 }) as unknown as TeamResourceShareRecord;

describe('team resource share /team listing', () => {
  it('returns retryable 503 when unshare cannot read the authoritative Team index', async () => {
    const service = {
      async unshare() {
        throw new TeamResourceAuthorityUnavailableError(new Error('hub offline'));
      },
    } as unknown as TeamResourceShareService;
    const req = await startServer({
      basePath: 'design-systems',
      share: service,
    });

    const response = await req.del('/api/workspace/design-systems/user%3Abrand/share');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'WORKSPACE_RESOURCE_AUTHORITY_UNAVAILABLE',
      message: 'team resource authority is temporarily unavailable',
      retryable: true,
    });
  });

  it('rejects a share when the resource-owner gate denies it', async () => {
    let shareCalls = 0;
    const service = {
      async sharedResources() { return []; },
      async share() { shareCalls += 1; return { version: 1 }; },
      async unshare() { return false; },
    } as unknown as TeamResourceShareService;
    const req = await startServer({
      basePath: 'design-systems',
      share: service,
      authorizeShare: () => false,
    });
    const response = await req.post('/api/workspace/design-systems/user%3Aprivate/share');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('WORKSPACE_RESOURCE_SHARE_DENIED');
    expect(shareCalls).toBe(0);
  });

  it('checks exact Personal creator ownership before invoking the share service', async () => {
    let shareCalls = 0;
    const service = {
      async share() {
        shareCalls += 1;
        return { version: 1 };
      },
    } as unknown as TeamResourceShareService;
    const req = await startServer({
      basePath: 'plugins',
      share: service,
      authorizeShare: async () => false,
    });

    const response = await req.post('/api/workspace/plugins/private-plugin/share');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('WORKSPACE_RESOURCE_SHARE_DENIED');
    expect(shareCalls).toBe(0);
  });

  it('forwards each request-resolved scope through list, share, and unshare', async () => {
    const seen: Array<{ operation: string; workspaceId: string }> = [];
    const service = {
      async sharedResources(scope: TeamResourceRequestScope) {
        seen.push({ operation: 'list', workspaceId: scope.principal.teamId });
        return [];
      },
      async share(_id: string, scope: TeamResourceRequestScope) {
        seen.push({ operation: 'share', workspaceId: scope.principal.teamId });
        return { version: 1 };
      },
      async unshare(_id: string, scope: TeamResourceRequestScope) {
        seen.push({ operation: 'unshare', workspaceId: scope.principal.teamId });
        return true;
      },
    } as unknown as TeamResourceShareService;
    const req = await startServer({
      basePath: 'skills',
      share: service,
      resolveScope: async (request) => ({
        ok: true,
        scope: request.get('x-test-workspace') === 'ws-2' ? SCOPE_B : SCOPE,
      }),
    });

    await req.get('/api/workspace/skills/team');
    await req.post('/api/workspace/skills/a/share', { 'x-test-workspace': 'ws-2' });
    await req.del('/api/workspace/skills/a/share');

    expect(seen).toEqual([
      { operation: 'list', workspaceId: 'ws-1' },
      { operation: 'share', workspaceId: 'ws-2' },
      { operation: 'unshare', workspaceId: 'ws-1' },
    ]);
  });

  it('fans out a committed linked mutation only after its exact list cache is invalidated', async () => {
    const order: string[] = [];
    const service = {
      async share() {
        order.push('share');
        return { version: 1 };
      },
      async unshare() {
        order.push('unshare');
        return true;
      },
    } as unknown as TeamResourceShareService;
    const listTeam = Object.assign(
      async () => ({ ids: [], resources: [] }),
      { invalidate: () => { order.push('invalidate-resource-list'); } },
    );
    const req = await startServer({
      basePath: 'design-systems',
      share: service,
      listTeam,
      onMutationCommitted: (resourceId, requestScope, visibility) => {
        order.push(`emit:${requestScope.principal.teamId}:${resourceId}:${visibility}`);
      },
    });

    await expect(req.post('/api/workspace/design-systems/user%3Abrand/share'))
      .resolves.toMatchObject({ status: 200, body: { shared: true } });
    await expect(req.del('/api/workspace/design-systems/user%3Abrand/share'))
      .resolves.toMatchObject({ status: 200, body: { unshared: true } });

    expect(order).toEqual([
      'share',
      'invalidate-resource-list',
      'emit:ws-1:user:brand:team',
      'unshare',
      'invalidate-resource-list',
      'emit:ws-1:user:brand:personal',
    ]);
  });

  it.each([
    [400, 'WORKSPACE_CONTEXT_REQUIRED'],
    [403, 'WORKSPACE_ACCESS_DENIED'],
    [503, 'WORKSPACE_AUTHORITY_UNAVAILABLE'],
  ] as const)('returns explicit authority failure %s (%s)', async (status, code) => {
    const { service, calls } = fakeShare([]);
    const req = await startServer({
      basePath: 'plugins',
      share: service,
      resolveScope: async () => ({
        ok: false,
        status,
        code,
        message: 'scope rejected',
        ...(status === 503 ? { retryable: true as const } : {}),
      }),
    });

    const response = await req.get('/api/workspace/plugins/team');
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({
      error: code,
      message: 'scope rejected',
      ...(status === 503 ? { retryable: true } : {}),
    });
    expect(calls()).toBe(0);
  });

  it('serves the cached listTeam provider instead of hitting the hub', async () => {
    const { service, calls } = fakeShare([record('a'), record('b')]);
    let listTeamCalls = 0;
    const req = await startServer({
      basePath: 'skills',
      share: service,
      listTeam: async () => {
        listTeamCalls += 1;
        return { ids: ['a', 'b'], resources: [record('a'), record('b')] };
      },
    });
    const res = await req.get('/api/workspace/skills/team');
    expect(res.status).toBe(200);
    expect(res.body.ids).toEqual(['a', 'b']);
    // The cache provider was consulted; the raw hub read was NOT hit on the path.
    expect(listTeamCalls).toBe(1);
    expect(calls()).toBe(0);
  });

  it('falls back to the direct hub read when no listTeam provider is given', async () => {
    const { service, calls } = fakeShare([record('x')]);
    const req = await startServer({ basePath: 'plugins', share: service });
    const res = await req.get('/api/workspace/plugins/team');
    expect(res.status).toBe(200);
    expect(res.body.ids).toEqual(['x']);
    expect(calls()).toBe(1);
  });
});

// Acceptance: "分享给团队的设计体系没有在设计体系做状态同步" / "分享到团队完成后团队的
// 设计体系没增加,要等很久,取消分享到团队也是". The route's response is what makes the
// client refetch `/team` right away; without an invalidate seam that refetch was
// served the pre-change list straight out of the daemon's own 3s SWR cache, so
// the change only became visible on a later poll (up to 60s once SSE lowers the
// client's cadence). These tests wire a REAL `createSwrCache` (the same
// primitive `cachedTeamResourceList` in server.ts uses) through the actual
// route handlers, so they fail if the POST/DELETE handlers stop calling
// `listTeam.invalidate()` on success.
describe('team resource share success invalidates the cached /team listing', () => {
  function mutableShare(initial: TeamResourceShareRecord[]) {
    let records = initial;
    let sharedResourcesCalls = 0;
    const service: TeamResourceShareService = {
      async sharedResources() {
        sharedResourcesCalls += 1;
        return records;
      },
      async share(id: string) {
        records = [...records, record(id)];
        return { version: (records.length) };
      },
      async unshare(id: string) {
        const before = records.length;
        records = records.filter((r) => r.id !== id);
        return records.length < before;
      },
    } as unknown as TeamResourceShareService;
    return { service, sharedResourcesCalls: () => sharedResourcesCalls };
  }

  // freshMs is generous (3000ms, matching production) precisely so that a
  // successful invalidate is the ONLY way the very next read can be fresh —
  // if the handler forgot to call it, this test would still be well inside the
  // stale window and would observe the pre-mutation list.
  const PROD_FRESH_MS = 3000;

  for (const kind of ['design-systems', 'plugins', 'skills'] as const) {
    it(`share success (${kind}) makes the very next /team read reflect it, inside freshMs`, async () => {
      const { service, sharedResourcesCalls } = mutableShare([record('a')]);
      const listTeam = createSwrCache(
        async () => {
          const resources = await service.sharedResources(SCOPE);
          return { ids: resources.map((r) => r.id), resources };
        },
        () => 'ws-1',
        PROD_FRESH_MS,
      );
      const req = await startServer({ basePath: kind, share: service, listTeam });

      const before = await req.get(`/api/workspace/${kind}/team`);
      expect(before.body.ids).toEqual(['a']);
      expect(sharedResourcesCalls()).toBe(1);

      const shareResp = await req.post(`/api/workspace/${kind}/b/share`);
      expect(shareResp.status).toBe(200);
      expect(shareResp.body).toMatchObject({ shared: true });

      // No delay, no waiting out freshMs — this is the exact timing the
      // client's own post-share refetch relies on.
      const after = await req.get(`/api/workspace/${kind}/team`);
      expect(after.body.ids).toEqual(['a', 'b']);
      expect(sharedResourcesCalls()).toBe(2);
    });

    it(`unshare success (${kind}) makes the very next /team read reflect it, inside freshMs`, async () => {
      const { service, sharedResourcesCalls } = mutableShare([record('a'), record('b')]);
      const listTeam = createSwrCache(
        async () => {
          const resources = await service.sharedResources(SCOPE);
          return { ids: resources.map((r) => r.id), resources };
        },
        () => 'ws-1',
        PROD_FRESH_MS,
      );
      const req = await startServer({ basePath: kind, share: service, listTeam });

      const before = await req.get(`/api/workspace/${kind}/team`);
      expect(before.body.ids).toEqual(['a', 'b']);
      expect(sharedResourcesCalls()).toBe(1);

      const unshareResp = await req.del(`/api/workspace/${kind}/b/share`);
      expect(unshareResp.status).toBe(200);
      expect(unshareResp.body).toEqual({ unshared: true });

      const after = await req.get(`/api/workspace/${kind}/team`);
      expect(after.body.ids).toEqual(['a']);
      expect(sharedResourcesCalls()).toBe(2);
    });
  }

  it('does not invalidate on a share no-op (shared:false — no team identity)', async () => {
    const { service, sharedResourcesCalls } = mutableShare([record('a')]);
    // Shadow `share` to answer the off-team no-op without mutating anything —
    // a real off-team share() never reaches the mutation branch above.
    (service as unknown as { share: TeamResourceShareService['share'] }).share = async () => null;
    const listTeam = createSwrCache(
      async () => {
        const resources = await service.sharedResources(SCOPE);
        return { ids: resources.map((r) => r.id), resources };
      },
      () => 'ws-1',
      3000,
    );
    const req = await startServer({ basePath: 'design-systems', share: service, listTeam });

    await req.get('/api/workspace/design-systems/team');
    const shareResp = await req.post('/api/workspace/design-systems/b/share');
    expect(shareResp.body).toEqual({ shared: false });

    // Still inside freshMs and nothing actually changed — the cache is
    // untouched, proving the handler did not fire an unconditional invalidate.
    await req.get('/api/workspace/design-systems/team');
    expect(sharedResourcesCalls()).toBe(1);
  });

  it('does not invalidate on an unshare no-op (unshared:false)', async () => {
    const { service, sharedResourcesCalls } = mutableShare([record('a')]);
    (service as unknown as { unshare: TeamResourceShareService['unshare'] }).unshare = async () => false;
    const listTeam = createSwrCache(
      async () => {
        const resources = await service.sharedResources(SCOPE);
        return { ids: resources.map((r) => r.id), resources };
      },
      () => 'ws-1',
      3000,
    );
    const req = await startServer({ basePath: 'design-systems', share: service, listTeam });

    await req.get('/api/workspace/design-systems/team');
    const unshareResp = await req.del('/api/workspace/design-systems/nonexistent/share');
    expect(unshareResp.body).toEqual({ unshared: false });

    await req.get('/api/workspace/design-systems/team');
    expect(sharedResourcesCalls()).toBe(1);
  });

  it('a cache seam that throws on invalidate still reports the share as successful', async () => {
    const { service } = mutableShare([record('a')]);
    const listTeam = Object.assign(
      async () => ({ ids: ['a'], resources: [record('a')] }),
      {
        invalidate() {
          throw new Error('cache seam exploded');
        },
      },
    );
    const req = await startServer({ basePath: 'design-systems', share: service, listTeam });

    const shareResp = await req.post('/api/workspace/design-systems/b/share');
    expect(shareResp.status).toBe(200);
    expect(shareResp.body).toMatchObject({ shared: true });
  });

  // Pins the two-layer composition `cachedTeamResourceList` uses in server.ts:
  // `share.sharedResources()` itself reads through a SECOND, shared SWR cache
  // (`sharedTeamResourcesCommand` — the single `vela resource shared --json`
  // read all three kinds funnel through). A bare reset of only the outer
  // per-kind cache is not enough: the immediate post-share refetch would call
  // `sharedResources()` fresh, which would then read the STILL-STALE raw hub
  // listing back out of that inner cache for up to its own freshMs. This
  // mirrors (does not import — the composition is private to server.ts) the
  // exact `cachedTeamResourceList` wiring so a regression there is caught here
  // instead of only in a live daemon.
  it('the outer per-kind cache cascades invalidate into the shared inner hub-read cache', async () => {
    let hubResources = [{ id: 'a' }];
    let hubReadCalls = 0;
    const sharedTeamResourcesCommand = createSwrCache(
      async () => {
        hubReadCalls += 1;
        return JSON.stringify({ resources: hubResources });
      },
      () => 'ws-1',
      3000,
    );

    const service: TeamResourceShareService = {
      async sharedResources() {
        const raw = await sharedTeamResourcesCommand();
        return (JSON.parse(raw).resources as Array<{ id: string }>).map((r) => record(r.id));
      },
      async share(id: string) {
        hubResources = [...hubResources, { id }];
        return { version: 1 };
      },
      async unshare() {
        return false;
      },
    } as unknown as TeamResourceShareService;

    function cachedTeamResourceListLikeServerTs() {
      const listing = createSwrCache(
        async () => {
          const resources = await service.sharedResources(SCOPE);
          return { ids: resources.map((r) => r.id), resources };
        },
        () => 'ws-1',
        3000,
      );
      const dropListingEntry = listing.invalidate;
      return Object.assign(listing, {
        invalidate() {
          dropListingEntry();
          sharedTeamResourcesCommand.invalidate();
        },
      });
    }

    const listTeam = cachedTeamResourceListLikeServerTs();
    const req = await startServer({ basePath: 'design-systems', share: service, listTeam });

    const before = await req.get('/api/workspace/design-systems/team');
    expect(before.body.ids).toEqual(['a']);
    expect(hubReadCalls).toBe(1);

    const shareResp = await req.post('/api/workspace/design-systems/b/share');
    expect(shareResp.status).toBe(200);

    const after = await req.get('/api/workspace/design-systems/team');
    // If only the outer cache had been dropped, `sharedResources()` would
    // still read the pre-share raw listing out of `sharedTeamResourcesCommand`
    // (hubReadCalls would stay at 1) and 'b' would be missing here.
    expect(after.body.ids).toEqual(['a', 'b']);
    expect(hubReadCalls).toBe(2);
  });
});

describe('background Team resource reconciliation invalidates the cached /team listing', () => {
  it('drops the selected outer plugin listing before the next post-retraction read', async () => {
    let records = [record('plugin-retracted')];
    let sharedResourcesCalls = 0;
    const service = {
      async sharedResources() {
        sharedResourcesCalls += 1;
        return records;
      },
      async share() {
        return null;
      },
      async unshare() {
        return false;
      },
    } as unknown as TeamResourceShareService;
    const outer = createSwrCache(
      async () => {
        const resources = await service.sharedResources(SCOPE);
        return { ids: resources.map((resource) => resource.id), resources };
      },
      () => 'ws-1',
      3000,
    );
    const listTeam = Object.assign(
      async (_scope: TeamResourceRequestScope) => outer(),
      { invalidate: (_scope: TeamResourceRequestScope) => outer.invalidate() },
    );
    const untouched = { invalidate: (_scope: TeamResourceRequestScope) => {} };
    const req = await startServer({ basePath: 'plugins', share: service, listTeam });

    const before = await req.get('/api/workspace/plugins/team');
    expect(before.body.ids).toEqual(['plugin-retracted']);
    expect(sharedResourcesCalls).toBe(1);

    records = [];
    invalidateTeamResourceListingCaches({
      resourceKind: 'plugin',
      scope: SCOPE,
      providers: {
        design_system: untouched,
        plugin: listTeam,
        skill: untouched,
      },
      invalidateSharedCommand: () => {},
    });

    const after = await req.get('/api/workspace/plugins/team');
    expect(after.body.ids).toEqual([]);
    expect(sharedResourcesCalls).toBe(2);
  });

  it('drops every outer kind for an unscoped reconnect or poll pass', () => {
    const invalidations: string[] = [];
    const provider = (kind: string) => ({
      invalidate(scope: TeamResourceRequestScope) {
        invalidations.push(`${kind}:${scope.principal.teamId}`);
      },
    });

    invalidateTeamResourceListingCaches({
      scope: SCOPE,
      providers: {
        design_system: provider('design_system'),
        plugin: provider('plugin'),
        skill: provider('skill'),
      },
      invalidateSharedCommand: (workspaceId) =>
        invalidations.push(`shared:${workspaceId}`),
    });

    expect(invalidations).toEqual([
      'design_system:ws-1',
      'plugin:ws-1',
      'skill:ws-1',
      'shared:ws-1',
    ]);
  });
});
