// POST /api/projects/:id/conversations/:cid/move re-parents a conversation and
// copies the files its transcript references, so the moved file cards still
// open in the target project. Exercised at the HTTP boundary with the real
// route registrar, real project directories, and a real run service.

import express from 'express';
import type { Response } from 'express';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  deleteConversation,
  ensureWorkspaceProject,
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
import { writeProjectFile } from '../src/projects.js';
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

async function mountApp(db: Db, runs: ReturnType<typeof createChatRunService>, projectsDir: string) {
  const app = express();
  app.use(express.json());
  registerProjectConversationRoutes(app, {
    db,
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { BRANDS_DIR: projectsDir, PROJECTS_DIR: projectsDir, RUNTIME_DATA_DIR: projectsDir },
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
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('POST /api/projects/:id/conversations/:cid/move', () => {
  let tempDir: string;
  let projectsDir: string;
  let db: Db;
  let runs: ReturnType<typeof createChatRunService>;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-conv-move-'));
    projectsDir = path.join(tempDir, 'projects');
    db = openDatabase(tempDir, { dataDir: tempDir });
    runs = makeRunService();
    const now = Date.now();
    insertProject(db, { id: 'src', name: 'Source', createdAt: now, updatedAt: now });
    insertProject(db, { id: 'dst', name: 'Target', createdAt: now, updatedAt: now });
    insertConversation(db, { id: 'c1', projectId: 'src', title: 'Moving', sessionMode: 'design', createdAt: now, updatedAt: now });
    await writeProjectFile(projectsDir, 'src', 'page.html', Buffer.from('<link href="style.css" rel="stylesheet"><img src="hero.png">'));
    await writeProjectFile(projectsDir, 'src', 'style.css', Buffer.from('body{color:red}'));
    await writeProjectFile(projectsDir, 'src', 'hero.png', Buffer.from('png-bytes'));
    await writeProjectFile(projectsDir, 'src', 'brief.pdf', Buffer.from('pdf-bytes'));
    upsertMessage(db, 'c1', { id: 'm1', role: 'user', content: 'make a page', attachments: [{ path: 'brief.pdf', name: 'brief.pdf', kind: 'file' }] });
    upsertMessage(db, 'c1', {
      id: 'm2',
      role: 'assistant',
      content: 'done',
      producedFiles: [{ name: 'page.html', path: 'page.html', localPath: path.join(projectsDir, 'src', 'page.html') }],
    });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function move(targetProjectId: string) {
    const app = await mountApp(db, runs, projectsDir);
    try {
      const res = await fetch(`${app.base}/api/projects/src/conversations/c1/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProjectId }),
      });
      return { status: res.status, body: await res.json() as any };
    } finally {
      await app.close();
    }
  }

  it('re-parents the conversation and copies referenced files plus HTML assets', async () => {
    const { status, body } = await move('dst');
    expect(status).toBe(200);
    expect(body.conversation.projectId).toBe('dst');
    expect([...body.copiedFiles].sort()).toEqual(['brief.pdf', 'hero.png', 'page.html', 'style.css']);
    for (const name of body.copiedFiles) {
      expect(existsSync(path.join(projectsDir, 'dst', name))).toBe(true);
      // The source project keeps its own copy.
      expect(existsSync(path.join(projectsDir, 'src', name))).toBe(true);
    }
    const produced = listMessages(db, 'c1').find((m: any) => m.id === 'm2')!.producedFiles[0];
    expect(produced.localPath).toBe(path.join(projectsDir, 'dst', 'page.html'));
  });

  it('copies a clashing referenced file under a numbered name and rewrites the transcript', async () => {
    await writeProjectFile(projectsDir, 'dst', 'page.html', Buffer.from('<p>different</p>'));
    const { status, body } = await move('dst');
    expect(status).toBe(200);
    expect(body.renamedFiles).toEqual([{ from: 'page.html', to: 'page (2).html' }]);
    expect(readFileSync(path.join(projectsDir, 'dst', 'page.html'), 'utf8')).toBe('<p>different</p>');
    const produced = listMessages(db, 'c1').find((m: any) => m.id === 'm2')!.producedFiles[0];
    expect(produced.path).toBe('page (2).html');
    expect(produced.name).toBe('page (2).html');
  });

  it('keeps the target copy of a clashing supporting asset and reports it skipped', async () => {
    await writeProjectFile(projectsDir, 'dst', 'style.css', Buffer.from('body{color:blue}'));
    const { body } = await move('dst');
    expect(body.skippedFiles).toEqual(['style.css']);
    expect(readFileSync(path.join(projectsDir, 'dst', 'style.css'), 'utf8')).toBe('body{color:blue}');
  });

  it('rejects team projects', async () => {
    ensureWorkspaceProject(db, { projectId: 'dst', workspaceId: 'w1', visibility: 'team' });
    const { status, body } = await move('dst');
    expect(status).toBe(400);
    expect(body.error.code).toBe('TEAM_PROJECT_UNSUPPORTED');
    expect(getConversation(db, 'c1')!.projectId).toBe('src');
  });

  it('refuses while a turn is running', async () => {
    runs.create({ projectId: 'src', conversationId: 'c1' });
    const { status } = await move('dst');
    expect(status).toBe(409);
    expect(getConversation(db, 'c1')!.projectId).toBe('src');
  });

  it('404s for a missing target project', async () => {
    const { status } = await move('nope');
    expect(status).toBe(404);
  });
});
