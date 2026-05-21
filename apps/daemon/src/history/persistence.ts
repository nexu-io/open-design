// SQLite schema for the history feature (#1241): per-project revision
// rows + the durable "current revision" pointer on projects, plus
// chat-run attribution columns on messages.
//
// Follows the daemon's existing migrateMediaTasks / migrateCritique /
// migratePlugins convention: idempotent CREATE TABLE IF NOT EXISTS for
// new tables, PRAGMA table_info + conditional ALTER TABLE ADD COLUMN
// for adding columns to existing tables. The function is called once
// from the main migrate() in db.ts when the database is opened.
//
// Substrate-agnostic schema by design — the same columns work under a
// git substrate (where `id` is a commit SHA and the table is a
// materialized view of `git log`) or an OD-owned revision store (where
// the table IS the source of truth and blobs live in a content store).
// Picking the substrate is implementation work that lands later;
// the schema doesn't care.

import type Database from 'better-sqlite3';

type DbRow = Record<string, unknown>;

export function migrateProjectRevisions(db: Database.Database): void {
  // project_revisions — one row per recorded revision on a project. ON
  // DELETE CASCADE so removing a project cleans up its history rows.
  //
  // `id` is a substrate-opaque UUID, not the git commit SHA. SHA1
  // commits are only unique within a repo: two separate project
  // gitdirs with identical initial content / author / message /
  // second-level timestamp can produce the same commit SHA (e.g.,
  // two empty-tree migration commits created in the same second by
  // LocalFallbackProvider). Using a synthetic id sidesteps that
  // collision and lets a future OD-owned substrate plug in without
  // schema changes. The actual git commit SHA lives in `git_sha`,
  // unique per project via a partial index.
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

    -- (project_id, git_sha) is unique when git_sha is set. Lets the
    -- substrate map "parent SHA" → "parent's project_revisions.id"
    -- at insert time without a full table scan, and prevents the
    -- (project_id, git_sha) pair from ever being duplicated.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_revisions_project_sha
      ON project_revisions(project_id, git_sha)
      WHERE git_sha IS NOT NULL;
  `);

  // Idempotent column-add for git_sha (in case a pre-fix migration
  // ran against this database with id=SHA). Existing rows get NULL
  // git_sha — that's a one-time inconsistency only relevant for the
  // author's reference deployment (no one else has run P0 yet).
  const revisionCols = db.prepare(`PRAGMA table_info(project_revisions)`).all() as DbRow[];
  if (!revisionCols.some((c) => c.name === 'git_sha')) {
    db.exec(`ALTER TABLE project_revisions ADD COLUMN git_sha TEXT`);
  }

  // current_revision_id pointer on projects. Nullable — populated once
  // the project's first revision exists.
  const projectCols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  if (!projectCols.some((c) => c.name === 'current_revision_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN current_revision_id TEXT`);
  }

  // Chat-run attribution columns on messages. Denormalized
  // actor_display_name + actor_identity_id keep historical attribution
  // intact even if the identity provider's mapping changes later
  // (e.g., a user is renamed by their auth provider). actor_source_ip
  // records the X-Forwarded-For value when behind a proxy, useful for
  // audit ("which device" separate from "which person").
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
