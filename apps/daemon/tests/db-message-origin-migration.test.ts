import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase, getMessage, insertConversation, insertProject,
  listMessages, openDatabase, upsertMessage,
} from '../src/db.js';

// A real old-schema fixture: only the test-owned database loses the new column.
// Production migrate must add it back without guessing old message provenance.
describe('message origin migration from an existing database', () => {
  let dataDir: string;
  beforeEach(() => { dataDir = mkdtempSync(path.join(tmpdir(), 'od-origin-migration-')); });
  afterEach(() => { closeDatabase(); rmSync(dataDir, { recursive: true, force: true }); });

  it('preserves unmarked old rows while enabling durable origins for new host notifications', () => {
    let db = openDatabase(dataDir, { dataDir });
    insertProject(db, { id: 'project', name: 'Migration', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'conversation', projectId: 'project', title: null, createdAt: 1, updatedAt: 1 });
    const content = '<od-card type="memory-applied">{"summary":"Old memory","used":[]}</od-card>';
    const events = [{ kind: 'text', text: content }];
    upsertMessage(db, 'conversation', { id: 'legacy', role: 'assistant', content, events, createdAt: 2 });
    const before = db.prepare('SELECT id, content, events_json, position, created_at FROM messages').all();
    const columns = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
    expect(columns.some(column => column.name === 'message_origin')).toBe(true);
    // better-sqlite3 12.10.0 vendors SQLite 3.53.1 (DROP COLUMN is supported).
    // Establish the capability in this isolated test instead of skipping it.
    const version = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
    const [major = 0, minor = 0] = version.version.split('.').map(Number);
    expect(major > 3 || (major === 3 && minor >= 35)).toBe(true);
    const indexes = db.prepare('PRAGMA index_list(messages)').all() as { name: string }[];
    for (const index of indexes) {
      const names = db.prepare('SELECT name FROM pragma_index_info(?)').all(index.name) as { name: string }[];
      expect(names.map(column => column.name)).not.toContain('message_origin');
    }
    db.exec('ALTER TABLE messages DROP COLUMN message_origin');
    expect((db.prepare('PRAGMA table_info(messages)').all() as { name: string }[])
      .some(column => column.name === 'message_origin')).toBe(false);
    closeDatabase();

    db = openDatabase(dataDir, { dataDir });
    expect((db.prepare('PRAGMA table_info(messages)').all() as { name: string }[])
      .some(column => column.name === 'message_origin')).toBe(true);
    expect(db.prepare('SELECT id, content, events_json, position, created_at FROM messages').all()).toEqual(before);
    const legacy = getMessage(db, 'legacy', 'conversation');
    expect(legacy?.content).toBe(content);
    expect(legacy?.events).toEqual(events);
    expect(legacy?.messageOrigin).toBeUndefined();
    expect(db.prepare('SELECT message_origin AS origin FROM messages WHERE id = ?').get('legacy'))
      .toEqual({ origin: null });

    const saved = upsertMessage(db, 'conversation', {
      id: 'new-host', role: 'assistant', content, events, createdAt: 3, messageOrigin: 'host_memory',
    });
    expect(saved?.messageOrigin).toBe('host_memory');
    const messages = listMessages(db, 'conversation');
    expect(messages.map(message => message.id)).toEqual(['legacy', 'new-host']);
    expect(messages[0]?.messageOrigin).toBeUndefined();
    expect(messages[1]?.messageOrigin).toBe('host_memory');
  });
});
