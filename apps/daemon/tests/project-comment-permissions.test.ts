import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  deletePreviewComment,
  getConversation,
  getPreviewComment,
  insertConversation,
  insertProject,
  listPreviewComments,
  openDatabase,
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

async function startServer() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-perms-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: PROJECT, name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: CONVERSATION, projectId: PROJECT, title: 'Chat', createdAt: 1, updatedAt: 1 });

  const updated: string[] = [];
  const deleted: string[] = [];

  const app = express();
  app.use(express.json());
  registerProjectCommentRoutes(app, {
    db,
    projectStore: { updateProject } as any,
    conversations: {
      getConversation,
      listPreviewComments,
      upsertPreviewComment,
      getPreviewComment,
      updatePreviewCommentStatus,
      updatePreviewCommentAnchor,
      deletePreviewComment,
    } as any,
    // Identify the caller from the `member:<id>` Authorization header.
    resolveAuthorMemberId: async (authorization) =>
      authorization?.startsWith('member:') ? authorization.slice('member:'.length) : undefined,
    // p1 is owned by OWNER.
    resolveProjectOwnerMemberId: async () => OWNER,
    onCommentUpdated: (c) => updated.push(c.id),
    onCommentDeleted: (c) => deleted.push(c.id),
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
    return res.body.comment as { id: string; authorMemberId?: string; note: string };
  }

  const listComments = () =>
    listPreviewComments(db, PROJECT, CONVERSATION) as Array<{
      id: string;
      authorMemberId?: string;
      note: string;
    }>;

  return { db, json, createComment, listComments, updated, deleted, commentTarget };
}

describe('preview comment permission gating', () => {
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
});
