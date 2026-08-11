// spec 04 §10 fix #4/#6 (recvqbklNGDqYY): before this fix,
// `apps/daemon/src/routes/project/comments.ts` had ZERO `enforceWorkspace*`
// coverage — not "only blocks team, lets personal through" like the other
// three resource types' mutation gate, but literally no gate at all. A
// caller with no workspace identity whatsoever (signed out, a plain `curl`)
// could POST/PATCH/DELETE comments on ANY project, including one bound to a
// team workspace it has never had any relationship with.
//
// This file wires `registerProjectCommentRoutes`'s new
// `enforceWorkspaceProjectMutation`/`sendApiError` deps to the REAL
// `enforceWorkspaceResourceMutation('project', …)` gate (the same one
// `routes/project/index.ts` builds for its own project routes), against a
// real project bound into `workspace_projects` — not a stub — so this is
// exercising the actual production wiring path end to end at the HTTP layer,
// not just the shared gate function in isolation (that is
// `tests/collab/workspace-resource-mutation.test.ts`'s job).

import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import {
  closeDatabase,
  deletePreviewComment,
  ensureWorkspaceProject,
  getConversation,
  getPreviewComment,
  getProjectPreviewComment,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertConversation,
  insertProject,
  listPreviewComments,
  listProjectPreviewComments,
  openDatabase,
  repairTeamProjectCommentAnchorConversations,
  reorderPreviewComment,
  updatePreviewCommentAnchor,
  updatePreviewCommentStatus,
  updateProject,
  upsertPreviewComment,
} from '../src/db.js';
import { enforceWorkspaceResourceMutation } from '../src/collab/workspace-resource-mutation.js';
import { verifyWorkspaceRequestContext } from '../src/collab/request-workspace-context.js';
import { createCachedWorkspaceDirectoryFetcher } from '../src/collab/vela-workspace-context.js';
import { registerProjectCommentRoutes } from '../src/routes/project/comments.js';

let server: http.Server | null = null;
let tempDir: string | null = null;
let database: ReturnType<typeof openDatabase> | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  closeDatabase();
  database = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

const TEAM_PROJECT = 'p-team';
const TEAM_MIRROR_PROJECT = 'p-team-mirror';
const PERSONAL_PROJECT = 'p-personal';
const UNBOUND_PROJECT = 'p-unbound';
const WORKSPACE_ID = 'ws-comment-gate';
const OWNER_MEMBER_ID = 'member-owner';
const OTHER_MEMBER_ID = 'member-other';

function sendApiError(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function workspaceHeaders(
  memberId: string,
  role: 'owner' | 'admin' | 'member',
  canWriteSyncedFiles = true,
) {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-member-id': memberId,
    'x-od-workspace-role': role,
    'x-od-workspace-can-write-synced-files': String(canWriteSyncedFiles),
  };
}

function activeTeamContext(
  memberId = OTHER_MEMBER_ID,
  role: 'owner' | 'admin' | 'member' = 'member',
): WorkspaceCollabContext {
  return {
    workspaceId: WORKSPACE_ID,
    workspaceType: 'team',
    workspaceMemberId: memberId,
    role,
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({
      role,
      lifecycleState: 'active',
    }),
    teamId: WORKSPACE_ID,
  };
}

const COMMENT_TARGET = {
  filePath: 'index.html',
  elementId: 'hero',
  selector: '[data-od-id="hero"]',
  label: 'h1.hero',
  text: 'Hero',
  htmlHint: '<h1>',
  position: { x: 0, y: 0, width: 0, height: 0 },
};

async function startServer(
  routeOverrides: Record<string, unknown> = {},
) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-ws-gate-'));
  const db = openDatabase(tempDir);
  database = db;
  const now = Date.now();
  for (const [id, conv] of [
    [TEAM_PROJECT, 'conv-team'],
    [TEAM_MIRROR_PROJECT, 'conv-team-mirror'],
    [PERSONAL_PROJECT, 'conv-personal'],
    [UNBOUND_PROJECT, 'conv-unbound'],
  ] as const) {
    insertProject(db, { id, name: id, createdAt: now, updatedAt: now });
    insertConversation(db, { id: conv, projectId: id, title: 'Chat', createdAt: now, updatedAt: now });
  }
  ensureWorkspaceProject(db, {
    projectId: TEAM_PROJECT,
    workspaceId: WORKSPACE_ID,
    visibility: 'team',
    createdByWorkspaceMemberId: OWNER_MEMBER_ID,
  });
  // The exact row shape `materializePulledTeamMirror` writes on a MEMBER's own
  // daemon for someone else's shared project: bound + team visibility, but
  // UNATTRIBUTED (`createdByWorkspaceMemberId: null` — the adoption red line
  // means lazy projection never assigns the reader as creator). This is the
  // row the real member-comment flow gates against.
  ensureWorkspaceProject(db, {
    projectId: TEAM_MIRROR_PROJECT,
    workspaceId: WORKSPACE_ID,
    visibility: 'team',
    createdByWorkspaceMemberId: null,
  });
  ensureWorkspaceProject(db, {
    projectId: PERSONAL_PROJECT,
    workspaceId: WORKSPACE_ID,
    visibility: 'personal',
    createdByWorkspaceMemberId: OWNER_MEMBER_ID,
  });
  // UNBOUND_PROJECT deliberately gets no `workspace_projects` row — the
  // "legacy / never claimed" control case the gate must leave alone.

  const app = express();
  app.use(express.json());
  registerProjectCommentRoutes(app, {
    db,
    projectStore: { updateProject, getWorkspaceProject, getWorkspaceProjectByProjectId } as any,
    conversations: {
      getConversation,
      listPreviewComments,
      listProjectPreviewComments,
      upsertPreviewComment,
      getPreviewComment,
      getProjectPreviewComment,
      updatePreviewCommentStatus,
      updatePreviewCommentAnchor,
      deletePreviewComment,
      reorderPreviewComment,
    } as any,
    sendApiError,
    enforceWorkspaceProjectMutation: async (req, res, sendError, getWp, getWpByProjectId, dbArg, projectId, capability) =>
      enforceWorkspaceResourceMutation(
        'project',
        req,
        res,
        sendError,
        getWp,
        getWpByProjectId,
        dbArg,
        projectId,
        capability,
      ),
    resolveAuthorMemberId: async () => undefined,
    ...routeOverrides,
  });
  const created = http.createServer(app);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, resolve));
  const address = created.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('project comments — workspace mutation gate', () => {
  it('keeps the repaired anchor internal while a Member comments through a public routing conversation', async () => {
    const baseUrl = await startServer({
      resolveWorkspaceContext: async () => ({
        ok: true,
        context: activeTeamContext(OTHER_MEMBER_ID, 'member'),
      }),
    });
    database!.prepare('DELETE FROM conversations WHERE project_id = ?').run(TEAM_MIRROR_PROJECT);
    expect(getConversation(database!, 'conv-team-mirror')).toBeNull();

    expect(repairTeamProjectCommentAnchorConversations(database!, 10)).toMatchObject({
      created: 2,
    });
    const rows = database!
      .prepare('SELECT id FROM conversations WHERE project_id = ? ORDER BY id')
      .all(TEAM_MIRROR_PROJECT) as Array<{ id: string }>;
    const anchor = rows.find((row) => row.id.startsWith('comment-anchor-'));
    const routingConversation = rows.find((row) => !row.id.startsWith('comment-anchor-'));
    expect(anchor).toBeDefined();
    expect(anchor!.id).toMatch(/^comment-anchor-/);
    expect(routingConversation).toBeDefined();

    const internalRouteResponse = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/${anchor!.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({
          target: COMMENT_TARGET,
          note: 'Must not write through internal anchor route',
        }),
      },
    );
    expect(internalRouteResponse.status).toBe(404);

    const response = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/${routingConversation!.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({
          target: COMMENT_TARGET,
          note: 'Member comment through public routing conversation',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(listProjectPreviewComments(database!, TEAM_MIRROR_PROJECT)).toEqual([
      expect.objectContaining({
        conversationId: routingConversation!.id,
        authorMemberId: OTHER_MEMBER_ID,
        note: 'Member comment through public routing conversation',
      }),
    ]);
  });

  it('includes a dirty relay pull in the first comments response', async () => {
    let releasePull!: () => void;
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const onCommentsRead = vi.fn(async () => {
      await pullGate;
      upsertPreviewComment(
        database!,
        TEAM_MIRROR_PROJECT,
        'conv-team-mirror',
        {
          id: 'remote-comment-after-dirty-read',
          target: COMMENT_TARGET,
          note: 'remote comment merged by the dirty pull',
          authorMemberId: OWNER_MEMBER_ID,
        },
      );
    });
    const baseUrl = await startServer({
      resolveReadWorkspaceContext: async () => ({
        ok: true,
        context: activeTeamContext(OTHER_MEMBER_ID, 'member'),
      }),
      onCommentsRead,
    });
    const commentsUrl =
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`;

    const responsePromise = fetch(commentsUrl, {
      headers: workspaceHeaders(OTHER_MEMBER_ID, 'member'),
    });
    await vi.waitFor(() => expect(onCommentsRead).toHaveBeenCalledTimes(1));
    releasePull();

    const response = await responsePromise;
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      comments: Array<{ id: string; note: string }>;
    };
    expect(payload.comments).toEqual([
      expect.objectContaining({
        id: 'remote-comment-after-dirty-read',
        note: 'remote comment merged by the dirty pull',
      }),
    ]);
  });

  it('leases directory authority only for GET while mutations stay fresh and revocation fails closed', async () => {
    let clock = 0;
    let directoryItems = [{
      workspaceId: WORKSPACE_ID,
      workspaceName: 'Team',
      workspaceType: 'team' as const,
      workspaceMemberId: OTHER_MEMBER_ID,
      role: 'member' as const,
      memberStatus: 'active' as const,
      lifecycleState: 'active' as const,
    }];
    const fetchReadDirectory = vi.fn(async () => ({
      ok: true as const,
      items: directoryItems,
    }));
    const cachedReadDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory: fetchReadDirectory,
      identityKey: () => 'member-comment-read',
      ttlMs: 5_000,
      now: () => clock,
    });
    const fetchFreshMutationDirectory = vi.fn(async () => ({
      ok: true as const,
      items: directoryItems,
    }));
    const baseUrl = await startServer({
      resolveReadWorkspaceContext: (req: unknown) =>
        verifyWorkspaceRequestContext({
          req,
          fetchWorkspaceDirectory: cachedReadDirectory,
        }),
      resolveWorkspaceContext: (req: unknown) =>
        verifyWorkspaceRequestContext({
          req,
          fetchWorkspaceDirectory: fetchFreshMutationDirectory,
        }),
    });
    const commentsUrl =
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`;
    const headers = workspaceHeaders(OTHER_MEMBER_ID, 'member');

    expect((await fetch(commentsUrl, { headers })).status).toBe(200);
    expect((await fetch(commentsUrl, { headers })).status).toBe(200);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(1);
    expect(fetchFreshMutationDirectory).not.toHaveBeenCalled();

    const create = await fetch(commentsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'fresh mutation' }),
    });
    expect(create.status).toBe(200);
    expect(fetchFreshMutationDirectory).toHaveBeenCalledTimes(1);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(1);

    directoryItems = [];
    clock = 5_001;
    expect((await fetch(commentsUrl, { headers })).status).toBe(403);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(2);

    const deniedMutation = await fetch(commentsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'must stay denied' }),
    });
    expect(deniedMutation.status).toBe(403);
    expect(fetchFreshMutationDirectory).toHaveBeenCalledTimes(2);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['revocation', 'revoked'],
    ['authority outage', 'outage'],
  ] as const)(
    'keeps the warm GET lease but does not redeem a dirty pull during %s',
    async (_label, deniedMode) => {
      let readClock = 0;
      let freshMode: 'active' | 'revoked' | 'outage' = 'active';
      const activeDirectory = [{
        workspaceId: WORKSPACE_ID,
        workspaceName: 'Team',
        workspaceType: 'team' as const,
        workspaceMemberId: OTHER_MEMBER_ID,
        role: 'member' as const,
        memberStatus: 'active' as const,
        lifecycleState: 'active' as const,
      }];
      const cachedReadDirectory = createCachedWorkspaceDirectoryFetcher({
        fetchDirectory: async () => ({
          ok: true as const,
          items: activeDirectory,
        }),
        identityKey: () => 'member-comment-dirty-read',
        ttlMs: 5_000,
        now: () => readClock,
      });
      const pullProject = vi.fn(
        async (
          _projectId: string,
          _context: WorkspaceCollabContext,
        ) => true,
      );
      let dirty = false;
      let redemption = Promise.resolve();
      const baseUrl = await startServer({
        resolveReadWorkspaceContext: (req: unknown) =>
          verifyWorkspaceRequestContext({
            req,
            fetchWorkspaceDirectory: cachedReadDirectory,
          }),
        resolveWorkspaceContext: (req: unknown) =>
          verifyWorkspaceRequestContext({
            req,
            fetchWorkspaceDirectory: async () => {
              if (freshMode === 'outage') {
                return { ok: false as const, items: [] };
              }
              return {
                ok: true as const,
                items: freshMode === 'active' ? activeDirectory : [],
              };
            },
          }),
        onCommentsRead: (
          projectId: string,
          leasedContext: WorkspaceCollabContext | null,
          resolveFreshContext: () => Promise<
            | { ok: true; context: WorkspaceCollabContext | null }
            | { ok: false }
          >,
        ) => {
          if (!dirty) return;
          dirty = false;
          redemption = (async () => {
            const fresh = await resolveFreshContext();
            if (
              !fresh.ok
              || !fresh.context
              || !leasedContext
              || fresh.context.workspaceId !== leasedContext.workspaceId
              || fresh.context.workspaceMemberId
                !== leasedContext.workspaceMemberId
            ) {
              dirty = true;
              return;
            }
            if (!await pullProject(projectId, fresh.context)) dirty = true;
          })();
        },
      });
      const commentsUrl =
        `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`;
      const headers = workspaceHeaders(OTHER_MEMBER_ID, 'member');

      // Warm the successful read lease while authority is active.
      expect((await fetch(commentsUrl, { headers })).status).toBe(200);

      // The list read still succeeds from that bounded lease, but the dirty
      // cloud pull/local merge must independently prove fresh authority.
      freshMode = deniedMode;
      dirty = true;
      expect((await fetch(commentsUrl, { headers })).status).toBe(200);
      await redemption;
      expect(pullProject).not.toHaveBeenCalled();
      expect(dirty).toBe(true);

      // The unredeemed mark survives the denial/outage and is consumed exactly
      // once after fresh authority recovers. The read lease never expired.
      freshMode = 'active';
      expect((await fetch(commentsUrl, { headers })).status).toBe(200);
      await redemption;
      expect(pullProject).toHaveBeenCalledTimes(1);
      expect(pullProject).toHaveBeenCalledWith(
        TEAM_MIRROR_PROJECT,
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          workspaceMemberId: OTHER_MEMBER_ID,
        }),
      );
      expect(dirty).toBe(false);

      readClock = 1;
      expect((await fetch(commentsUrl, { headers })).status).toBe(200);
      await redemption;
      expect(pullProject).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the verified project A scope after ambient identity moved to B', async () => {
    const projectContext = activeTeamContext();
    const pushedScopes: Array<{ workspaceId: string; workspaceMemberId: string }> = [];
    const baseUrl = await startServer({
      // Models the stale daemon-global answer after another tab moved to B.
      resolveAuthorMemberId: async () => 'member-b',
      resolveWorkspaceContext: async () => ({ ok: true, context: projectContext }),
      onCommentCreated: (
        _comment: unknown,
        scope: WorkspaceCollabContext | null,
      ) => {
        if (scope) {
          pushedScopes.push({
            workspaceId: scope.workspaceId,
            workspaceMemberId: scope.workspaceMemberId,
          });
        }
      },
    });
    const response = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({ target: COMMENT_TARGET, note: 'scoped to A' }),
      },
    );

    expect(response.status).toBe(200);
    const { comment } = (await response.json()) as {
      comment: { authorMemberId?: string };
    };
    expect(comment.authorMemberId).toBe(OTHER_MEMBER_ID);
    expect(pushedScopes).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        workspaceMemberId: OTHER_MEMBER_ID,
      },
    ]);
  });

  it('persists and enqueues without waiting for a pending remote catalog read', async () => {
    const projectContext = activeTeamContext();
    const remoteCatalogGate = vi.fn(
      () => new Promise<boolean>(() => {
        // Deliberately never resolves: delivery authority belongs to the
        // outbox worker, not the mutation response path.
      }),
    );
    const enqueued: string[] = [];
    const baseUrl = await startServer({
      resolveWorkspaceContext: async () => ({ ok: true, context: projectContext }),
      // Compatibility-shaped trap: the route must not call/await this remote
      // catalog seam before placing the local mutation into the outbox.
      shouldSyncProjectComments: remoteCatalogGate,
      onCommentCreated: (comment: { id: string }) => enqueued.push(comment.id),
    });

    const response = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({ target: COMMENT_TARGET, note: 'queue immediately' }),
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { comment: { id: string } };
    expect(enqueued).toEqual([payload.comment.id]);
    expect(remoteCatalogGate).not.toHaveBeenCalled();
    expect(listPreviewComments(database!, TEAM_MIRROR_PROJECT, 'conv-team-mirror'))
      .toEqual([expect.objectContaining({ id: payload.comment.id })]);
  });

  it('rolls back create, update, and delete when durable enqueue fails', async () => {
    const projectContext = activeTeamContext(OWNER_MEMBER_ID, 'owner');
    const baseUrl = await startServer({
      resolveWorkspaceContext: async () => ({ ok: true, context: projectContext }),
      onCommentCreated: () => false,
      onCommentUpdated: () => false,
      onCommentDeleted: () => false,
    });
    const commentsUrl =
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`;
    const headers = {
      'Content-Type': 'application/json',
      ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
    };

    const create = await fetch(commentsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'must roll back' }),
    });
    expect(create.status).toBe(400);
    expect(listPreviewComments(database!, TEAM_PROJECT, 'conv-team')).toEqual([]);

    const updateTarget = upsertPreviewComment(
      database!,
      TEAM_PROJECT,
      'conv-team',
      {
        id: 'comment-update-rollback',
        target: COMMENT_TARGET,
        note: 'keep open',
        authorMemberId: OWNER_MEMBER_ID,
      },
    );
    const removeTarget = upsertPreviewComment(
      database!,
      TEAM_PROJECT,
      'conv-team',
      {
        id: 'comment-delete-rollback',
        target: COMMENT_TARGET,
        note: 'keep row',
        authorMemberId: OWNER_MEMBER_ID,
      },
    );

    const update = await fetch(`${commentsUrl}/${updateTarget!.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'applying' }),
    });
    expect(update.status).toBe(400);
    expect(getPreviewComment(
      database!,
      TEAM_PROJECT,
      'conv-team',
      updateTarget!.id,
    )?.status).toBe('open');

    const remove = await fetch(`${commentsUrl}/${removeTarget!.id}`, {
      method: 'DELETE',
      headers,
    });
    expect(remove.status).toBe(400);
    expect(getPreviewComment(
      database!,
      TEAM_PROJECT,
      'conv-team',
      removeTarget!.id,
    )).not.toBeNull();
  });

  it('fails closed before saving or relaying when project scope authority is unavailable', async () => {
    let relayed = 0;
    const baseUrl = await startServer({
      resolveWorkspaceContext: async () => ({
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      }),
      onCommentCreated: () => {
        relayed += 1;
      },
    });
    const response = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({ target: COMMENT_TARGET, note: 'must not persist' }),
      },
    );

    expect(response.status).toBe(503);
    expect(relayed).toBe(0);
    expect(database).not.toBeNull();
    expect(listPreviewComments(database!, TEAM_PROJECT, 'conv-team')).toEqual([]);
  });

  it('fails closed before derived anchor or reorder writes when scope authority is unavailable', async () => {
    const baseUrl = await startServer({
      resolveWorkspaceContext: async () => ({
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      }),
    });
    expect(database).not.toBeNull();
    const seeded = upsertPreviewComment(
      database!,
      TEAM_PROJECT,
      'conv-team',
      {
        id: 'comment-derived-write',
        target: COMMENT_TARGET,
        note: 'keep the original derived state',
      },
    );
    expect(seeded).not.toBeNull();
    if (!seeded) throw new Error('expected the comment fixture to be created');
    const before = getPreviewComment(
      database!,
      TEAM_PROJECT,
      'conv-team',
      seeded.id,
    );

    const anchor = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments/${seeded.id}/anchor`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          selector: '[data-od-id="different"]',
          position: { x: 99, y: 99, width: 10, height: 10 },
        }),
      },
    );
    const reorder = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments/${seeded.id}/reorder`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({ sortKey: 999 }),
      },
    );

    expect(anchor.status).toBe(503);
    expect(reorder.status).toBe(503);
    expect(
      getPreviewComment(
        database!,
        TEAM_PROJECT,
        'conv-team',
        seeded.id,
      ),
    ).toEqual(before);
  });

  it('rejects a headerless POST (new comment) against a team-bound project', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(`${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
    });
    expect(resp.status).toBe(401);
  });

  it('rejects a headerless PATCH (status transition) against a team-bound project', async () => {
    const baseUrl = await startServer();
    // Seed a comment with a member header first (allowed — owner), then
    // retry the status PATCH with no headers at all.
    const create = await fetch(`${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
    });
    expect(create.status).toBe(200);
    const { comment } = (await create.json()) as { comment: { id: string } };

    const resp = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments/${comment.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) },
    );
    expect(resp.status).toBe(401);
  });

  it('rejects a headerless DELETE against a team-bound project', async () => {
    const baseUrl = await startServer();
    const create = await fetch(`${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
    });
    const { comment } = (await create.json()) as { comment: { id: string } };

    const resp = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments/${comment.id}`,
      { method: 'DELETE' },
    );
    expect(resp.status).toBe(401);
  });

  // The exact recvqbklNGDqYY-shaped regression: BEFORE this fix, the shared
  // gate's null-ctx branch only refused `visibility: 'team'`, so a headerless
  // caller could still write to a `personal`-but-CLAIMED project's comments.
  it('rejects a headerless POST against a personal-visibility (but bound) project too', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(`${baseUrl}/api/projects/${PERSONAL_PROJECT}/conversations/conv-personal/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
    });
    expect(resp.status).toBe(401);
  });

  it('still allows a headerless POST/PATCH/DELETE against a never-claimed (legacy) project', async () => {
    const baseUrl = await startServer();
    const create = await fetch(`${baseUrl}/api/projects/${UNBOUND_PROJECT}/conversations/conv-unbound/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
    });
    expect(create.status).toBe(200);
    const { comment } = (await create.json()) as { comment: { id: string } };

    const patch = await fetch(
      `${baseUrl}/api/projects/${UNBOUND_PROJECT}/conversations/conv-unbound/comments/${comment.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) },
    );
    expect(patch.status).toBe(200);

    const del = await fetch(
      `${baseUrl}/api/projects/${UNBOUND_PROJECT}/conversations/conv-unbound/comments/${comment.id}`,
      { method: 'DELETE' },
    );
    expect(del.status).toBe(200);
  });

  // The member-comment regression (2026-07-27 dogfood, beta 0.15.2-beta.137):
  // the comment gate borrowed the project's `writeFiles` capability, whose
  // `canMutate` requires `privileged || selfCreated` — so a PLAIN member could
  // never comment on someone else's team-shared project even though the
  // product's read-only banner explicitly promises "view and comment". A
  // comment is not a file write; it needs its own capability that any active
  // member of the sharing workspace passes.
  it('allows a plain team member (not the creator) to comment on a team-shared project', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(`${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OTHER_MEMBER_ID, 'member') },
      body: JSON.stringify({ target: COMMENT_TARGET, note: '这啥?' }),
    });
    expect(resp.status).toBe(200);
    const { comment } = (await resp.json()) as { comment: { id: string } };
    expect(comment.id).toBeTruthy();
  });

  it.each([
    ['member', OTHER_MEMBER_ID],
    ['admin', 'member-admin'],
  ] as const)(
    'allows an active %s to comment when synced-file writes are disabled',
    async (role, memberId) => {
      const baseUrl = await startServer();
      const resp = await fetch(`${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(memberId, role, false),
        },
        body: JSON.stringify({ target: COMMENT_TARGET, note: `${role} comment` }),
      });
      expect(resp.status).toBe(200);
    },
  );

  // Same as above but against the exact row shape the member's own daemon
  // holds after `POST /api/projects/:id/collab/pull` — the unattributed
  // (`createdByWorkspaceMemberId: null`) team mirror. This is the literal
  // production shape of the dogfood failure (403
  // WORKSPACE_PROJECT_PERMISSION_DENIED → “评论保存失败，请重试。”).
  it('allows a member to comment on a pulled team mirror (unattributed binding)', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OTHER_MEMBER_ID, 'member') },
        body: JSON.stringify({ target: COMMENT_TARGET, note: '这啥?' }),
      },
    );
    expect(resp.status).toBe(200);
  });

  it('lists Team comments across local conversation anchors while keeping personal comments isolated', async () => {
    const baseUrl = await startServer({
      resolveReadWorkspaceContext: async () => ({
        ok: true,
        context: activeTeamContext(OTHER_MEMBER_ID, 'member'),
      }),
      resolveWorkspaceContext: async () => ({
        ok: true,
        context: activeTeamContext(OTHER_MEMBER_ID, 'member'),
      }),
    });
    const db = database!;
    const now = Date.now();
    insertConversation(db, {
      id: 'conv-team-active',
      projectId: TEAM_MIRROR_PROJECT,
      title: 'Current local chat',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-personal-active',
      projectId: PERSONAL_PROJECT,
      title: 'Current personal chat',
      createdAt: now,
      updatedAt: now,
    });
    const teamComment = upsertPreviewComment(db, TEAM_MIRROR_PROJECT, 'conv-team-mirror', {
      target: COMMENT_TARGET,
      note: 'remote comment stored under another local anchor',
    })!;
    const otherPersonalComment = upsertPreviewComment(db, PERSONAL_PROJECT, 'conv-personal', {
      target: COMMENT_TARGET,
      note: 'another personal conversation',
    })!;
    upsertPreviewComment(db, PERSONAL_PROJECT, 'conv-personal-active', {
      target: { ...COMMENT_TARGET, elementId: 'personal-active' },
      note: 'current personal conversation',
    });

    const teamResponse = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments`,
      { headers: workspaceHeaders(OTHER_MEMBER_ID, 'member') },
    );
    expect(teamResponse.status).toBe(200);
    const teamPayload = (await teamResponse.json()) as {
      comments: Array<{ conversationId: string; note: string }>;
    };
    expect(teamPayload.comments).toEqual([
      expect.objectContaining({
        conversationId: 'conv-team-mirror',
        note: 'remote comment stored under another local anchor',
      }),
    ]);

    const teamEdit = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({
          id: teamComment.id,
          target: COMMENT_TARGET,
          note: 'edited from the active local conversation',
        }),
      },
    );
    expect(teamEdit.status).toBe(200);
    expect((await teamEdit.json()) as unknown).toEqual({
      comment: expect.objectContaining({
        id: teamComment.id,
        conversationId: 'conv-team-mirror',
        note: 'edited from the active local conversation',
      }),
    });

    const teamAnchor = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments/${teamComment.id}/anchor`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({
          anchorState: 'reanchored',
          anchoredVersion: 3,
          lastGoodPosition: { x: 11, y: 22, width: 33, height: 44 },
        }),
      },
    );
    expect(teamAnchor.status).toBe(200);
    expect((await teamAnchor.json()) as unknown).toEqual({
      comment: expect.objectContaining({
        id: teamComment.id,
        conversationId: 'conv-team-mirror',
        anchorState: 'reanchored',
        anchoredVersion: 3,
        lastGoodPosition: { x: 11, y: 22, width: 33, height: 44 },
      }),
    });

    const teamReorder = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments/${teamComment.id}/reorder`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({ sortKey: 77 }),
      },
    );
    expect(teamReorder.status).toBe(200);
    expect((await teamReorder.json()) as unknown).toEqual({
      comment: expect.objectContaining({
        id: teamComment.id,
        conversationId: 'conv-team-mirror',
        sortKey: 77,
      }),
    });

    const teamStatus = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments/${teamComment.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OTHER_MEMBER_ID, 'member'),
        },
        body: JSON.stringify({ status: 'resolved' }),
      },
    );
    expect(teamStatus.status).toBe(200);
    expect((await teamStatus.json()) as unknown).toEqual({
      comment: expect.objectContaining({
        id: teamComment.id,
        conversationId: 'conv-team-mirror',
        status: 'resolved',
      }),
    });

    const teamAfterUpdate = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments`,
      { headers: workspaceHeaders(OTHER_MEMBER_ID, 'member') },
    );
    expect(teamAfterUpdate.status).toBe(200);
    expect((await teamAfterUpdate.json()) as { comments: unknown[] }).toEqual({
      comments: [expect.objectContaining({ id: teamComment.id })],
    });

    const teamDelete = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments/${teamComment.id}`,
      {
        method: 'DELETE',
        headers: workspaceHeaders(OTHER_MEMBER_ID, 'member'),
      },
    );
    expect(teamDelete.status).toBe(200);
    expect(await teamDelete.json()).toEqual({ ok: true });

    const teamAfterDelete = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-active/comments`,
      { headers: workspaceHeaders(OTHER_MEMBER_ID, 'member') },
    );
    expect(teamAfterDelete.status).toBe(200);
    expect(await teamAfterDelete.json()).toEqual({ comments: [] });

    const personalResponse = await fetch(
      `${baseUrl}/api/projects/${PERSONAL_PROJECT}/conversations/conv-personal-active/comments`,
      { headers: workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
    );
    expect(personalResponse.status).toBe(200);
    const personalPayload = (await personalResponse.json()) as {
      comments: Array<{ conversationId: string; note: string }>;
    };
    expect(personalPayload.comments).toEqual([
      expect.objectContaining({
        conversationId: 'conv-personal-active',
        note: 'current personal conversation',
      }),
    ]);

    const personalStatus = await fetch(
      `${baseUrl}/api/projects/${PERSONAL_PROJECT}/conversations/conv-personal-active/comments/${otherPersonalComment.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({ status: 'resolved' }),
      },
    );
    expect(personalStatus.status).toBe(404);
  });

  // Comment-capability follow-through: the same borrowed gate also fronts
  // status change and delete, so a member must reach the per-comment author
  // rules (`callerMayMutate`) instead of being 403'd at the workspace layer.
  // (Author-based restrictions themselves are pinned by
  // project-comment-permissions.test.ts; this fixture stores unauthored
  // comments, which degrade open by design.)
  it('lets a member reach the author rules for status/delete on a team-shared project', async () => {
    const baseUrl = await startServer();
    const create = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OTHER_MEMBER_ID, 'member') },
        body: JSON.stringify({ target: COMMENT_TARGET, note: 'mine' }),
      },
    );
    expect(create.status).toBe(200);
    const { comment } = (await create.json()) as { comment: { id: string } };

    const patch = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments/${comment.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OTHER_MEMBER_ID, 'member') },
        body: JSON.stringify({ status: 'resolved' }),
      },
    );
    expect(patch.status).toBe(200);

    const del = await fetch(
      `${baseUrl}/api/projects/${TEAM_MIRROR_PROJECT}/conversations/conv-team-mirror/comments/${comment.id}`,
      { method: 'DELETE', headers: workspaceHeaders(OTHER_MEMBER_ID, 'member') },
    );
    expect(del.status).toBe(200);
  });

  // Guard against overshoot: widening the comment gate must not open comments
  // on a personal-visibility (unshared, merely claimed) project to other
  // members — only the sharing act (`visibility: 'team'`) grants comment
  // standing beyond creator/privileged.
  it('still rejects a non-creator member commenting on a personal-visibility project', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(
      `${baseUrl}/api/projects/${PERSONAL_PROJECT}/conversations/conv-personal/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OTHER_MEMBER_ID, 'member') },
        body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
      },
    );
    expect(resp.status).toBe(403);
  });

  it('allows a properly-authenticated team member to POST/PATCH/DELETE against the team-bound project', async () => {
    const baseUrl = await startServer();
    const create = await fetch(`${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
      body: JSON.stringify({ target: COMMENT_TARGET, note: 'hi' }),
    });
    expect(create.status).toBe(200);
    const { comment } = (await create.json()) as { comment: { id: string } };

    const patch = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments/${comment.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
        body: JSON.stringify({ status: 'resolved' }),
      },
    );
    expect(patch.status).toBe(200);

    const del = await fetch(
      `${baseUrl}/api/projects/${TEAM_PROJECT}/conversations/conv-team/comments/${comment.id}`,
      { method: 'DELETE', headers: workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
    );
    expect(del.status).toBe(200);
  });
});
