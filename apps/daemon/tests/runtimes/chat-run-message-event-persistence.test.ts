import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  persistRunEventToAssistantMessage,
  RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS,
} from '../../src/runtimes/chat-run-messages.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      events_json TEXT
    );
    CREATE TABLE message_event_updates (count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO message_event_updates (count) VALUES (0);
    CREATE TRIGGER count_message_event_updates
      AFTER UPDATE OF events_json ON messages
      BEGIN
        UPDATE message_event_updates SET count = count + 1;
      END;
  `);
  return db;
}

describe('run message event persistence', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    vi.useRealTimers();
    db?.close();
    db = null;
  });

  it('coalesces a high-volume delta stream before synchronously rewriting the message', () => {
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES (?, '', '[]')`)
      .run('assistant-1');
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };
    const deltas = Array.from({ length: 1_500 }, (_, index) => `chunk-${index};`);

    for (const delta of deltas) {
      persistRunEventToAssistantMessage(db, run, 'agent', {
        type: 'text_delta',
        delta,
      });
    }
    persistRunEventToAssistantMessage(db, run, 'end', { status: 'succeeded' });

    const message = db.prepare(`SELECT content, events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-1') as { content: string; eventsJson: string };
    const updates = db.prepare(`SELECT count FROM message_event_updates`).get() as { count: number };
    const text = deltas.join('');

    expect(message.content).toBe(text);
    expect(JSON.parse(message.eventsJson)).toEqual([{ kind: 'text', text }]);
    expect(updates.count).toBeLessThanOrEqual(2);
  });

  it('keeps 100,000 tiny deltas linear in persisted size and database writes', () => {
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES (?, '', '[]')`)
      .run('assistant-1');
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };

    for (let index = 0; index < 100_000; index += 1) {
      persistRunEventToAssistantMessage(db, run, 'agent', {
        type: index < 50_000 ? 'text_delta' : 'thinking_delta',
        delta: 'x',
      });
    }
    persistRunEventToAssistantMessage(db, run, 'end', { status: 'succeeded' });

    const message = db.prepare(`SELECT content, events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-1') as { content: string; eventsJson: string };
    const updates = db.prepare(`SELECT count FROM message_event_updates`).get() as { count: number };
    const events = JSON.parse(message.eventsJson) as Array<{ kind: string; text: string }>;

    expect(message.content).toHaveLength(50_000);
    expect(events).toEqual([
      { kind: 'text', text: 'x'.repeat(50_000) },
      { kind: 'thinking', text: 'x'.repeat(50_000) },
    ]);
    expect(updates.count).toBeLessThanOrEqual(2);
  });

  it('flushes deltas on the interval boundary and semantic events immediately', async () => {
    vi.useFakeTimers();
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES (?, '', '[]')`)
      .run('assistant-1');
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };

    persistRunEventToAssistantMessage(db, run, 'agent', {
      type: 'text_delta',
      delta: 'hello',
    });
    await vi.advanceTimersByTimeAsync(RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS - 1);
    expect(db.prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-1')).toEqual({ eventsJson: '[]' });

    await vi.advanceTimersByTimeAsync(1);
    expect(db.prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-1')).toEqual({
      eventsJson: JSON.stringify([{ kind: 'text', text: 'hello' }]),
    });

    persistRunEventToAssistantMessage(db, run, 'agent', {
      type: 'thinking_delta',
      delta: 'checking',
    });
    persistRunEventToAssistantMessage(db, run, 'agent', {
      type: 'tool_use',
      id: 'tool-1',
      name: 'Read',
      input: { file_path: 'brief.md' },
    });

    const message = db.prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-1') as { eventsJson: string };
    expect(JSON.parse(message.eventsJson)).toEqual([
      { kind: 'text', text: 'hello' },
      { kind: 'thinking', text: 'checking' },
      {
        kind: 'tool_use',
        id: 'tool-1',
        name: 'Read',
        input: { file_path: 'brief.md' },
      },
    ]);
  });
});
