// Regression for #5468: deleting a conversation (or project) must terminate
// any still-active agent run it owns. Before the fix the DELETE handler only
// removed the row, leaving the run's CLI subprocess alive — it kept burning
// provider quota, stayed `running` in GET /api/runs with no UI trace, and for
// a project delete kept writing into a directory that had been rm'd out from
// under it.
//
// This exercises the real HTTP boundary: a bare Express app with the actual
// conversation route registrar and a real run service, so the assertion is on
// observable behavior (the run ends `canceled`) rather than on source shape.

import express from 'express';
import type { Response } from 'express';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  deleteConversation,
  getConversation,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  openDatabase,
  updateConversation,
  updateProject,
  upsertMessage,
} from '../src/db.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import {
  registerProjectConversationRoutes,
  type RegisterProjectConversationRoutesDeps,
} from '../src/routes/project/conversations.js';

type Db = ReturnType<typeof openDatabase>;

function makeRunService() {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

async function mountConversationApp(
  db: Db,
  runs: ReturnType<typeof createChatRunService>,
  tempDir: string,
) {
  const app = express();
  app.use(express.json());
  registerProjectConversationRoutes(app, {
    db,
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { BRANDS_DIR: tempDir, PROJECTS_DIR: tempDir, RUNTIME_DATA_DIR: tempDir },
    projectStore: { getProject, updateProject },
    conversations: {
      insertConversation,
      getConversation,
      listConversations,
      updateConversation,
      deleteConversation,
      listMessages,
      upsertMessage,
    },
    ids: { randomId: () => 'rid-' + Math.random().toString(36).slice(2) },
    appConfig: { readAppConfig: async () => ({}) },
    agents: { getAgentDef: () => null },
    design: { runs },
  } as unknown as RegisterProjectConversationRoutesDeps);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('DELETE conversation cancels its active runs (#5468)', () => {
  let tempDir: string;
  let db: Db;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-5468-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'Project', createdAt: now, updatedAt: now });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('terminates a still-active run owned by the deleted conversation', async () => {
    const now = Date.now();
    insertConversation(db, {
      id: 'c1',
      projectId: 'p1',
      title: null,
      sessionMode: 'design',
      createdAt: now,
      updatedAt: now,
    });

    const runs = makeRunService();
    const run = runs.create({ projectId: 'p1', conversationId: 'c1' });
    expect(runs.isTerminal(run.status)).toBe(false);

    const app = await mountConversationApp(db, runs, tempDir);
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }

    expect(run.status).toBe('canceled');
    expect(runs.list({ conversationId: 'c1', status: 'active' })).toEqual([]);
  });

  it('leaves runs owned by other conversations untouched', async () => {
    const now = Date.now();
    insertConversation(db, {
      id: 'c1',
      projectId: 'p1',
      title: null,
      sessionMode: 'design',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'c2',
      projectId: 'p1',
      title: null,
      sessionMode: 'design',
      createdAt: now,
      updatedAt: now,
    });

    const runs = makeRunService();
    const doomed = runs.create({ projectId: 'p1', conversationId: 'c1' });
    const bystander = runs.create({ projectId: 'p1', conversationId: 'c2' });

    const app = await mountConversationApp(db, runs, tempDir);
    try {
      const res = await fetch(`${app.base}/api/projects/p1/conversations/c1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }

    expect(doomed.status).toBe('canceled');
    expect(bystander.status).not.toBe('canceled');
    expect(runs.list({ conversationId: 'c2', status: 'active' })).toHaveLength(1);
  });
});
