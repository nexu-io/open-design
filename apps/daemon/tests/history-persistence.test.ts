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
      'git_sha',
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

  it('enforces uniqueness on (project_id, git_sha) — two projects with the same SHA do not collide', () => {
    // Set up a second project so we can insert two rows under
    // different project_ids with the same git_sha (the collision
    // scenario the synthetic-UUID-id fix addresses).
    db.exec(`INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'p2', 0, 0)`);

    const sharedSha = 'a'.repeat(40);
    const insert = db.prepare(`
      INSERT INTO project_revisions (id, project_id, parent_id, git_sha, created_at, source, message)
      VALUES (?, ?, NULL, ?, ?, 'migration', 'shared content')
    `);
    // Two projects, same SHA, different revision UUIDs — both inserts succeed.
    expect(() => insert.run('uuid-1', 'p1', sharedSha, 1)).not.toThrow();
    expect(() => insert.run('uuid-2', 'p2', sharedSha, 2)).not.toThrow();

    // But the same (project_id, git_sha) pair would violate the unique partial index.
    expect(() => insert.run('uuid-3', 'p1', sharedSha, 3)).toThrow();
  });

  it('migrates a legacy database that already has project_revisions without git_sha', () => {
    // Simulate a database that ran the pre-fix migration (id=SHA, no
    // git_sha column). The fixed migration must add the column before
    // creating the (project_id, git_sha) partial unique index, otherwise
    // SQLite errors with `no such column: git_sha` and migration aborts
    // before the backfill can run.
    const legacyDb = new Database(':memory:');
    legacyDb.pragma('foreign_keys = ON');
    legacyDb.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE project_revisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        actor_identity_id TEXT,
        actor_display_name TEXT,
        run_id TEXT,
        files_changed_count INTEGER NOT NULL DEFAULT 0,
        bytes_added INTEGER NOT NULL DEFAULT 0,
        bytes_removed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
      -- A legacy revision row with id=SHA, no git_sha column populated
      INSERT INTO project_revisions (id, project_id, created_at, source, message)
      VALUES ('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'p1', 1, 'migration', 'legacy');
    `);

    expect(() => migrateProjectRevisions(legacyDb)).not.toThrow();

    // git_sha column now exists; legacy row's value is NULL (expected)
    const cols = legacyDb.prepare(`PRAGMA table_info(project_revisions)`).all() as DbRow[];
    expect(cols.map((c) => c.name)).toContain('git_sha');
    const legacyRow = legacyDb.prepare(`SELECT git_sha FROM project_revisions LIMIT 1`).get() as DbRow;
    expect(legacyRow.git_sha).toBeNull();

    // The partial unique index exists
    const idx = legacyDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_project_revisions_project_sha'`)
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe('idx_project_revisions_project_sha');

    legacyDb.close();
  });

  it('allows multiple NULL git_sha rows (non-git substrates do not violate the unique index)', () => {
    const insert = db.prepare(`
      INSERT INTO project_revisions (id, project_id, parent_id, git_sha, created_at, source, message)
      VALUES (?, 'p1', NULL, NULL, ?, 'migration', 'no sha')
    `);
    // Partial index ignores NULL git_sha — many rows without SHAs is fine.
    expect(() => insert.run('uuid-n1', 1)).not.toThrow();
    expect(() => insert.run('uuid-n2', 2)).not.toThrow();
    expect(() => insert.run('uuid-n3', 3)).not.toThrow();
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
