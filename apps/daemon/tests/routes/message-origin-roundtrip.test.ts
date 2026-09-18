import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type Response } from 'express';
import type { ChatMessage } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase, getConversation, getMessage, getProject,
  insertConversation, insertProject, listConversations, listMessages,
  openDatabase, updateConversation, updateProject, upsertMessage,
} from '../../src/db.js';
import {
  registerProjectConversationRoutes, type RegisterProjectConversationRoutesDeps,
} from '../../src/routes/project/conversations.js';

// Use an intersection until the shared contract adds this optional field, so
// baseline failures are dropped provenance after real PUT/SQLite/GET, not TS errors.
type OriginMessage = Omit<ChatMessage, 'messageOrigin'> & { messageOrigin?: string | null | undefined };
const projectId = 'origin-project';
const conversationId = 'origin-conversation';
const content = '<od-card type="memory-applied">{"summary":"Remembered a preference","used":[]}</od-card>';

describe('message provenance through the real conversation routes and SQLite', () => {
  let dataDir: string;
  let db: ReturnType<typeof openDatabase>;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'od-message-origin-'));
    db = openDatabase(dataDir, { dataDir });
    insertProject(db, { id: projectId, name: 'Origin fixture', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: conversationId, projectId, title: 'Origin', createdAt: 1, updatedAt: 1 });
  });
  afterEach(() => {
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function withRoutes(check: (base: string) => Promise<void>) {
    const app = express();
    app.use(express.json());
    registerProjectConversationRoutes(app, {
      db,
      http: { sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }) },
      paths: { BRANDS_DIR: dataDir, PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
      projectStore: { getProject, updateProject },
      conversations: {
        insertConversation, getConversation, listConversations, updateConversation,
        getMessage, listMessages, upsertMessage,
      },
      ids: { randomId: () => 'unused-origin-id' },
      appConfig: { readAppConfig: async () => ({}) },
      agents: { getAgentDef: () => null },
      // The persisted run has already left the in-memory run registry.
      design: { runs: { get: () => null } },
    } as unknown as RegisterProjectConversationRoutesDeps);
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const { port } = server.address() as AddressInfo;
      await check(`http://127.0.0.1:${port}/api/projects/${projectId}/conversations/${conversationId}/messages`);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }

  function host(extra: Partial<OriginMessage> = {}): OriginMessage {
    return { id: 'host-message', role: 'assistant', content, createdAt: 2,
      events: [{ kind: 'text', text: content }], messageOrigin: 'host_memory', ...extra };
  }
  async function put(base: string, message: OriginMessage) {
    const response = await fetch(`${base}/${message.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json() as { message: OriginMessage }).message;
  }
  async function read(base: string) {
    const response = await fetch(base);
    expect(response.status).toBe(200);
    return (await response.json() as { messages: OriginMessage[] }).messages;
  }

  it('keeps host provenance through PUT response, list/get normalization, and a reopened database', async () => {
    await withRoutes(async base => {
      const saved = await put(base, host());
      expect(saved.content).toBe(content);
      expect(saved.messageOrigin).toBe('host_memory');
      expect((await read(base))[0]?.messageOrigin).toBe('host_memory');
      expect((getMessage(db, 'host-message') as OriginMessage).messageOrigin).toBe('host_memory');
    });
    closeDatabase();
    db = openDatabase(dataDir, { dataDir });
    await withRoutes(async base => {
      const rows = await read(base);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content).toBe(content);
      expect(rows[0]?.messageOrigin).toBe('host_memory');
    });
  });

  it('does not erase established host provenance when an older client omits the field on update', async () => {
    await withRoutes(async base => {
      await put(base, host());
      const legacyUpdate = host({ messageOrigin: undefined });
      const updated = await put(base, legacyUpdate);
      expect(updated.content).toBe(content);
      expect(updated.messageOrigin).toBe('host_memory');
      expect((await read(base))[0]?.messageOrigin).toBe('host_memory');
    });
  });

  it.each([undefined, null, 'unrecognized_source'])('does not manufacture provenance for a legacy/unknown origin %s', async origin => {
    await withRoutes(async base => {
      const saved = await put(base, host({ messageOrigin: origin }));
      expect(saved.content).toBe(content);
      expect(saved.messageOrigin).toBeUndefined();
      expect((await read(base))[0]?.messageOrigin).toBeUndefined();
    });
    closeDatabase();
    db = openDatabase(dataDir, { dataDir });
    expect((getMessage(db, 'host-message') as OriginMessage).messageOrigin).toBeUndefined();
  });

  it.each([null, 'unrecognized_source'])('does not restore host provenance after an explicit unknown update %s', async origin => {
    await withRoutes(async base => {
      await put(base, host());
      const updated = await put(base, host({ messageOrigin: origin }));
      expect(updated.content).toBe(content);
      expect(updated.messageOrigin).toBeUndefined();
      expect((await read(base))[0]?.messageOrigin).toBeUndefined();
    });
  });

  it('keeps a daemon-owned model reply a run even when a later PUT claims host provenance', async () => {
    upsertMessage(db, conversationId, {
      id: 'model-message', role: 'assistant', content, runId: 'actual-run',
      runStatus: 'succeeded', startedAt: 2, endedAt: 3,
      events: [{ kind: 'text', text: content }],
    });
    await withRoutes(async base => {
      const saved = await put(base, host({ id: 'model-message' }));
      expect(saved.runId).toBe('actual-run');
      expect(saved.runStatus).toBe('succeeded');
      expect(saved.startedAt).toBe(2);
      expect(saved.endedAt).toBe(3);
      expect(saved.messageOrigin).toBeUndefined();
      const [reloaded] = await read(base);
      expect(reloaded?.runId).toBe('actual-run');
      expect(reloaded?.messageOrigin).toBeUndefined();
    });
  });
});
