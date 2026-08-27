import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  finalizeRunMessageEvents,
  persistRunEventToAssistantMessage,
  readRunMessageEventPersistenceTelemetry,
  RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS,
  runMessageEventPersistenceAnalytics,
} from '../../src/runtimes/chat-run-messages.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      events_json TEXT
    );
    CREATE TABLE message_event_batches (
      id INTEGER PRIMARY KEY,
      message_id TEXT NOT NULL,
      events_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE message_event_updates (count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO message_event_updates (count) VALUES (0);
    CREATE TABLE message_content_updates (count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO message_content_updates (count) VALUES (0);
    CREATE TRIGGER count_message_event_updates
      AFTER UPDATE OF events_json ON messages
      BEGIN
        UPDATE message_event_updates SET count = count + 1;
      END;
    CREATE TRIGGER count_message_content_updates
      AFTER UPDATE OF content ON messages
      BEGIN
        UPDATE message_content_updates SET count = count + 1;
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

  it('coalesces a high-volume delta stream before one terminal fold', () => {
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
    finalizeRunMessageEvents(db, run);

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
    finalizeRunMessageEvents(db, run);

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

  it('reports persistence pressure without emitting a high-cardinality event per flush', () => {
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES (?, '', '[]')`)
      .run('assistant-1');
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };

    for (let index = 0; index < 1_500; index += 1) {
      persistRunEventToAssistantMessage(db, run, 'agent', {
        type: 'thinking_delta',
        delta: 'x',
      });
    }
    persistRunEventToAssistantMessage(db, run, 'end', { status: 'succeeded' });
    finalizeRunMessageEvents(db, run);

    expect(readRunMessageEventPersistenceTelemetry(run)).toMatchObject({
      storageMode: 'append_only',
      inputEventCount: 1_500,
      deltaEventCount: 1_500,
      inputCharCount: 1_500,
      flushCount: 1,
      batchEventCount: 1,
      persistedEventCount: 1,
      pendingCharPeak: 1_500,
      finalizeCount: 1,
      finalEventCount: 1,
      persistenceErrorCount: 0,
    });
    expect(runMessageEventPersistenceAnalytics(run)).toMatchObject({
      message_event_storage_mode: 'append_only',
      message_event_input_count: 1_500,
      message_event_delta_count: 1_500,
      message_event_input_char_count: 1_500,
      message_event_flush_count: 1,
      message_event_batch_event_count: 1,
      message_event_persisted_count: 1,
      message_event_pending_char_peak: 1_500,
      message_event_finalize_count: 1,
      message_event_final_event_count: 1,
      message_event_persistence_error_count: 0,
    });
  });

  it('bounds writes for a five-minute time-distributed 30,000-delta stream', async () => {
    vi.useFakeTimers();
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES (?, '', '[]')`)
      .run('assistant-1');
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };

    const flushWindows = 1_200;
    const deltasPerWindow = 25;
    for (let window = 0; window < flushWindows; window += 1) {
      for (let delta = 0; delta < deltasPerWindow; delta += 1) {
        persistRunEventToAssistantMessage(db, run, 'agent', {
          type: 'thinking_delta',
          delta: 'x',
        });
      }
      await vi.advanceTimersByTimeAsync(RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS);
    }
    const updates = db.prepare(`SELECT count FROM message_event_updates`).get() as { count: number };
    const batches = db.prepare(`SELECT COUNT(*) AS count FROM message_event_batches`).get() as {
      count: number;
    };
    expect(updates.count).toBe(0);
    expect(batches.count).toBe(flushWindows);

    persistRunEventToAssistantMessage(db, run, 'end', { status: 'succeeded' });
    finalizeRunMessageEvents(db, run);

    const finalizedUpdates = db.prepare(`SELECT count FROM message_event_updates`).get() as {
      count: number;
    };
    const remainingBatches = db.prepare(`SELECT COUNT(*) AS count FROM message_event_batches`)
      .get() as { count: number };
    expect(finalizedUpdates.count).toBe(1);
    expect(remainingBatches.count).toBe(0);
    expect(readRunMessageEventPersistenceTelemetry(run)).toMatchObject({
      inputEventCount: flushWindows * deltasPerWindow,
      deltaEventCount: flushWindows * deltasPerWindow,
      flushCount: flushWindows,
      batchEventCount: flushWindows,
      persistedEventCount: 1,
      finalizeCount: 1,
      finalEventCount: 1,
      persistenceErrorCount: 0,
    });
  });

  it('keeps time-distributed text append-only until the terminal fold', async () => {
    vi.useFakeTimers();
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES (?, '', '[]')`)
      .run('assistant-1');
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };

    const flushWindows = 100;
    for (let window = 0; window < flushWindows; window += 1) {
      persistRunEventToAssistantMessage(db, run, 'agent', {
        type: 'text_delta',
        delta: `window-${window};`,
      });
      await vi.advanceTimersByTimeAsync(RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS);
    }

    expect(db.prepare(`SELECT count FROM message_content_updates`).get())
      .toEqual({ count: 0 });
    expect(db.prepare(`SELECT content FROM messages WHERE id = ?`).get('assistant-1'))
      .toEqual({ content: '' });

    finalizeRunMessageEvents(db, run);

    const expectedText = Array.from(
      { length: flushWindows },
      (_, window) => `window-${window};`,
    ).join('');
    expect(db.prepare(`SELECT count FROM message_content_updates`).get())
      .toEqual({ count: 1 });
    expect(db.prepare(`SELECT content FROM messages WHERE id = ?`).get('assistant-1'))
      .toEqual({ content: expectedText });
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
      eventsJson: '[]',
    });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM message_event_batches`).get())
      .toEqual({ count: 1 });

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

    expect(db.prepare(`SELECT COUNT(*) AS count FROM message_event_batches`).get())
      .toEqual({ count: 2 });
    finalizeRunMessageEvents(db, run);

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
