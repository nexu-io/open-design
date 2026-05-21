import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { upsertMessage } from '../src/db.js';
import { attributionFromIdentity } from '../src/identity/attribution.js';
import { migrateProjectRevisions } from '../src/history/persistence.js';
import type { Identity } from '../src/identity/types.js';

const IDENTITY: Identity = {
  id: 'local:default',
  displayName: 'Local User',
  source: 'local-fallback',
};

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Minimal upstream schema for upsertMessage (mirrors what
  // db.ts:migrate() creates). The actor_* columns come from
  // migrateProjectRevisions which the daemon runs as part of the
  // main migrate() chain.
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      run_id TEXT,
      run_status TEXT,
      last_run_event_id TEXT,
      events_json TEXT,
      attachments_json TEXT,
      comment_attachments_json TEXT,
      produced_files_json TEXT,
      feedback_json TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
    INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES ('c1', 'p1', 't', 0, 0);
  `);
  migrateProjectRevisions(db);
  return db;
}

type MessageRow = {
  actor_identity_id: string | null;
  actor_display_name: string | null;
  actor_source_ip: string | null;
};

describe('upsertMessage stores actor_* columns from attribution', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('INSERT path populates the actor columns when attribution is provided', () => {
    const req = {
      headers: { 'x-forwarded-for': '100.113.57.7' },
      socket: { remoteAddress: '::1' },
    };
    upsertMessage(db, 'c1', {
      id: 'm1',
      role: 'user',
      content: 'Hello',
      ...attributionFromIdentity(IDENTITY, req),
    });

    const row = db.prepare(`SELECT actor_identity_id, actor_display_name, actor_source_ip FROM messages WHERE id='m1'`).get() as MessageRow;
    expect(row.actor_identity_id).toBe('local:default');
    expect(row.actor_display_name).toBe('Local User');
    expect(row.actor_source_ip).toBe('100.113.57.7');
  });

  it('INSERT path leaves actor columns null when no identity is provided', () => {
    upsertMessage(db, 'c1', { id: 'm-anon', role: 'user', content: 'no identity' });

    const row = db.prepare(`SELECT actor_identity_id, actor_display_name, actor_source_ip FROM messages WHERE id='m-anon'`).get() as MessageRow;
    expect(row.actor_identity_id).toBeNull();
    expect(row.actor_display_name).toBeNull();
    expect(row.actor_source_ip).toBeNull();
  });

  it('UPDATE path preserves existing actor columns when a later upsert lacks identity', () => {
    upsertMessage(db, 'c1', {
      id: 'm-keep',
      role: 'user',
      content: 'first',
      ...attributionFromIdentity(IDENTITY, { headers: {}, socket: { remoteAddress: '10.0.0.1' } }),
    });

    // Second upsert (e.g., streaming update from the agent) — no identity passed.
    upsertMessage(db, 'c1', { id: 'm-keep', role: 'user', content: 'updated' });

    const row = db.prepare(`SELECT actor_identity_id, actor_display_name, actor_source_ip FROM messages WHERE id='m-keep'`).get() as MessageRow;
    expect(row.actor_identity_id).toBe('local:default');
    expect(row.actor_display_name).toBe('Local User');
    expect(row.actor_source_ip).toBe('10.0.0.1');
  });

  it('UPDATE path overwrites actor columns when a later upsert provides identity', () => {
    const earlyId: Identity = { id: 'local:default', displayName: 'Original', source: 'local-fallback' };
    upsertMessage(db, 'c1', {
      id: 'm-overwrite',
      role: 'user',
      content: 'first',
      ...attributionFromIdentity(earlyId),
    });

    const newerId: Identity = { id: 'oauth:google:newer@example.com', displayName: 'Newer', source: 'oauth' };
    upsertMessage(db, 'c1', {
      id: 'm-overwrite',
      role: 'user',
      content: 'updated',
      ...attributionFromIdentity(newerId, { headers: {}, socket: { remoteAddress: '::1' } }),
    });

    const row = db.prepare(`SELECT actor_identity_id, actor_display_name, actor_source_ip FROM messages WHERE id='m-overwrite'`).get() as MessageRow;
    expect(row.actor_identity_id).toBe('oauth:google:newer@example.com');
    expect(row.actor_display_name).toBe('Newer');
    expect(row.actor_source_ip).toBe('::1');
  });
});
