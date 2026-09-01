import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import {
  SHARED_PROJECT_PLACEHOLDER_METADATA_KEY,
  isUnmaterializedSharedPlaceholder,
} from '../src/collab/shared-project-placeholder.js';
import {
  registerCollabSyncRoutes,
  type PulledProjectStore,
  type TeamMirrorPullScope,
} from '../src/routes/collab-sync.js';

// Red spec for the QA P0 "first open of a shared project shows nothing"
// report: a brand-new member on a fresh install joins someone's workspace,
// opens a project from it, sees NO loading state and no files — and only a
// SECOND open (minutes later) shows the downloaded content.
//
// The whole first-open handshake is one `/collab/status` request, and on a
// fresh data root it answers with:
//
//   { publishedVersion: null, materializedVersion: null,
//     contentTransferState: null, syncState: 'synced', ownerMemberId: <owner> }
//
// `publishedVersion` is null because `collab.publishedVersion()` is an
// in-process map that a fresh daemon has never written, and the real hub head
// is fetched fire-and-forget into `headEnrichmentCache` for a LATER poll to
// consume (routes/collab-sync.ts, the `needsHubHead` block). So the very first
// response carries no evidence at all that content is on its way — which is
// exactly what the web needs: `useProjectCollab.downloadPending` is gated on
// `publishedVersion > cursor`, so it computes false and DesignFilesPanel
// renders `design-files-empty` (with "create a new sketch" CTAs) instead of
// `design-files-syncing`. Nothing else on the first request starts a pull
// either: the daemon's self-materialization block is gated on `callerIsOwner`,
// and the web's auto-pull is gated on the same missing `publishedVersion`.
//
// The invariant under test: a viewer opening a shared project whose only local
// record is an unmaterialized placeholder (`sharedProjectPlaceholderAt`, see
// collab/shared-project-placeholder.ts) must be TOLD its local file list is
// not the project's content, and the pull that fixes that must start on this
// same request — never be deferred to a later poll or a background
// reconciler.

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
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  };
  return { current: async () => context };
}

/**
 * The exact local state of a fresh install: no projects at all. The status
 * route's `ensureSharedProjectPlaceholder` registers the placeholder row on
 * the first open and `markSharedProjectPlaceholder` stamps it — this fake
 * models both, so the test exercises the real first-open sequence rather than
 * a pre-seeded one.
 */
function freshInstallProjectStore() {
  const rows = new Map<string, { name?: string | null; metadata?: unknown }>();
  const bindings = new Map<string, TeamMirrorPullScope>();
  const store: PulledProjectStore = {
    get: (projectId) => rows.get(projectId) ?? null,
    has: (projectId) => rows.has(projectId),
    register: (input) => {
      rows.set(input.id, { name: input.name ?? null, metadata: rows.get(input.id)?.metadata });
    },
    materializeTeamPlaceholder: (input, scope) => {
      rows.set(input.id, {
        name: input.name,
        metadata: { [SHARED_PROJECT_PLACEHOLDER_METADATA_KEY]: Date.now() },
      });
      bindings.set(input.id, scope);
      return { localRecordChanged: true };
    },
  };
  const markSharedProjectPlaceholder = (projectId: string, placeholder: boolean) => {
    const row = rows.get(projectId);
    if (!row) return;
    const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}) };
    if (placeholder) metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY] = Date.now();
    else delete metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY];
    rows.set(projectId, { ...row, metadata });
  };
  return { rows, bindings, store, markSharedProjectPlaceholder };
}

async function startFirstOpenDaemon(options: {
  beginContentTransfer?: (
    projectId: string,
    scope: TeamMirrorPullScope,
    version?: number,
  ) => { id: string };
}) {
  const { rows, bindings, store, markSharedProjectPlaceholder } = freshInstallProjectStore();
  const workspaceContext = memberContextProvider('viewer-member');
  const context = await workspaceContext.current({});
  if (!context) throw new Error('test workspace context missing');
  const runtime = createCollabRuntime({
    workspaceContext,
  });
  const app = express();
  app.use(express.json());
  registerCollabSyncRoutes(app, {
    collab: runtime,
    verifyWorkspaceRequest: async (req) =>
      req.header('x-od-workspace-id') === context.workspaceId
      && req.header('x-od-workspace-member-id') === context.workspaceMemberId
        ? context
        : null,
    verifyWorkspaceScope: async (scope) =>
      context.workspaceType === 'team'
      && scope.workspaceId === context.workspaceId
      && scope.resourceTeamId === context.teamId
      && scope.viewerMemberId === context.workspaceMemberId,
    // The hub catalog lists the project and names SOMEONE ELSE as its owner —
    // the member case QA reported.
    resolveSharedProjectOwner: async () => 'owner-1',
    projectStore: store,
    markSharedProjectPlaceholder,
    ...(options.beginContentTransfer
      ? { beginContentTransfer: options.beginContentTransfer as never }
      : {}),
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return {
    base: `http://127.0.0.1:${address.port}`,
    rows,
    bindings,
    headers: {
      'x-od-workspace-id': context.workspaceId,
      'x-od-workspace-member-id': context.workspaceMemberId,
    },
  };
}

describe('first open of an unmaterialized shared project (QA P0: no loading state, nothing downloads)', () => {
  it('atomically exposes an exact Team-bound placeholder before the background pull finishes', async () => {
    const { base, rows, bindings, headers } = await startFirstOpenDaemon({});

    const res = await fetch(`${base}/api/projects/shared-from-owner/collab/bootstrap`, {
      method: 'PUT',
      headers,
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ ok: true, awaitingFirstMaterialization: true });
    expect(isUnmaterializedSharedPlaceholder(rows.get('shared-from-owner'))).toBe(true);
    expect(bindings.get('shared-from-owner')).toEqual({
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'viewer-member',
      ownerMemberId: 'owner-1',
    });
  });

  it('tells the client on the FIRST status response that local files are not the project content yet', async () => {
    const { base, rows, headers } = await startFirstOpenDaemon({});

    const res = await fetch(`${base}/api/projects/shared-from-owner/collab/status`, { headers });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    // Preconditions: this IS the fresh-install first open. The route registered
    // the placeholder, and the local record proves the content is missing.
    expect(isUnmaterializedSharedPlaceholder(rows.get('shared-from-owner'))).toBe(true);
    expect(body.ownerMemberId).toBe('owner-1');
    expect(body.syncState).toBe('synced');
    // …and every field the web currently reasons about is blank, so it cannot
    // distinguish "empty project" from "content still downloading".
    expect(body.publishedVersion).toBeNull();
    expect(body.materializedVersion).toBeNull();
    expect(body.contentTransferState ?? null).toBeNull();

    // The signal that has to exist: local files are provably not the content.
    expect(body.awaitingFirstMaterialization).toBe(true);
  });

  it('starts the content pull on that same first open instead of waiting for a later poll', async () => {
    const beginContentTransfer = vi.fn(() => ({ id: 'transfer-1' }));
    const { base, headers } = await startFirstOpenDaemon({ beginContentTransfer });

    const res = await fetch(`${base}/api/projects/shared-from-owner/collab/status`, { headers });
    expect(res.status).toBe(200);
    await res.json();

    // `beginContentTransfer` is what `pullSharedProjectCoalesced` calls the
    // moment an exact-scope pull is admitted — i.e. the observable proof that
    // opening the project actually kicked a materialization.
    await vi.waitFor(() => {
      expect(beginContentTransfer).toHaveBeenCalled();
    });
    const [projectId, scope] = beginContentTransfer.mock.calls[0] as unknown as [
      string,
      TeamMirrorPullScope,
    ];
    expect(projectId).toBe('shared-from-owner');
    expect(scope).toMatchObject({
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'viewer-member',
      ownerMemberId: 'owner-1',
    });
  });

  it('stops reporting the awaiting state once the placeholder is materialized', async () => {
    const { base, rows, headers } = await startFirstOpenDaemon({});

    await fetch(`${base}/api/projects/shared-from-owner/collab/status`, { headers });
    // What a landed pull does: replace the row and drop the stamp.
    rows.set('shared-from-owner', { name: 'Real project', metadata: {} });

    const res = await fetch(`${base}/api/projects/shared-from-owner/collab/status`, { headers });
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.awaitingFirstMaterialization).toBe(false);
  });
});
