import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { type Request, type Response, type RequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconcileAssistantMessageOnRunEnd } from '../../src/plugins/share-helpers.js';
import { openDatabase, closeDatabase, insertProject, insertConversation, getProject, updateProject,
  getConversation, listConversations, updateConversation, getMessage, listMessages, upsertMessage } from '../../src/db.js';
import { registerProjectConversationRoutes, type RegisterProjectConversationRoutesDeps } from '../../src/routes/project/conversations.js';

// Run the actual registered PUT handler and SQLite merge, without a listening
// socket/full server. The web suite separately exercises fetch serialization.
describe('daemon-backed terminal timestamp persistence', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it.each(['succeeded', 'failed', 'canceled'] as const)('persists a later client timestamp for %s, so the client must send the physical end', async status => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-terminal-clock-'));
    let db = openDatabase(dataDir, { dataDir });
    try {
      insertProject(db, { id: 'clock-project', name: 'Clock', createdAt: 1, updatedAt: 1 });
      insertConversation(db, { id: 'clock-conversation', projectId: 'clock-project', title: 'Clock', createdAt: 1, updatedAt: 1 });
      const app = express();
      const puts = vi.spyOn(app, 'put');
      registerProjectConversationRoutes(app, {
        db,
        http: { sendApiError: (res: Response, code: number, error: string, message: string) => res.status(code).json({ error, message }) },
        paths: { BRANDS_DIR: dataDir, PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
        projectStore: { getProject, updateProject },
        conversations: { insertConversation, getConversation, listConversations, updateConversation, getMessage, listMessages, upsertMessage },
        ids: { randomId: () => 'unused' }, appConfig: { readAppConfig: async () => ({}) },
        agents: { getAgentDef: () => null }, design: { runs: { get: (id: string) => ({ id, status, terminalAt: 1_789_000_020_000 }) } },
      } as unknown as RegisterProjectConversationRoutesDeps);
      const registered = puts.mock.calls.find(args => args[0] === '/api/projects/:id/conversations/:cid/messages/:mid');
      expect(registered).toBeDefined();
      const handler = registered?.[1];
      if (typeof handler !== 'function') throw new Error('No production message PUT handler.');
      for (const incomingEnd of [50_000, 20_000]) {
        const id = `message-${incomingEnd}`;
        const original = { id, role: 'assistant' as const, content: 'The result is ready.', runId: `run-${id}`,
          runStatus: status, startedAt: 1_789_000_000_000, endedAt: 1_789_000_020_000,
          events: [{ kind: 'text' as const, text: 'The result is ready.' }] };
        upsertMessage(db, 'clock-conversation', original);
        let responseBody: unknown;
        const res = { json: (body: unknown) => { responseBody = JSON.parse(JSON.stringify(body)); return res; },
          status: () => res };
        // Only HTTP transport plumbing is supplied; merging and storage are production functions.
        await (handler as RequestHandler)({ params: { id: 'clock-project', cid: 'clock-conversation', mid: id },
          body: JSON.parse(JSON.stringify({ ...original, endedAt: original.startedAt + incomingEnd })),
        } as unknown as Request, res as unknown as Response, error => { if (error) throw error; });
        expect(responseBody).toMatchObject({ message: { id, endedAt: original.startedAt + incomingEnd } });
        expect(getMessage(db, id)?.endedAt).toBe(original.startedAt + incomingEnd);
      }
      closeDatabase(); db = openDatabase(dataDir, { dataDir });
      expect(getMessage(db, 'message-50000')?.endedAt).toBe(1_789_000_050_000);
      expect(getMessage(db, 'message-20000')?.endedAt).toBe(1_789_000_020_000);
    } finally { closeDatabase(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it.each([
    { status: 'succeeded', legacy: false }, { status: 'failed', legacy: false }, { status: 'canceled', legacy: false },
    { status: 'succeeded', legacy: true }, { status: 'failed', legacy: true }, { status: 'canceled', legacy: true },
  ] as const)('keeps the physical clock when reconcile wins before the client PUT: $status / legacy=$legacy', async ({ status, legacy }) => {
    const physicalEnd = 1_789_000_020_000;
    const reconciliationTime = physicalEnd + 3_009;
    const expectedEnd = legacy ? reconciliationTime : physicalEnd;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-terminal-reconcile-'));
    let db = openDatabase(dataDir, { dataDir });
    try {
      insertProject(db, { id: 'clock-project', name: 'Clock', createdAt: 1, updatedAt: 1 });
      insertConversation(db, { id: 'clock-conversation', projectId: 'clock-project', title: 'Clock', createdAt: 1, updatedAt: 1 });
      const original = { id: 'clock-assistant', role: 'assistant' as const, content: 'The result is ready.', runId: 'clock-run',
        runStatus: 'running' as const, startedAt: 1_789_000_000_000, events: [{ kind: 'text' as const, text: 'The result is ready.' }] };
      upsertMessage(db, 'clock-conversation', original);
      vi.spyOn(Date, 'now').mockReturnValue(reconciliationTime);
      const finalStatus = { status, ...(legacy ? {} : { terminalAt: physicalEnd }) };
      const completion = Promise.resolve(finalStatus);
      // Real daemon reconciliation runs before the client's delayed terminal delivery.
      reconcileAssistantMessageOnRunEnd(db, { wait: () => completion }, { id: original.runId, assistantMessageId: original.id });
      await completion;
      expect(getMessage(db, original.id)?.runStatus).toBe(status);
      expect.soft(getMessage(db, original.id)?.endedAt).toBe(expectedEnd);

      const app = express();
      const puts = vi.spyOn(app, 'put');
      registerProjectConversationRoutes(app, {
        db,
        http: { sendApiError: (res: Response, code: number, error: string, message: string) => res.status(code).json({ error, message }) },
        paths: { BRANDS_DIR: dataDir, PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
        projectStore: { getProject, updateProject },
        conversations: { insertConversation, getConversation, listConversations, updateConversation, getMessage, listMessages, upsertMessage },
        ids: { randomId: () => 'unused' }, appConfig: { readAppConfig: async () => ({}) },
        agents: { getAgentDef: () => null }, design: { runs: { get: () => ({ id: original.runId, ...finalStatus }) } },
      } as unknown as RegisterProjectConversationRoutesDeps);
      const handler = puts.mock.calls.find(args => args[0] === '/api/projects/:id/conversations/:cid/messages/:mid')?.[1];
      if (typeof handler !== 'function') throw new Error('No production message PUT handler.');
      let responseBody: unknown;
      const res = { json: (body: unknown) => { responseBody = JSON.parse(JSON.stringify(body)); return res; }, status: () => res };
      vi.mocked(Date.now).mockReturnValue(physicalEnd + 30_000);
      // Submit the exact physical end even if the first writer already put +3009ms in SQLite.
      // The legacy guard must still reject backward client timestamp corrections.
      await (handler as RequestHandler)({ params: { id: 'clock-project', cid: 'clock-conversation', mid: original.id },
        body: JSON.parse(JSON.stringify({ ...original, runStatus: status, endedAt: physicalEnd })),
      } as unknown as Request, res as unknown as Response, error => { if (error) throw error; });
      expect.soft(responseBody).toMatchObject({ message: { id: original.id, endedAt: expectedEnd } });
      expect.soft(getMessage(db, original.id)?.endedAt).toBe(expectedEnd);
      closeDatabase(); db = openDatabase(dataDir, { dataDir });
      expect.soft(getMessage(db, original.id)?.endedAt).toBe(expectedEnd);
    } finally { closeDatabase(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

});
