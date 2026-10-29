// P0-24 N10 (register item A-06): the global run-notice feed.
//
// The classifier decides which terminal runs the user hears about wherever
// they are; the log never replays history; the route hides every notice the
// caller's Workspace identity cannot read.

import http from 'node:http';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  openDatabase,
} from '../src/db.js';
import { registerRunRoutes } from '../src/routes/runs.js';
import { connectorService } from '../src/connectors/service.js';
import { createAuthorizeProjectRequest } from '../src/collab/project-request-authority.js';
import {
  classifyRunNotice,
  composeRunTerminalHooks,
  createRunNoticeLog,
} from '../src/runtimes/run-notices.js';

const QUESTION_FORM = '<question-form id="brief" title="Brief">\n{"questions":[{"id":"tone","label":"Tone","type":"text"}]}\n</question-form>';
const textEvents = (text: string) => [{ event: 'agent', data: { type: 'text_delta', delta: text } }];

describe('classifyRunNotice', () => {
  it('names a failure, a question and a finished reply; a stop produces nothing', () => {
    expect(classifyRunNotice({ projectId: 'p', events: [] }, 'failed')).toBe('failed');
    expect(classifyRunNotice({ projectId: 'p', events: textEvents(QUESTION_FORM) }, 'succeeded')).toBe('awaiting_input');
    expect(classifyRunNotice({ projectId: 'p', events: textEvents('Done.') }, 'succeeded')).toBe('new_reply');
    expect(classifyRunNotice({ projectId: 'p', events: [] }, 'canceled')).toBeNull();
  });

  it('an OD Next segment the daemon continues is not news; the final answer and a blocked task are', () => {
    const continuing = { projectId: 'p', events: [], strategyTask: { terminal: false, nextRunId: 'run-2' } };
    expect(classifyRunNotice(continuing, 'succeeded')).toBeNull();
    const finalAnswer = { projectId: 'p', events: [], strategyTask: { terminal: true } };
    expect(classifyRunNotice(finalAnswer, 'succeeded')).toBe('new_reply');
    // A failed segment is a failed turn even if a successor was planned (N13 ④).
    expect(classifyRunNotice(continuing, 'failed')).toBe('failed');
  });

  it('a run without a project cannot be opened and produces nothing', () => {
    expect(classifyRunNotice({ events: [] }, 'failed')).toBeNull();
  });
});

describe('createRunNoticeLog', () => {
  it('appends with increasing seq and reads only what comes after', async () => {
    const log = createRunNoticeLog({ projectName: (id) => `Name ${id}`, startedAt: 0 });
    log.record({ id: 'r1', projectId: 'a', conversationId: 'c1', events: [] }, 'failed', 10);
    log.record({ id: 'r2', projectId: 'b', conversationId: 'c2', events: [] }, 'succeeded', 20);
    log.record({ id: 'r3', projectId: 'b', events: [] }, 'canceled', 30);
    const all = await log.read(0);
    expect(all.latestSeq).toBe(2);
    expect(all.notices.map((n) => [n.seq, n.runId, n.kind, n.projectName])).toEqual([
      [1, 'r1', 'failed', 'Name a'],
      [2, 'r2', 'new_reply', 'Name b'],
    ]);
    expect((await log.read(1)).notices.map((n) => n.runId)).toEqual(['r2']);
    // A notice carries no reply text.
    expect(JSON.stringify(all)).not.toContain('Done');
  });

  it('never records a run that ended before this process started (startup backfill)', async () => {
    const log = createRunNoticeLog({ projectName: () => null, startedAt: 1_000 });
    log.record({ id: 'old', projectId: 'a', events: [] }, 'failed', 999);
    log.record({ id: 'new', projectId: 'a', events: [] }, 'failed', 1_000);
    expect((await log.read(0)).notices.map((n) => n.runId)).toEqual(['new']);
  });

  it('records a run once, and each process has its own epoch', async () => {
    const a = createRunNoticeLog({ projectName: () => null, startedAt: 0 });
    a.record({ id: 'r1', projectId: 'p', events: [] }, 'failed', 1);
    a.record({ id: 'r1', projectId: 'p', events: [] }, 'failed', 2);
    expect((await a.read(0)).notices).toHaveLength(1);
    const b = createRunNoticeLog({ projectName: () => null, startedAt: 0 });
    expect((await a.read(0)).epoch).not.toBe((await b.read(0)).epoch);
  });

  it('a hook failure does not stop the other terminal hooks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const after = vi.fn();
    composeRunTerminalHooks(() => { throw new Error('outbox down'); }, after)({}, 'failed', 1);
    expect(after).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

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

function sendApiError(res: any, status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return res.status(status).json({ error: { code, message, ...details } });
}

const TEAM_PROJECT = 'p-team-notice';
const PERSONAL_PROJECT = 'p-personal-notice';
const UNBOUND_PROJECT = 'p-unbound-notice';

async function startServer() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-notices-'));
  const db = openDatabase(tempDir);
  const now = Date.now();
  for (const id of [TEAM_PROJECT, PERSONAL_PROJECT, UNBOUND_PROJECT]) {
    insertProject(db, { id, name: id, createdAt: now, updatedAt: now });
  }
  ensureWorkspaceProject(db, {
    projectId: TEAM_PROJECT,
    workspaceId: 'ws-team',
    visibility: 'team',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'member-owner',
  });
  ensureWorkspaceProject(db, {
    projectId: PERSONAL_PROJECT,
    workspaceId: 'ws-personal',
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'member-me',
  });
  const runNotices = createRunNoticeLog({ projectName: (id) => id, startedAt: 0 });
  for (const projectId of [TEAM_PROJECT, PERSONAL_PROJECT, UNBOUND_PROJECT]) {
    runNotices.record({ id: `run-${projectId}`, projectId, conversationId: `conv-${projectId}`, events: [] }, 'failed', now);
  }
  const authorizeProjectRequest = createAuthorizeProjectRequest({
    db,
    getWorkspaceProject: getWorkspaceProject as any,
    getWorkspaceProjectByProjectId: getWorkspaceProjectByProjectId as any,
    sendApiError,
  });
  const app = express();
  app.use(express.json());
  registerRunRoutes(app, {
    db,
    design: {
      runs: { get: () => null, list: () => [], statusBody: (run: any) => run, isTerminal: () => true },
      analytics: { capture: () => {} },
      getAppVersion: () => 'test',
    },
    http: { createSseResponse: () => ({ send() {}, end() {}, cleanup() {} }), sendApiError },
    paths: { PROJECTS_DIR: tempDir, RUNTIME_DATA_DIR: tempDir },
    agents: { detectAgents: async () => [], getAgentDef: () => null },
    chat: { startChatRun: async () => undefined },
    byokCredentials: { has: async () => false },
    lifecycle: { isDaemonShuttingDown: () => false },
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess: () => {},
      firePipelineForRun: () => {},
      loadPluginRegistryView: async () => ({} as any),
      renderPluginBriefTemplate: (template: string) => template,
    },
    telemetry: {
      reportRunCompletionTelemetryFallback: () => {},
      resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined },
      runRetryEventsForAnalytics: () => [],
    },
    messages: {
      pinAssistantMessageOnRunCreate: () => ({ ok: true }),
      reconcileAssistantMessageOnRunEnd: () => {},
    },
    amrWorkspaceScope: { isSignedIn: () => false },
    authorizeProjectRequest,
    projectStore: { getWorkspaceProject, getWorkspaceProjectByProjectId },
    runNotices,
  } as any);
  const created = http.createServer(app);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  const address = created.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, port };
}

const identity = (workspaceId: string, memberId: string, type: 'team' | 'personal') => ({
  'x-od-workspace-id': workspaceId,
  'x-od-workspace-type': type,
  'x-od-workspace-member-id': memberId,
  'x-od-workspace-role': 'member',
  'x-od-workspace-lifecycle-state': 'active',
  'x-od-workspace-member-status': 'active',
  'x-od-workspace-can-share-projects': 'true',
  'x-od-workspace-can-write-synced-files': 'true',
});

async function projectsSeen(baseUrl: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/api/run-notices?after=0`, { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = (await response.json()) as { notices: { projectId: string }[]; latestSeq: number };
  expect(body.latestSeq).toBe(3);
  return body.notices.map((n) => n.projectId).sort();
}

describe('GET /api/run-notices', () => {
  it('a headerless caller sees only projects with no Workspace binding', async () => {
    const { baseUrl } = await startServer();
    expect(await projectsSeen(baseUrl)).toEqual([UNBOUND_PROJECT]);
  });

  it('a Team member sees that Team project; a client in another Workspace does not', async () => {
    const { baseUrl } = await startServer();
    expect(await projectsSeen(baseUrl, identity('ws-team', 'member-other', 'team')))
      .toEqual([TEAM_PROJECT, UNBOUND_PROJECT].sort());
    expect(await projectsSeen(baseUrl, identity('ws-elsewhere', 'member-other', 'team')))
      .toEqual([UNBOUND_PROJECT]);
  });

  it('a Personal project reaches only its creator', async () => {
    const { baseUrl } = await startServer();
    expect(await projectsSeen(baseUrl, identity('ws-personal', 'member-me', 'personal')))
      .toEqual([PERSONAL_PROJECT, UNBOUND_PROJECT].sort());
    expect(await projectsSeen(baseUrl, identity('ws-personal', 'member-someone', 'personal')))
      .toEqual([UNBOUND_PROJECT]);
  });

  it('a partial identity hides every bound project instead of failing the feed', async () => {
    const { baseUrl } = await startServer();
    expect(await projectsSeen(baseUrl, { 'x-od-workspace-id': 'ws-team' })).toEqual([UNBOUND_PROJECT]);
  });

  it('refuses a foreign Origin', async () => {
    const { port } = await startServer();
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, path: '/api/run-notices', method: 'GET',
        headers: { host: `127.0.0.1:${port}`, origin: 'https://attacker.example' },
      }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});
