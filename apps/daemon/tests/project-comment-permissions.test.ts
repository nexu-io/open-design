import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  deletePreviewComment,
  ensureProjectCommentAnchorConversation,
  ensureWorkspaceProject,
  getWorkspaceProjectByProjectId,
  getProject,
  getProjectPreviewComment,
  listProjectPreviewComments,
  mergeSyncedPreviewComment,
  getConversation,
  getPreviewComment,
  insertConversation,
  insertProject,
  listPreviewComments,
  openDatabase,
  reorderPreviewComment,
  updatePreviewCommentAnchor,
  updatePreviewCommentStatus,
  updateProject,
  upsertPreviewComment,
} from '../src/db.js';
import { registerProjectCommentRoutes } from '../src/routes/project/comments.js';

// Server-authoritative permission gating for the preview-comment mutation routes
// (product model 2026-07-09): editing a comment is author-only (structurally, via
// the author-scoped POST upsert); changing status (the send-to-agent lifecycle)
// and deleting are allowed for the author AND the project owner, and blocked for
// any other member.

let server: http.Server | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

const OWNER = 'm-owner';
const PROJECT = 'p1';
const CONVERSATION = 'conv-1';

/** The Authorization header carries `member:<id>` so a test can act as any member. */
function asMember(memberId: string): { authorization: string } {
  return { authorization: `member:${memberId}` };
}

async function startServer({
  shared = true,
  team = false,
  metadata = { kind: 'prototype' },
}: {
  shared?: boolean;
  team?: boolean;
  metadata?: Record<string, unknown>;
} = {}) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-perms-'));
  const db = openDatabase(tempDir);
  insertProject(db, {
    id: PROJECT,
    name: 'Project',
    metadata,
    createdAt: 1,
    updatedAt: 1,
  });
  insertConversation(db, { id: CONVERSATION, projectId: PROJECT, title: 'Chat', createdAt: 1, updatedAt: 1 });

  if (team) ensureWorkspaceProject(db, {
    projectId: PROJECT, workspaceId: 'test-team', visibility: 'team', createdByWorkspaceMemberId: OWNER,
  });
  const updated: string[] = [];
  const deleted: string[] = [];
  const created: string[] = [];
  const productEvents: Array<{
    eventName: string;
    properties: Record<string, unknown>;
  }> = [];

  const app = express();
  app.use(express.json());
  registerProjectCommentRoutes(app, {
    db,
    projectStore: { updateProject, getWorkspaceProjectByProjectId } as any,
    conversations: {
      getConversation,
      getProjectPreviewComment,
      listProjectPreviewComments,
      listPreviewComments,
      upsertPreviewComment,
      getPreviewComment,
      updatePreviewCommentStatus,
      updatePreviewCommentAnchor,
      deletePreviewComment,
      reorderPreviewComment,
    } as any,
    // Identify the caller from the `member:<id>` Authorization header.
    resolveAuthorMemberId: async (authorization) =>
      authorization?.startsWith('member:') ? authorization.slice('member:'.length) : undefined,
    // p1 is owned by OWNER.
    resolveProjectOwnerMemberId: async () => OWNER,
    isSharedProject: async () => shared,
    onCommentCreated: (c) => { created.push(c.id); },
    onCommentUpdated: (c) => { updated.push(c.id); },
    onCommentDeleted: (c) => { deleted.push(c.id); },
    telemetry: {
      captureProductEvent: (_req: unknown, eventName: string, properties: Record<string, unknown>) => {
        productEvents.push({ eventName, properties });
      },
    } as any,
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;

  async function json(
    route: string,
    options: { method?: string; body?: unknown; member?: string } = {},
  ) {
    const init: RequestInit = { method: options.method ?? 'GET', headers: {} };
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.member) Object.assign(headers, asMember(options.member));
    init.headers = headers;
    const response = await fetch(`${base}${route}`, init);
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as any) : {} };
  }

  const commentTarget = {
    filePath: 'index.html',
    elementId: 'hero',
    selector: '[data-od-id="hero"]',
    label: 'h1.hero',
    text: 'Hero',
    htmlHint: '<h1>',
    position: { x: 0, y: 0, width: 0, height: 0 },
  };

  async function createComment(member: string, note = 'a note') {
    const res = await json(`/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`, {
      method: 'POST',
      member,
      body: { target: commentTarget, note },
    });
    return res.body.comment as {
      id: string;
      authorMemberId?: string;
      note: string;
      pinSeq?: number;
      sortKey?: number;
    };
  }

  const listComments = () =>
    listPreviewComments(db, PROJECT, CONVERSATION) as Array<{
      id: string;
      authorMemberId?: string;
      note: string;
    }>;

  return {
    db,
    json,
    createComment,
    listComments,
    created,
    updated,
    deleted,
    productEvents,
    commentTarget,
  };
}

describe('preview comment permission gating', () => {
  it.each([
    { team: false, caller: OWNER }, { team: false, caller: 'm-member' },
    { team: true, caller: OWNER }, { team: true, caller: 'm-member' },
  ])('rejects stored external body edits without effects (team=$team caller=$caller)', async ({ team, caller }) => {
    const api = await startServer({ team });
    const anchor = ensureProjectCommentAnchorConversation(api.db, PROJECT)!.conversationId;
    const route = `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`;
    for (const shape of ['user', 'mixed-member', 'missing-kind', 'kind-only']) {
      const id = `external-${shape}`;
      mergeSyncedPreviewComment(api.db, PROJECT, anchor, {
        ...api.commentTarget, id, projectId: PROJECT, conversationId: 'remote',
        memberId: '', seq: 1, note: 'original external note', status: 'open',
        authorKind: 'user', authorAppUserId: 'external-account', createdAt: 10, updatedAt: 10,
      });
      // Historical incomplete/mixed identities cannot be produced by the modern
      // merger; retain them verbatim as fixtures, never repair them on rejection.
      if (shape === 'mixed-member') api.db.prepare('UPDATE preview_comments SET author_member_id = ? WHERE id = ?').run(caller, id);
      if (shape === 'missing-kind') api.db.prepare('UPDATE preview_comments SET author_kind = NULL WHERE id = ?').run(id);
      if (shape === 'kind-only') api.db.prepare('UPDATE preview_comments SET author_app_user_id = NULL WHERE id = ?').run(id);
      const before = api.db.prepare('SELECT * FROM preview_comments WHERE id = ?').get(id);
      const projectBefore = getProject(api.db, PROJECT);
      const outboxBefore = api.db.prepare('SELECT * FROM comment_relay_outbox').all();
      const rejected = await api.json(route, {
        method: 'POST', member: caller,
        body: { id, target: api.commentTarget, note: 'stolen edit',
          authorKind: 'member', authorMemberId: caller, authorAppUserId: '', authorDisplayName: 'spoofed' },
      });
      expect(rejected.status).toBe(403);
      expect(api.db.prepare('SELECT * FROM preview_comments WHERE id = ?').get(id)).toEqual(before);
      expect(getProject(api.db, PROJECT)).toEqual(projectBefore);
      expect(api.db.prepare('SELECT * FROM comment_relay_outbox').all()).toEqual(outboxBefore);
      expect(api.created).toEqual([]);
      expect(api.updated).toEqual([]);
      expect(api.deleted).toEqual([]);
      expect(api.productEvents).toEqual([]);
    }
    // Editing is not Owner handling: the actual status endpoint remains usable.
    expect((await api.json(route, { member: OWNER })).body.comments).toHaveLength(4);
    const handled = await api.json(`${route}/external-user`, {
      method: 'PATCH', member: OWNER, body: { status: 'attached' },
    });
    expect(handled.status).toBe(200);
    expect(handled.body.comment.note).toBe('original external note');
    expect(handled.body.comment.authorKind).toBe('user');
  });

  it('preserves the existing authorless POST compatibility branch', async () => {
    const api = await startServer();
    const legacy = upsertPreviewComment(api.db, PROJECT, CONVERSATION, { target: api.commentTarget, note: 'legacy' });
    const edited = await api.json(`/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`, {
      method: 'POST', member: OWNER, body: { id: legacy!.id, target: api.commentTarget, note: 'legacy edited' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.comment).toMatchObject({ note: 'legacy edited', authorMemberId: OWNER });
  });

  it('personal reads and owner handling include only the current conversation plus internal shared anchor', async () => {
    const api = await startServer();
    const own = await api.createComment(OWNER, 'current private note');
    insertConversation(api.db, { id: 'private-other', projectId: PROJECT, title: 'Other', createdAt: 2, updatedAt: 2 });
    const hidden = upsertPreviewComment(api.db, PROJECT, 'private-other', {
      target: api.commentTarget, note: 'other private note', authorMemberId: OWNER,
    });
    const route = `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`;
    expect((await api.json(route, { member: OWNER })).body.comments.map((c: { id: string }) => c.id)).toEqual([own.id]);
    const anchor = ensureProjectCommentAnchorConversation(api.db, PROJECT)!.conversationId;
    mergeSyncedPreviewComment(api.db, PROJECT, anchor, {
      ...api.commentTarget, id: 'external-user', projectId: PROJECT, conversationId: 'remote',
      memberId: '', seq: 1, note: 'shared incoming note', status: 'open',
      authorKind: 'user', authorAppUserId: 'account-external', createdAt: 10, updatedAt: 10,
    });
    insertProject(api.db, { id: 'other-project', name: 'Other', createdAt: 1, updatedAt: 1 });
    const foreignAnchor = ensureProjectCommentAnchorConversation(api.db, 'other-project')!.conversationId;
    upsertPreviewComment(api.db, 'other-project', foreignAnchor, { target: api.commentTarget, note: 'foreign anchor' });
    const listed = await api.json(route, { member: OWNER });
    expect(listed.status).toBe(200);
    expect(listed.body.comments.map((c: { id: string }) => c.id).sort()).toEqual([own.id, 'external-user'].sort());
    const handled = await api.json(`${route}/external-user`, { method: 'PATCH', member: OWNER, body: { status: 'attached' } });
    expect(handled.status).toBe(200);
    expect(getPreviewComment(api.db, PROJECT, anchor, 'external-user')).toMatchObject({ status: 'attached', conversationId: anchor });
    expect((await api.json(`${route}/${hidden!.id}`, { method: 'PATCH', member: OWNER, body: { status: 'attached' } })).status).toBe(404);
    expect((await api.json(`/api/projects/${PROJECT}/conversations/${anchor}/comments`, { member: OWNER })).status).toBe(404);
  });

  it('classifies new comments as self or other and does not count edits', async () => {
    const api = await startServer();
    const ownComment = await api.createComment(OWNER, 'owner note');
    const otherComment = await api.createComment('m-member', 'member note');

    expect(api.productEvents).toEqual([
      {
        eventName: 'project_comment_create_result',
        properties: expect.objectContaining({
          result: 'success',
          target_project_relation: 'self',
          comment_level: 'top_level',
          project_id: PROJECT,
          project_kind: 'prototype',
        }),
      },
      {
        eventName: 'project_comment_create_result',
        properties: expect.objectContaining({
          result: 'success',
          target_project_relation: 'other',
          comment_level: 'top_level',
          project_id: PROJECT,
          project_kind: 'prototype',
        }),
      },
    ]);

    const edit = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        member: 'm-member',
        body: {
          id: otherComment.id,
          target: api.commentTarget,
          note: 'edited member note',
        },
      },
    );
    expect(edit.status).toBe(200);
    expect(ownComment.id).not.toBe(otherComment.id);
    expect(api.productEvents).toHaveLength(2);
  });

  it('uses the canonical prototype kind for a legacy project without metadata.kind', async () => {
    const api = await startServer({ metadata: {} });

    await api.createComment(OWNER, 'legacy project note');

    expect(api.productEvents).toEqual([
      {
        eventName: 'project_comment_create_result',
        properties: expect.objectContaining({
          project_id: PROJECT,
          project_kind: 'prototype',
        }),
      },
    ]);
  });

  it('legacy comments in a shared project are owner-only', async () => {
    const api = await startServer();
    const legacy = upsertPreviewComment(
      api.db,
      PROJECT,
      CONVERSATION,
      { target: api.commentTarget, note: 'legacy note' },
    );
    expect(legacy?.authorMemberId).toBeUndefined();

    const memberDelete = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${legacy!.id}`,
      { method: 'DELETE', member: 'm-member' },
    );
    expect(memberDelete.status).toBe(403);
    expect(api.listComments()).toHaveLength(1);

    const ownerDelete = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${legacy!.id}`,
      { method: 'DELETE', member: OWNER },
    );
    expect(ownerDelete.status).toBe(200);
    expect(api.listComments()).toHaveLength(0);
  });

  it('legacy comments in an unshared project keep single-user mutation behavior', async () => {
    const api = await startServer({ shared: false });
    const legacy = upsertPreviewComment(
      api.db,
      PROJECT,
      CONVERSATION,
      { target: api.commentTarget, note: 'personal legacy note' },
    );

    const memberDelete = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${legacy!.id}`,
      { method: 'DELETE', member: 'm-member' },
    );
    expect(memberDelete.status).toBe(200);
    expect(api.listComments()).toHaveLength(0);
  });

  it('a non-author non-owner member cannot change status or delete', async () => {
    const api = await startServer();
    const comment = await api.createComment('m-author');
    expect(comment.authorMemberId).toBe('m-author');

    const patch = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'PATCH', member: 'm-stranger', body: { status: 'applying' } },
    );
    expect(patch.status).toBe(403);

    const del = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'DELETE', member: 'm-stranger' },
    );
    expect(del.status).toBe(403);

    // Nothing changed / propagated.
    expect(api.listComments()).toHaveLength(1);
    expect(api.updated).toEqual([]);
    expect(api.deleted).toEqual([]);
  });

  it('an authored shared comment cannot be changed or deleted without caller identity', async () => {
    const api = await startServer();
    const comment = await api.createComment('m-author');

    const patch = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'PATCH', body: { status: 'applying' } },
    );
    expect(patch.status).toBe(403);

    const del = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'DELETE' },
    );
    expect(del.status).toBe(403);

    expect(api.listComments()).toHaveLength(1);
    expect(api.updated).toEqual([]);
    expect(api.deleted).toEqual([]);
  });

  it('the author can change status on their own comment', async () => {
    const api = await startServer();
    const comment = await api.createComment('m-author');
    const patch = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'PATCH', member: 'm-author', body: { status: 'applying' } },
    );
    expect(patch.status).toBe(200);
    expect(patch.body.comment.status).toBe('applying');
    // The status change propagated to the relay seam.
    expect(api.updated).toEqual([comment.id]);
  });

  it('the project owner can change status on and delete another member\'s comment', async () => {
    const api = await startServer();
    const comment = await api.createComment('m-author');

    const patch = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'PATCH', member: OWNER, body: { status: 'needs_review' } },
    );
    expect(patch.status).toBe(200);

    const del = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}`,
      { method: 'DELETE', member: OWNER },
    );
    expect(del.status).toBe(200);
    expect(api.deleted).toEqual([comment.id]);
    expect(api.listComments()).toHaveLength(0);
  });

  it('POST is author-scoped: a second member commenting on the same element makes their own row', async () => {
    const api = await startServer();
    const first = await api.createComment('m-author', 'author note');
    const second = await api.createComment('m-other', 'other note');

    // Distinct rows — the second member did not overwrite the author's comment.
    expect(second.id).not.toBe(first.id);
    const rows = api.listComments();
    expect(rows).toHaveLength(2);
    expect(rows.find((c) => c.authorMemberId === 'm-author')?.note).toBe('author note');
    expect(rows.find((c) => c.authorMemberId === 'm-other')?.note).toBe('other note');
  });

  it('ignores spoofed request authors on create and edit', async () => {
    const api = await startServer();
    const created = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        member: 'm-author',
        body: {
          target: api.commentTarget,
          note: 'trusted author',
          authorMemberId: 'm-spoofed',
          authorKind: 'user',
          authorAppUserId: 'app-spoofed',
          authorDisplayName: 'Spoofed',
          authorKey: 'f'.repeat(64),
        },
      },
    );
    expect(created.status).toBe(200);
    expect(created.body.comment).toMatchObject({
      authorMemberId: 'm-author',
    });
    expect(created.body.comment).not.toHaveProperty('authorKind');
    expect(created.body.comment).not.toHaveProperty('authorAppUserId');
    expect(created.body.comment).not.toHaveProperty('authorDisplayName');
    expect(created.body.comment).not.toHaveProperty('authorKey');

    const unauthenticated = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        body: {
          target: api.commentTarget,
          note: 'no caller identity',
          authorMemberId: 'm-spoofed',
          authorKind: 'user',
          authorAppUserId: 'app-spoofed',
          authorDisplayName: 'Spoofed',
          authorKey: 'd'.repeat(64),
        },
      },
    );
    expect(unauthenticated.status).toBe(200);
    expect(unauthenticated.body.comment).not.toHaveProperty('authorMemberId');
    expect(unauthenticated.body.comment).not.toHaveProperty('authorKind');
    expect(unauthenticated.body.comment).not.toHaveProperty('authorAppUserId');
    expect(unauthenticated.body.comment).not.toHaveProperty('authorDisplayName');
    expect(unauthenticated.body.comment).not.toHaveProperty('authorKey');

    const edited = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        member: 'm-author',
        body: {
          id: created.body.comment.id,
          target: api.commentTarget,
          note: 'trusted edit',
          authorMemberId: 'm-spoofed-edit',
          authorKind: 'user',
          authorAppUserId: 'app-spoofed-edit',
          authorDisplayName: 'Spoofed edit',
          authorKey: 'e'.repeat(64),
        },
      },
    );
    expect(edited.status).toBe(200);
    expect(edited.body.comment).toMatchObject({
      authorMemberId: 'm-author',
      note: 'trusted edit',
    });
    expect(edited.body.comment).not.toHaveProperty('authorKind');
    expect(edited.body.comment).not.toHaveProperty('authorAppUserId');
    expect(edited.body.comment).not.toHaveProperty('authorDisplayName');
    expect(edited.body.comment).not.toHaveProperty('authorKey');
  });

  it('POST creates another row for the same author unless an existing id is sent', async () => {
    const api = await startServer();
    const first = await api.createComment('m-author', 'first note');
    const second = await api.createComment('m-author', 'second note');

    expect(second.id).not.toBe(first.id);
    expect(api.listComments()).toHaveLength(2);

    const edit = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        member: 'm-author',
        body: { id: first.id, target: api.commentTarget, note: 'edited first' },
      },
    );

    expect(edit.status).toBe(200);
    expect(edit.body.comment.id).toBe(first.id);
    expect(api.listComments()).toHaveLength(2);
    expect(api.listComments().find((c) => c.id === first.id)?.note).toBe('edited first');
    expect(api.listComments().find((c) => c.id === second.id)?.note).toBe('second note');
  });

  it('POST cannot edit another member comment by passing its id', async () => {
    const api = await startServer();
    const first = await api.createComment('m-author', 'author note');
    const edit = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        member: 'm-other',
        body: { id: first.id, target: api.commentTarget, note: 'stolen edit' },
      },
    );

    expect(edit.status).toBe(403);
    expect(api.listComments()).toHaveLength(1);
    expect(api.listComments()[0]?.note).toBe('author note');
  });

  it('POST cannot edit an authored shared comment when caller identity is missing', async () => {
    const api = await startServer();
    const first = await api.createComment('m-author', 'author note');
    const edit = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        body: { id: first.id, target: api.commentTarget, note: 'anonymous edit' },
      },
    );

    expect(edit.status).toBe(403);
    expect(api.listComments()).toHaveLength(1);
    expect(api.listComments()[0]?.note).toBe('author note');
  });

  it('POST with an unknown id is treated as a missing edit target', async () => {
    const api = await startServer();
    const edit = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      {
        method: 'POST',
        member: 'm-author',
        body: { id: 'missing-comment', target: api.commentTarget, note: 'edit nothing' },
      },
    );

    expect(edit.status).toBe(404);
    expect(api.listComments()).toHaveLength(0);
  });

  // —— reorder (sidebar sort_key) — recvq5BVsolIxi Phase 2 ————————————————————

  it('reorder is a personal display preference: any member may reorder, not just the author', async () => {
    const api = await startServer();
    const comment = await api.createComment('m-author');

    const patch = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}/reorder`,
      { method: 'PATCH', member: 'm-stranger', body: { sortKey: 42 } },
    );
    expect(patch.status).toBe(200);
    expect(patch.body.comment.sortKey).toBe(42);
    // Unlike status change/delete, reordering is not pushed to the relay and
    // does not require caller identity at all.
    const anon = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}/reorder`,
      { method: 'PATCH', body: { sortKey: 43 } },
    );
    expect(anon.status).toBe(200);
    expect(api.updated).toEqual([]);
    expect(api.created).toEqual([comment.id]);
  });

  it('reorder writes only sort_key — pin_seq stays exactly what creation assigned', async () => {
    const api = await startServer();
    const first = await api.createComment('m-author', 'first');
    const second = await api.createComment('m-other', 'second');
    expect(first.pinSeq).toBe(1);
    expect(second.pinSeq).toBe(2);

    const patch = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${first.id}/reorder`,
      { method: 'PATCH', member: 'm-author', body: { sortKey: 99 } },
    );
    expect(patch.status).toBe(200);
    expect(patch.body.comment.sortKey).toBe(99);
    expect(patch.body.comment.pinSeq).toBe(1);
    // The untouched sibling is unaffected.
    const rows = api.listComments() as unknown as Array<{ id: string; pinSeq?: number; sortKey?: number }>;
    expect(rows.find((c) => c.id === second.id)?.pinSeq).toBe(2);
  });

  it('reorder rejects a non-finite sortKey and 404s for an unknown comment', async () => {
    const api = await startServer();
    const comment = await api.createComment('m-author');

    const bad = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/${comment.id}/reorder`,
      { method: 'PATCH', member: 'm-author', body: { sortKey: 'not-a-number' } },
    );
    expect(bad.status).toBe(400);

    const missing = await api.json(
      `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments/missing-comment/reorder`,
      { method: 'PATCH', member: 'm-author', body: { sortKey: 1 } },
    );
    expect(missing.status).toBe(404);
  });
});
