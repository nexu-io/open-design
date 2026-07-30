import { afterEach, describe, expect, it } from 'vitest';
import express, { type Request } from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

function memberContextProvider(workspaceMemberId: string): WorkspaceContextProvider {
  const context: WorkspaceCollabContext = {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    teamId: 'team-1',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  };
  return { current: async () => context };
}

function teamContext(
  workspaceId: string,
  workspaceMemberId: string,
  teamId = 'team-1',
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    teamId,
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  };
}

function workspaceHeaders(context: WorkspaceCollabContext): Record<string, string> {
  return {
    'x-od-workspace-id': context.workspaceId,
    'x-od-workspace-member-id': context.workspaceMemberId,
  };
}

function verifiedScopeDeps(context: WorkspaceCollabContext) {
  return {
    verifyWorkspaceRequest: async (req: Request) =>
      req.header('x-od-workspace-id') === context.workspaceId
      && req.header('x-od-workspace-member-id') === context.workspaceMemberId
        ? context
        : null,
    verifyWorkspaceScope: async (scope: {
      workspaceId: string;
      resourceTeamId: string;
      viewerMemberId: string;
    }) =>
      context.workspaceType === 'team'
      && scope.workspaceId === context.workspaceId
      && scope.resourceTeamId === context.teamId
      && scope.viewerMemberId === context.workspaceMemberId,
  };
}

/**
 * A local-only, unowned project must NOT trigger the resource-hub published-head
 * lookup. That call is an uncached ~2s round-trip; running it on every status
 * poll made a member's own project sit in the front end's fail-closed
 * "shared read-only" state for seconds before /collab/status confirmed ownership.
 */
describe('collab/status local-only fast path', () => {
  it('skips publishedHead when the project is local-only and unowned', async () => {
    const context = teamContext('ws-1', 'viewer-member');
    const runtime = createCollabRuntime() as CollabRuntime & {
      publishedHead: CollabRuntime['publishedHead'];
    };
    let headCalls = 0;
    const originalHead = runtime.publishedHead.bind(runtime);
    runtime.publishedHead = ((projectId: string, principal: unknown) => {
      headCalls += 1;
      return originalHead(projectId, principal as never);
    }) as CollabRuntime['publishedHead'];

    let ownerLookups = 0;
    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      ...verifiedScopeDeps(context),
      resolveSharedProjectOwner: async () => {
        ownerLookups += 1;
        return null; // not shared to the team
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/projects/my-local-project/collab/status`, {
      headers: workspaceHeaders(context),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.syncState).toBe('local_only');
    expect(body.ownerMemberId).toBeNull();
    expect(body.publishedVersion).toBeNull();
    // The cheap cached owner lookup ran; the expensive hub head lookup did not.
    expect(ownerLookups).toBe(1);
    expect(headCalls).toBe(0);
  });

  it('consults publishedHead for a NON-owner member of a shared project', async () => {
    const context = teamContext('ws-1', 'viewer-member');
    const runtime = createCollabRuntime({
      workspaceContext: memberContextProvider('viewer-member'),
    }) as CollabRuntime & { publishedHead: CollabRuntime['publishedHead'] };
    let headCalls = 0;
    const originalHead = runtime.publishedHead.bind(runtime);
    runtime.publishedHead = ((projectId: string, principal: unknown) => {
      headCalls += 1;
      return originalHead(projectId, principal as never);
    }) as CollabRuntime['publishedHead'];

    let nameLookups = 0;
    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      ...verifiedScopeDeps(context),
      resolveSharedProjectOwner: async () => 'member-owner', // someone else owns it
      resolveOwnerDisplayName: async () => {
        nameLookups += 1;
        return { displayName: 'Owner', role: 'member' };
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/projects/shared-project/collab/status`, {
      headers: workspaceHeaders(context),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ownerMemberId).toBe('member-owner');
    expect(body.syncState).toBe('synced');
    expect(body.ownerDisplayName).toBeUndefined();
    // Remote enrichment never gates the local shared identity. Once it settles,
    // the next status poll consumes the scoped cache.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(headCalls).toBe(1);
    expect(nameLookups).toBe(1);
    const enrichedRes = await fetch(
      `${base}/api/projects/shared-project/collab/status`,
      { headers: workspaceHeaders(context) },
    );
    const enrichedBody = (await enrichedRes.json()) as Record<string, unknown>;
    expect(enrichedRes.status).toBe(200);
    expect(enrichedBody.ownerDisplayName).toBe('Owner');
    // The owner directory entry is TTL-cached. The head is refreshed in the
    // background on every poll so auto-pull freshness keeps advancing.
    expect(nameLookups).toBe(1);
    expect(headCalls).toBe(2);
  });

  it('returns local shared identity before remote owner-name and head enrichment settle', async () => {
    const context = teamContext('ws-1', 'viewer-member');
    const runtime = createCollabRuntime({
      workspaceContext: memberContextProvider('viewer-member'),
    }) as CollabRuntime & { publishedHead: CollabRuntime['publishedHead'] };
    runtime.rememberTeamShare(
      'shared-local-project',
      {
        teamId: 'team-1',
        memberId: 'member-owner',
        role: 'member',
        lifecycleState: 'active',
        workspaceType: 'team',
      },
      'synced',
    );

    let resolveHead!: (value: number | null) => void;
    const pendingHead = new Promise<number | null>((resolve) => {
      resolveHead = resolve;
    });
    let resolveOwnerName!: (
      value: { displayName: string; role: 'member' } | null
    ) => void;
    const pendingOwnerName = new Promise<{ displayName: string; role: 'member' } | null>(
      (resolve) => {
        resolveOwnerName = resolve;
      },
    );

    let headCalls = 0;
    let nameLookups = 0;
    let resolveRemoteLookupsStarted!: () => void;
    const remoteLookupsStarted = new Promise<void>((resolve) => {
      resolveRemoteLookupsStarted = resolve;
    });
    const markRemoteLookupStarted = () => {
      if (headCalls === 1 && nameLookups === 1) resolveRemoteLookupsStarted();
    };
    runtime.publishedHead = (() => {
      headCalls += 1;
      markRemoteLookupStarted();
      return pendingHead;
    }) as CollabRuntime['publishedHead'];

    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      ...verifiedScopeDeps(context),
      resolveOwnerDisplayName: async () => {
        nameLookups += 1;
        markRemoteLookupStarted();
        return pendingOwnerName;
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;

    const responsePromise = fetch(
      `${base}/api/projects/shared-local-project/collab/status`,
      { headers: workspaceHeaders(context) },
    );
    await remoteLookupsStarted;
    const firstResult = await Promise.race([
      responsePromise.then((response) => ({ kind: 'response' as const, response })),
      new Promise<{ kind: 'blocked' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'blocked' }), 100);
      }),
    ]);

    // Always release the injected remote calls so the old-code red test can
    // finish cleanly instead of leaving the HTTP server with an open request.
    resolveHead(7);
    resolveOwnerName({ displayName: 'Owner', role: 'member' });
    const res =
      firstResult.kind === 'response'
        ? firstResult.response
        : await responsePromise;
    const body = (await res.json()) as Record<string, unknown>;

    expect(firstResult.kind).toBe('response');
    expect(res.status).toBe(200);
    expect(body.ownerMemberId).toBe('member-owner');
    expect(body.syncState).toBe('synced');
    expect(headCalls).toBe(1);
    expect(nameLookups).toBe(1);

    await new Promise<void>((resolve) => setImmediate(resolve));
    const enrichedRes = await fetch(
      `${base}/api/projects/shared-local-project/collab/status`,
      { headers: workspaceHeaders(context) },
    );
    const enrichedBody = (await enrichedRes.json()) as Record<string, unknown>;
    expect(enrichedRes.status).toBe(200);
    expect(enrichedBody.ownerDisplayName).toBe('Owner');
    expect(enrichedBody.publishedVersion).toBe(7);
  });

  it('keeps explicit workspace enrichment isolated when resource identity is shared', async () => {
    const contexts = [
      teamContext('workspace-a', 'viewer-member', 'shared-resource-team'),
      teamContext('workspace-b', 'viewer-member', 'shared-resource-team'),
    ];
    let verificationReads = 0;
    const runtime = createCollabRuntime() as CollabRuntime & {
      publishedHead: CollabRuntime['publishedHead'];
    };
    runtime.rememberTeamShare(
      'switching-project',
      {
        teamId: 'shared-resource-team',
        memberId: 'member-owner',
        role: 'member',
        lifecycleState: 'active',
        workspaceType: 'team',
      },
      'synced',
    );
    runtime.publishedHead = (async () => {
      return 9;
    }) as CollabRuntime['publishedHead'];
    const materializedScopes: string[] = [];

    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      verifyWorkspaceRequest: async (req) => {
        verificationReads += 1;
        return contexts.find(
          (context) =>
            req.header('x-od-workspace-id') === context.workspaceId
            && req.header('x-od-workspace-member-id') === context.workspaceMemberId,
        ) ?? null;
      },
      verifyWorkspaceScope: async (scope) =>
        contexts.some(
          (context) =>
            scope.workspaceId === context.workspaceId
            && scope.resourceTeamId === context.teamId
            && scope.viewerMemberId === context.workspaceMemberId,
        ),
      resolveOwnerDisplayName: async () => ({
        displayName: 'Owner',
        role: 'member',
      }),
      readMaterializedVersion: (_projectId, scope) => {
        materializedScopes.push(scope.workspaceId);
        return scope.workspaceId === 'workspace-a' ? 11 : 22;
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;

    const firstA = await fetch(
      `${base}/api/projects/switching-project/collab/status`,
      { headers: workspaceHeaders(contexts[0]!) },
    );
    const firstABody = (await firstA.json()) as Record<string, unknown>;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(firstA.status).toBe(200);
    expect(firstABody.ownerMemberId).toBe('member-owner');
    expect(firstABody.syncState).toBe('synced');
    expect(firstABody.ownerDisplayName).toBeUndefined();
    expect(firstABody.publishedVersion).toBeNull();

    // A/B deliberately share the same resource team, viewer, owner and
    // project. The explicit Workspace selector must still keep their caches
    // isolated.
    const firstB = await fetch(
      `${base}/api/projects/switching-project/collab/status`,
      { headers: workspaceHeaders(contexts[1]!) },
    );
    const firstBBody = (await firstB.json()) as Record<string, unknown>;
    expect(firstBBody.ownerDisplayName).toBeUndefined();
    expect(firstBBody.publishedVersion).toBeNull();
    expect(firstBBody.materializedVersion).toBeNull();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const enrichedB = await fetch(
      `${base}/api/projects/switching-project/collab/status`,
      { headers: workspaceHeaders(contexts[1]!) },
    );
    const enrichedBBody = (await enrichedB.json()) as Record<string, unknown>;
    expect(enrichedBBody.ownerDisplayName).toBe('Owner');
    expect(enrichedBBody.publishedVersion).toBe(9);
    expect(enrichedBBody.materializedVersion).toBe(22);

    const revisitedA = await fetch(
      `${base}/api/projects/switching-project/collab/status`,
      { headers: workspaceHeaders(contexts[0]!) },
    );
    const revisitedABody = (await revisitedA.json()) as Record<string, unknown>;
    expect(revisitedABody.ownerDisplayName).toBe('Owner');
    expect(revisitedABody.publishedVersion).toBe(9);
    expect(revisitedABody.materializedVersion).toBe(11);
    expect(materializedScopes).toEqual(['workspace-b', 'workspace-a']);
    // One authoritative verification per status request; background enrichment
    // reuses the captured identity instead of reading an ambient active one.
    expect(verificationReads).toBe(4);
  });

  it('does not enrich an owner name from a personal workspace without a team principal', async () => {
    const context: WorkspaceCollabContext = {
      workspaceId: 'personal-workspace',
      workspaceType: 'personal',
      workspaceMemberId: 'personal-member',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'platform_credits',
      seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
      permissions: buildWorkspacePermissions({
        role: 'owner',
        lifecycleState: 'active',
      }),
    };
    const personalContext: WorkspaceContextProvider = {
      current: async () => context,
    };
    const runtime = createCollabRuntime({
      workspaceContext: personalContext,
    });
    runtime.rememberTeamShare(
      'personal-context-project',
      {
        teamId: 'team-1',
        memberId: 'member-owner',
        role: 'member',
        lifecycleState: 'active',
        workspaceType: 'team',
      },
      'synced',
    );
    let ownerNameLookups = 0;

    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      ...verifiedScopeDeps(context),
      resolveOwnerDisplayName: async () => {
        ownerNameLookups += 1;
        return { displayName: 'Owner', role: 'member' };
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(
      `${base}/api/projects/personal-context-project/collab/status`,
      { headers: workspaceHeaders(context) },
    );
    const body = (await res.json()) as Record<string, unknown>;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(res.status).toBe(200);
    expect(body.ownerMemberId).toBe('member-owner');
    expect(body.syncState).toBe('synced');
    expect(body.ownerDisplayName).toBeUndefined();
    expect(ownerNameLookups).toBe(0);
  });

  it('bounds scoped enrichment caches with LRU eviction and never reuses an evicted scope', async () => {
    const runtime = createCollabRuntime() as CollabRuntime & {
      publishedHead: CollabRuntime['publishedHead'];
    };
    runtime.publishedHead = (async (
      _projectId: string,
      principal: { teamId: string } | null | undefined,
    ) => {
      const scopeIndex = Number(principal?.teamId.replace('workspace-', ''));
      return 1_000 + scopeIndex;
    }) as CollabRuntime['publishedHead'];

    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      verifyWorkspaceRequest: async (req) => {
        const workspaceId = req.header('x-od-workspace-id');
        const memberId = req.header('x-od-workspace-member-id');
        return workspaceId && memberId
          ? teamContext(workspaceId, memberId, workspaceId)
          : null;
      },
      verifyWorkspaceScope: async (scope) =>
        scope.workspaceId === scope.resourceTeamId
        && scope.viewerMemberId.startsWith('viewer-'),
      resolveSharedProjectOwner: async () => 'member-owner',
      resolveOwnerDisplayName: async () => ({
        displayName: 'Owner',
        role: 'member',
      }),
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;
    const readStatus = async (scopeIndex: number) => {
      const response = await fetch(
        `${base}/api/projects/lru-project/collab/status`,
        {
          headers: {
            'x-od-workspace-id': `workspace-${scopeIndex}`,
            'x-od-workspace-member-id': `viewer-${scopeIndex}`,
            'x-od-workspace-role': 'member',
          },
        },
      );
      return {
        response,
        body: (await response.json()) as Record<string, unknown>,
      };
    };

    // Fill the exact 256-entry bound, letting each scope's asynchronous
    // enrichment settle before inserting the next one.
    for (let scopeIndex = 0; scopeIndex < 256; scopeIndex += 1) {
      await readStatus(scopeIndex);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    // Touch scope 0 so it becomes most-recently used, then overflow by one.
    const touched = await readStatus(0);
    expect(touched.body.ownerDisplayName).toBe('Owner');
    expect(touched.body.publishedVersion).toBe(1_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await readStatus(256);
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Scope 1, now the least-recent entry, was evicted from BOTH caches. Its
    // first revisit gets only local identity and cannot reuse old enrichment.
    const evicted = await readStatus(1);
    expect(evicted.response.status).toBe(200);
    expect(evicted.body.ownerMemberId).toBe('member-owner');
    expect(evicted.body.syncState).toBe('synced');
    expect(evicted.body.ownerDisplayName).toBeUndefined();
    expect(evicted.body.publishedVersion).toBeNull();
    await new Promise<void>((resolve) => setImmediate(resolve));

    // The touched scope survived the overflow and still exposes its own head.
    const retained = await readStatus(0);
    expect(retained.body.ownerDisplayName).toBe('Owner');
    expect(retained.body.publishedVersion).toBe(1_000);
  });

  it('skips publishedHead when the caller IS the owner of a shared project', async () => {
    const context = teamContext('ws-1', 'member-owner');
    const runtime = createCollabRuntime({
      workspaceContext: memberContextProvider('member-owner'),
    }) as CollabRuntime & { publishedHead: CollabRuntime['publishedHead'] };
    let headCalls = 0;
    const originalHead = runtime.publishedHead.bind(runtime);
    runtime.publishedHead = ((projectId: string, principal: unknown) => {
      headCalls += 1;
      return originalHead(projectId, principal as never);
    }) as CollabRuntime['publishedHead'];

    let nameLookups = 0;
    const app = express();
    app.use(express.json());
    registerCollabSyncRoutes(app, {
      collab: runtime,
      ...verifiedScopeDeps(context),
      resolveSharedProjectOwner: async () => 'member-owner', // caller owns it
      resolveOwnerDisplayName: async () => {
        nameLookups += 1;
        return { displayName: 'Owner', role: 'member' };
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/projects/my-shared-project/collab/status`, {
      headers: workspaceHeaders(context),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ownerMemberId).toBe('member-owner');
    expect(body.syncState).toBe('synced');
    // The owner is the single writer, never auto-pulls, and sees an editable
    // surface (no "shared by X" banner) — so BOTH the hub head lookup and the
    // owner-name directory lookup are skipped; their editable state resolves fast.
    expect(headCalls).toBe(0);
    expect(nameLookups).toBe(0);
  });
});
