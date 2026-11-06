import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  finalizeRunMessageEvents,
  persistRunEventToAssistantMessage,
  runEventStorageShapeAnalytics,
  runMessageEventPersistenceAnalytics,
} from '../../src/runtimes/chat-run-messages.js';
import { readSqlitePageStats } from '../../src/storage/db-inspect.js';
import { readRunStorageAnalytics } from '../../src/storage/run-storage-analytics.js';

function createDb({ strategy = true, batches = true } = {}): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', events_json TEXT);`);
  if (batches) {
    db.exec(`CREATE TABLE message_event_batches (
      id INTEGER PRIMARY KEY, message_id TEXT NOT NULL, events_json TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  }
  if (strategy) {
    db.exec(`CREATE TABLE strategy_task_executions (
      task_execution_id TEXT PRIMARY KEY, initial_run_id TEXT NOT NULL, prompt_bundle_utf8_bytes INTEGER);`);
  }
  return db;
}

let db: Database.Database | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

describe('readRunStorageAnalytics', () => {
  it('reports SQLite octet lengths that match the stored UTF-8 bytes', () => {
    db = createDb();
    const events = JSON.stringify([{ kind: 'text', text: '设计稿 ✓' }]);
    const content = 'héllo 世界';
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES ('m1', ?, ?)`).run(content, events);
    db.prepare(`INSERT INTO message_event_batches (message_id, events_json, created_at) VALUES ('m1', '[{"kind":"status"}]', 1)`).run();
    db.prepare(`INSERT INTO strategy_task_executions VALUES ('task-1', 'run-1', 65536)`).run();

    expect(readRunStorageAnalytics(db, { runId: 'run-1', assistantMessageId: 'm1' })).toEqual({
      storage_schema_version: 1,
      storage_events_json_bytes: Buffer.byteLength(events),
      storage_content_bytes: Buffer.byteLength(content),
      storage_pending_batch_count: 1,
      storage_pending_batch_bytes: Buffer.byteLength('[{"kind":"status"}]'),
      storage_prompt_bundle_bytes: 65536,
    });
  });

  it('reports the prompt bundle only on the task initial run', () => {
    db = createDb();
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES ('m2', '', '[]')`).run();
    db.prepare(`INSERT INTO strategy_task_executions VALUES ('task-1', 'run-1', 65536)`).run();
    const resumed = readRunStorageAnalytics(db, { runId: 'run-2', assistantMessageId: 'm2' });
    expect(resumed).not.toHaveProperty('storage_prompt_bundle_bytes');
  });

  it('omits what cannot be measured instead of reporting zero', () => {
    db = createDb({ strategy: false, batches: false });
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES ('m1', 'x', NULL)`).run();
    expect(readRunStorageAnalytics(db, { runId: 'run-1', assistantMessageId: 'm1' })).toEqual({
      storage_schema_version: 1,
      storage_content_bytes: 1,
    });
    expect(readRunStorageAnalytics(db, { runId: 'run-1', assistantMessageId: null })).toEqual({});
    db.close();
    // A closed handle throws on prepare; the reader must not.
    expect(readRunStorageAnalytics(db, { runId: 'run-1', assistantMessageId: 'm1' })).toEqual({});
    db = null;
  });
});

describe('run event storage shape', () => {
  it('tracks the largest and truncated events without changing the existing persistence analytics', () => {
    db = createDb({ strategy: false });
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES ('assistant-1', '', '[]')`).run();
    const run = { id: 'run-1', assistantMessageId: 'assistant-1' };
    const hugeLine = 'x'.repeat(200 * 1024);

    persistRunEventToAssistantMessage(db, run, 'agent', { type: 'text_delta', delta: 'hello' });
    persistRunEventToAssistantMessage(db, run, 'agent', { type: 'raw', line: hugeLine });
    persistRunEventToAssistantMessage(db, run, 'end', { status: 'succeeded' });
    finalizeRunMessageEvents(db, run);

    const shape = runEventStorageShapeAnalytics(run);
    expect(shape).toMatchObject({
      storage_largest_event_kind: 'raw',
      storage_truncated_event_count: 1,
      storage_truncated_original_bytes: Buffer.byteLength(hugeLine),
    });
    // The stored (bounded) raw event is what gets measured, not the input line.
    expect(shape.storage_largest_event_chars).toBeGreaterThan(0);
    expect(shape.storage_largest_event_chars).toBeLessThan(hugeLine.length);

    // Lossless: the pre-existing projection gains no keys.
    expect(Object.keys(runMessageEventPersistenceAnalytics(run)).sort()).toEqual([
      'message_event_batch_event_count',
      'message_event_delta_count',
      'message_event_final_event_count',
      'message_event_finalize_count',
      'message_event_finalize_max_ms',
      'message_event_finalize_total_ms',
      'message_event_flush_count',
      'message_event_flush_max_ms',
      'message_event_flush_total_ms',
      'message_event_input_char_count',
      'message_event_input_count',
      'message_event_pending_char_peak',
      'message_event_persisted_count',
      'message_event_persistence_error_count',
      'message_event_storage_mode',
    ]);
  });

  it('is empty for a run that persisted nothing in this process', () => {
    expect(runEventStorageShapeAnalytics({ id: 'run-x', assistantMessageId: 'm' })).toEqual({});
  });
});

describe('readSqlitePageStats', () => {
  it('reads header-level pragmas and reports unreadable files as null, never 0', () => {
    db = createDb();
    const stats = readSqlitePageStats({ db, file: '/nonexistent/app.sqlite' });
    expect(stats.pageSize).toBeGreaterThan(0);
    expect(stats.pageCount).toBeGreaterThanOrEqual(1);
    expect(stats.freelistCount).toBe(0);
    expect(stats.mainBytes).toBeNull();
    expect(stats.walBytes).toBeNull();
  });
});
