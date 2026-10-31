import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { ensureWorkspaceArtifactForPath } from '../src/chat-artifacts/store.js';
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { registerCommentAlignmentRoutes } from '../src/routes/project/comments.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { updateProject, upsertPreviewComment, closeDatabase, ensureWorkspaceProject, insertProject, insertConversation, openDatabase, mergeSyncedPreviewComment } from '../src/db.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createCommentAlignmentService, exportCommentAlignment, parseCommentAlignmentResult, runVelaCommentAlignment } from '../src/collab/comment-alignment.js';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });
const context: WorkspaceCollabContext = {
  workspaceId: 'w', workspaceMemberId: 'm', workspaceType: 'team', teamId: 'w', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
function setup() {
  root = mkdtempSync(join(tmpdir(), 'od-align-'));
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
  ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'team', createdByWorkspaceMemberId: 'm' });
  insertConversation(db, { id: 'local', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
  return db;
}
const comments = ['member', 'user'].map((authorKind, i) => ({
  id: `c${i}`, conversationId: 'remote', filePath: 'pages/source.html', elementId: 'heading', selector: '#heading', label: 'Heading',
  note: `note${i}`, text: '', htmlHint: '', position: { x: 1.2, y: 2.7, width: 3, height: 4 },
  status: i ? 'resolved' : 'open', authorKind, createdAt: 1, updatedAt: 2,
  attachments: [{ id: `attachment-${i}`, name: 'display ignored', path: `local-${i}.png` }],
}));

it.each([false, true])('exports actual merged rows; deliberately lost merge is diverged (drop=%s)', async drop => {
  const db = setup(); let pulls = 0; let compares = 0;
  const cloud = createCollabCloudService({
    client: createVelaCliCollabClient({ run: async () => { pulls++; return JSON.stringify({ comments, latestSeq: 2, etag: 'v2' }); } }),
    listProjectIds: () => [], resolveLocalConversationId: () => 'local',
    mergeComment: ({ projectId, conversationId, comment }) => drop && comment.id === 'c1'
      ? 'unchanged' : mergeSyncedPreviewComment(db, projectId, conversationId, comment),
  });
  const alignment = createCommentAlignmentService({ db,
    readCursor: (projectId, ctx) => cloud.readMergedCommentCursor(projectId, ctx),
    compare: async (_project, _context, request) => {
      compares++;
      expect(request.expectedLatestSeq).toBe(2);
      // Independent fixture oracle: an equal cursor must not hide a missing row.
      const intact = request.comments.length === 2 && request.comments.some(row => row.id === 'c1' && row.authorKind === 'user' && row.status === 'resolved');
      return { state: intact ? 'aligned' : 'diverged', latestSeq: 2 };
    },
  });
  expect(alignment.read({ projectId: 'p', workspaceId: 'w', workspaceMemberId: 'm' })).toBeUndefined();
  expect(await alignment.check('p', context)).toEqual({ state: 'unknown', reason: 'unavailable' });
  expect(compares).toBe(0);
  expect(await cloud.pullProject('p', context)).toBe(true);
  const before = db.prepare('SELECT * FROM preview_comments ORDER BY id').all();
  expect(await alignment.check('p', context)).toEqual({ state: drop ? 'diverged' : 'aligned', latestSeq: 2 });
  expect(pulls).toBe(1); expect(compares).toBe(1);
  expect(db.prepare('SELECT * FROM preview_comments ORDER BY id').all()).toEqual(before);
  const rows = exportCommentAlignment(db, 'p', context);
  expect(Object.keys(rows[0]!)).toHaveLength(16);
  expect(rows[0]).toMatchObject({ position: { x: 1, y: 3, width: 3, height: 4 }, attachments: [{ id: 'attachment-0', name: '' }], filePath: 'pages/source.html' });
  expect(rows[0]).not.toHaveProperty('authorDisplayName');
  expect(alignment.read({ projectId: 'p', workspaceId: 'w', workspaceMemberId: 'other' })).toBeUndefined();
  cloud.dispose();
});

it('invalidates in-flight or later local changes rather than caching aligned', async () => {
  const db = setup();
  const alignment = createCommentAlignmentService({ db, readCursor: () => 0, compare: async () => {
    mergeSyncedPreviewComment(db, 'p', 'local', { ...comments[0]!, authorKind: 'member', status: 'open', projectId: 'p', memberId: 'm', seq: 1 });
    return { state: 'aligned', latestSeq: 0 };
  } });
  expect(await alignment.check('p', context)).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
});

it('legacy path-only attachments are unknown, not fabricated cloud ids', async () => {
  const db = setup();
  mergeSyncedPreviewComment(db, 'p', 'local', { ...comments[0]!, authorKind: 'member', status: 'open', projectId: 'p', memberId: 'm', seq: 1, attachments: [{ path: 'local.png', name: 'N' }] });
  let calls = 0;
  const alignment = createCommentAlignmentService({ db, readCursor: () => 1, compare: async () => { calls++; return { state: 'aligned', latestSeq: 1 }; } });
  expect(await alignment.check('p', context)).toEqual({ state: 'unknown', reason: 'unavailable' }); expect(calls).toBe(0);
});

it.each(['{}', 'not-json', '{"state":"aligned"}', '{"state":"unknown"}', '{"state":"aligned","latestSeq":-1}'])('does not treat exit0 or malformed output as aligned: %s', output => {
  expect(parseCommentAlignmentResult(output)).toEqual({ state: 'unknown', reason: 'unavailable' });
});
it.each(['history_incomplete', 'snapshot_changed', 'unavailable'])('preserves unknown reason %s', reason => {
  expect(parseCommentAlignmentResult(JSON.stringify({ state: 'unknown', reason, latestSeq: 5 }))).toEqual({ state: 'unknown', reason, latestSeq: 5 });
});
it('guards HTTP by project Owner and the real od CLI uses the same read-only action', async () => {
  const db = setup();
  ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'team', createdByWorkspaceMemberId: 'm' });
  const app = express(); const server = createServer(app); let calls = 0;
  let current = context;
  registerCommentAlignmentRoutes(app, { db, authorize: async () => ({ ok: true, context: current }), alignment: {
    check: async () => { calls++; return { state: 'unknown', reason: 'history_incomplete', latestSeq: 3 }; },
  } });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('listen failed');
    const base = `http://127.0.0.1:${address.port}`;
    current = { ...context, workspaceMemberId: 'other' };
    expect((await fetch(`${base}/api/projects/p/comments/align`, { method: 'POST' })).status).toBe(403);
    expect(calls).toBe(0); current = context;
    const response = await fetch(`${base}/api/projects/p/comments/align`, { method: 'POST' });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ state: 'unknown', reason: 'history_incomplete', latestSeq: 3 });
    const { stdout } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
      fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
      'comment', 'align', 'p', '--daemon-url', base, '--json',
    ], { env: { ...process.env, NODE_OPTIONS: '' }, timeout: 15000 });
    expect(JSON.parse(stdout)).toEqual({ state: 'unknown', reason: 'history_incomplete', latestSeq: 3 });
    expect(calls).toBe(2);
    current = { ...context, workspaceMemberId: 'other' };
    await expect(promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
      fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
      'comment', 'align', 'p', '--daemon-url', base, '--json',
    ], { env: { ...process.env, NODE_OPTIONS: '' }, timeout: 15000 })).rejects.toMatchObject({
      stderr: expect.stringContaining('"code":"comment-align-rejected"'),
    });
    expect(calls).toBe(2);
  } finally { if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('writes the actual request to a private file for the pinned CLI, reads state and cleans up', async () => {
  setup(); let file = '';
  const result = await runVelaCommentAlignment({ projectId: 'p', workspaceId: 'w', dataRoot: root!, request: { comments: [], expectedLatestSeq: 4 },
    session: { profile: 'test', apiUrl: 'https://example.invalid', controlKey: 'test-only', user: null, configMtimeMs: null } }, async input => {
    expect(input.args.slice(0, 5)).toEqual(['collab', 'comment', 'align', 'p', '--comment-file']);
    file = input.args[5]!;
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ comments: [], expectedLatestSeq: 4 });
    return '{"state":"diverged","latestSeq":4}';
  });
  expect(result).toEqual({ state: 'diverged', latestSeq: 4 }); expect(existsSync(file)).toBe(false);
});

it.each(['personal', 'team'] as const)('4046 filters personal project payloads in %s workspaces and fences stop/resume', async workspaceType => {
  const db = setup();
  db.prepare("UPDATE workspace_projects SET visibility = 'personal' WHERE project_id = 'p'").run();
  const ctx = { ...context, workspaceType };
  const publications = createSqlitePublicFilePublicationStore(db);
  const scope = { resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath: 'a.html' };
  const publication = { slug: 'a', url: null, fileName: 'a.html' };
  publications.set(scope, publication);
  publications.set({ ...scope, filePath: 'c.html' }, { ...publication, slug: 'c' });
  for (const filePath of ['a.html', 'b.html', 'c.html']) {
    mergeSyncedPreviewComment(db, 'p', 'local', { ...comments[0]!, id: filePath, filePath,
      note: `private body ${filePath}`, htmlHint: `<p>${filePath}</p>`,
      authorKind: 'member', status: 'open', projectId: 'p', memberId: 'm', seq: 1 });
  }
  let sent: string[] = [];
  let duringCompare = () => {};
  const alignment = createCommentAlignmentService({ db, readCursor: () => 1, compare: async (_project, _context, request) => {
    sent = request.comments.map(comment => comment.filePath);
    expect(JSON.stringify(request)).not.toContain('b.html');
    duringCompare();
    return { state: 'aligned', latestSeq: 1 };
  } });
  expect((await alignment.check('p', ctx)).state).toBe('aligned');
  expect(sent).toEqual(['a.html', 'c.html']);
  publications.delete(scope);
  expect(alignment.read({ projectId: 'p', workspaceId: 'w', workspaceMemberId: 'm' })).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
  expect((await alignment.check('p', ctx)).state).toBe('aligned');
  expect(sent).toEqual(['c.html']);
  publications.set(scope, publication);
  expect((await alignment.check('p', ctx)).state).toBe('aligned');
  expect(sent).toEqual(['a.html', 'c.html']);
  duringCompare = () => { publications.delete(scope); publications.set(scope, publication); };
  expect(await alignment.check('p', ctx)).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
  duringCompare = () => publications.delete(scope);
  expect(await alignment.check('p', ctx)).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
  publications.delete({ ...scope, filePath: 'c.html' });
  sent = [];
  expect(await alignment.check('p', ctx)).toEqual({ state: 'unknown', reason: 'unavailable' });
  expect(sent).toEqual([]);
});

it('4046 excludes unshared invalid attachments before projection and rejects foreign identity', async () => {
  const db = setup();
  db.prepare("UPDATE workspace_projects SET visibility = 'personal' WHERE project_id = 'p'").run();
  const publications = createSqlitePublicFilePublicationStore(db);
  publications.set({ resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath: 'a.html' }, { slug: 'a', url: null, fileName: 'a.html' });
  mergeSyncedPreviewComment(db, 'p', 'local', { ...comments[0]!, filePath: 'b.html', authorKind: 'member', status: 'open',
    projectId: 'p', memberId: 'm', seq: 1, attachments: [{ path: 'never-upload.png', name: 'private' }] });
  let calls = 0;
  const alignment = createCommentAlignmentService({ db, readCursor: () => 1, compare: async (_project, _context, request) => {
    calls++; expect(request.comments).toEqual([]); return { state: 'aligned', latestSeq: 1 };
  } });
  expect((await alignment.check('p', context)).state).toBe('aligned');
  for (const ctx of [{ ...context, workspaceId: 'foreign' }, { ...context, workspaceMemberId: 'foreign' }, { ...context, memberStatus: 'removed' as const }]) {
    expect(await alignment.check('p', ctx)).toEqual({ state: 'unknown', reason: 'unavailable' });
  }
  expect(calls).toBe(1);
  expect((await alignment.check('p', context)).state).toBe('aligned');
  db.prepare("UPDATE workspace_projects SET created_by_workspace_member_id = 'other' WHERE project_id = 'p'").run();
  expect(alignment.read({ projectId: 'p', workspaceId: 'w', workspaceMemberId: 'm' })).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
});

it('4046 same-path identity replacement invalidates alignment and excludes unadmitted replacement comments', async () => {
  const db = setup();
  db.prepare("UPDATE workspace_projects SET visibility = 'personal' WHERE project_id = 'p'").run();
  const publications = createSqlitePublicFilePublicationStore(db);
  publications.set({ resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath: 'a.html' }, { slug: 'a', url: null, fileName: 'a.html' });
  const sourceFileId = '11111111-1111-4111-8111-111111111111';
  const fact = { sourceFileId, sourceFilePath: 'a.html', entryPath: 'index.html', resourceId: 'r', versionId: 'v', retired: false };
  updateProject(db, 'p', { metadata: { _commentFiles: { schemaVersion: 1, revision: 1, files: [fact] } } });
  mergeSyncedPreviewComment(db, 'p', 'local', { ...comments[0]!, sourceFileId, sourceFilePath: 'a.html', filePath: 'a.html',
    authorKind: 'member', status: 'open', projectId: 'p', memberId: 'm', seq: 1 });
  const alignment = createCommentAlignmentService({ db, readCursor: () => 1, compare: async () => ({ state: 'aligned', latestSeq: 1 }) });
  expect(exportCommentAlignment(db, 'p', context)).toHaveLength(1);
  await alignment.check('p', context);
  updateProject(db, 'p', { metadata: { _commentFiles: { schemaVersion: 1, revision: 2, files: [{ ...fact, retired: true }] } } });
  const replacement = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'a.html', kind: 'html' });
  upsertPreviewComment(db, 'p', 'local', { sourceFileId: replacement.id, note: 'unpublished replacement',
    target: { filePath: 'a.html', elementId: 'new', selector: '#new', label: 'New', position: { x: 0, y: 0, width: 1, height: 1 } } });
  expect(exportCommentAlignment(db, 'p', context)).toEqual([]);
  expect(alignment.read({ projectId: 'p', workspaceId: 'w', workspaceMemberId: 'm' })).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
});

it('4046 rechecks publication scope after async serialization before invoking the CLI', async () => {
  const db = setup();
  db.prepare("UPDATE workspace_projects SET visibility = 'personal' WHERE project_id = 'p'").run();
  const publications = createSqlitePublicFilePublicationStore(db);
  const scope = { resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath: 'a.html' };
  publications.set(scope, { slug: 'a', url: null, fileName: 'a.html' });
  let calls = 0;
  const alignment = createCommentAlignmentService({ db, readCursor: () => 1,
    compare: async (projectId, ctx, request, isCurrent) => {
      const pending = runVelaCommentAlignment({ projectId, workspaceId: ctx.workspaceId, request, dataRoot: root!, isCurrent,
        session: { profile: 'test', apiUrl: 'https://example.invalid', controlKey: 'test-only', user: null, configMtimeMs: null } },
      async () => { calls++; return '{"state":"aligned","latestSeq":1}'; });
      publications.delete(scope);
      return pending;
    },
  });
  expect(await alignment.check('p', context)).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
  expect(calls).toBe(0);
});

it('4046 fences scope changes during pinned CLI setup before spawning the transport', async () => {
  const db = setup();
  db.prepare("UPDATE workspace_projects SET visibility = 'personal' WHERE project_id = 'p'").run();
  const publications = createSqlitePublicFilePublicationStore(db);
  const scope = { resourceTeamId: 'w', ownerMemberId: 'm', projectId: 'p', filePath: 'a.html' };
  publications.set(scope, { slug: 'a', url: null, fileName: 'a.html' });
  let transportCalls = 0;
  const alignment = createCommentAlignmentService({ db, readCursor: () => 1,
    compare: (projectId, ctx, request, isCurrent) => runVelaCommentAlignment({
      projectId, workspaceId: ctx.workspaceId, request, dataRoot: root!, isCurrent,
      session: { profile: 'test', apiUrl: 'https://example.invalid', controlKey: 'fixture', user: null, configMtimeMs: null },
    }, async input => {
      const pending = runPinnedVelaCommand(input, async () => { transportCalls++; return '{"state":"aligned","latestSeq":1}'; });
      publications.delete(scope);
      return pending;
    }),
  });
  expect(await alignment.check('p', context)).toEqual({ state: 'unknown', reason: 'snapshot_changed' });
  expect(transportCalls).toBe(0);
});
