import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrateProjectRevisions } from '../src/history/persistence.js';

type DbRow = Record<string, unknown>;

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Stand up just enough of the upstream schema to exercise the
  // migration: projects + messages exist (so the column-additions can
  // attach to them) and conversations exists (referenced by messages
  // via FK if/when production schema declares one).
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
  `);
  migrateProjectRevisions(db);
  return db;
}

function columnsOf(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as DbRow[];
  return rows.map((r) => r.name as string);
}

describe('migrateProjectRevisions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('is idempotent: running twice does not throw or duplicate', () => {
    expect(() => {
      migrateProjectRevisions(db);
      migrateProjectRevisions(db);
    }).not.toThrow();

    const tableRow = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='project_revisions'`)
      .get() as { name: string } | undefined;
    expect(tableRow?.name).toBe('project_revisions');
  });

  it('creates project_revisions with the expected columns', () => {
    const cols = columnsOf(db, 'project_revisions');
    expect(cols).toEqual(expect.arrayContaining([
      'id',
      'project_id',
      'parent_id',
      'created_at',
      'source',
      'message',
      'actor_identity_id',
      'actor_display_name',
      'run_id',
      'files_changed_count',
      'bytes_added',
      'bytes_removed',
    ]));
  });

  it('adds current_revision_id to projects (nullable)', () => {
    const cols = columnsOf(db, 'projects');
    expect(cols).toContain('current_revision_id');
    // Existing rows have NULL for the new column.
    const row = db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as DbRow;
    expect(row.current_revision_id).toBeNull();
  });

  it('adds actor_* columns to messages', () => {
    const cols = columnsOf(db, 'messages');
    expect(cols).toContain('actor_identity_id');
    expect(cols).toContain('actor_display_name');
    expect(cols).toContain('actor_source_ip');
  });

  it('enforces the source CHECK constraint', () => {
    const insert = db.prepare(`
      INSERT INTO project_revisions (id, project_id, parent_id, created_at, source, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    // Valid source values accepted
    expect(() => insert.run('r1', 'p1', null, 1, 'agent-run', 'first')).not.toThrow();
    expect(() => insert.run('r2', 'p1', 'r1', 2, 'manual-snapshot', 'tagged')).not.toThrow();
    expect(() => insert.run('r3', 'p1', 'r2', 3, 'restore', 'reverted')).not.toThrow();
    expect(() => insert.run('r4', 'p1', null, 4, 'migration', 'import')).not.toThrow();

    // Invalid source rejected by CHECK
    expect(() =>
      insert.run('r5', 'p1', null, 5, 'made-up-source', 'nope'),
    ).toThrow();
  });

  it('cascades on project delete (FK)', () => {
    db.prepare(`
      INSERT INTO project_revisions (id, project_id, parent_id, created_at, source, message)
      VALUES ('r1', 'p1', NULL, 1, 'migration', 'first')
    `).run();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number }).n,
    ).toBe(1);

    db.prepare(`DELETE FROM projects WHERE id = 'p1'`).run();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number }).n,
    ).toBe(0);
  });

  it('creates the (project_id, created_at DESC) index', () => {
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_project_revisions_project_created'`)
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe('idx_project_revisions_project_created');
  });
});
