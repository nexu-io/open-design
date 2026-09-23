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

  it('does not generation-reset a row owned by a still-active run', () => {
    // nettee on #6418: a second concurrent run sharing the same
    // assistantMessageId must not clear the first run's in-flight events —
    // rebinding a row whose current run is still active would corrupt the
    // transcript (the route rejects it; this is the defense-in-depth skip).
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'in-flight',
      events: [{ kind: 'text', text: 'in-flight' }],
      runId: 'run-a',
      runStatus: 'running',
      lastRunEventId: 'evt-3',
      startedAt: 100,
    });

    pinAssistantMessageOnRunCreate(
      db,
      {
        id: 'run-b',
        conversationId: 'conv-a',
        assistantMessageId: 'msg-1',
        status: 'queued',
        createdAt: 300,
      },
      { isRunActive: (runId) => runId === 'run-a' },
    );

    const m = readMessage(db, 'msg-1');
    // Untouched: still owned by run-a with its in-flight transcript.
    expect(m.runId).toBe('run-a');
    expect(m.runStatus).toBe('running');
    expect(m.content).toBe('in-flight');
    expect(m.eventsJson).not.toBeNull();
    expect(m.lastRunEventId).toBe('evt-3');
    expect(m.startedAt).toBe(100);
  });

  it('rebinds a stale active-looking row when the daemon no longer owns its run', () => {
    // nettee on #6418: SQLite run_status is not authoritative after a daemon
    // restart. A row can be left as running while the daemon has no live run;
    // retrying that assistant id must recover instead of returning
    // RUN_IN_PROGRESS forever.
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'stale partial',
      events: [{ kind: 'text', text: 'stale partial' }],
      runId: 'gone-run',
      runStatus: 'running',
      lastRunEventId: 'evt-3',
      startedAt: 100,
    });

    const claim = pinAssistantMessageOnRunCreate(
      db,
      {
        id: 'run-b',
        conversationId: 'conv-a',
        assistantMessageId: 'msg-1',
        status: 'queued',
        createdAt: 300,
      },
      { isRunActive: () => false },
    );

    expect(claim.ok).toBe(true);
    const m = readMessage(db, 'msg-1');
    expect(m.runId).toBe('run-b');
    expect(m.runStatus).toBe('queued');
    expect(m.content).toBe('');
    expect(m.eventsJson).toBeNull();
    expect(m.lastRunEventId).toBeNull();
    expect(m.startedAt).toBe(300);
  });

  it('binds a runId-less web placeholder (normal pre-run flow)', () => {
    // The web persists an assistant placeholder with runStatus set but no run
    // bound yet; the run creation must be able to rebind it (this is not a
    // concurrent-run race — there is no real run owning the row).
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'placeholder',
      runStatus: 'running',
      startedAt: 100,
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
    expect(m.content).toBe('placeholder');
    // The web-persisted placeholder start time survives (retry-after-stop e2e).
    expect(m.startedAt).toBe(100);
  });

  it('rolls back an existing-row claim when commit-time seeding fails', () => {
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'placeholder',
      runStatus: 'running',
      startedAt: 100,
    });

    expect(() =>
      pinAssistantMessageOnRunCreate(
        db,
        {
          id: 'run-b',
          conversationId: 'conv-a',
          assistantMessageId: 'msg-1',
          status: 'queued',
          createdAt: 300,
        },
        {
          beforeClaimCommit: () => {
            db.prepare(
              `INSERT INTO messages
                 (id, conversation_id, role, content, position, created_at)
               VALUES ('user-seed', 'conv-a', 'user', 'prompt', 1, 0)`,
            ).run();
            throw new Error('seed failed');
          },
        },
      ),
    ).toThrow('seed failed');

    const m = readMessage(db, 'msg-1');
    expect(m.runId).toBeNull();
    expect(m.runStatus).toBe('running');
    expect(m.content).toBe('placeholder');
    expect(
      db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE id = 'user-seed'`).get(),
    ).toMatchObject({ count: 0 });
  });

  it('writes the overridden status when resuming a same run (recharge resume)', () => {
    // A recharge resume claims with an explicit `queued` status override while
    // the run object is still terminal (failed); the message row must take the
    // override, keep its transcript, and clear the prior ended_at.
    const db = createDb();
    db.prepare(`INSERT INTO conversations (id) VALUES ('conv-a')`).run();
    seedMessage(db, {
      id: 'msg-1',
      conversationId: 'conv-a',
      content: 'partial',
      events: [{ kind: 'text', text: 'partial' }],
      runId: 'run-a',
      runStatus: 'failed',
      lastRunEventId: 'evt-5',
      startedAt: 100,
      endedAt: 200,
    });

    pinAssistantMessageOnRunCreate(
      db,
      { id: 'run-a', conversationId: 'conv-a', assistantMessageId: 'msg-1', status: 'failed', createdAt: 300 },
      { status: 'queued' },
    );

    const m = readMessage(db, 'msg-1');
    expect(m.runId).toBe('run-a');
    expect(m.runStatus).toBe('queued');
    expect(m.content).toBe('partial');
    expect(m.eventsJson).not.toBeNull();
    expect(m.startedAt).toBe(100);
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
