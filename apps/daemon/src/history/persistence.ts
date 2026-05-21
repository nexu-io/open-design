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
  // Migration order matters:
  //   1. Create the table (fresh installs get git_sha built in).
  //   2. Create the cheap index that only references columns from the
  //      CREATE TABLE definition.
  //   3. Backfill git_sha on legacy tables via ALTER TABLE ADD COLUMN —
  //      necessary for any DB that already has project_revisions from
  //      a pre-fix branch version where id was the SHA and git_sha did
  //      not exist as a column.
  //   4. Only then create the partial unique index on (project_id,
  //      git_sha) — it references the column added in step 3, so doing
  //      this earlier blows up on legacy DBs with `no such column: git_sha`.
  //
  // Background on the UUID id + separate git_sha shape:
  //   `id` is a substrate-opaque UUID, not the git commit SHA. SHA1
  //   commits are only unique within a repo, so two separate project
  //   gitdirs with identical initial content / author / message /
  //   second-level timestamp can produce the same SHA (the empty-tree
  //   migration commit being the most likely collision). Using a
  //   synthetic id sidesteps that and leaves room for a future
  //   OD-owned substrate that doesn't use SHAs at all.

  // Step 1 + 2: create the table (with git_sha included for fresh
  // installs) plus the cheap created_at index. No column references
  // anything that needs backfill.
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

  // Step 3: backfill git_sha if the table predates the column.
  // Idempotent — silently no-ops on fresh installs where the column
  // is already part of CREATE TABLE.
  const revisionCols = db.prepare(`PRAGMA table_info(project_revisions)`).all() as DbRow[];
  if (!revisionCols.some((c) => c.name === 'git_sha')) {
    db.exec(`ALTER TABLE project_revisions ADD COLUMN git_sha TEXT`);
  }

  // Step 4: partial unique index on (project_id, git_sha). MUST run
  // after the column-add for legacy DBs — referencing git_sha in the
  // index definition while the column is missing aborts the whole
  // migration with `no such column: git_sha`.
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
