// Plugin-system SQLite migrations. Phase 1 shipped installed_plugins,
// plugin_marketplaces, applied_plugin_snapshots (full §11.4 shape with
// PB2 expires_at), and ALTER TABLE adds for projects / conversations to
// back-reference the applied snapshot. Phase 2A adds run_devloop_iterations
// (devloop audit + future per-iteration billing) and genui_surfaces
// (cross-conversation cache, F8 lookup rules).
//
// `runs` lives in-memory in `apps/daemon/src/runs.ts` today, so the
// run-level snapshot link is carried on the in-memory run object plus
// the messages.run_id row instead of a SQL ALTER TABLE.

import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

export function migratePlugins(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS installed_plugins (
      id                   TEXT PRIMARY KEY,
      title                TEXT NOT NULL,
      version              TEXT NOT NULL,
      source_kind          TEXT NOT NULL,
      source               TEXT NOT NULL,
      pinned_ref           TEXT,
      source_digest        TEXT,
      source_marketplace_id TEXT,
      source_marketplace_entry_name TEXT,
      source_marketplace_entry_version TEXT,
      marketplace_trust    TEXT,
      resolved_source      TEXT,
      resolved_ref         TEXT,
      manifest_digest      TEXT,
      archive_integrity    TEXT,
      trust                TEXT NOT NULL,
      capabilities_granted TEXT NOT NULL,
      manifest_json        TEXT NOT NULL,
      fs_path              TEXT NOT NULL,
      installed_at         INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_installed_plugins_source_kind
      ON installed_plugins(source_kind);

    CREATE TABLE IF NOT EXISTS plugin_marketplaces (
      id            TEXT PRIMARY KEY,
      url           TEXT NOT NULL,
      spec_version  TEXT NOT NULL DEFAULT '1.0.0',
      version       TEXT NOT NULL DEFAULT '0.0.0',
      trust         TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      added_at      INTEGER NOT NULL,
      refreshed_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applied_plugin_snapshots (
      id                       TEXT PRIMARY KEY,
      project_id               TEXT NOT NULL,
      conversation_id          TEXT,
      run_id                   TEXT,
      plugin_id                TEXT NOT NULL,
      plugin_spec_version      TEXT NOT NULL DEFAULT '1.0.0',
      plugin_version           TEXT NOT NULL,
      manifest_source_digest   TEXT NOT NULL,
      source_marketplace_id    TEXT,
      source_marketplace_entry_name TEXT,
      source_marketplace_entry_version TEXT,
      marketplace_trust        TEXT,
      resolved_source          TEXT,
      resolved_ref             TEXT,
      archive_integrity        TEXT,
      pinned_ref               TEXT,
      task_kind                TEXT NOT NULL,
      inputs_json              TEXT NOT NULL,
      resolved_context_json    TEXT NOT NULL,
      pipeline_json            TEXT,
      genui_surfaces_json      TEXT NOT NULL DEFAULT '[]',
      capabilities_granted     TEXT NOT NULL,
      capabilities_required    TEXT NOT NULL DEFAULT '[]',
      assets_staged_json       TEXT NOT NULL,
      connectors_required_json TEXT NOT NULL DEFAULT '[]',
      connectors_resolved_json TEXT NOT NULL DEFAULT '[]',
      mcp_servers_json         TEXT NOT NULL DEFAULT '[]',
      plugin_title             TEXT,
      plugin_description       TEXT,
      query_text               TEXT,
      status                   TEXT NOT NULL DEFAULT 'fresh',
      applied_at               INTEGER NOT NULL,
      expires_at               INTEGER,
      FOREIGN KEY (project_id)      REFERENCES projects(id)      ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_project ON applied_plugin_snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_run     ON applied_plugin_snapshots(run_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_plugin  ON applied_plugin_snapshots(plugin_id, plugin_version);

    -- §10.2 devloop audit + per-iteration billing surface.
    -- run_id is a free string today (in-memory runs, no FK target).
    CREATE TABLE IF NOT EXISTS run_devloop_iterations (
      id                    TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      stage_id              TEXT NOT NULL,
      iteration             INTEGER NOT NULL,
      artifact_diff_summary TEXT,
      critique_summary      TEXT,
      tokens_used           INTEGER,
      ended_at              INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_devloop_run        ON run_devloop_iterations(run_id);
    CREATE INDEX IF NOT EXISTS idx_devloop_run_stage  ON run_devloop_iterations(run_id, stage_id);

    -- §10.3 GenUI surface persisted state. The lookup rules in §10.3.3
    -- read this table at run / conversation / project tier; F8 enforces
    -- the cross-conversation cache hit on a second oauth-prompt.
    -- conversation_id / run_id are stored as plain TEXT (no FK) because
    -- runs are in-memory; conversation FK is set up by the daemon's
    -- existing migrations and we don't want to fail on legacy DBs that
    -- predate it. plugin_snapshot_id is a FK to applied_plugin_snapshots.
    CREATE TABLE IF NOT EXISTS genui_surfaces (
      id                    TEXT PRIMARY KEY,
      project_id            TEXT NOT NULL,
      conversation_id       TEXT,
      run_id                TEXT,
      plugin_snapshot_id    TEXT NOT NULL,
      surface_id            TEXT NOT NULL,
      kind                  TEXT NOT NULL,
      persist               TEXT NOT NULL,
      schema_digest         TEXT,
      value_json            TEXT,
      status                TEXT NOT NULL,
      responded_by          TEXT,
      requested_at          INTEGER NOT NULL,
      responded_at          INTEGER,
      expires_at            INTEGER,
      FOREIGN KEY (project_id)         REFERENCES projects(id)                  ON DELETE CASCADE,
      FOREIGN KEY (plugin_snapshot_id) REFERENCES applied_plugin_snapshots(id)  ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_genui_proj_surface ON genui_surfaces(project_id, surface_id);
    CREATE INDEX IF NOT EXISTS idx_genui_conv_surface ON genui_surfaces(conversation_id, surface_id);
    CREATE INDEX IF NOT EXISTS idx_genui_run          ON genui_surfaces(run_id);
  `);

  const marketplaceCols = db.prepare(`PRAGMA table_info(plugin_marketplaces)`).all() as DbRow[];
  if (!marketplaceCols.some((c) => c['name'] === 'spec_version')) {
    db.exec(`ALTER TABLE plugin_marketplaces ADD COLUMN spec_version TEXT NOT NULL DEFAULT '1.0.0'`);
  }
  if (!marketplaceCols.some((c) => c['name'] === 'version')) {
    db.exec(`ALTER TABLE plugin_marketplaces ADD COLUMN version TEXT NOT NULL DEFAULT '0.0.0'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_marketplaces_version ON plugin_marketplaces(version)`);

  const installedCols = db.prepare(`PRAGMA table_info(installed_plugins)`).all() as DbRow[];
  for (const [name, ddl] of [
    ['source_marketplace_entry_name', `ALTER TABLE installed_plugins ADD COLUMN source_marketplace_entry_name TEXT`],
    ['source_marketplace_entry_version', `ALTER TABLE installed_plugins ADD COLUMN source_marketplace_entry_version TEXT`],
    ['marketplace_trust', `ALTER TABLE installed_plugins ADD COLUMN marketplace_trust TEXT`],
    ['resolved_source', `ALTER TABLE installed_plugins ADD COLUMN resolved_source TEXT`],
    ['resolved_ref', `ALTER TABLE installed_plugins ADD COLUMN resolved_ref TEXT`],
    ['manifest_digest', `ALTER TABLE installed_plugins ADD COLUMN manifest_digest TEXT`],
    ['archive_integrity', `ALTER TABLE installed_plugins ADD COLUMN archive_integrity TEXT`],
  ] as const) {
    if (!installedCols.some((c) => c['name'] === name)) db.exec(ddl);
  }

  const snapshotCols = db.prepare(`PRAGMA table_info(applied_plugin_snapshots)`).all() as DbRow[];
  if (!snapshotCols.some((c) => c['name'] === 'plugin_spec_version')) {
    db.exec(`ALTER TABLE applied_plugin_snapshots ADD COLUMN plugin_spec_version TEXT NOT NULL DEFAULT '1.0.0'`);
  }
  for (const [name, ddl] of [
    ['source_marketplace_entry_name', `ALTER TABLE applied_plugin_snapshots ADD COLUMN source_marketplace_entry_name TEXT`],
    ['source_marketplace_entry_version', `ALTER TABLE applied_plugin_snapshots ADD COLUMN source_marketplace_entry_version TEXT`],
    ['marketplace_trust', `ALTER TABLE applied_plugin_snapshots ADD COLUMN marketplace_trust TEXT`],
    ['resolved_source', `ALTER TABLE applied_plugin_snapshots ADD COLUMN resolved_source TEXT`],
    ['resolved_ref', `ALTER TABLE applied_plugin_snapshots ADD COLUMN resolved_ref TEXT`],
    ['archive_integrity', `ALTER TABLE applied_plugin_snapshots ADD COLUMN archive_integrity TEXT`],
  ] as const) {
    if (!snapshotCols.some((c) => c['name'] === name)) db.exec(ddl);
  }

  // Back-reference columns. SQLite has no IF NOT EXISTS for ALTER; check
  // pragma_table_info first. Mirrors the upstream pattern in db.ts.
  const projectCols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  if (!projectCols.some((c) => c['name'] === 'applied_plugin_snapshot_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN applied_plugin_snapshot_id TEXT`);
  }
  const conversationCols = db.prepare(`PRAGMA table_info(conversations)`).all() as DbRow[];
  if (!conversationCols.some((c) => c['name'] === 'applied_plugin_snapshot_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN applied_plugin_snapshot_id TEXT`);
  }
}
