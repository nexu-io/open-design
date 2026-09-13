// Route-level coverage for the #5991 manual compaction surface:
//   GET  /api/projects/:id/conversations/:cid/compaction
//   POST /api/projects/:id/conversations/:cid/compact
//
// The POST handler drives a real `createChatRunService` and a stubbed
// `startChatRun` (the server-level starter is not reachable from a bare
// Express fixture), so assertions land on observable HTTP behavior: JSON
// error envelopes before the stream opens, SSE `progress`/`compaction`/
// `error` frames after it, and the durable checkpoint row.

import express from 'express';
import type { Response } from 'express';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  getConversation,
  getConversationCompaction,
  getMessage,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  openDatabase,
  updateProject,
  upsertAgentSession,
  upsertMessage,
} from '../src/db.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import { createSseResponse } from '../src/server.js';
import {
  registerProjectConversationRoutes,
  COMPACTION_ELIGIBLE_AGENT_IDS,
  type RegisterProjectConversationRoutesDeps,
} from '../src/routes/project/conversations.js';

type Db = ReturnType<typeof openDatabase>;
type Runs = ReturnType<typeof createChatRunService>;

let tempDir: string;
let db: Db;
let runs: Runs;
let startChatRun: ReturnType<typeof vi.fn>;

function seedConversation() {
  const now = Date.now();
  insertProject(db, { id: 'p1', name: 'Project 1', createdAt: now, updatedAt: now });
  insertConversation(db, {
    id: 'c1',
    projectId: 'p1',
    title: 'API mode chat',
    sessionMode: 'design',
    createdAt: now,
    updatedAt: now,
  });
  upsertAgentSession(db, {
    conversationId: 'c1',
    agentId: 'antigravity',
    sessionId: 'agy-session-1',
    model: 'gemini-3.8-flash-high',
    cwd: '/tmp/workspace',
  });
  upsertMessage(db, 'c1', { id: 'm1', role: 'user', content: 'build the page' });
  upsertMessage(db, 'c1', {
    id: 'm2',
    role: 'assistant',
    content: 'wrote page.html',
    producedFiles: [{ name: 'page.html', path: 'page.html', type: 'file' }],
  });
  upsertMessage(db, 'c1', { id: 'm3', role: 'user', content: 'make it dark' });
}

async function mountApp() {
  const app = express();
  app.use(express.json());
  registerProjectConversationRoutes(app, {
    db,
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
      createSseResponse,
    },
    paths: { BRANDS_DIR: tempDir, PROJECTS_DIR: tempDir, RUNTIME_DATA_DIR: tempDir },
    projectStore: { getProject, updateProject },
    conversations: {
      insertConversation,
      getConversation,
      listConversations,
      updateConversation: () => {},
      deleteConversation: () => {},
      getMessage,
      listMessages,
      upsertMessage,
    },
    ids: { randomId: () => 'rid-' + Math.random().toString(36).slice(2) },
    appConfig: { readAppConfig: async () => ({ agentModels: { antigravity: { model: 'gemini-3.8-flash-high' } } }) },
    agents: { getAgentDef: (id: string) => (id === 'antigravity' ? { id, name: 'Antigravity' } : null) },
    design: { runs },
    startChatRun,
    internalRuns: {
      // Same shape as createInternalRunCreationService: install analytics
      // (no-op here) then hand off to the mocked registry's start.
      start: (run: any, _analytics: any, starter: any) => {
        runs.start(run, () => starter(run));
        return run;
      },
    },
  } as unknown as RegisterProjectConversationRoutesDeps);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function parseSseText(text: string): Array<{ event: string; data: any }> {
  const frames = text.split('\n\n').filter(Boolean);
  return frames.map((frame) => {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    return { event, data: data ? JSON.parse(data) : undefined };
  });
}

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-5991-route-'));
  db = openDatabase(tempDir, { dataDir: tempDir });
  runs = createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
  startChatRun = vi.fn();
  seedConversation();
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('POST /api/projects/:id/conversations/:cid/compact (#5991)', () => {
  it('mirrors the web replay/UI eligibility classification (creation gate contract)', () => {
    // Mirror-locked against apps/web/tests/providers/compaction-eligibility-contract.test.ts
    // and apps/web/src/providers/daemon.ts: the creation gate, the UI
    // availability gate, and the replay gate must all use the same set.
    expect([...COMPACTION_ELIGIBLE_AGENT_IDS].sort()).toEqual([
      'aihubmix-api',
      'anthropic-api',
      'antigravity',
      'azure-openai-api',
      'bedrock-api',
      'byok-opencode',
      'google-gemini-api',
      'ollama-cloud-api',
      'openai-api',
      'senseaudio-api',
    ]);
  });

  it('runs the summary round, streams progress + compaction, and persists the checkpoint', async () => {
    startChatRun.mockImplementation(async (chatBody: any, run: any) => {
      expect(chatBody.agentId).toBe('antigravity');
      expect(chatBody.conversationId).toBe('c1');
      expect(chatBody.message).toContain('## Full conversation transcript');
      expect(chatBody.message).toContain('build the page');
      expect(chatBody.message).toContain('- page.html: file');
      // The summary round must never claim a project or an assistant message.
      expect(run.projectId).toBeNull();
      expect(run.assistantMessageId).toBeNull();
      expect(run.context).toEqual({ kind: 'summary-round' });
      runs.emit(run, 'agent', { type: 'text_delta', delta: '## Compacted summary' });
      runs.emit(run, 'agent', { type: 'text_delta', delta: '\n\nPage built in dark mode.' });
      runs.finish(run, 'succeeded');
    });

    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cutAtMessageId: 'm2' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const frames = parseSseText(await res.text());

      expect(frames.map((f) => f.event)).toEqual(['progress', 'compaction']);
      expect(frames[0]!.data.stage).toBe('summarizing');
      expect(frames[1]!.data.compaction).toMatchObject({
        conversationId: 'c1',
        cutAtMessageId: 'm2',
        summaryText: '## Compacted summary\n\nPage built in dark mode.',
        modelId: 'gemini-3.8-flash-high',
      });
      expect(frames[1]!.data.compaction.ledger).toEqual([
        { identifier: 'page.html', description: 'file', fileName: 'page.html' },
      ]);
    } finally {
      await app.close();
    }

    const stored = getConversationCompaction(db, 'c1');
    expect(stored).not.toBeNull();
    expect(stored!.cutAtMessageId).toBe('m2');
    expect(stored!.summaryText).toContain('Page built in dark mode.');
    expect(stored!.ledger).toEqual([
      { identifier: 'page.html', description: 'file', fileName: 'page.html' },
    ]);
    // No assistant message may leak into the conversation.
    expect(listMessages(db, 'c1')).toHaveLength(3);
  });

  it('cuts at the last message when cutAtMessageId is omitted', async () => {
    startChatRun.mockImplementation(async (_chatBody: any, run: any) => {
      runs.emit(run, 'agent', { type: 'text_delta', delta: 'summary' });
      runs.finish(run, 'succeeded');
    });

    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(200);
      const frames = parseSseText(await res.text());
      expect(frames[frames.length - 1]!.data.compaction.cutAtMessageId).toBe('m3');
    } finally {
      await app.close();
    }
  });

  it('streams an error frame when the summary run fails', async () => {
    startChatRun.mockImplementation(async (_chatBody: any, run: any) => {
      runs.fail(run, 'UPSTREAM_FAILED', 'provider exploded');
    });

    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(200);
      const frames = parseSseText(await res.text());
      expect(frames[frames.length - 1]!.event).toBe('error');
      expect(frames[frames.length - 1]!.data.message).toBe('provider exploded');
    } finally {
      await app.close();
    }

    expect(getConversationCompaction(db, 'c1')).toBeNull();
  });

  it('rejects a missing cutAtMessageId with a JSON envelope before the stream opens', async () => {
    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cutAtMessageId: 'nope' }),
      });
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({
        error: { code: 'BAD_REQUEST', message: 'cutAtMessageId does not exist in this conversation' },
      });
    } finally {
      await app.close();
    }
    expect(startChatRun).not.toHaveBeenCalled();
  });

  it('refuses conversations with no API-mode turns or session (eligibility contract)', async () => {
    insertConversation(db, {
      id: 'c2',
      projectId: 'p1',
      title: 'AMR chat',
      sessionMode: 'design',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    upsertMessage(db, 'c2', { id: 'm1', role: 'user', content: 'hello' });
    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c2/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: { code: 'COMPACTION_UNAVAILABLE', message: 'conversation has no API-mode agent turns or session' },
      });
    } finally {
      await app.close();
    }
    expect(startChatRun).not.toHaveBeenCalled();
  });

  it('accepts direct API conversations whose turns carry byok-opencode', async () => {
    startChatRun.mockImplementation(async (_chatBody: any, run: any) => {
      runs.emit(run, 'agent', { type: 'text_delta', delta: 'summary' });
      runs.finish(run, 'succeeded');
    });
    insertConversation(db, {
      id: 'c3',
      projectId: 'p1',
      title: 'Direct API chat',
      sessionMode: 'design',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    upsertMessage(db, 'c3', { id: 'c3m1', role: 'user', content: 'hello', agentId: 'byok-opencode' });
    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c3/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(200);
      const frames = parseSseText(await res.text());
      expect(frames[frames.length - 1]!.event).toBe('compaction');
      expect(getConversationCompaction(db, 'c3')).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it('accepts conversations whose turns carry an API adapter id', async () => {
    startChatRun.mockImplementation(async (_chatBody: any, run: any) => {
      runs.emit(run, 'agent', { type: 'text_delta', delta: 'summary' });
      runs.finish(run, 'succeeded');
    });
    insertConversation(db, {
      id: 'c4',
      projectId: 'p1',
      title: 'OpenAI API chat',
      sessionMode: 'design',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    upsertMessage(db, 'c4', { id: 'c4m1', role: 'user', content: 'hello', agentId: 'openai-api' });
    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c4/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(200);
      const frames = parseSseText(await res.text());
      expect(frames[frames.length - 1]!.event).toBe('compaction');
      expect(getConversationCompaction(db, 'c4')).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it('returns 404 JSON envelopes for unknown projects and conversations', async () => {
    const app = await mountApp();
    try {
      const missingProject = await fetch(`${app.base}/api/projects/zzz/conversations/c1/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(missingProject.status).toBe(404);
      expect(await missingProject.json()).toEqual({ error: 'project not found' });

      const missingConversation = await fetch(`${app.base}/api/projects/p1/conversations/zzz/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(missingConversation.status).toBe(404);
      expect(await missingConversation.json()).toEqual({ error: 'conversation not found' });
    } finally {
      await app.close();
    }
    expect(startChatRun).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:id/conversations/:cid/compaction (#5991)', () => {
  it('returns the stored checkpoint after a successful compact', async () => {
    startChatRun.mockImplementation(async (_chatBody: any, run: any) => {
      runs.emit(run, 'agent', { type: 'text_delta', delta: 'summary' });
      runs.finish(run, 'succeeded');
    });

    const app = await mountApp();
    try {
      const posted = await fetch(`${app.base}/api/projects/p1/conversations/c1/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      await posted.text();

      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1/compaction`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { compaction?: { conversationId?: string; cutAtMessageId?: string; summaryText?: string } };
      expect(body.compaction).toMatchObject({
        conversationId: 'c1',
        cutAtMessageId: 'm3',
        summaryText: 'summary',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when no checkpoint has been stored yet', async () => {
    const app = await mountApp();
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1/compaction`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'compaction not found' });
    } finally {
      await app.close();
    }
  });
});
