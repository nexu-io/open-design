import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { pinAssistantMessageOnRunCreate } from '../src/runtimes/chat-run-messages.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      events_json TEXT,
      run_id TEXT,
      run_status TEXT,
      last_run_event_id TEXT,
      session_mode TEXT,
      run_context_json TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );
  `);
  return db;
}

function seedMessage(
  db: Database.Database,
  row: {
    id: string;
    conversationId: string;
    content: string;
    events?: unknown[];
    runId?: string;
    runStatus?: string;
    lastRunEventId?: string | null;
    startedAt?: number;
    endedAt?: number | null;
  },
): void {
  db.prepare(
    `INSERT INTO messages
       (id, conversation_id, role, content, events_json, run_id, run_status,
        last_run_event_id, started_at, ended_at, position, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
  ).run(
    row.id,
    row.conversationId,
    row.content,
    row.events ? JSON.stringify(row.events) : null,
    row.runId ?? null,
    row.runStatus ?? null,
    row.lastRunEventId ?? null,
    row.startedAt ?? null,
    row.endedAt ?? null,
  );
}

function readMessage(db: Database.Database, id: string) {
  return db
    .prepare(
      `SELECT id, conversation_id AS conversationId, role, content,
              events_json AS eventsJson, run_id AS runId, run_status AS runStatus,
              last_run_event_id AS lastRunEventId,
              started_at AS startedAt, ended_at AS endedAt
         FROM messages WHERE id = ?`,
    )
    .get(id) as Record<string, unknown>;
}

describe('pinAssistantMessageOnRunCreate generation boundary (#6418)', () => {
  it('resets run-owned fields when rebinding a message to a new run', () => {
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'old attempt',
      events: [{ kind: 'text', text: 'old' }],
      runId: 'run-a',
      runStatus: 'failed',
      lastRunEventId: 'evt-5',
      startedAt: 100,
      endedAt: 200,
    });

    pinAssistantMessageOnRunCreate(db, {
      id: 'run-b',
      conversationId: 'conv-a',
      assistantMessageId: 'msg-1',
      status: 'queued',
      createdAt: 300,
    });

    const m = readMessage(db, 'msg-1');
    expect(m.runId).toBe('run-b');
    expect(m.runStatus).toBe('queued');
    expect(m.eventsJson).toBeNull();
    expect(m.content).toBe('');
    expect(m.lastRunEventId).toBeNull();
    expect(m.endedAt).toBeNull();
    expect(m.startedAt).toBe(300);
  });

  it('keeps the transcript when re-pinning the same run (resume)', () => {
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'partial',
      events: [{ kind: 'text', text: 'partial' }],
      runId: 'run-a',
      runStatus: 'running',
      lastRunEventId: 'evt-5',
      startedAt: 100,
      endedAt: 200,
    });

    pinAssistantMessageOnRunCreate(db, {
      id: 'run-a',
      conversationId: 'conv-a',
      assistantMessageId: 'msg-1',
      status: 'running',
      createdAt: 300,
    });

    const m = readMessage(db, 'msg-1');
    expect(m.runId).toBe('run-a');
    expect(m.runStatus).toBe('running');
    expect(m.eventsJson).not.toBeNull();
    expect(m.content).toBe('partial');
    expect(m.lastRunEventId).toBe('evt-5');
    expect(m.startedAt).toBe(100);
    // The prior failure's end timestamp must be cleared so the resumed
    // completion records a fresh terminal time (nettee P2 on #6418).
    expect(m.endedAt).toBeNull();
  });

  it('does not touch a message in another conversation', () => {
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a'), ('conv-b')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'conv-a msg',
      events: [{ kind: 'text', text: 'a' }],
      runId: 'run-a',
      runStatus: 'failed',
      lastRunEventId: 'evt-1',
      startedAt: 100,
    });

    // Run in conversation B with assistantMessageId pointing at conv-a's message.
    pinAssistantMessageOnRunCreate(db, {
      id: 'run-b',
      conversationId: 'conv-b',
      assistantMessageId: 'msg-1',
      status: 'queued',
      createdAt: 300,
    });

    const m = readMessage(db, 'msg-1');
    // Scoped by conversation_id: conv-a's message must be untouched.
    expect(m.runId).toBe('run-a');
    expect(m.runStatus).toBe('failed');
    expect(m.content).toBe('conv-a msg');
    expect(m.eventsJson).not.toBeNull();
    expect(m.startedAt).toBe(100);
  });
});
