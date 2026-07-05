/** @module schema/migrate
 * DDL definitions and forward-compatible schema migrations for the daemon's SQLite database.
 * Imports only `core/`; also delegates to external per-feature migrators
 * (`critique`, `media/tasks`, `library-store`, and `plugins/persistence`).
 */
import type { SqliteDb, DbRow } from '../core/index.js';
import { migrateCritique } from '../../critique/persistence.js';
import { migrateMediaTasks } from '../../media/tasks.js';
import { migrateLibrary } from '../../library-store.js';
import { migratePlugins } from '../../plugins/persistence.js';

/**
 * Idempotent schema bootstrap: creates all core tables and indexes, then applies
 * forward-compatible `ALTER TABLE … ADD COLUMN` patches for every column introduced
 * after the initial schema.  Delegates supplementary table creation to the
 * per-feature migrators (`migrateCritique`, `migrateMediaTasks`, `migrateLibrary`,
 * `migratePlugins`).  Must be called exactly once after `openDatabase`.
 * @param db - the open better-sqlite3 handle to migrate
 */
export function migrate(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      design_system_id TEXT,
      pending_prompt TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_project_id TEXT,
      files_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      session_mode TEXT NOT NULL DEFAULT 'design',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conv_project
      ON conversations(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_sessions (
      conversation_id TEXT NOT NULL,
      agent_id        TEXT NOT NULL,
      session_id      TEXT NOT NULL,
      stable_prompt_hash TEXT,
      -- Resume identity guard: the session is only safe to resume when the
      -- conversation has not changed shape under it. model/cwd are the runtime
      -- identity the upstream session was created with; a change forces a fresh
      -- session. last_message_id is the assistant message this session produced
      -- on its last turn -- if it is no longer the latest completed assistant
      -- turn (another agent ran in between, or it was edited away), the session
      -- is behind and we reseed the full transcript.
      model           TEXT,
      cwd             TEXT,
      last_message_id TEXT,
      updated_at      INTEGER NOT NULL,
      PRIMARY KEY (conversation_id, agent_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      events_json TEXT,
      attachments_json TEXT,
      produced_files_json TEXT,
      trace_object_files_json TEXT,
      feedback_json TEXT,
      pre_turn_file_names_json TEXT,
      session_mode TEXT,
      run_context_json TEXT,
      applied_plugin_snapshot_json TEXT,
      telemetry_finalized_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, position);

    CREATE TABLE IF NOT EXISTS preview_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      element_id TEXT NOT NULL,
      selector TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      position_json TEXT NOT NULL,
      html_hint TEXT NOT NULL,
      selection_kind TEXT,
      member_count INTEGER,
      pod_members_json TEXT,
      style_json TEXT,
      attachments_json TEXT,
      slide_index INTEGER,
      slide_key INTEGER NOT NULL DEFAULT -1,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, conversation_id, file_path, element_id, slide_key),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
      ON preview_comments(project_id, conversation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation_created
      ON preview_comments(project_id, conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS tabs (
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(project_id, name),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tabs_state (
      project_id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      state_json TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tabs_project
      ON tabs(project_id, position);

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      url TEXT NOT NULL,
      deployment_id TEXT,
      deployment_count INTEGER NOT NULL DEFAULT 1,
      target TEXT NOT NULL DEFAULT 'preview',
      status TEXT NOT NULL DEFAULT 'ready',
      status_message TEXT,
      reachable_at INTEGER,
      provider_metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, file_name, provider_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project
      ON deployments(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      schedule_json TEXT,
      project_mode TEXT NOT NULL,
      project_id TEXT,
      skill_id TEXT,
      agent_id TEXT,
      context_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      agent_run_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      summary TEXT,
      error TEXT,
      error_code TEXT,
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS routine_schedule_claims (
      routine_id TEXT NOT NULL,
      slot_at INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY(routine_id, slot_at),
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine
      ON routine_runs(routine_id, started_at DESC);
  `);
  // Forward-compatible column add for databases created before metadata_json.
  // SQLite has no IF NOT EXISTS for ALTER, so we check pragma_table_info.
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  if (!cols.some((c: DbRow) => c.name === 'metadata_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN metadata_json TEXT`);
  }
  if (!cols.some((c: DbRow) => c.name === 'custom_instructions')) {
    db.exec(`ALTER TABLE projects ADD COLUMN custom_instructions TEXT`);
  }
  const conversationCols = db.prepare(`PRAGMA table_info(conversations)`).all() as DbRow[];
  if (!conversationCols.some((c: DbRow) => c.name === 'session_mode')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN session_mode TEXT NOT NULL DEFAULT 'design'`);
  }
  const messageCols = db.prepare(`PRAGMA table_info(messages)`).all() as DbRow[];
  if (!messageCols.some((c: DbRow) => c.name === 'agent_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN agent_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'agent_name')) {
    db.exec(`ALTER TABLE messages ADD COLUMN agent_name TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_status')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_status TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'last_run_event_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN last_run_event_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'comment_attachments_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN comment_attachments_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'feedback_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN feedback_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'pre_turn_file_names_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN pre_turn_file_names_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'trace_object_files_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN trace_object_files_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'session_mode')) {
    db.exec(`ALTER TABLE messages ADD COLUMN session_mode TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_context_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_context_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'applied_plugin_snapshot_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN applied_plugin_snapshot_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'telemetry_finalized_at')) {
    db.exec(`ALTER TABLE messages ADD COLUMN telemetry_finalized_at INTEGER`);
  }
  const routineRunCols = db.prepare(`PRAGMA table_info(routine_runs)`).all() as DbRow[];
  if (!routineRunCols.some((c: DbRow) => c.name === 'error_code')) {
    db.exec(`ALTER TABLE routine_runs ADD COLUMN error_code TEXT`);
  }

  const previewCommentCols = db.prepare(`PRAGMA table_info(preview_comments)`).all() as DbRow[];
  if (!previewCommentCols.some((c: DbRow) => c.name === 'selection_kind')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN selection_kind TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'member_count')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN member_count INTEGER`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'pod_members_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN pod_members_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'style_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN style_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'attachments_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN attachments_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'slide_index')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN slide_index INTEGER`);
  }
  migratePreviewCommentsSlideKey(db);
  const deploymentCols = db.prepare(`PRAGMA table_info(deployments)`).all() as DbRow[];
  if (!deploymentCols.some((c: DbRow) => c.name === 'status')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'status_message')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN status_message TEXT`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'reachable_at')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN reachable_at INTEGER`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'provider_metadata_json')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN provider_metadata_json TEXT`);
  }
  // schedule_json holds the full RoutineSchedule object (kind discriminator
  // plus kind-specific fields like time/timezone/weekday). The legacy
  // schedule_kind/schedule_value columns are kept populated for query
  // convenience and as a fallback when reading rows written before this
  // column existed.
  const routineCols = db.prepare(`PRAGMA table_info(routines)`).all() as DbRow[];
  if (routineCols.length > 0 && !routineCols.some((c: DbRow) => c.name === 'schedule_json')) {
    db.exec(`ALTER TABLE routines ADD COLUMN schedule_json TEXT`);
  }
  if (routineCols.length > 0 && !routineCols.some((c: DbRow) => c.name === 'context_json')) {
    db.exec(`ALTER TABLE routines ADD COLUMN context_json TEXT`);
  }
  const agentSessionCols = db.prepare(`PRAGMA table_info(agent_sessions)`).all() as DbRow[];
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'stable_prompt_hash')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN stable_prompt_hash TEXT`);
  }
  // Resume identity guard columns (see agent_sessions CREATE TABLE comment).
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'model')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN model TEXT`);
  }
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'cwd')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN cwd TEXT`);
  }
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'last_message_id')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN last_message_id TEXT`);
  }
  const tabsStateCols = db.prepare(`PRAGMA table_info(tabs_state)`).all() as DbRow[];
  if (tabsStateCols.length > 0 && !tabsStateCols.some((c: DbRow) => c.name === 'state_json')) {
    db.exec(`ALTER TABLE tabs_state ADD COLUMN state_json TEXT`);
  }
  migrateCritique(db);
  migrateMediaTasks(db);
  migrateLibrary(db);
  migratePlugins(db);
}

/** @internal
 * Rebuilds the `preview_comments` table when the legacy four-column UNIQUE constraint
 * (without `slide_key`) is still in place, promoting the unique key to include `slide_key`
 * so that per-slide comments can coexist for the same element.  No-op when the table already
 * has the new constraint.
 */
function migratePreviewCommentsSlideKey(db: SqliteDb): void {
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'preview_comments'`)
    .get() as DbRow | undefined;
  const tableSql = String(table?.sql ?? '');
  const hasSlideKey = /\bslide_key\b/i.test(tableSql);
  const hasLegacyUnique = /UNIQUE\s*\(\s*project_id\s*,\s*conversation_id\s*,\s*file_path\s*,\s*element_id\s*\)/i
    .test(tableSql);
  if (hasSlideKey && !hasLegacyUnique) return;

  db.exec(`
    CREATE TABLE preview_comments_next (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      element_id TEXT NOT NULL,
      selector TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      position_json TEXT NOT NULL,
      html_hint TEXT NOT NULL,
      selection_kind TEXT,
      member_count INTEGER,
      pod_members_json TEXT,
      style_json TEXT,
      attachments_json TEXT,
      slide_index INTEGER,
      slide_key INTEGER NOT NULL DEFAULT -1,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, conversation_id, file_path, element_id, slide_key),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    INSERT INTO preview_comments_next
      (id, project_id, conversation_id, file_path, element_id, selector, label,
       text, position_json, html_hint, selection_kind, member_count, pod_members_json,
       style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at)
    SELECT id, project_id, conversation_id, file_path, element_id, selector, label,
       text, position_json, html_hint, selection_kind, member_count, pod_members_json,
       style_json, attachments_json, slide_index, COALESCE(slide_index, -1), note, status, created_at, updated_at
      FROM preview_comments;

    DROP TABLE preview_comments;
    ALTER TABLE preview_comments_next RENAME TO preview_comments;
    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
      ON preview_comments(project_id, conversation_id, updated_at DESC);
  `);
}

