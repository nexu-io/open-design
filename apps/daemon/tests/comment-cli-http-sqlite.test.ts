import { captureJsonBodySize } from '../src/http/json-body-size.js';
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  SHARE_COMMENT_MAX_BYTES,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  closeDatabase,
  deletePreviewComment,
  ensureWorkspaceProject,
  getConversation,
  getProjectCommentReadState,
  getPreviewComment,
  getProjectPreviewComment,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertConversation,
  insertProject,
  listPreviewComments,
  listProjectPreviewComments,
  openDatabase,
  reorderPreviewComment,
  updatePreviewCommentAnchor,
  updatePreviewCommentStatus,
  updateProject,
  upsertPreviewComment,
} from '../src/db.js';
import { enforceWorkspaceResourceMutation } from '../src/collab/workspace-resource-mutation.js';
import { verifyWorkspaceRequestContext } from '../src/collab/request-workspace-context.js';
import { registerProjectCommentRoutes } from '../src/routes/project/comments.js';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
const PROJECT = 'project-cli-sqlite';
const CONVERSATION = 'conversation-cli-sqlite';
const WORKSPACE = 'workspace-cli-sqlite';
const OWNER = 'member-owner';
const OTHER = 'member-other';
const target = {
  filePath: 'index.html', elementId: 'headline', selector: '#headline',
  label: 'Headline', text: 'Hello', htmlHint: '<h1>Hello</h1>',
  position: { x: 1, y: 2, width: 3, height: 4 },
};

let server: http.Server | null = null;
let tempRoot = '';
let db: ReturnType<typeof openDatabase> | null = null;
let requestAudit: Array<{ method: string; path: string; body: unknown }> = [];

function context(memberId: string): WorkspaceCollabContext {
  return {
    workspaceId: WORKSPACE, workspaceType: 'team', workspaceMemberId: memberId,
    role: memberId === OWNER ? 'owner' : 'member', memberStatus: 'active', lifecycleState: 'active',
    billingState: 'active', planId: null, providerMode: 'platform_credits', teamId: WORKSPACE,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: memberId === OWNER ? 'owner' : 'member', lifecycleState: 'active' }),
  };
}

function headers(memberId: string) {
  return ['--workspace', WORKSPACE, '--workspace-member', memberId];
}

async function runCli(args: string[]) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT, env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number | null; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
  }
}

function runCliWithStdin(args: string[], input: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function startRouteServer() {
  tempRoot = mkdtempSync(join(tmpdir(), 'od-comment-cli-sqlite-'));
  db = openDatabase(tempRoot);
  insertProject(db, { id: PROJECT, name: 'CLI SQLite', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: CONVERSATION, projectId: PROJECT, title: 'CLI', createdAt: 1, updatedAt: 1 });
  ensureWorkspaceProject(db, { projectId: PROJECT, workspaceId: WORKSPACE, visibility: 'team', createdByWorkspaceMemberId: OWNER });
  const app = express();
  requestAudit = [];
  app.use(express.json({ limit: '4mb', verify: captureJsonBodySize }));
  app.use((req, _res, next) => {
    requestAudit.push({ method: req.method, path: req.path, body: req.body });
    next();
  });
  registerProjectCommentRoutes(app, {
    db,
    projectStore: { updateProject, getWorkspaceProject, getWorkspaceProjectByProjectId } as any,
    conversations: {
      getConversation, listPreviewComments, listProjectPreviewComments, upsertPreviewComment,
      getPreviewComment, getProjectPreviewComment, updatePreviewCommentStatus,
      updatePreviewCommentAnchor, deletePreviewComment, reorderPreviewComment,
    } as any,
    sendApiError: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
    enforceWorkspaceProjectMutation: async (req, res, sendError, getWorkspace, getWorkspaceByProjectId, database, projectId, capability) =>
      enforceWorkspaceResourceMutation('project', req, res, sendError, getWorkspace, getWorkspaceByProjectId, database, projectId, capability),
    resolveWorkspaceContext: (req) => verifyWorkspaceRequestContext({
      req,
      fetchWorkspaceDirectory: async () => ({ ok: true as const, items: [
        { workspaceId: WORKSPACE, workspaceName: 'CLI SQLite', workspaceType: 'team' as const, workspaceMemberId: OWNER, role: 'owner' as const, memberStatus: 'active' as const, lifecycleState: 'active' as const },
        { workspaceId: WORKSPACE, workspaceName: 'CLI SQLite', workspaceType: 'team' as const, workspaceMemberId: OTHER, role: 'member' as const, memberStatus: 'active' as const, lifecycleState: 'active' as const },
      ] }),
    }),
  });
  server = http.createServer(app);
  await new Promise<void>((resolveListen) => server!.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('route server did not bind');
  return 'http://127.0.0.1:' + address.port;
}

afterEach(async () => {
  if (server) await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
  server = null;
  closeDatabase(); db = null;
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

describe('od comment CLI HTTP/SQLite route integration', () => {
  it('persists the create/list/update/status/delete lifecycle through production CLI and comment routes', async () => {
    const base = await startRouteServer();
    const common = [...headers(OWNER), '--daemon-url', base, '--json'];
    const create = await runCli(['comment', 'create', PROJECT, CONVERSATION, '--target', JSON.stringify(target), '--prompt', 'created', ...common]);
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout).comment as { id: string };
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)).toMatchObject({ note: 'created', status: 'open', authorMemberId: OWNER });

    const list = await runCli(['comment', 'list', PROJECT, CONVERSATION, ...common]);
    expect(list.code).toBe(0);
    expect(JSON.parse(list.stdout).comments).toEqual([expect.objectContaining({ id: created.id, note: 'created' })]);

    const update = await runCli(['comment', 'update', PROJECT, CONVERSATION, created.id, '--target', JSON.stringify(target), '--prompt', 'updated', ...common]);
    expect(update.code).toBe(0);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)?.note).toBe('updated');

    const status = await runCli(['comment', 'status', PROJECT, CONVERSATION, created.id, '--status', 'resolved', ...common]);
    expect(status.code).toBe(0);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)?.status).toBe('resolved');

    const deleted = await runCli(['comment', 'delete', PROJECT, CONVERSATION, created.id, ...common]);
    expect(deleted.code).toBe(0);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)).toBeNull();
  });

  it('acknowledges only displayed file rows through CLI, HTTP and SQLite', async () => {
    const base = await startRouteServer();
    const common = [...headers(OWNER), '--daemon-url', base, '--json'];
    const ids: string[] = [];
    for (const filePath of ['index.html', 'other.html']) {
      const created = await runCli(['comment', 'create', PROJECT, CONVERSATION,
        '--target', JSON.stringify({ ...target, filePath }), '--prompt', 'Review', ...common]);
      expect(created.code).toBe(0);
      ids.push(JSON.parse(created.stdout).comment.id);
    }
    const read = await runCli(['comment', 'read', PROJECT, '--file', 'index.html', '--comment-ids', ids.join(','), ...common]);
    expect(read.code).toBe(0);
    expect(JSON.parse(read.stdout)).toEqual({ projectId: PROJECT, filePath: 'index.html', seenCommentIds: [ids[0]] });
    const other = await runCli(['comment', 'read', PROJECT, '--file', 'index.html', '--comment-ids', '', ...headers(OTHER), '--daemon-url', base, '--json']);
    expect(other.code).toBe(0);
    expect(JSON.parse(other.stdout).seenCommentIds).toEqual([]);
    const invalid = await runCli(['comment', 'read', PROJECT, '--file', 'index.html', '--comment-ids', ids[0]!, '--workspace', WORKSPACE, '--workspace-member', 'unknown', '--daemon-url', base, '--json']);
    expect(invalid.code).not.toBe(0);
  });

  it('persists CLI read markers through the production route with clamp, isolation, and reopen durability', async () => {
    const base = await startRouteServer();
    const common = ['--daemon-url', base, '--json'];
    const ownerScope = `${WORKSPACE}:${OWNER}`;
    const otherScope = `${WORKSPACE}:${OTHER}`;
    const suppliedReadAt = Date.now() - 10_000;

    const initial = await runCli(['comment', 'read', PROJECT, '--read-at', String(suppliedReadAt), ...headers(OWNER), ...common]);
    expect(initial.code).toBe(0);
    expect(JSON.parse(initial.stdout)).toEqual({ projectId: PROJECT, lastReadAt: suppliedReadAt });
    expect(requestAudit).toEqual([{ method: 'PUT', path: `/api/projects/${PROJECT}/comments/read`, body: { readAt: suppliedReadAt } }]);
    expect(getProjectCommentReadState(db!, PROJECT, ownerScope)).toEqual({ projectId: PROJECT, lastReadAt: suppliedReadAt });

    const futureReadAt = Date.now() + 60_000;
    const clampStartedAt = Date.now();
    const clamped = await runCli(['comment', 'read', PROJECT, '--read-at', String(futureReadAt), ...headers(OWNER), ...common]);
    const clampFinishedAt = Date.now();
    expect(clamped.code).toBe(0);
    const clampedState = JSON.parse(clamped.stdout) as { projectId: string; lastReadAt: number };
    expect(clampedState.projectId).toBe(PROJECT);
    expect(clampedState.lastReadAt).toBeGreaterThanOrEqual(clampStartedAt);
    expect(clampedState.lastReadAt).toBeLessThanOrEqual(clampFinishedAt);
    expect(clampedState.lastReadAt).toBeLessThan(futureReadAt);

    const lower = await runCli(['comment', 'read', PROJECT, '--read-at', String(suppliedReadAt), ...headers(OWNER), ...common]);
    expect(lower.code).toBe(0);
    expect(JSON.parse(lower.stdout)).toEqual(clampedState);

    const other = await runCli(['comment', 'read', PROJECT, '--read-at', String(suppliedReadAt), ...headers(OTHER), ...common]);
    expect(other.code).toBe(0);
    expect(JSON.parse(other.stdout)).toEqual({ projectId: PROJECT, lastReadAt: suppliedReadAt });
    expect(getProjectCommentReadState(db!, PROJECT, ownerScope)).toEqual(clampedState);
    expect(getProjectCommentReadState(db!, PROJECT, otherScope)).toEqual({ projectId: PROJECT, lastReadAt: suppliedReadAt });

    const auditBeforeFailures = requestAudit.length;
    const unauthorized = await runCli(['comment', 'read', PROJECT, '--read-at', String(futureReadAt), ...headers('member-intruder'), ...common]);
    expect(unauthorized.code).not.toBe(0);
    expect(requestAudit).toHaveLength(auditBeforeFailures + 1);
    const invalid = await runCli(['comment', 'read', PROJECT, '--read-at', 'not-a-number', ...headers(OWNER), ...common]);
    expect(invalid.code).toBe(2);
    expect(requestAudit).toHaveLength(auditBeforeFailures + 1);
    expect(getProjectCommentReadState(db!, PROJECT, ownerScope)).toEqual(clampedState);

    closeDatabase();
    db = openDatabase(tempRoot);
    expect(getProjectCommentReadState(db, PROJECT, ownerScope)).toEqual(clampedState);
    expect(getProjectCommentReadState(db, PROJECT, otherScope)).toEqual({ projectId: PROJECT, lastReadAt: suppliedReadAt });
  });

  it('passes long multibyte prompt files and stdin through the route into SQLite', async () => {
    const base = await startRouteServer();
    const common = [...headers(OWNER), '--daemon-url', base, '--json'];
    const fileNote = '评论内容'.repeat(1_500);
    const promptPath = join(tempRoot, 'long.txt');
    writeFileSync(promptPath, fileNote, 'utf8');
    const fromFile = await runCli(['comment', 'create', PROJECT, CONVERSATION, '--target', JSON.stringify(target), '--prompt-file', promptPath, ...common]);
    expect(fromFile.code).toBe(0);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, JSON.parse(fromFile.stdout).comment.id)?.note).toBe(fileNote);

    const stdinNote = '第一行\n第二行评论\n第三行';
    const fromStdin = await runCliWithStdin(['comment', 'create', PROJECT, CONVERSATION, '--target', JSON.stringify(target), '--prompt-file', '-', ...common], stdinNote);
    expect(fromStdin.code).toBe(0);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, JSON.parse(fromStdin.stdout).comment.id)?.note).toBe(stdinNote);
  });

  it('OPEND-3661 rejects a complete JSON body over 64 KiB before SQLite or relay writes', async () => {
    const base = await startRouteServer();
    const url = `${base}/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`;
    const payload = { target, note: '中文😀\n' };
    const emptyBytes = Buffer.byteLength(JSON.stringify(payload));
    payload.note += 'x'.repeat(SHARE_COMMENT_MAX_BYTES - emptyBytes);
    const send = (body: string) => fetch(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-od-workspace-id': WORKSPACE,
      'x-od-workspace-member-id': OWNER,
    }, body });
    expect(Buffer.byteLength(JSON.stringify(payload))).toBe(SHARE_COMMENT_MAX_BYTES);
    expect((await send(JSON.stringify(payload))).status).toBe(200);
    const before = listPreviewComments(db!, PROJECT, CONVERSATION);
    const rejected = await send(JSON.stringify({ ...payload, note: payload.note + 'x' }));
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(listPreviewComments(db!, PROJECT, CONVERSATION)).toEqual(before);
    // Whitespace is part of the transport ceiling even though parsing drops it.
    expect((await send(JSON.stringify(payload) + ' ')).status).toBe(413);
    expect(listPreviewComments(db!, PROJECT, CONVERSATION)).toEqual(before);
  });

  it('accepts exactly the server byte ceiling and rejects one UTF-8 byte over it through CLI, HTTP, and SQLite', async () => {
    const base = await startRouteServer();
    const common = [...headers(OWNER), '--daemon-url', base, '--json'];
    const sizedNote = (extra: Record<string, unknown>, prefix: string) => {
      const overhead = Buffer.byteLength(JSON.stringify({ target, ...extra, note: prefix }));
      return prefix + 'a'.repeat(SHARE_COMMENT_MAX_BYTES - overhead);
    };
    const exactNote = sizedNote({}, '评论😀\n');
    // Updates include the persisted UUID in the request envelope.
    const oversizedNote = exactNote + 'b';
    expect(Buffer.byteLength(JSON.stringify({ target, note: exactNote }))).toBe(SHARE_COMMENT_MAX_BYTES);
    expect(Buffer.byteLength(JSON.stringify({ target, note: oversizedNote }))).toBe(SHARE_COMMENT_MAX_BYTES + 1);

    const exactPath = join(tempRoot, 'exact-limit.txt');
    const exactUpdatePath = join(tempRoot, 'exact-update-limit.txt');
    const oversizedPath = join(tempRoot, 'one-byte-over-limit.txt');
    writeFileSync(exactPath, exactNote, 'utf8');
    writeFileSync(oversizedPath, oversizedNote, 'utf8');

    const create = await runCli(['comment', 'create', PROJECT, CONVERSATION, '--target', JSON.stringify(target), '--prompt-file', exactPath, ...common]);
    expect(create.code).toBe(0);
    const created = listPreviewComments(db!, PROJECT, CONVERSATION)[0]!;
    expect(created).toMatchObject({
      note: exactNote, status: 'open', authorMemberId: OWNER,
    });

    const beforeRejectedCreate = getPreviewComment(db!, PROJECT, CONVERSATION, created.id);
    expect(beforeRejectedCreate).not.toBeNull();
    const auditBeforeRejectedCreate = requestAudit.length;
    const rejectedCreate = await runCli(['comment', 'create', PROJECT, CONVERSATION, '--target', JSON.stringify(target), '--prompt-file', oversizedPath, ...common]);
    expect(rejectedCreate.code).not.toBe(0);
    const rejectedCreateError = JSON.parse(rejectedCreate.stderr);
    expect(rejectedCreateError).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(rejectedCreateError).not.toMatchObject({ error: { code: 'INVALID_COMMENT' } });
    expect(requestAudit).toHaveLength(auditBeforeRejectedCreate + 1);
    expect(requestAudit[auditBeforeRejectedCreate]).toMatchObject({
      method: 'POST',
      path: `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      body: { note: oversizedNote },
    });
    expect(listPreviewComments(db!, PROJECT, CONVERSATION)).toHaveLength(1);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)).toEqual(beforeRejectedCreate);

    const exactUpdateNote = sizedNote({ id: created.id }, '更新😀\n');
    writeFileSync(exactUpdatePath, exactUpdateNote, 'utf8');
    const update = await runCli(['comment', 'update', PROJECT, CONVERSATION, created.id, '--target', JSON.stringify(target), '--prompt-file', exactUpdatePath, ...common]);
    expect(update.code).toBe(0);
    const status = await runCli(['comment', 'status', PROJECT, CONVERSATION, created.id, '--status', 'resolved', ...common]);
    expect(status.code).toBe(0);
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)).toMatchObject({
      note: exactUpdateNote, status: 'resolved', authorMemberId: OWNER,
    });

    const beforeRejectedUpdate = getPreviewComment(db!, PROJECT, CONVERSATION, created.id);
    expect(beforeRejectedUpdate).not.toBeNull();
    const auditBeforeRejectedUpdate = requestAudit.length;
    const rejectedUpdate = await runCli(['comment', 'update', PROJECT, CONVERSATION, created.id, '--target', JSON.stringify(target), '--prompt-file', oversizedPath, ...common]);
    expect(rejectedUpdate.code).not.toBe(0);
    const rejectedUpdateError = JSON.parse(rejectedUpdate.stderr);
    expect(rejectedUpdateError).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(rejectedUpdateError).not.toMatchObject({ error: { code: 'INVALID_COMMENT' } });
    expect(requestAudit).toHaveLength(auditBeforeRejectedUpdate + 1);
    expect(requestAudit[auditBeforeRejectedUpdate]).toMatchObject({
      method: 'POST',
      path: `/api/projects/${PROJECT}/conversations/${CONVERSATION}/comments`,
      body: { id: created.id, note: oversizedNote },
    });
    expect(getPreviewComment(db!, PROJECT, CONVERSATION, created.id)).toEqual(beforeRejectedUpdate);
  });

  it('rejects unauthorized and invalid CLI writes without mutation', async () => {
    const base = await startRouteServer();
    const unauthorized = await runCli(['comment', 'create', PROJECT, CONVERSATION, '--target', JSON.stringify(target), '--prompt', 'denied', ...headers('member-intruder'), '--daemon-url', base, '--json']);
    expect(unauthorized.code).not.toBe(0);
    expect(listPreviewComments(db!, PROJECT, CONVERSATION)).toEqual([]);

    const invalid = await runCli(['comment', 'create', PROJECT, CONVERSATION, '--target', '{bad', '--prompt', 'never sent', ...headers(OWNER), '--daemon-url', base]);
    expect(invalid.code).toBe(2);
    expect(listPreviewComments(db!, PROJECT, CONVERSATION)).toEqual([]);
  });
});
