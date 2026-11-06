// Priority-1 verification for the workspace-team continuous-sync gap: "分享
// 到团队" was a one-time snapshot because the ONLY UI entry point that calls
// `share()` (team-resource-share.ts) hid itself once a resource was already
// shared. Before touching the frontend, this pins the backend half of that
// fix: `share()` itself has NO "already shared → refuse" guard anywhere in
// the real production path (permission gate → `createVelaCliResourceAdapter`
// → the `POST /api/workspace/:kind/:id/share` route), so calling it again on
// an already-shared resource is a legitimate "push the current directory as
// an update" — exactly what the UI's new "Sync to team" action relies on.
//
// This drives the REAL `createTeamResourceShareService` (not a hand-rolled
// mock of `TeamResourceShareService` — see team-resource-share-list-cache.test
// for that lighter-weight seam) through the REAL `registerTeamResourceShareRoutes`
// HTTP handlers, over a real listening server. Only the outermost `vela
// resource` CLI process invocation is faked — the same injectable seam
// (`CreateTeamResourceShareOptions.run`) production code and every other test
// in this suite already uses instead of a live Vela login/hub.

import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { registerTeamResourceShareRoutes } from '../src/routes/team-resource-share.js';
import {
  createTeamResourceShareService,
  type TeamResourceRequestScope,
} from '../src/collab/team-resource-share.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

async function listen(app: express.Express): Promise<string> {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

const OWNER: ResourceHubPrincipal = {
  memberId: 'mem-owner',
  teamId: 'team-resync-1',
  role: 'member',
  lifecycleState: 'active',
  workspaceType: 'team',
};
const SCOPE: TeamResourceRequestScope = { principal: OWNER, canShare: true };

/**
 * In-memory stand-in for the vela CLI's hub-side resource store — the exact
 * seam `createVelaCliResourceAdapter` shells out through (`run(args,
 * workspaceId)`), so `push`/`shared` here model the REAL args the adapter
 * sends, not a paraphrase of them. `metadata-json` round-trips just like the
 * real hub does, so `parseSharedResourceRecords` resolves the local id
 * correctly off `metadata.localId` — the same mechanism the real
 * `describeResource` callbacks in server.ts feed it.
 */
function fakeHub() {
  type Entry = { version: number; dir: string; metadata: Record<string, unknown> };
  const entries = new Map<string, Entry>();
  const pushCalls: Array<{ resourceId: string; dir: string }> = [];

  const run = async (args: string[]): Promise<string> => {
    if (args[0] === 'push') {
      // ['push', kind, resourceId, dir, '--ref', 'published', '--json', ...excludes, '--metadata-json', json?]
      const resourceId = args[2]!;
      const dir = args[3]!;
      const metaFlagIndex = args.indexOf('--metadata-json');
      const metadata = metaFlagIndex >= 0 ? (JSON.parse(args[metaFlagIndex + 1]!) as Record<string, unknown>) : {};
      const nextVersion = (entries.get(resourceId)?.version ?? 0) + 1;
      entries.set(resourceId, { version: nextVersion, dir, metadata });
      pushCalls.push({ resourceId, dir });
      return JSON.stringify({ version: nextVersion, id: `ver-${nextVersion}` });
    }
    if (args[0] === 'shared') {
      return JSON.stringify({
        resources: [...entries.entries()].map(([id, entry]) => ({
          id,
          kind: 'design_system',
          deletedAt: null,
          ownerMemberId: OWNER.memberId,
          metadata: entry.metadata,
          publishedVersion: { id: `ver-${entry.version}`, version: entry.version },
        })),
      });
    }
    throw new Error(`unexpected vela args: ${args.join(' ')}`);
  };

  return { run, entries, pushCalls };
}

describe('team resource re-share (the "Sync to team" backend path)', () => {
  it('a second share() call on an already-shared resource overwrites the hub version instead of being refused', async () => {
    const hub = fakeHub();
    let currentDir = '/tmp/ds-1/v1-original-logo';

    const share = createTeamResourceShareService({
      kind: 'design_system',
      idPrefix: 'ds',
      resolveDir: () => currentDir,
      describeResource: () => ({ localId: 'user:ds-1', title: 'Ds 1' }),
      run: hub.run,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    const app = express();
    app.use(express.json());
    registerTeamResourceShareRoutes(app, {
      basePath: 'design-systems',
      share,
      resolveScope: async () => ({ ok: true, scope: SCOPE }),
    });
    const base = await listen(app);

    // First share.
    const firstResp = await fetch(
      `${base}/api/workspace/design-systems/${encodeURIComponent('user:ds-1')}/share`,
      { method: 'POST' },
    );
    expect(firstResp.status).toBe(200);
    await expect(firstResp.json()).resolves.toMatchObject({ shared: true, version: 1 });

    // Owner edits locally (new logo/content) — resolveDir now resolves to the
    // edited directory, same as a real daemon re-reading the on-disk system.
    currentDir = '/tmp/ds-1/v2-new-logo';

    // Re-share: the UI's "Sync to team" action hits the exact same route with
    // no special flag — this must NOT be refused just because it is already
    // shared.
    const secondResp = await fetch(
      `${base}/api/workspace/design-systems/${encodeURIComponent('user:ds-1')}/share`,
      { method: 'POST' },
    );
    expect(secondResp.status).toBe(200);
    await expect(secondResp.json()).resolves.toMatchObject({ shared: true, version: 2 });

    // The hub's real state reflects the SECOND push — proves this is a genuine
    // overwrite, not a refused/no-op call swallowed into a false "success".
    expect(hub.pushCalls).toHaveLength(2);
    expect(hub.pushCalls[1]).toMatchObject({ dir: '/tmp/ds-1/v2-new-logo' });

    // A teammate's own read of the team listing — the actual "does the team
    // see the update" acceptance check — sees the LATEST version, not the
    // first snapshot.
    const teamListingResp = await fetch(`${base}/api/workspace/design-systems/team`);
    const teamListing = (await teamListingResp.json()) as {
      resources: Array<{ id: string; version?: number }>;
    };
    const entry = teamListing.resources.find((r) => r.id === 'user:ds-1');
    expect(entry?.version).toBe(2);
  });

  it('does not require any special "update" flag — the permission gate re-evaluates cleanly on every repeat call', async () => {
    const hub = fakeHub();
    let shareChecks = 0;
    const share = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill-1',
      describeResource: () => ({ localId: 'my-skill' }),
      run: hub.run,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });
    const resolveScope = async () => {
        shareChecks += 1;
        return { ok: true as const, scope: SCOPE };
    };

    const app = express();
    app.use(express.json());
    registerTeamResourceShareRoutes(app, { basePath: 'skills', share, resolveScope });
    const base = await listen(app);

    for (let i = 0; i < 3; i += 1) {
      const resp = await fetch(
        `${base}/api/workspace/skills/${encodeURIComponent('my-skill')}/share`,
        { method: 'POST' },
      );
      expect(resp.status).toBe(200);
      await expect(resp.json()).resolves.toMatchObject({ shared: true, version: i + 1 });
    }

    // The permission gate is re-evaluated fresh each time, not cached/bypassed
    // after the first successful share.
    expect(shareChecks).toBe(3);
    expect(hub.pushCalls).toHaveLength(3);
  });
});
