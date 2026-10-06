import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import express, { type Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getConversation,
  getMessage,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  openDatabase,
  updateConversation,
  updateProject,
  upsertMessage,
} from '../../src/db.js';
import {
  registerProjectConversationRoutes,
  type RegisterProjectConversationRoutesDeps,
} from '../../src/routes/project/conversations.js';
import {
  EVENT_LOG_PAYLOAD_SENTINEL,
  jsonBytes,
  legacyCursorTurnEvents,
} from '../helpers/cursor-agent-stream-shapes.js';
import { captureDbReadsAsync, readsCarrying } from '../helpers/db-read-capture.js';

/*
 * Incident 2026-09-14: after ~169 cursor-agent turns stored verbatim tool
 * lines (~1.4 MB per turn), `GET …/conversations/:cid/messages` failed with
 * `RangeError: Invalid string length` in `res.json`, and every `PUT` of a
 * message re-read and `JSON.parse`d the full `events_json` of every sibling
 * row just to learn each sibling's `done_key`.
 *
 * Invariant pinned here (I2): loading a conversation never materializes
 * unbounded data. Rows are seeded exactly as 0.22.x left them (written
 * straight into `messages.events_json`, bypassing any write-side budget),
 * because those rows exist on disk today whatever the new writer does.
 */

const PROJECT_ID = 'oversized-project';
const CONVERSATION_ID = 'oversized-conversation';
const PERSISTED_EVENT_BUDGET_BYTES = 64 * 1024;

type Db = ReturnType<typeof openDatabase>;

function seedConversation(db: Db) {
  insertProject(db, { id: PROJECT_ID, name: 'Oversized', createdAt: 1, updatedAt: 1 });
  insertConversation(db, {
    id: CONVERSATION_ID,
    projectId: PROJECT_ID,
    title: 'Oversized',
    createdAt: 1,
    updatedAt: 1,
  });
}

/** One user + one assistant row per turn, with 0.22.x-shaped assistant events. */
function seedLegacyTurns(db: Db, turns: number) {
  const writeLegacyEvents = db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`);
  for (let turn = 0; turn < turns; turn += 1) {
    upsertMessage(db, CONVERSATION_ID, {
      id: `user-${turn}`,
      role: 'user',
      content: `Synthetic request ${turn}`,
      createdAt: 100 + turn * 10,
    });
    upsertMessage(db, CONVERSATION_ID, {
      id: `assistant-${turn}`,
      role: 'assistant',
      content: `Synthetic answer for turn ${turn}.`,
      agentId: 'cursor-agent',
      runId: `run-${turn}`,
      runStatus: 'succeeded',
      events: [],
      createdAt: 105 + turn * 10,
      startedAt: 105 + turn * 10,
      endedAt: 108 + turn * 10,
    });
    // What 0.22.x wrote: the verbatim event list, no budget.
    writeLegacyEvents.run(
      JSON.stringify(legacyCursorTurnEvents({ turn, doneKey: `done-key-${turn}` })),
      `assistant-${turn}`,
    );
  }
}

async function withConversationRoutes<T>(
  db: Db,
  dataDir: string,
  body: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json({ limit: '64mb' }));
  registerProjectConversationRoutes(app, {
    db,
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { BRANDS_DIR: dataDir, PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
    projectStore: { getProject, updateProject },
    conversations: {
      insertConversation, getConversation, listConversations, updateConversation,
      getMessage, listMessages, upsertMessage,
    },
    ids: { randomId: () => 'unused-id' },
    appConfig: { readAppConfig: async () => ({}) },
    agents: { getAgentDef: () => null },
    // No live daemon runs: every seeded row is a finished, persisted turn.
    design: { runs: { get: () => undefined } },
  } as unknown as RegisterProjectConversationRoutesDeps);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return await body(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('conversation routes over 0.22.x oversized run events', () => {
  let dataDir: string;
  let db: Db;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-oversized-run-events-'));
    db = openDatabase(dataDir, { dataDir });
    seedConversation(db);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('GET messages returns a bounded transcript for a conversation holding tens of MB of raw tool lines', async () => {
    const turns = 40;
    seedLegacyTurns(db, turns);
    const storedBytes = (db
      .prepare(`SELECT SUM(LENGTH(events_json)) AS bytes FROM messages WHERE conversation_id = ?`)
      .get(CONVERSATION_ID) as { bytes: number }).bytes;
    // The seeded conversation really is the incident's shape: tens of MB.
    expect(storedBytes).toBeGreaterThan(50 * 1024 * 1024);

    const { status, text } = await withConversationRoutes(db, dataDir, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/messages`,
      );
      return { status: response.status, text: await response.text() };
    });

    expect(status).toBe(200);
    // Bounded: the response no longer carries the raw tool payloads.
    expect(Buffer.byteLength(text)).toBeLessThan(8 * 1024 * 1024);
    const body = JSON.parse(text) as {
      messages: Array<{ id: string; role: string; content: string; events?: Array<Record<string, unknown>> }>;
    };
    expect(body.messages).toHaveLength(turns * 2);
    for (let turn = 0; turn < turns; turn += 1) {
      const assistant = body.messages.find((message) => message.id === `assistant-${turn}`);
      expect(assistant?.content).toBe(`Synthetic answer for turn ${turn}.`);
      const events = assistant?.events ?? [];
      // No event is dropped, and none exceeds the per-event budget.
      expect(events).toHaveLength(9);
      for (const event of events) {
        expect(jsonBytes(event)).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
      }
      // The events that carry meaning survive untouched.
      expect(events.filter((event) => event.kind !== 'raw')).toEqual([
        { kind: 'status', label: 'starting', detail: 'cursor-agent' },
        { kind: 'done_key', key: `done-key-${turn}` },
        { kind: 'status', label: 'initializing', detail: 'synthetic-cursor-model' },
        { kind: 'text', text: `Synthetic answer for turn ${turn}.` },
        { kind: 'usage', inputTokens: 1200, outputTokens: 340, durationMs: 4200 },
      ]);
    }
  });

  it('PUT keeps the sibling-Run guard without loading sibling event logs into JS', async () => {
    seedLegacyTurns(db, 25);
    // The row the client writes: a small, finished turn with its own Run key.
    upsertMessage(db, CONVERSATION_ID, {
      id: 'assistant-target',
      role: 'assistant',
      content: 'Target answer.',
      runId: 'run-target',
      runStatus: 'succeeded',
      events: [
        { kind: 'done_key', key: 'done-key-target' },
        { kind: 'text', text: 'Target answer.' },
      ],
      startedAt: 1_000,
      endedAt: 1_100,
    });

    await withConversationRoutes(db, dataDir, async (baseUrl) => {
      const url = `${baseUrl}/api/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/messages/assistant-target`;
      const put = (payload: unknown) => fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // 1. A client fold that carries a SIBLING Run's key is refused: the
      //    stored Run stream stays exactly what the daemon wrote.
      const folded = await captureDbReadsAsync(db, async () => {
        const response = await put({
          id: 'assistant-target',
          role: 'assistant',
          content: 'Target answer.Sibling answer.',
          runId: 'run-target',
          runStatus: 'succeeded',
          events: [
            { kind: 'done_key', key: 'done-key-target' },
            { kind: 'text', text: 'Target answer.' },
            { kind: 'done_key', key: 'done-key-7' },
            { kind: 'text', text: 'Sibling answer.' },
          ],
          feedback: { rating: 'up' },
        });
        return response.status;
      });
      expect(folded.result).toBe(200);
      // The guard read each sibling's Run key without loading any sibling's
      // event log into JS (a sentinel sits inside every sibling's tool payload).
      expect(readsCarrying(folded.reads, EVENT_LOG_PAYLOAD_SENTINEL)).toEqual([]);
      const afterFold = getMessage(db, 'assistant-target', CONVERSATION_ID);
      expect(afterFold?.events).toEqual([
        { kind: 'done_key', key: 'done-key-target' },
        { kind: 'text', text: 'Target answer.' },
      ]);
      expect(afterFold?.content).toBe('Target answer.');
      // Client metadata still lands on a refused fold.
      expect(afterFold?.feedback).toEqual({ rating: 'up' });

      // 2. A write of the row's own stream (grown, same Run) still lands.
      const own = await captureDbReadsAsync(db, async () => {
        const response = await put({
          id: 'assistant-target',
          role: 'assistant',
          content: 'Target answer. More.',
          runId: 'run-target',
          runStatus: 'succeeded',
          events: [
            { kind: 'done_key', key: 'done-key-target' },
            { kind: 'text', text: 'Target answer. More.' },
            { kind: 'status', label: 'done' },
          ],
        });
        return response.status;
      });
      expect(own.result).toBe(200);
      expect(readsCarrying(own.reads, EVENT_LOG_PAYLOAD_SENTINEL)).toEqual([]);
      expect(getMessage(db, 'assistant-target', CONVERSATION_ID)?.events).toEqual([
        { kind: 'done_key', key: 'done-key-target' },
        { kind: 'text', text: 'Target answer. More.' },
        { kind: 'status', label: 'done' },
      ]);
    });
  });
});
