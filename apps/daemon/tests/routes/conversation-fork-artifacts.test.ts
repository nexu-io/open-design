import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import express, { type Request, type Response } from 'express';
import type { ChatMessage } from '@open-design/contracts';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  closeDatabase, getConversation, getMessage, getProject, insertConversation,
  insertProject, listConversations, listMessages, openDatabase, updateConversation,
  updateProject, upsertMessage,
} from '../../src/db.js';
import {
  registerProjectConversationRoutes,
  type RegisterProjectConversationRoutesDeps,
} from '../../src/routes/project/conversations.js';

let dataDir: string;
let db: ReturnType<typeof openDatabase>;
const projectId = 'fork-artifact-project';
const sourceId = 'source-conversation';

const planningRunId = 'cf4e2ee0-9458-4e14-bc60-9960a27ec87a';
const productionRunId = '39e8c5a8-713a-4e0c-9787-b725719edf42';
const htmlName = 'pangu-kaitian-lesson.html';
const producedFiles = [
  htmlName, 'assets/chaos.jpg', 'assets/hold-sky.jpg', 'assets/newworld.jpg',
  'assets/pangu-axe.jpg', 'assets/transform.jpg',
].map((name) => ({ name, size: 100, mtime: 100, kind: name.endsWith('.html') ? 'html' : 'image' }));

const planning: ChatMessage = {
  id: 'planning-message', role: 'assistant', runId: planningRunId, runStatus: 'succeeded',
  content: '规划完成。多张插图需保持统一绘本风格。',
  events: [
    { kind: 'done_key', key: '7551f71ad5feb3f0' },
    { kind: 'text', text: '规划完成。多张插图需保持统一绘本风格。' },
  ],
  producedFiles: [],
};
const production: ChatMessage = {
  id: 'production-message', role: 'assistant', runId: productionRunId, runStatus: 'succeeded',
  content: '《盘古开天》语文教案已生成。',
  events: [
    { kind: 'done_key', key: '1aa4ef19659189e4' },
    { kind: 'artifact_focus', show: [htmlName] },
    { kind: 'text', text: '《盘古开天》语文教案已生成。' },
  ],
  producedFiles,
};

function application() {
  const app = express();
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
    ids: { randomId: randomUUID },
    appConfig: { readAppConfig: async () => ({}) },
    agents: { getAgentDef: () => null },
    design: { runs: { get: () => null } },
  } as unknown as RegisterProjectConversationRoutesDeps);
  return app;
}

// Run the production Express routes and response serialization without a
// listening server. The transport supplies the already-decoded JSON body.
function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = new Duplex({
      read() {},
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    const req = new IncomingMessage(socket as Socket) as Request;
    req.method = method;
    req.url = url;
    req.body = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
    const res = new ServerResponse(req) as Response;
    res.assignSocket(socket as Socket);
    res.on('finish', () => {
      try {
        const wire = Buffer.concat(chunks).toString();
        expect(res.statusCode).toBe(200);
        resolve(JSON.parse(wire.slice(wire.indexOf('\r\n\r\n') + 4)) as T);
      } catch (error) {
        reject(error);
      } finally {
        socket.destroy();
      }
    });
    res.on('error', reject);
    application()(req, res, reject);
    req.push(null);
  });
}

async function history(conversationId: string): Promise<ChatMessage[]> {
  const body = await request<{ messages: ChatMessage[] }>(
    'GET', `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  return body.messages;
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-fork-artifact-ownership-'));
  db = openDatabase(dataDir, { dataDir });
  insertProject(db, { id: projectId, name: 'Fork artifact ownership', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: sourceId, projectId, title: 'Source', createdAt: 1, updatedAt: 1 });
  upsertMessage(db, sourceId, planning);
  upsertMessage(db, sourceId, production);
});

afterEach(() => {
  closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

// OPEND-2994: production reports six artifact paths but only one display
// selection. The continuing browser row still has the planning message ID.
// A late PUT must not attach those six paths to the planning-only events:
// the source task hides that mismatch while folded, but Fork exposes it.
it.each([
  ['successor run pointer', productionRunId, production.events!.slice(1)],
  ['same run pointer with a sibling stream', planningRunId, production.events!],
])('preserves artifact ownership for a folded PUT with %s, including after Fork and reload', async (_name, runId, successorEvents) => {
  await request('PUT', `/api/projects/${projectId}/conversations/${sourceId}/messages/${planning.id}`, {
    ...planning,
    runId,
    content: `${planning.content}\n\n${production.content}`,
    events: [...planning.events!, ...successorEvents],
    producedFiles: production.producedFiles,
  });

  const created = await request<{ conversation: { id: string } }>(
    'POST', `/api/projects/${projectId}/conversations`,
    { seedFromConversationId: sourceId, forkAfterMessageId: production.id },
  );
  closeDatabase();
  db = openDatabase(dataDir, { dataDir });

  for (const conversationId of [sourceId, created.conversation.id]) {
    const messages = await history(conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      content: planning.content, events: planning.events, producedFiles: [],
    });
    expect(messages[1]).toMatchObject({
      content: production.content, events: production.events, producedFiles,
    });
  }
  expect((await history(created.conversation.id)).every((message) => message.runId === undefined)).toBe(true);
});

it('still accepts artifact updates from the owning run', async () => {
  const ownedFiles = [{ name: 'outline.html', kind: 'html', size: 50, mtime: 50 }];
  await request('PUT', `/api/projects/${projectId}/conversations/${sourceId}/messages/${planning.id}`, {
    ...planning,
    producedFiles: ownedFiles,
    events: [...planning.events!, { kind: 'artifact_focus', show: ['outline.html'] }],
  });
  expect((await history(sourceId))[0]?.producedFiles).toEqual(ownedFiles);
});

// Keep normal history independently of the foreign-run PUT regression. Fork
// copies through the selected message, including its declared main artifact;
// supporting files remain attributed to that historical turn as well.
it.each([1, 6])('preserves a normal declared delivery with %i files through Fork and DB reopen', async (count) => {
  const source = { ...production, producedFiles: producedFiles.slice(0, count) };
  upsertMessage(db, sourceId, source);
  upsertMessage(db, sourceId, {
    id: 'later-message', role: 'assistant', content: 'A later delivery',
    events: [{ kind: 'artifact_focus', show: ['later.html'] }],
    producedFiles: [{ name: 'later.html', kind: 'html', size: 50, mtime: 200 }],
  });
  const sourceBefore = await history(sourceId);
  const created = await request<{ conversation: { id: string } }>(
    'POST', `/api/projects/${projectId}/conversations`,
    { seedFromConversationId: sourceId, forkAfterMessageId: production.id },
  );
  closeDatabase();
  db = openDatabase(dataDir, { dataDir });

  expect(await history(sourceId)).toEqual(sourceBefore);
  const forked = await history(created.conversation.id);
  expect(forked.map((message) => message.content)).toEqual([planning.content, source.content]);
  expect(forked[1]).toMatchObject({
    events: source.events, producedFiles: source.producedFiles, runStatus: 'succeeded',
  });
  expect(forked[1]?.runId).toBeUndefined();
  expect(forked[1]?.id).not.toBe(source.id);
});
