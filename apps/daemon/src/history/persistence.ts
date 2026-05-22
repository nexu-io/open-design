// SQLite schema for the history feature (#1241): per-project revision
// rows + the durable "current revision" pointer on projects, plus
// chat-run attribution columns on messages.
//
// Substrate-agnostic schema by design — the same columns work under a
// git substrate (where `git_sha` is the commit SHA) or an OD-owned
// revision store (where the table IS the source of truth and blobs
// live in a content store).

import type Database from 'better-sqlite3';

type DbRow = Record<string, unknown>;

export function migrateProjectRevisions(db: Database.Database): void {
  // Migration order matters:
  //   1. CREATE TABLE (fresh installs get git_sha built in).
  //   2. Cheap created_at index (only references CREATE TABLE columns).
  //   3. ALTER TABLE ADD COLUMN git_sha for legacy DBs.
  //   4. Partial unique index on (project_id, git_sha) — MUST come
  //      after step 3, otherwise legacy DBs abort with "no such
  //      column: git_sha".
  //
  // `id` is a substrate-opaque UUID, not the git SHA. Two separate
  // gitdirs with identical initial content/author/message/timestamp
  // can produce the same SHA (the empty-tree migration commit being
  // the most likely collision); the synthetic id sidesteps that.

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_revisions (
      id                    TEXT PRIMARY KEY,
      project_id            TEXT NOT NULL,
      parent_id             TEXT,
      git_sha               TEXT,
      created_at            INTEGER NOT NULL,
      source                TEXT NOT NULL CHECK (source IN
        ('agent-run','manual-snapshot','restore','migration')),
      message               TEXT NOT NULL,
      actor_identity_id     TEXT,
      actor_display_name    TEXT,
      run_id                TEXT,
      files_changed_count   INTEGER NOT NULL DEFAULT 0,
      bytes_added           INTEGER NOT NULL DEFAULT 0,
      bytes_removed         INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_revisions_project_created
      ON project_revisions(project_id, created_at DESC);
  `);

  const revisionCols = db.prepare(`PRAGMA table_info(project_revisions)`).all() as DbRow[];
  if (!revisionCols.some((c) => c.name === 'git_sha')) {
    db.exec(`ALTER TABLE project_revisions ADD COLUMN git_sha TEXT`);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_revisions_project_sha
      ON project_revisions(project_id, git_sha)
      WHERE git_sha IS NOT NULL;
  `);

  // current_revision_id pointer on projects. Nullable — populated once
  // the project's first revision exists.
  const projectCols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  if (!projectCols.some((c) => c.name === 'current_revision_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN current_revision_id TEXT`);
  }

  // Chat-run attribution on messages. Denormalized name + id keep
  // historical attribution intact if the provider mapping changes
  // later. actor_source_ip captures the Express trust-proxy-resolved
  // client IP (set via OD_TRUST_PROXY); useful for "which device"
  // separate from "which person".
  const messageCols = db.prepare(`PRAGMA table_info(messages)`).all() as DbRow[];
  if (!messageCols.some((c) => c.name === 'actor_identity_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN actor_identity_id TEXT`);
  }
  if (!messageCols.some((c) => c.name === 'actor_display_name')) {
    db.exec(`ALTER TABLE messages ADD COLUMN actor_display_name TEXT`);
  }
  if (!messageCols.some((c) => c.name === 'actor_source_ip')) {
    db.exec(`ALTER TABLE messages ADD COLUMN actor_source_ip TEXT`);
  }
}
