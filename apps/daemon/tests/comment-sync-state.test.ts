import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { recordPublishedCommentBackfill } from '../src/collab/published-comment-backfill-state.js';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext, type CommentSyncState } from '@open-design/contracts';
import { openDatabase, closeDatabase, insertProject } from '../src/db.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import { createCommentSyncStateService } from '../src/collab/comment-sync-state.js';
import { registerCommentSyncStateRoutes } from '../src/routes/project/comments.js';

it('supplies scoped K8 over HTTP with unknown, login recovery, isolated retry and historical failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-k8-'));
  const db = openDatabase(root);
  const app = express(); const server = createServer(app);
  let available: boolean | null = null;
  let fail = false;
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'm', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  try {
    insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
    const queue = createCommentRelayOutboxStore(db);
    for (const [id, project, workspace, member] of [['mine', 'p', 'w', 'm'], ['other-project', 'q', 'w', 'm'], ['other-member', 'p', 'w', 'n'], ['other-workspace', 'p', 'v', 'm']]) {
      db.prepare(`INSERT INTO comment_relay_outbox(workspace_id,workspace_member_id,team_id,project_id,comment_id,payload_json,next_attempt_at,created_at,updated_at)
        VALUES(?,?,?,?,?,'{}',0,1,1)`).run(workspace, member, workspace, project, id);
    }
    const mine = queue.listDue(1).find(row => row.commentId === 'mine')!;
    queue.defer(mine, { error: 'secret-token-do-not-expose', nextAttemptAt: 9000000000000 });
    const foreignBefore = db.prepare("SELECT * FROM comment_relay_outbox WHERE comment_id!='mine'").all();
    const service = createCommentSyncStateService(db, async () => { if (fail) throw new Error('session unavailable'); return available; });
    registerCommentSyncStateRoutes(app, { db, service, authorize: async req => req.get('x-test-deny')
      ? { ok: false, status: 403, code: 'DENIED', message: 'denied' } : { ok: true, context } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('listener failed');
    const url = `http://127.0.0.1:${address.port}/api/projects/p/comment-sync-state`;
    const unknown = await fetch(url); expect(unknown.status).toBe(200); expect(await unknown.json()).toBeNull();
    expect(unknown.headers.get('cache-control')).toBe('no-store');
    available = false;
    const missing = await (await fetch(url)).json();
    expect(missing).toEqual({ pending: 1, lastError: 'COMMENT_SYNC_DELIVERY_FAILED', sessionMissing: true, shareStopped: null });
    available = true;
    expect(await (await fetch(url)).json()).toEqual({ pending: 1, lastError: 'COMMENT_SYNC_DELIVERY_FAILED', sessionMissing: false, shareStopped: null });
    const denied = await fetch(url, { method: 'POST', headers: { 'x-test-deny': '1' } });
    expect(denied.status).toBe(403);
    expect(queue.listDue(1).some(row => row.commentId === 'mine')).toBe(false);
    expect((await fetch(url, { method: 'POST' })).status).toBe(200);
    expect(queue.listDue(1).find(row => row.commentId === 'mine')?.revision).toBe(mine.revision);
    expect(db.prepare("SELECT * FROM comment_relay_outbox WHERE comment_id!='mine'").all()).toEqual(foreignBefore);
    queue.acknowledge(mine); available = false;
    expect(await (await fetch(url)).json()).toEqual({ pending: 0, lastError: 'COMMENT_SYNC_DELIVERY_FAILED', sessionMissing: false, shareStopped: null });
    available = true;
    const publications = createSqlitePublicFilePublicationStore(db);
    for (const filePath of ['a.html', 'b.html']) {
      const scope = { resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath };
      publications.set(scope, { slug: filePath, url: 'https://example.test', fileName: filePath });
      const revision = publications.getRevision(scope)!;
      db.transaction(() => recordPublishedCommentBackfill(db, { scope, publicationRevision: revision, commentIds: [filePath] }))();
      for (const id of [filePath, `late-${filePath}`]) {
        queue.enqueue({ workspaceId: 'w', workspaceMemberId: 'm', teamId: 'w', relayScope: 'personal', projectId: 'p', expectedOwnerMemberId: 'm', comment: { id, filePath } as never, publication: { ...revision, publicFilePath: filePath } });
        const row = queue.listDue(Date.now()).find(row => row.commentId === id)!;
        queue.defer(row, { nextAttemptAt: 9000000000000, error: 'private transport detail' });
      }
    }
    expect((await (await fetch(url)).json() as CommentSyncState).backfill).toBeUndefined();
    const fileUrl = `${url}?filePath=a.html`;
    const state = await (await fetch(fileUrl)).json() as CommentSyncState;
    expect(state.backfill).toMatchObject({ state: 'failed', filePath: 'a.html', retryable: true });
    expect(JSON.stringify(state)).not.toContain('private transport detail');
    expect((await fetch(`${url}?filePath=`, { method: 'POST' })).status).toBe(400);
    const untouched = db.prepare("SELECT * FROM comment_relay_outbox WHERE comment_id!='a.html'").all();
    const base = `http://127.0.0.1:${address.port}`;
    const run = (action: string) => promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
      fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'comment', action, 'p', '--file', 'a.html', '--daemon-url', base, '--json',
    ], { env: { ...process.env, NODE_OPTIONS: '' }, timeout: 15000 });
    expect(JSON.parse((await run('sync-state')).stdout).backfill).toEqual(state.backfill);
    expect(JSON.parse((await run('retry-backfill')).stdout).backfill.state).toBe('failed');
    expect(queue.listDue(Date.now()).filter(row => row.projectId === 'p' && row.workspaceId === 'w' && row.workspaceMemberId === 'm').map(row => row.commentId)).toEqual(['a.html']);
    expect(db.prepare("SELECT * FROM comment_relay_outbox WHERE comment_id!='a.html'").all()).toEqual(untouched);
    queue.acknowledge(queue.listDue(Date.now()).find(row => row.commentId === 'a.html')!, 'delivered');
    expect(await (await fetch(fileUrl)).json()).toMatchObject({ backfill: { state: 'succeeded' } });
    expect(await (await fetch(`${url}?filePath=b.html`)).json()).toMatchObject({ backfill: { state: 'failed' } });
    fail = true; expect((await fetch(url)).status).toBe(503);
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    closeDatabase(); rmSync(root, { recursive: true, force: true });
  }
});
