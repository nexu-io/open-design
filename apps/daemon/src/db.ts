// SQLite-backed persistence for projects, conversations, messages, and the
// per-project set of open workspace tabs. The on-disk project folder under
// .od/projects/<id>/ is still the single owner of the user's actual files
// (HTML artifacts, sketches, uploads); this database tracks the metadata
// that used to live in localStorage.

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type {
  CollabCloudComment,
  OdNextDevicePlatformV1,
  ProjectBrowserWorkspaceTab,
  ProjectTabsState,
} from '@open-design/contracts';
import { eventsEndedWithUnfinishedWork } from '@open-design/contracts';
import { migrateCollabSyncSnapshots } from './collab/sync-snapshot-store.js';
import { migrateCommentRelayOutbox } from './collab/comment-relay-outbox.js';
import { migratePublicFilePublications } from './collab/public-file-publication-store.js';
import { migrateAmrTerminalReportOutbox } from './storage/amr-terminal-report-outbox.js';
import {
  collapseWorkspaceProjectHomes,
  type WorkspaceProjectHomeRow,
} from './collab/workspace-project-home.js';
import { migrateCritique } from './critique/persistence.js';
import { migrateMediaTasks } from './media/tasks.js';
import { migrateLibrary } from './library-store.js';
import { migratePlugins } from './plugins/persistence.js';
import { migrateProjectScenarioBindings } from './plugins/scenario-binding.js';
import { emittedRenderableQuestionForm } from './question-form-detect.js';
import { migrateOdNextRolloutStore } from './strategies/od-next/rollout.js';
import { migrateStrategyTaskStore } from './strategies/task-store.js';

type SqliteDb = Database.Database;
type DbRow = Record<string, any>;
type JsonObject = Record<string, unknown>;
type ChatSessionMode = 'design' | 'chat' | 'plan';

let dbInstance: SqliteDb | null = null;
let dbFile: string | null = null;

function row(value: unknown): DbRow | null {
  return value && typeof value === 'object' ? value as DbRow : null;
}

function rows(value: unknown[]): DbRow[] {
  return value.map((item) => row(item) ?? {});
}

export function openDatabase(projectRoot: string, { dataDir }: { dataDir?: string } = {}): SqliteDb {
  const dir = dataDir ? path.resolve(dataDir) : path.join(projectRoot, '.od');
  const file = path.join(dir, 'app.sqlite');
  if (dbInstance && dbFile === file) return dbInstance;
  if (dbInstance) closeDatabase();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  dbInstance = db;
  dbFile = file;
  return db;
}

export function closeDatabase() {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
  dbFile = null;
}

function migrate(db: SqliteDb): void {
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

    -- A project belongs to exactly ONE workspace, so project_id is the key.
    -- See collab/workspace-project-home.ts for the ruling and the repair path.
    CREATE TABLE IF NOT EXISTS workspace_projects (
      project_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('personal', 'team')),
      resource_state TEXT NOT NULL CHECK (resource_state IN ('active', 'frozen', 'deleted')),
      created_by_workspace_member_id TEXT,
      updated_by_workspace_member_id TEXT,
      resource_hub_resource_id TEXT,
      cloud_tombstoned_at INTEGER,
      sync_state TEXT,
      metadata_refresh_pending INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace_visibility
      ON workspace_projects(workspace_id, visibility, updated_at DESC);

    CREATE TABLE IF NOT EXISTS team_project_materializations (
      workspace_id TEXT NOT NULL,
      resource_team_id TEXT NOT NULL,
      viewer_member_id TEXT NOT NULL,
      owner_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      ref TEXT NOT NULL CHECK (ref = 'published'),
      version INTEGER NOT NULL,
      version_id TEXT NOT NULL,
      manifest_digest TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL CHECK (lifecycle_state = 'active'),
      authorized_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, project_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- The generic workspace-binding table for resource types that do NOT get
    -- their own dedicated table (plugin today; skill / design system are
    -- planned follow-ups — see specs/current for the phased rollout). Same
    -- "binding envelope" columns as workspace_projects, parameterized by
    -- resource_type so one CRUD layer (see getWorkspaceResource and friends
    -- below) and one mutation gate (collab/workspace-resource-mutation.ts)
    -- serve every resource type instead of forking per type.
    --
    -- Unlike workspace_projects, resource_id has no FOREIGN KEY here: which
    -- table it points at depends on resource_type, and SQLite has no
    -- polymorphic foreign key. Callers that delete a resource's underlying
    -- record MUST also delete its workspace_resources row (by resource_type +
    -- resource_id) themselves, or it becomes an orphan binding — the same
    -- failure mode workspace_projects_legacy_single_project once hit.
    CREATE TABLE IF NOT EXISTS workspace_resources (
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('personal', 'team')),
      resource_state TEXT,
      created_by_workspace_member_id TEXT,
      updated_by_workspace_member_id TEXT,
      resource_hub_resource_id TEXT,
      cloud_tombstoned_at INTEGER,
      sync_state TEXT,
      version INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (resource_type, resource_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_resources_type_workspace
      ON workspace_resources(resource_type, workspace_id, updated_at DESC);

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
      intent_signals_json TEXT,
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
      -- Per-section digests of the stable prefix inputs behind
      -- stable_prompt_hash, as JSON (see prompts/stable-sections.ts). Purely
      -- diagnostic: when the hash moves, diffing this against the current turn
      -- names WHICH input drifted. Never gates a re-send -- stable_prompt_hash
      -- stays the only source of truth for that.
      stable_prompt_sections TEXT,
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
      -- Last provider-reported effective input usage for this exact session.
      -- Observability only: never used to admit, reject, compact, or roll over.
      last_input_tokens INTEGER,
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
      result_delivery_state TEXT,
      events_json TEXT,
      attachments_json TEXT,
      produced_files_json TEXT,
      trace_object_files_json TEXT,
      feedback_json TEXT,
      pre_turn_file_names_json TEXT,
      session_mode TEXT,
      run_context_json TEXT,
      task_analytics_json TEXT,
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

    -- Agent streams write small immutable batches while a run is active. The
    -- batches are folded into messages.events_json once, at the terminal
    -- boundary, so a long thinking stream never rewrites its full history on
    -- every flush window.
    CREATE TABLE IF NOT EXISTS message_event_batches (
      id INTEGER PRIMARY KEY,
      message_id TEXT NOT NULL,
      events_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_message_event_batches_message
      ON message_event_batches(message_id, id);

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
      anchor_state TEXT,
      anchored_version INTEGER,
      author_member_id TEXT,
      last_good_position_json TEXT,
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
  const workspaceProjectCols = db.prepare(`PRAGMA table_info(workspace_projects)`).all() as DbRow[];
  if (!workspaceProjectCols.some((c: DbRow) => c.name === 'resource_hub_resource_id')) {
    db.exec(`ALTER TABLE workspace_projects ADD COLUMN resource_hub_resource_id TEXT`);
  }
  if (!workspaceProjectCols.some((c: DbRow) => c.name === 'cloud_tombstoned_at')) {
    db.exec(`ALTER TABLE workspace_projects ADD COLUMN cloud_tombstoned_at INTEGER`);
  }
  migrateWorkspaceProjectsSingleHome(db);
  const migratedWorkspaceProjectCols = db
    .prepare(`PRAGMA table_info(workspace_projects)`)
    .all() as DbRow[];
  if (!migratedWorkspaceProjectCols.some((c: DbRow) => c.name === 'metadata_refresh_pending')) {
    db.exec(
      `ALTER TABLE workspace_projects ADD COLUMN metadata_refresh_pending INTEGER NOT NULL DEFAULT 0`,
    );
  }
  const conversationCols = db.prepare(`PRAGMA table_info(conversations)`).all() as DbRow[];
  if (!conversationCols.some((c: DbRow) => c.name === 'session_mode')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN session_mode TEXT NOT NULL DEFAULT 'design'`);
  }
  if (!conversationCols.some((c: DbRow) => c.name === 'intent_signals_json')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN intent_signals_json TEXT`);
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
  if (!messageCols.some((c: DbRow) => c.name === 'result_delivery_state')) {
    db.exec(`ALTER TABLE messages ADD COLUMN result_delivery_state TEXT`);
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
  if (!messageCols.some((c: DbRow) => c.name === 'task_analytics_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN task_analytics_json TEXT`);
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
  // Team collaboration anchor columns — added after the slide-key rebuild so a legacy
  // table rebuild cannot drop them.
  const previewCommentAnchorCols = db.prepare(`PRAGMA table_info(preview_comments)`).all() as DbRow[];
  if (!previewCommentAnchorCols.some((c: DbRow) => c.name === 'anchor_state')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN anchor_state TEXT`);
  }
  if (!previewCommentAnchorCols.some((c: DbRow) => c.name === 'anchored_version')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN anchored_version INTEGER`);
  }
  if (!previewCommentAnchorCols.some((c: DbRow) => c.name === 'author_member_id')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN author_member_id TEXT`);
  }
  if (!previewCommentAnchorCols.some((c: DbRow) => c.name === 'last_good_position_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN last_good_position_json TEXT`);
  }
  // Multiple comments per element: edit by explicit id; creating another note
  // on the same element inserts a new row.
  migratePreviewCommentsAllowMultiplePerElement(db);
  // Stable canvas pin numbering + persisted sidebar order (recvq5BVsolIxi).
  // Added after the multi-per-element rebuild so a legacy table rebuild can
  // never drop them (same reasoning as the anchor columns above).
  const previewCommentPinCols = db.prepare(`PRAGMA table_info(preview_comments)`).all() as DbRow[];
  if (!previewCommentPinCols.some((c: DbRow) => c.name === 'pin_seq')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN pin_seq INTEGER`);
  }
  if (!previewCommentPinCols.some((c: DbRow) => c.name === 'pin_seq_confirmed')) {
    // 1 = final (no reconciliation pending). A NEW comment on a team-shared
    // project starts at 0 until the collab-cloud push confirms the real
    // cloud-assigned seq (see confirmPreviewCommentPinSeq) — see this file's
    // upsertPreviewComment for why a locally-computed pin_seq can otherwise
    // collide across two devices creating a comment in the same poll window.
    db.exec(`ALTER TABLE preview_comments ADD COLUMN pin_seq_confirmed INTEGER NOT NULL DEFAULT 1`);
  }
  if (!previewCommentPinCols.some((c: DbRow) => c.name === 'sort_key')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN sort_key REAL`);
  }
  backfillPreviewCommentPinSeqAndSortKey(db);
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
  // Drift attribution (see agent_sessions CREATE TABLE comment). Rows written
  // before this column exists read back null and report `unattributed` for one
  // turn, then self-heal on the next write.
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'stable_prompt_sections')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN stable_prompt_sections TEXT`);
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
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'last_input_tokens')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN last_input_tokens INTEGER`);
  }
  const tabsStateCols = db.prepare(`PRAGMA table_info(tabs_state)`).all() as DbRow[];
  if (tabsStateCols.length > 0 && !tabsStateCols.some((c: DbRow) => c.name === 'state_json')) {
    db.exec(`ALTER TABLE tabs_state ADD COLUMN state_json TEXT`);
  }
  migrateCritique(db);
  migrateMediaTasks(db);
  migrateLibrary(db);
  migratePlugins(db);
  migrateProjectScenarioBindings(db);
  migrateStrategyTaskStore(db);
  migrateOdNextRolloutStore(db);
  migrateCollabSyncSnapshots(db);
  migrateCommentRelayOutbox(db);
  migrateAmrTerminalReportOutbox(db);
  migratePublicFilePublications(db);
}

/**
 * Bind every project to exactly ONE workspace, and make any other state
 * unrepresentable.
 *
 * Product ruling (2026-07-21): a project is created in a workspace and lives
 * there; sharing flips `visibility` within that workspace rather than projecting
 * the project into a second one. See collab/workspace-project-home.ts for the
 * full statement and for the rule that picks the surviving row.
 *
 * Two steps, in this order, inside one transaction:
 *   1. collapse the duplicate rows an older build's blanket back-fill wrote —
 *      on the dogfood database 23 of 31 projects had rows in 2-4 workspaces;
 *   2. narrow the primary key from `(workspace_id, project_id)` back to
 *      `project_id`, which is what it was before a migration widened it (the
 *      table it renamed was called `workspace_projects_legacy_single_project`).
 *
 * The order matters: the rebuild's INSERT would fail on the narrowed key if the
 * duplicates were still there. Step 1 therefore runs on every startup, not just
 * on the one that narrows the key, so a row that predates this build is repaired
 * even if the key was already narrow. It is idempotent and costs one indexed
 * scan.
 *
 * A migration rather than the startup reconciliation used for impossible team
 * shares (server.ts `reconcileImpossibleTeamShares`): that one needs the
 * workspace DIRECTORY to decide, which is a signed-in network fact, so it cannot
 * run before the first read. This one decides from the table alone, so it can —
 * and it must, because the read path below now assumes at most one row.
 */
function migrateWorkspaceProjectsSingleHome(db: SqliteDb): void {
  const collapse = db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT project_id AS projectId,
                workspace_id AS workspaceId,
                visibility,
                created_by_workspace_member_id AS createdByWorkspaceMemberId,
                created_at AS createdAt
           FROM workspace_projects`,
      )
      .all() as WorkspaceProjectHomeRow[];
    const decisions = collapseWorkspaceProjectHomes(rows);
    if (decisions.length === 0) return 0;
    const drop = db.prepare(
      `DELETE FROM workspace_projects WHERE workspace_id = ? AND project_id = ?`,
    );
    let dropped = 0;
    for (const decision of decisions) {
      for (const row of decision.drop) {
        drop.run(row.workspaceId, row.projectId);
        dropped += 1;
      }
    }
    return dropped;
  });
  const dropped = collapse();
  if (dropped > 0) {
    console.warn(
      `[od] bound ${dropped} duplicated workspace project row(s) to a single workspace each. ` +
        'A project belongs to one workspace; the extras came from an older blanket back-fill.',
    );
  }

  const cols = db.prepare(`PRAGMA table_info(workspace_projects)`).all() as DbRow[];
  const projectPk = cols.find((c: DbRow) => c.name === 'project_id')?.pk ?? 0;
  const workspacePk = cols.find((c: DbRow) => c.name === 'workspace_id')?.pk ?? 0;
  if (projectPk === 1 && workspacePk === 0) return;

  db.exec(`
    DROP INDEX IF EXISTS idx_workspace_projects_workspace_visibility;
    ALTER TABLE workspace_projects RENAME TO workspace_projects_legacy_multi_workspace;
    CREATE TABLE workspace_projects (
      project_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('personal', 'team')),
      resource_state TEXT NOT NULL CHECK (resource_state IN ('active', 'frozen', 'deleted')),
      created_by_workspace_member_id TEXT,
      updated_by_workspace_member_id TEXT,
      resource_hub_resource_id TEXT,
      cloud_tombstoned_at INTEGER,
      sync_state TEXT,
      metadata_refresh_pending INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO workspace_projects
      (project_id, workspace_id, visibility, resource_state,
       created_by_workspace_member_id, updated_by_workspace_member_id,
       resource_hub_resource_id, cloud_tombstoned_at,
       sync_state, version, created_at, updated_at)
    SELECT project_id, workspace_id, visibility, resource_state,
           created_by_workspace_member_id, updated_by_workspace_member_id,
           resource_hub_resource_id, cloud_tombstoned_at,
           sync_state, version, created_at, updated_at
      FROM workspace_projects_legacy_multi_workspace;
    DROP TABLE workspace_projects_legacy_multi_workspace;
    CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace_visibility
      ON workspace_projects(workspace_id, visibility, updated_at DESC);
  `);
}

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

/**
 * Rebuild `preview_comments` so comments are keyed by `id` only.
 *
 * Older schemas had a natural unique key on project/conversation/file/element/
 * slide/author. That prevented multiple notes by the same member on one
 * element. Editing now requires the caller to send an explicit comment id.
 */
function migratePreviewCommentsAllowMultiplePerElement(db: SqliteDb): void {
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'preview_comments'`)
    .get() as DbRow | undefined;
  const tableSql = String(table?.sql ?? '');
  const hasNaturalUnique = /UNIQUE\s*\([^)]*\bproject_id\b[^)]*\belement_id\b[^)]*\)/i.test(tableSql);
  if (!hasNaturalUnique) return;

  db.exec(`
    CREATE TABLE preview_comments_multi_next (
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
      anchor_state TEXT,
      anchored_version INTEGER,
      author_member_id TEXT,
      last_good_position_json TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    INSERT INTO preview_comments_multi_next
      (id, project_id, conversation_id, file_path, element_id, selector, label,
       text, position_json, html_hint, selection_kind, member_count, pod_members_json,
       style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at,
       anchor_state, anchored_version, author_member_id, last_good_position_json)
    SELECT id, project_id, conversation_id, file_path, element_id, selector, label,
       text, position_json, html_hint, selection_kind, member_count, pod_members_json,
       style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at,
       anchor_state, anchored_version, author_member_id, last_good_position_json
      FROM preview_comments;

    DROP TABLE preview_comments;
    ALTER TABLE preview_comments_multi_next RENAME TO preview_comments;
    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
      ON preview_comments(project_id, conversation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation_created
      ON preview_comments(project_id, conversation_id, created_at ASC);
  `);
}

/**
 * Backfill `pin_seq`/`sort_key` for rows written before those columns
 * existed. Cheap no-op once every row is backfilled (the WHERE clause skips
 * already-assigned rows), so it is safe to call on every startup.
 *
 * `pin_seq` is assigned per (project_id, file_path), ordered exactly like the
 * pre-existing canvas numbering (`created_at ASC, rowid ASC` — see
 * `listPreviewComments`), so an already-open project's pin numbers do not
 * visibly change the moment this migration lands.
 *
 * `sort_key` backfills to `created_at` so the new sort-by-sort_key-descending
 * default (see FileViewer's `visibleSideComments`) reproduces "newest first"
 * for every pre-existing comment too, not just ones created after this ships.
 */
function backfillPreviewCommentPinSeqAndSortKey(db: SqliteDb): void {
  const pending = db
    .prepare(
      `SELECT id, project_id AS projectId, file_path AS filePath, created_at AS createdAt
         FROM preview_comments
        WHERE pin_seq IS NULL
        ORDER BY project_id ASC, file_path ASC, created_at ASC, rowid ASC`,
    )
    .all() as DbRow[];
  if (pending.length === 0) return;
  const setPinSeq = db.prepare(`UPDATE preview_comments SET pin_seq = ? WHERE id = ?`);
  const setSortKey = db.prepare(
    `UPDATE preview_comments SET sort_key = ? WHERE id = ? AND sort_key IS NULL`,
  );
  // Seed each scope's counter from whatever is already assigned there (belt
  // and suspenders — in the normal flow this backfill clears every NULL row in
  // one pass at the first startup after the migration lands, so there is
  // nothing already-assigned to seed from, but a partial prior run must not
  // renumber from 1 and collide with rows that already have a real pin_seq).
  const alreadyAssigned = db
    .prepare(
      `SELECT project_id AS projectId, file_path AS filePath, MAX(pin_seq) AS maxSeq
         FROM preview_comments
        WHERE pin_seq IS NOT NULL
        GROUP BY project_id, file_path`,
    )
    .all() as DbRow[];
  const nextPinSeqByScope = new Map<string, number>();
  for (const row of alreadyAssigned) {
    nextPinSeqByScope.set(`${row.projectId} ${row.filePath}`, Number(row.maxSeq) || 0);
  }
  const backfill = db.transaction(() => {
    for (const row of pending) {
      const scopeKey = `${row.projectId} ${row.filePath}`;
      const nextSeq = (nextPinSeqByScope.get(scopeKey) ?? 0) + 1;
      nextPinSeqByScope.set(scopeKey, nextSeq);
      setPinSeq.run(nextSeq, row.id);
      setSortKey.run(row.createdAt, row.id);
    }
  });
  backfill();
}

// ---------- deployments ----------

const DEPLOYMENT_COLS = `id, project_id AS projectId, file_name AS fileName,
  provider_id AS providerId, url, deployment_id AS deploymentId,
  deployment_count AS deploymentCount, target, status,
  status_message AS statusMessage, reachable_at AS reachableAt,
  provider_metadata_json AS providerMetadataJson,
  created_at AS createdAt, updated_at AS updatedAt`;

export function listDeployments(db: SqliteDb, projectId: string) {
  return (db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(projectId) as DbRow[])
    .map(normalizeDeployment);
}

export function getDeployment(db: SqliteDb, projectId: string, fileName: string, providerId: string) {
  const row = db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ? AND file_name = ? AND provider_id = ?`,
    )
    .get(projectId, fileName, providerId) as DbRow | undefined;
  return row ? normalizeDeployment(row) : null;
}

export function getDeploymentById(db: SqliteDb, projectId: string, id: string) {
  const row = db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ? AND id = ?`,
    )
    .get(projectId, id) as DbRow | undefined;
  return row ? normalizeDeployment(row) : null;
}

export function upsertDeployment(db: SqliteDb, deployment: DbRow) {
  const existing = getDeployment(
    db,
    deployment.projectId,
    deployment.fileName,
    deployment.providerId,
  );
  const now = Date.now();
  const inputProviderMetadata =
    deployment.providerMetadata === undefined
      ? existing?.providerMetadata
      : deployment.providerMetadata;
  const providerMetadata =
    deployment.cloudflarePages && typeof deployment.cloudflarePages === 'object'
      ? {
          ...(inputProviderMetadata && typeof inputProviderMetadata === 'object' && !Array.isArray(inputProviderMetadata)
            ? inputProviderMetadata
            : {}),
          cloudflarePages: deployment.cloudflarePages,
        }
      : inputProviderMetadata;
  const next = {
    id: existing?.id ?? deployment.id,
    projectId: deployment.projectId,
    fileName: deployment.fileName,
    providerId: deployment.providerId,
    url: deployment.url,
    deploymentId: deployment.deploymentId ?? null,
    deploymentCount:
      typeof deployment.deploymentCount === 'number'
        ? deployment.deploymentCount
        : (existing?.deploymentCount ?? 0) + 1,
    target: deployment.target ?? 'preview',
    status: deployment.status ?? existing?.status ?? 'ready',
    statusMessage: deployment.statusMessage ?? null,
    reachableAt: deployment.reachableAt ?? null,
    providerMetadata,
    createdAt: existing?.createdAt ?? deployment.createdAt ?? now,
    updatedAt: deployment.updatedAt ?? now,
  };
  const providerMetadataJson = stringifyJsonObjectOrNull(next.providerMetadata);
  db.prepare(
    `INSERT INTO deployments
       (id, project_id, file_name, provider_id, url, deployment_id,
        deployment_count, target, status, status_message, reachable_at,
        provider_metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, file_name, provider_id) DO UPDATE SET
       url = excluded.url,
       deployment_id = excluded.deployment_id,
       deployment_count = excluded.deployment_count,
       target = excluded.target,
       status = excluded.status,
       status_message = excluded.status_message,
       reachable_at = excluded.reachable_at,
       provider_metadata_json = excluded.provider_metadata_json,
       updated_at = excluded.updated_at`,
  ).run(
    next.id,
    next.projectId,
    next.fileName,
    next.providerId,
    next.url,
    next.deploymentId,
    next.deploymentCount,
    next.target,
    next.status,
    next.statusMessage,
    next.reachableAt,
    providerMetadataJson,
    next.createdAt,
    next.updatedAt,
  );
  return getDeployment(db, next.projectId, next.fileName, next.providerId);
}

function normalizeDeployment(row: DbRow) {
  const providerMetadata = parseJsonOrUndef(row.providerMetadataJson);
  const normalizedProviderMetadata =
    providerMetadata && typeof providerMetadata === 'object' && !Array.isArray(providerMetadata)
      ? providerMetadata
      : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    providerId: row.providerId,
    url: row.url,
    deploymentId: row.deploymentId ?? undefined,
    deploymentCount: Number(row.deploymentCount ?? 1),
    target: row.target === 'production' ? 'production' : 'preview',
    status: row.status || 'ready',
    statusMessage: row.statusMessage ?? undefined,
    reachableAt: row.reachableAt == null ? undefined : Number(row.reachableAt),
    cloudflarePages:
      normalizedProviderMetadata?.cloudflarePages &&
      typeof normalizedProviderMetadata.cloudflarePages === 'object' &&
      !Array.isArray(normalizedProviderMetadata.cloudflarePages)
        ? normalizedProviderMetadata.cloudflarePages
        : undefined,
    providerMetadata: normalizedProviderMetadata,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function stringifyJsonObjectOrNull(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

// ---------- projects ----------

const PROJECT_COLS = `id, name, skill_id AS skillId,
  design_system_id AS designSystemId,
  pending_prompt AS pendingPrompt,
  metadata_json AS metadataJson,
  applied_plugin_snapshot_id AS appliedPluginSnapshotId,
  custom_instructions AS customInstructions,
  created_at AS createdAt,
  updated_at AS updatedAt`;

export function listProjects(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT ${PROJECT_COLS}
         FROM projects
        ORDER BY updated_at DESC`,
    )
    .all() as DbRow[];
  return rows.map(normalizeProject);
}

/**
 * Every project with NO `workspace_projects` binding row at all — the "no
 * scope" catalog `GET /api/projects` must actually serve (spec 04 §10.2#1).
 * `listProjects` above stays the unfiltered form other internal callers
 * (library-sync's inventory scan, `listProjectIds` for the design-run
 * cross-reference) legitimately still want; this is the ONE new consumer that
 * needs the join. A project bound to ANY workspace — personal or team — is
 * someone's claimed resource and must not leak into a headerless read.
 */
export function listUnboundProjects(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.skill_id AS skillId,
              p.design_system_id AS designSystemId,
              p.pending_prompt AS pendingPrompt,
              p.metadata_json AS metadataJson,
              p.applied_plugin_snapshot_id AS appliedPluginSnapshotId,
              p.custom_instructions AS customInstructions,
              p.created_at AS createdAt,
              p.updated_at AS updatedAt
         FROM projects p
         LEFT JOIN workspace_projects wp ON wp.project_id = p.id
        WHERE wp.project_id IS NULL
        ORDER BY p.updated_at DESC`,
    )
    .all() as DbRow[];
  return rows.map(normalizeProject);
}

export function getWorkspaceProject(db: SqliteDb, workspaceId: string, projectId: string) {
  return db
    .prepare(
      `SELECT project_id AS projectId,
              workspace_id AS workspaceId,
              visibility,
              resource_state AS resourceState,
              created_by_workspace_member_id AS createdByWorkspaceMemberId,
              updated_by_workspace_member_id AS updatedByWorkspaceMemberId,
              resource_hub_resource_id AS resourceHubResourceId,
              cloud_tombstoned_at AS cloudTombstonedAt,
              sync_state AS syncState,
              version,
              created_at AS createdAt,
              updated_at AS updatedAt
         FROM workspace_projects
        WHERE workspace_id = ? AND project_id = ?`,
    )
    .get(workspaceId, projectId) as DbRow | undefined;
}

export function listWorkspaceProjects(db: SqliteDb, workspaceId: string) {
  return db
    .prepare(
      `SELECT p.id,
              p.name,
              p.skill_id AS skillId,
              p.design_system_id AS designSystemId,
              p.pending_prompt AS pendingPrompt,
              p.metadata_json AS metadataJson,
              p.applied_plugin_snapshot_id AS appliedPluginSnapshotId,
              p.custom_instructions AS customInstructions,
              p.created_at AS createdAt,
              p.updated_at AS updatedAt,
              wp.project_id AS workspaceProjectId,
              wp.workspace_id AS workspaceId,
              wp.visibility AS workspaceVisibility,
              wp.resource_state AS resourceState,
              wp.created_by_workspace_member_id AS createdByWorkspaceMemberId,
              wp.updated_by_workspace_member_id AS updatedByWorkspaceMemberId,
              wp.resource_hub_resource_id AS resourceHubResourceId,
              wp.cloud_tombstoned_at AS cloudTombstonedAt,
              wp.sync_state AS syncState,
              wp.version AS workspaceVersion,
              wp.created_at AS workspaceCreatedAt,
              wp.updated_at AS workspaceUpdatedAt
         FROM workspace_projects wp
         JOIN projects p ON p.id = wp.project_id
        WHERE wp.workspace_id = ?
        ORDER BY MAX(p.updated_at, wp.updated_at) DESC`,
    )
    .all(workspaceId) as DbRow[];
}

/**
 * Every project's workspace, as one map. The bulk form of
 * {@link getWorkspaceProjectByProjectId}, for list endpoints that would
 * otherwise issue one lookup per project on a hot path.
 */
export function listWorkspaceProjectBindings(db: SqliteDb): Map<string, string> {
  const rows = db
    .prepare(`SELECT project_id AS projectId, workspace_id AS workspaceId FROM workspace_projects`)
    .all() as Array<{ projectId: string; workspaceId: string }>;
  return new Map(rows.map((row) => [row.projectId, row.workspaceId]));
}

export function listTeamWorkspaceProjectShares(db: SqliteDb) {
  return db
    .prepare(
      `SELECT project_id AS projectId,
              workspace_id AS workspaceId,
              visibility,
              created_by_workspace_member_id AS createdByWorkspaceMemberId,
              updated_by_workspace_member_id AS updatedByWorkspaceMemberId,
              sync_state AS syncState,
              metadata_refresh_pending AS metadataRefreshPending
         FROM workspace_projects
        WHERE visibility = 'team'
          AND resource_state != 'deleted'`,
    )
    .all() as DbRow[];
}

/**
 * Durable metadata-only catalog repair marker. This is intentionally separate
 * from `sync_state`: a failed rename upsert does not mean the project's
 * published content failed to sync.
 */
export function setWorkspaceProjectMetadataRefreshPending(
  db: SqliteDb,
  workspaceId: string,
  projectId: string,
  pending: boolean,
): void {
  db.prepare(
    `UPDATE workspace_projects
        SET metadata_refresh_pending = ?
      WHERE workspace_id = ? AND project_id = ?`,
  ).run(pending ? 1 : 0, workspaceId, projectId);
}

/**
 * The workspace a project belongs to, looked up by project alone.
 *
 * A project has exactly one workspace (see collab/workspace-project-home.ts), so
 * this — not `getWorkspaceProject(db, workspaceId, projectId)` — is the question
 * to ask before binding a project anywhere. Asking the two-key form and getting
 * nothing back means "not in THIS workspace", which an older build mistook for
 * "not bound anywhere" and answered by writing another row.
 */
export function getWorkspaceProjectByProjectId(db: SqliteDb, projectId: string) {
  return db
    .prepare(
      `SELECT project_id AS projectId,
              workspace_id AS workspaceId,
              visibility,
              resource_state AS resourceState,
              created_by_workspace_member_id AS createdByWorkspaceMemberId,
              updated_by_workspace_member_id AS updatedByWorkspaceMemberId,
              resource_hub_resource_id AS resourceHubResourceId,
              cloud_tombstoned_at AS cloudTombstonedAt,
              sync_state AS syncState,
              version,
              created_at AS createdAt,
              updated_at AS updatedAt
         FROM workspace_projects
        WHERE project_id = ?`,
    )
    .get(projectId) as DbRow | undefined;
}

/**
 * The `updatedAt` a writer passes when its write is SYNC, not a local person's
 * change: keep the row's existing answer instead of stamping "now".
 *
 * A project's `updated_at` answers exactly one question for the UI — when did a
 * person last change this project's conversations, files, or name? The project
 * card renders it as one relative time and the list sorts by it, folding the
 * project row and its `workspace_projects` binding together with
 * `MAX(p.updated_at, wp.updated_at)` (see `listWorkspaceProjects` below and
 * `normalizeWorkspaceProjectRow` in routes/project/index.ts). So BOTH rows have
 * to answer it, and only a local action may answer it with `Date.now()`.
 *
 * Sync writes rows without anything having changed: materializing a teammate's
 * pulled content, clearing a revocation or placeholder flag once that pull
 * lands, advancing `sync_state` after a background upload, reconciling a
 * binding against the team catalog. A writer on one of those paths must either
 * carry the ORIGIN's timestamp when it has one (as `materializePulledTeamMirror`
 * does) or pass this marker. Letting them fall through to "now" is what made a
 * member's card read 「刚刚更新」 hours after a background pull they never asked
 * for — the reported bug.
 */
export const SYNC_KEEPS_UPDATED_AT = '__od.sync-keeps-updated-at__' as const;

/**
 * Resolve a patch's `updatedAt` for a row that already exists: an explicit
 * number wins, {@link SYNC_KEEPS_UPDATED_AT} keeps `existing`, and anything
 * else (a patch that simply omits it) stamps now.
 */
function nextUpdatedAt(patched: unknown, existing: unknown): number {
  if (typeof patched === 'number') return patched;
  if (patched === SYNC_KEEPS_UPDATED_AT && typeof existing === 'number') {
    return existing;
  }
  return Date.now();
}

/**
 * Bind a project to a workspace, or return the binding it already has.
 *
 * Deliberately keyed on the PROJECT, not on `(workspace, project)`: a project
 * already bound elsewhere is returned as-is rather than bound a second time.
 * That is what makes the caller's "ensure" idempotent across workspaces instead
 * of one back-fill per workspace visited — and it is also what the narrowed
 * primary key now enforces, so an accidental second insert throws instead of
 * silently duplicating.
 *
 * A fresh binding's `updated_at` falls back to the PROJECT's own `updated_at`,
 * not to now: the project list reports `MAX(p.updated_at, wp.updated_at)` as one
 * "last changed" time, so a binding written while syncing an old project must
 * not claim the project just changed (see {@link SYNC_KEEPS_UPDATED_AT}). A
 * caller that genuinely means "now" — a brand-new project — gets the same answer
 * either way, because its project row was stamped now a moment ago.
 */
export function ensureWorkspaceProject(db: SqliteDb, input: DbRow) {
  const now = Date.now();
  const existing = getWorkspaceProjectByProjectId(db, input.projectId);
  if (existing) return existing;
  const boundProjectUpdatedAt = getProject(db, input.projectId)?.updatedAt;
  const insertedUpdatedAt = typeof input.updatedAt === 'number'
    ? input.updatedAt
    : typeof boundProjectUpdatedAt === 'number'
      ? boundProjectUpdatedAt
      : now;
  db.prepare(
    `INSERT INTO workspace_projects
       (project_id, workspace_id, visibility, resource_state,
        created_by_workspace_member_id, updated_by_workspace_member_id,
        resource_hub_resource_id, cloud_tombstoned_at,
        sync_state, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.projectId,
    input.workspaceId,
    input.visibility ?? 'personal',
    input.resourceState ?? 'active',
    input.createdByWorkspaceMemberId ?? null,
    input.updatedByWorkspaceMemberId ?? input.createdByWorkspaceMemberId ?? null,
    input.resourceHubResourceId ?? null,
    input.cloudTombstonedAt ?? null,
    input.syncState ?? 'local_only',
    input.version ?? 1,
    input.createdAt ?? now,
    insertedUpdatedAt,
  );
  return getWorkspaceProject(db, input.workspaceId, input.projectId);
}

export function updateWorkspaceProject(db: SqliteDb, workspaceId: string, projectId: string, patch: DbRow) {
  const existing = getWorkspaceProject(db, workspaceId, projectId);
  if (!existing) return null;
  const next: DbRow = {
    ...existing,
    ...patch,
    resourceHubResourceId: patch.resourceHubResourceId === undefined
      ? existing.resourceHubResourceId
      : patch.resourceHubResourceId,
    cloudTombstonedAt: patch.cloudTombstonedAt === undefined
      ? existing.cloudTombstonedAt
      : patch.cloudTombstonedAt,
    updatedAt: nextUpdatedAt(patch.updatedAt, existing.updatedAt),
  };
  db.prepare(
    `UPDATE workspace_projects
        SET workspace_id = ?,
            visibility = ?,
            resource_state = ?,
            created_by_workspace_member_id = ?,
            updated_by_workspace_member_id = ?,
            resource_hub_resource_id = ?,
            cloud_tombstoned_at = ?,
            sync_state = ?,
            version = ?,
            updated_at = ?
      WHERE workspace_id = ? AND project_id = ?`,
  ).run(
    workspaceId,
    next.visibility,
    next.resourceState,
    next.createdByWorkspaceMemberId ?? null,
    next.updatedByWorkspaceMemberId ?? null,
    next.resourceHubResourceId ?? null,
    next.cloudTombstonedAt ?? null,
    next.syncState ?? null,
    next.version ?? 1,
    next.updatedAt,
    workspaceId,
    projectId,
  );
  return getWorkspaceProject(db, workspaceId, projectId);
}

/**
 * Update a project's `workspace_projects` row by project alone, reassigning
 * `workspace_id` to whatever the caller passes — the one case where the row's
 * CURRENT workspace is allowed to differ from the workspace this event is
 * asserting.
 *
 * `updateWorkspaceProject` requires the caller to already know the row's
 * current `workspace_id` (its lookup and its `WHERE` both key on it), which is
 * right for callers acting on a row they just read. It is wrong for a remote
 * team-share notification: the local row can predate the share (a personal
 * draft the user made before ever joining the team it just got shared into),
 * so it sits under an unrelated, stale `workspace_id`. Asking
 * `updateWorkspaceProject(db, newWorkspaceId, ...)` in that case finds nothing
 * — same shape of mistake `getWorkspaceProjectByProjectId`'s own doc comment
 * warns about — and the row is silently never migrated: visibility and
 * sync_state stay frozen at whatever they were, so the project never starts
 * pulling the sharer's updates.
 */
export function rebindWorkspaceProject(db: SqliteDb, projectId: string, patch: DbRow) {
  const existing = getWorkspaceProjectByProjectId(db, projectId);
  if (!existing) return null;
  const workspaceId = typeof patch.workspaceId === 'string' ? patch.workspaceId : existing.workspaceId;
  const next: DbRow = {
    ...existing,
    ...patch,
    workspaceId,
    resourceHubResourceId: patch.resourceHubResourceId === undefined
      ? existing.resourceHubResourceId
      : patch.resourceHubResourceId,
    cloudTombstonedAt: patch.cloudTombstonedAt === undefined
      ? existing.cloudTombstonedAt
      : patch.cloudTombstonedAt,
    updatedAt: nextUpdatedAt(patch.updatedAt, existing.updatedAt),
  };
  db.prepare(
    `UPDATE workspace_projects
        SET workspace_id = ?,
            visibility = ?,
            resource_state = ?,
            created_by_workspace_member_id = ?,
            updated_by_workspace_member_id = ?,
            resource_hub_resource_id = ?,
            cloud_tombstoned_at = ?,
            sync_state = ?,
            version = ?,
            updated_at = ?
      WHERE project_id = ?`,
  ).run(
    workspaceId,
    next.visibility,
    next.resourceState,
    next.createdByWorkspaceMemberId ?? null,
    next.updatedByWorkspaceMemberId ?? null,
    next.resourceHubResourceId ?? null,
    next.cloudTombstonedAt ?? null,
    next.syncState ?? null,
    next.version ?? 1,
    next.updatedAt,
    projectId,
  );
  return getWorkspaceProjectByProjectId(db, projectId);
}

export function deleteWorkspaceProject(db: SqliteDb, workspaceId: string, projectId: string): void {
  db.prepare(
    `DELETE FROM workspace_projects
      WHERE workspace_id = ? AND project_id = ?`,
  ).run(workspaceId, projectId);
}

/**
 * The workspace a project's TEAM projection lives in — the project's pinned
 * scope for hub-facing calls (presence, comments). A project shared to (or
 * pulled from) a team has exactly one team-visibility row; personal drafts
 * have none and resolve to null so callers fall back to the local selection.
 */
export function findTeamWorkspaceIdForProject(db: SqliteDb, projectId: string): string | null {
  const row = db.prepare(
    `SELECT workspace_id AS workspaceId
       FROM workspace_projects
      WHERE project_id = ? AND visibility = 'team'
      LIMIT 1`,
  ).get(projectId) as { workspaceId?: string } | undefined;
  const workspaceId = typeof row?.workspaceId === 'string' ? row.workspaceId.trim() : '';
  return workspaceId || null;
}

export function countWorkspaceProjectRefs(db: SqliteDb, projectId: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM workspace_projects
      WHERE project_id = ?`,
  ).get(projectId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

const WORKSPACE_RESOURCE_SELECT_COLUMNS = `
              resource_type AS resourceType,
              resource_id AS resourceId,
              workspace_id AS workspaceId,
              visibility,
              resource_state AS resourceState,
              created_by_workspace_member_id AS createdByWorkspaceMemberId,
              updated_by_workspace_member_id AS updatedByWorkspaceMemberId,
              resource_hub_resource_id AS resourceHubResourceId,
              cloud_tombstoned_at AS cloudTombstonedAt,
              sync_state AS syncState,
              version,
              created_at AS createdAt,
              updated_at AS updatedAt`;

/**
 * The generic counterpart of {@link getWorkspaceProject}, parameterized by
 * `resourceType` ('plugin' | 'skill' | 'design_system' — 'project' itself
 * stays on the dedicated `workspace_projects` table above). Returns null when
 * the resource is unbound OR bound to a DIFFERENT workspace than the one
 * asked about — same "wrong workspace reads as absent" contract as
 * `getWorkspaceProject`.
 */
export function getWorkspaceResource(
  db: SqliteDb,
  resourceType: string,
  workspaceId: string,
  resourceId: string,
) {
  return db
    .prepare(
      `SELECT ${WORKSPACE_RESOURCE_SELECT_COLUMNS}
         FROM workspace_resources
        WHERE resource_type = ? AND workspace_id = ? AND resource_id = ?`,
    )
    .get(resourceType, workspaceId, resourceId) as DbRow | undefined;
}

/**
 * The workspace a resource belongs to, looked up by resource alone (mirrors
 * {@link getWorkspaceProjectByProjectId}). Because `(resource_type,
 * resource_id)` is the table's primary key, a resource can only ever have
 * ONE binding row — this is the question to ask before binding a resource
 * anywhere, not the two-key form above.
 */
export function getWorkspaceResourceByResourceId(
  db: SqliteDb,
  resourceType: string,
  resourceId: string,
) {
  return db
    .prepare(
      `SELECT ${WORKSPACE_RESOURCE_SELECT_COLUMNS}
         FROM workspace_resources
        WHERE resource_type = ? AND resource_id = ?`,
    )
    .get(resourceType, resourceId) as DbRow | undefined;
}

export function listWorkspaceResources(db: SqliteDb, resourceType: string, workspaceId: string) {
  return db
    .prepare(
      `SELECT ${WORKSPACE_RESOURCE_SELECT_COLUMNS}
         FROM workspace_resources
        WHERE resource_type = ? AND workspace_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(resourceType, workspaceId) as DbRow[];
}

/** Workspace ids that still own a live Team resource binding.
 *
 * Background reconciliation uses this persisted witness after restarts. It
 * deliberately returns ids only; callers must resolve each id against the
 * current authoritative Workspace directory before touching the resource hub.
 */
export function listTeamWorkspaceResourceWorkspaceIds(db: SqliteDb): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT workspace_id AS workspaceId
         FROM workspace_resources
        WHERE visibility = 'team'
          AND resource_state != 'deleted'
        ORDER BY workspace_id`,
    )
    .all() as Array<{ workspaceId: string }>;
  return rows.map((row) => row.workspaceId);
}

/**
 * Bind a resource to a workspace, or return the binding it already has.
 *
 * Deliberately keyed on `(resourceType, resourceId)`, not on `(workspace,
 * resource)` — see {@link ensureWorkspaceProject}'s doc comment for why: a
 * resource already bound elsewhere is returned as-is rather than bound a
 * second time, which is what makes this idempotent across workspaces and
 * what the `(resource_type, resource_id)` primary key enforces physically.
 */
export function ensureWorkspaceResource(
  db: SqliteDb,
  resourceType: string,
  workspaceId: string,
  resourceId: string,
  input: DbRow = {},
) {
  const now = Date.now();
  const existing = getWorkspaceResourceByResourceId(db, resourceType, resourceId);
  if (existing) return existing;
  db.prepare(
    `INSERT INTO workspace_resources
       (resource_type, resource_id, workspace_id, visibility, resource_state,
        created_by_workspace_member_id, updated_by_workspace_member_id,
        resource_hub_resource_id, cloud_tombstoned_at,
        sync_state, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    resourceType,
    resourceId,
    workspaceId,
    input.visibility ?? 'personal',
    input.resourceState ?? null,
    input.createdByWorkspaceMemberId ?? null,
    input.updatedByWorkspaceMemberId ?? input.createdByWorkspaceMemberId ?? null,
    input.resourceHubResourceId ?? null,
    input.cloudTombstonedAt ?? null,
    input.syncState ?? null,
    input.version ?? 1,
    input.createdAt ?? now,
    input.updatedAt ?? now,
  );
  return getWorkspaceResource(db, resourceType, workspaceId, resourceId);
}

export function updateWorkspaceResource(
  db: SqliteDb,
  resourceType: string,
  workspaceId: string,
  resourceId: string,
  patch: DbRow,
) {
  const existing = getWorkspaceResource(db, resourceType, workspaceId, resourceId);
  if (!existing) return null;
  const next: DbRow = {
    ...existing,
    ...patch,
    resourceHubResourceId: patch.resourceHubResourceId === undefined
      ? existing.resourceHubResourceId
      : patch.resourceHubResourceId,
    cloudTombstonedAt: patch.cloudTombstonedAt === undefined
      ? existing.cloudTombstonedAt
      : patch.cloudTombstonedAt,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE workspace_resources
        SET workspace_id = ?,
            visibility = ?,
            resource_state = ?,
            created_by_workspace_member_id = ?,
            updated_by_workspace_member_id = ?,
            resource_hub_resource_id = ?,
            cloud_tombstoned_at = ?,
            sync_state = ?,
            version = ?,
            updated_at = ?
      WHERE resource_type = ? AND workspace_id = ? AND resource_id = ?`,
  ).run(
    workspaceId,
    next.visibility,
    next.resourceState ?? null,
    next.createdByWorkspaceMemberId ?? null,
    next.updatedByWorkspaceMemberId ?? null,
    next.resourceHubResourceId ?? null,
    next.cloudTombstonedAt ?? null,
    next.syncState ?? null,
    next.version ?? 1,
    next.updatedAt,
    resourceType,
    workspaceId,
    resourceId,
  );
  return getWorkspaceResource(db, resourceType, workspaceId, resourceId);
}

export function deleteWorkspaceResource(
  db: SqliteDb,
  resourceType: string,
  workspaceId: string,
  resourceId: string,
): void {
  db.prepare(
    `DELETE FROM workspace_resources
      WHERE resource_type = ? AND workspace_id = ? AND resource_id = ?`,
  ).run(resourceType, workspaceId, resourceId);
}

/**
 * Delete a resource's binding row regardless of which workspace it is
 * currently bound to. Callers that delete the resource's underlying record
 * (e.g. plugin uninstall) MUST call this — there is no ON DELETE CASCADE for
 * this table (see the table's doc comment in `migrate()`), so skipping this
 * leaves an orphan `workspace_resources` row pointing at nothing.
 */
export function deleteWorkspaceResourceByResourceId(
  db: SqliteDb,
  resourceType: string,
  resourceId: string,
): void {
  db.prepare(
    `DELETE FROM workspace_resources
      WHERE resource_type = ? AND resource_id = ?`,
  ).run(resourceType, resourceId);
}

export function listLatestProjectRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT c.project_id AS projectId,
              m.run_id AS runId,
              m.run_status AS status,
              m.events_json AS eventsJson,
              COALESCE(m.ended_at, m.started_at, m.created_at) AS updatedAt
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.run_status IS NOT NULL
        ORDER BY updatedAt DESC`,
    )
    .all() as DbRow[];
  const latestByProject = new Map<string, DbRow>();
  for (const row of rows) {
    if (!latestByProject.has(row.projectId)) {
      latestByProject.set(row.projectId, {
        value: projectDisplayStatusForRunRow(row.status, row.eventsJson),
        updatedAt: Number(row.updatedAt),
        runId: row.runId ?? undefined,
      });
    }
  }
  return latestByProject;
}

// A terminal `succeeded` run whose PERSISTED events show unfinished declared
// work (a non-`completed` TodoWrite task) projects as `incomplete`, never
// `succeeded`, so the project pill can't read "Completed" for a run whose work
// is not actually done (#1247 / #1060). Derived from the same events the chat
// footer reads, so the two surfaces cannot disagree, and it survives reload
// because the events were persisted per-event as the run streamed.
function projectDisplayStatusForRunRow(status: unknown, eventsJson: unknown) {
  const normalized = normalizeProjectRunStatus(status);
  if (normalized !== 'succeeded') return normalized;
  const events = parseJsonOrUndef(eventsJson);
  return eventsEndedWithUnfinishedWork(events) ? 'incomplete' : normalized;
}

export function listLatestConversationRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT m.conversation_id AS conversationId,
              m.run_id AS runId,
              m.run_status AS status,
              COALESCE(m.ended_at, m.started_at, m.created_at) AS updatedAt,
              m.position AS position
         FROM messages m
        WHERE m.run_status IS NOT NULL
        ORDER BY updatedAt DESC, m.position DESC`,
    )
    .all() as DbRow[];
  const latestByConversation = new Map<string, DbRow>();
  for (const row of rows) {
    if (!latestByConversation.has(row.conversationId)) {
      latestByConversation.set(row.conversationId, {
        value: normalizeProjectRunStatus(row.status),
        updatedAt: Number(row.updatedAt),
        runId: row.runId ?? undefined,
      });
    }
  }
  return latestByConversation;
}

export function listFirstConversationRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT m.conversation_id AS conversationId,
              m.run_id AS runId,
              m.run_status AS status,
              COALESCE(m.ended_at, m.started_at, m.created_at) AS updatedAt,
              m.position AS position
         FROM messages m
        WHERE m.run_status IS NOT NULL
          AND m.run_id IS NOT NULL
        ORDER BY m.position ASC`,
    )
    .all() as DbRow[];
  const firstByConversation = new Map<string, DbRow>();
  for (const row of rows) {
    if (!firstByConversation.has(row.conversationId)) {
      firstByConversation.set(row.conversationId, {
        value: normalizeProjectRunStatus(row.status),
        updatedAt: Number(row.updatedAt),
        runId: row.runId ?? undefined,
      });
    }
  }
  return firstByConversation;
}

export function listLatestRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT m.run_id AS runId,
              m.run_status AS status,
              COALESCE(m.ended_at, m.started_at, m.created_at) AS updatedAt,
              m.position AS position
         FROM messages m
        WHERE m.run_status IS NOT NULL
          AND m.run_id IS NOT NULL
        ORDER BY updatedAt DESC, m.position DESC`,
    )
    .all() as DbRow[];
  const latestByRun = new Map<string, DbRow>();
  for (const row of rows) {
    if (!latestByRun.has(row.runId)) {
      latestByRun.set(row.runId, {
        value: normalizeProjectRunStatus(row.status),
        updatedAt: Number(row.updatedAt),
        runId: row.runId ?? undefined,
      });
    }
  }
  return latestByRun;
}

/**
 * Cheap SQL prefilter for the awaiting-input latch.
 *
 * Only a prefilter: every renderable form necessarily contains one of these
 * substrings, so the predicate is a strict superset of the real answer and
 * cannot drop a genuine form. `ask-question` is an accepted alias for
 * `question-form` (UI parser + daemon detector), so an alias-form turn must be
 * a candidate too. The authoritative test is `emittedRenderableQuestionForm`,
 * applied to the candidate content in JS.
 */
const AWAITING_INPUT_MARKER_PREFILTER = `(
                LOWER(m.content) LIKE '%<question-form%'
                OR LOWER(m.content) LIKE '%<ask-question%'
              )`;

interface AwaitingInputCandidate {
  partitionKey: string;
  conversationId: string;
  createdAt: number;
  position: number;
  content: string;
}

type AwaitingInputWinner = Omit<AwaitingInputCandidate, 'partitionKey' | 'content'>;

/**
 * Which partitions are still waiting on an answer to a form the user can see?
 *
 * The invariant this preserves, unchanged from the single-statement query it
 * replaces: within each partition take the NEWEST form-bearing assistant
 * message (`created_at DESC, position DESC`), then report the partition only if
 * that message's own conversation has no later user message. A partition whose
 * newest form was already answered is not awaiting input, even when an older
 * unanswered form exists elsewhere in it.
 *
 * The strict check has to run BEFORE the newest-per-partition pick, not after
 * it. Post-filtering the winning rows would silently change which message is
 * considered latest: a stray, unrenderable marker emitted after a real
 * unanswered form would win the partition, fail the check, and drop a project
 * that is genuinely waiting on the user. So the pick happens here, over rows
 * already reduced to those that actually render.
 */
function listPartitionsAwaitingInput(
  db: SqliteDb,
  candidates: Iterable<AwaitingInputCandidate>,
): Set<string> {
  // Streamed, and the winner keeps no `content`: this runs on every
  // `GET /api/projects`, and the candidate set is every form-bearing assistant
  // message the database has ever stored. Materializing those turns' full text
  // would grow the cost of listing projects with the length of the history.
  const winners = new Map<string, AwaitingInputWinner>();
  for (const candidate of candidates) {
    if (winners.has(candidate.partitionKey)) continue;
    if (!emittedRenderableQuestionForm(candidate.content)) continue;
    winners.set(candidate.partitionKey, {
      conversationId: candidate.conversationId,
      createdAt: candidate.createdAt,
      position: candidate.position,
    });
  }
  // The loop above drains the row iterator before this point, so no statement
  // executes while it is still open.
  const laterUserReply = db.prepare(
    `SELECT 1
       FROM messages reply
      WHERE reply.conversation_id = ?
        AND reply.role = 'user'
        AND (
          reply.created_at > ?
          OR (reply.created_at = ? AND reply.position > ?)
        )
      LIMIT 1`,
  );
  const awaiting = new Set<string>();
  for (const [partitionKey, winner] of winners) {
    const answered = laterUserReply.get(
      winner.conversationId,
      winner.createdAt,
      winner.createdAt,
      winner.position,
    );
    if (!answered) awaiting.add(partitionKey);
  }
  return awaiting;
}

export function listProjectsAwaitingInput(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT c.project_id AS partitionKey,
              m.conversation_id AS conversationId,
              m.created_at AS createdAt,
              m.position AS position,
              m.content AS content
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.role = 'assistant'
          AND ${AWAITING_INPUT_MARKER_PREFILTER}
        ORDER BY m.created_at DESC, m.position DESC`,
    )
    .iterate() as Iterable<AwaitingInputCandidate>;
  return listPartitionsAwaitingInput(db, rows);
}

export function listConversationsAwaitingInput(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT m.conversation_id AS partitionKey,
              m.conversation_id AS conversationId,
              m.created_at AS createdAt,
              m.position AS position,
              m.content AS content
         FROM messages m
        WHERE m.role = 'assistant'
          AND ${AWAITING_INPUT_MARKER_PREFILTER}
        ORDER BY m.created_at DESC, m.position DESC`,
    )
    .iterate() as Iterable<AwaitingInputCandidate>;
  return listPartitionsAwaitingInput(db, rows);
}

export function getProject(db: SqliteDb, id: string) {
  const row = db
    .prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return row ? normalizeProject(row) : null;
}

export function insertProject(db: SqliteDb, p: DbRow) {
  db.prepare(
    `INSERT INTO projects
       (id, name, skill_id, design_system_id, pending_prompt,
        metadata_json, custom_instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.name,
    p.skillId ?? null,
    p.designSystemId ?? null,
    p.pendingPrompt ?? null,
    p.metadata ? JSON.stringify(p.metadata) : null,
    p.customInstructions ?? null,
    p.createdAt,
    p.updatedAt,
  );
  return getProject(db, p.id);
}

export function updateProject(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getProject(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: nextUpdatedAt(patch.updatedAt, existing.updatedAt),
  };
  db.prepare(
    `UPDATE projects
        SET name = ?,
            skill_id = ?,
            design_system_id = ?,
            pending_prompt = ?,
            metadata_json = ?,
            custom_instructions = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.name,
    merged.skillId ?? null,
    merged.designSystemId ?? null,
    merged.pendingPrompt ?? null,
    merged.metadata ? JSON.stringify(merged.metadata) : null,
    merged.customInstructions ?? null,
    merged.updatedAt,
    id,
  );
  return getProject(db, id);
}

export function deleteProject(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

function normalizeProject(row: DbRow) {
  let metadata;
  if (row.metadataJson) {
    try {
      metadata = JSON.parse(row.metadataJson);
    } catch {
      metadata = undefined;
    }
  }
  return {
    id: row.id,
    name: row.name,
    skillId: row.skillId,
    designSystemId: row.designSystemId,
    pendingPrompt: row.pendingPrompt ?? undefined,
    metadata,
    appliedPluginSnapshotId: row.appliedPluginSnapshotId ?? undefined,
    customInstructions: row.customInstructions ?? undefined,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function normalizeProjectRunStatus(status: unknown) {
  if (status === 'starting') return 'running';
  if (status === 'cancelled') return 'canceled';
  if (
    status === 'queued' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'canceled'
  ) {
    return status;
  }
  return 'not_started';
}

// ---------- templates ----------

export function listTemplates(db: SqliteDb) {
  return (db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates
        ORDER BY created_at DESC`,
    )
    .all() as DbRow[])
    .map(normalizeTemplate);
}

export function getTemplate(db: SqliteDb, id: string) {
  const row = db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates WHERE id = ?`,
    )
    .get(id) as DbRow | undefined;
  return row ? normalizeTemplate(row) : null;
}

export function findTemplateByNameAndProject(
  db: SqliteDb,
  name: string,
  sourceProjectId: string,
) {
  const row = db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates
        WHERE name = ? AND source_project_id = ?`,
    )
    .get(name, sourceProjectId) as DbRow | undefined;
  return row ? normalizeTemplate(row) : null;
}

export function insertTemplate(db: SqliteDb, t: DbRow) {
  db.prepare(
    `INSERT INTO templates (id, name, description, source_project_id, files_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    t.id,
    t.name,
    t.description ?? null,
    t.sourceProjectId ?? null,
    JSON.stringify(t.files ?? []),
    t.createdAt,
  );
  return getTemplate(db, t.id);
}

export function updateTemplate(
  db: SqliteDb,
  id: string,
  t: { description: string | null; files: unknown[] },
) {
  db.prepare(
    `UPDATE templates SET description = ?, files_json = ? WHERE id = ?`,
  ).run(t.description, JSON.stringify(t.files), id);
  return getTemplate(db, id);
}

export function deleteTemplate(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
}

function normalizeTemplate(row: DbRow) {
  let files = [];
  try {
    files = JSON.parse(row.filesJson || '[]');
  } catch {
    files = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sourceProjectId: row.sourceProjectId ?? undefined,
    files,
    createdAt: Number(row.createdAt),
  };
}

// ---------- conversations ----------

export function listConversations(db: SqliteDb, projectId: string) {
  const listed = rows(db
    .prepare(
      `WITH project_conversations AS (
          SELECT id, project_id AS projectId, title, session_mode AS sessionMode,
                 created_at AS createdAt, updated_at AS updatedAt
           FROM conversations
           WHERE project_id = ?
             AND id NOT LIKE 'comment-anchor-%'
        ),
        latest_runs AS (
          SELECT conversation_id AS conversationId,
                 run_status AS latestRunStatus,
                 started_at AS latestRunStartedAt,
                 ended_at AS latestRunEndedAt,
                 id AS latestRunMessageId
            FROM (
              SELECT m.conversation_id,
                     m.run_status,
                     m.started_at,
                     m.ended_at,
                     m.id,
                     ROW_NUMBER() OVER (
                       PARTITION BY m.conversation_id
                       ORDER BY m.position DESC
                     ) AS rn
                FROM messages m
                JOIN project_conversations c ON c.id = m.conversation_id
               WHERE m.role = 'assistant'
                 AND m.run_status IS NOT NULL
            )
           WHERE rn = 1
        ),
        message_counts AS (
          SELECT m.conversation_id AS conversationId,
                 COUNT(*) AS messageCount
            FROM messages m
            JOIN project_conversations c ON c.id = m.conversation_id
           GROUP BY m.conversation_id
        ),
        total_run_durations AS (
          SELECT m.conversation_id AS conversationId,
                 SUM(${terminalRunDurationSql('m')}) AS totalDurationMs
            FROM messages m
            JOIN project_conversations c ON c.id = m.conversation_id
           WHERE m.role = 'assistant'
             AND m.run_status IN ('succeeded', 'failed', 'canceled')
           GROUP BY m.conversation_id
        )
        SELECT c.id, c.projectId, c.title, c.sessionMode, c.createdAt, c.updatedAt,
               COALESCE(mc.messageCount, 0) AS messageCount,
               lr.latestRunStatus, lr.latestRunStartedAt,
               lr.latestRunEndedAt, lr.latestRunMessageId,
               trd.totalDurationMs
          FROM project_conversations c
          LEFT JOIN latest_runs lr ON lr.conversationId = c.id
          LEFT JOIN message_counts mc ON mc.conversationId = c.id
          LEFT JOIN total_run_durations trd ON trd.conversationId = c.id
         ORDER BY c.updatedAt DESC`,
    )
    .all(projectId));
  return attachLatestRunEvents(db, listed).map(normalizeConversation);
}

/**
 * Resolve `latestRunEventsJson` for the rows that actually need it.
 *
 * The summary only reads the event log to recover a `durationMs` from the run's
 * last `usage` event, and only when the run's timestamps cannot supply one (see
 * `conversationRunSummaryFromRow`). Selecting `events_json` inside the
 * `latest_runs` window function instead forces SQLite to materialize the full
 * event log of every assistant message in the project just to order them —
 * unbounded work for a field the common path never looks at, since event logs
 * grow with tool output (image tool results carry inline base64).
 *
 * So the query carries only the message id, and the log is fetched here for the
 * few rows whose timestamps are incomplete. A project whose runs all ended
 * normally reads no event logs at all.
 */
function attachLatestRunEvents(db: SqliteDb, listed: DbRow[]): DbRow[] {
  // Mirror `conversationRunSummaryFromRow`'s own nullish handling exactly: it
  // maps a null timestamp to `undefined` before the finiteness check, so a null
  // column means "no duration available from timestamps". Testing
  // `Number.isFinite(Number(value))` instead would treat null as 0 — a finite
  // number — and silently skip the fetch for precisely the rows that need it.
  const hasBothTimestamps = (row: DbRow) =>
    row.latestRunStartedAt != null
    && row.latestRunEndedAt != null
    && Number.isFinite(Number(row.latestRunStartedAt))
    && Number.isFinite(Number(row.latestRunEndedAt));

  const pending = listed.filter(
    (row) => row.latestRunMessageId != null && !hasBothTimestamps(row),
  );
  if (pending.length === 0) return listed;

  const statement = db.prepare(
    `SELECT events_json AS eventsJson FROM messages WHERE id = ?`,
  );
  for (const row of pending) {
    const found = statement.get(row.latestRunMessageId) as DbRow | undefined;
    row.latestRunEventsJson = found?.eventsJson ?? null;
  }
  return listed;
}

/**
 * Return the conversation that was inserted first for a project.
 *
 * Project creation seeds this row before any side conversations exist.
 * `created_at` normally identifies it, while `rowid` preserves insertion
 * order when two conversations are created within the same millisecond.
 * Keep this separate from `listConversations`, whose updated-at ordering is a
 * user-facing recency contract.
 */
export function getFirstProjectConversation(db: SqliteDb, projectId: string) {
  const result = db
    .prepare(
      `SELECT id
         FROM conversations
        WHERE project_id = ?
        ORDER BY created_at ASC, rowid ASC
        LIMIT 1`,
    )
    .get(projectId) as { id?: unknown } | undefined;
  return typeof result?.id === 'string'
    ? getConversation(db, result.id)
    : null;
}

export function getConversation(db: SqliteDb, id: string) {
  const r = db
    .prepare(
      `SELECT id, project_id AS projectId, title, session_mode AS sessionMode,
              created_at AS createdAt, updated_at AS updatedAt,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) AS messageCount
         FROM conversations WHERE id = ?`,
    )
    .get(id) as DbRow | undefined;
  if (!r) return null;
  return {
    ...normalizeConversation(r),
    latestRun: latestConversationRunSummary(db, r.id) ?? undefined,
    ...numberProperty('totalDurationMs', totalConversationRunDurationMs(db, r.id)),
  };
}

function normalizeConversation(r: DbRow) {
  const latestRun = conversationRunSummaryFromRow({
    runStatus: r.latestRunStatus,
    startedAt: r.latestRunStartedAt,
    endedAt: r.latestRunEndedAt,
    eventsJson: r.latestRunEventsJson,
  });
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title ?? null,
    sessionMode: normalizeConversationSessionMode(r.sessionMode),
    messageCount: Number(r.messageCount ?? 0),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    ...numberProperty('totalDurationMs', r.totalDurationMs),
    latestRun: latestRun ?? undefined,
  };
}

export function normalizeConversationSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' || value === 'plan' ? value : 'design';
}

function numberProperty(key: string, value: unknown) {
  const n = value == null ? undefined : Number(value);
  return typeof n === 'number' && Number.isFinite(n) ? { [key]: n } : {};
}

function latestConversationRunSummary(db: SqliteDb, conversationId: string) {
  const row = db
    .prepare(
      `SELECT run_status AS runStatus,
              started_at AS startedAt,
              ended_at AS endedAt,
              events_json AS eventsJson
         FROM messages
        WHERE conversation_id = ?
          AND role = 'assistant'
          AND run_status IS NOT NULL
        ORDER BY position DESC
        LIMIT 1`,
    )
    .get(conversationId) as DbRow | undefined;
  return conversationRunSummaryFromRow(row);
}

function totalConversationRunDurationMs(db: SqliteDb, conversationId: string): number | undefined {
  const row = db
    .prepare(
      `SELECT SUM(${terminalRunDurationSql()}) AS totalDurationMs
         FROM messages
        WHERE conversation_id = ?
          AND role = 'assistant'
          AND run_status IN ('succeeded', 'failed', 'canceled')`,
    )
    .get(conversationId) as DbRow | undefined;
  return row?.totalDurationMs == null ? undefined : Number(row.totalDurationMs);
}

function terminalRunDurationSql(alias?: string) {
  const p = alias ? `${alias}.` : '';
  return `CASE
            WHEN ${p}started_at IS NOT NULL AND ${p}ended_at IS NOT NULL THEN
              CASE
                WHEN CAST(${p}ended_at AS INTEGER) >= CAST(${p}started_at AS INTEGER)
                  THEN CAST(${p}ended_at AS INTEGER) - CAST(${p}started_at AS INTEGER)
                ELSE 0
              END
            ELSE (
              SELECT CASE
                       WHEN json_extract(usage_event.value, '$.durationMs') >= 0
                         THEN json_extract(usage_event.value, '$.durationMs')
                       ELSE 0
                     END
                FROM json_each(
                  CASE
                    WHEN json_valid(${p}events_json) AND json_type(${p}events_json) = 'array'
                      THEN ${p}events_json
                    ELSE '[]'
                  END
                ) AS usage_event
               WHERE usage_event.type = 'object'
                 AND json_extract(usage_event.value, '$.kind') = 'usage'
                 AND json_type(usage_event.value, '$.durationMs') IN ('integer', 'real')
               ORDER BY CAST(usage_event.key AS INTEGER) DESC
               LIMIT 1
            )
          END`;
}

function conversationRunSummaryFromRow(row: DbRow | undefined) {
  if (!row || typeof row.runStatus !== 'string') return null;
  const startedAt = row.startedAt == null ? undefined : Number(row.startedAt);
  const endedAt = row.endedAt == null ? undefined : Number(row.endedAt);
  const usageDurationMs = latestUsageDurationMs(row.eventsJson);
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(endedAt)
      ? Math.max(0, (endedAt as number) - (startedAt as number))
      : usageDurationMs;
  return {
    status: row.runStatus,
    ...(Number.isFinite(startedAt) ? { startedAt } : {}),
    ...(Number.isFinite(endedAt) ? { endedAt } : {}),
    ...(typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? { durationMs }
      : {}),
  };
}

function latestUsageDurationMs(eventsJson: unknown): number | undefined {
  if (typeof eventsJson !== 'string' || eventsJson.length === 0) return undefined;
  try {
    const events = JSON.parse(eventsJson);
    if (!Array.isArray(events)) return undefined;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (
        event &&
        typeof event === 'object' &&
        event.kind === 'usage' &&
        typeof event.durationMs === 'number' &&
        Number.isFinite(event.durationMs)
      ) {
        return Math.max(0, event.durationMs);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function insertConversation(db: SqliteDb, c: DbRow) {
  db.prepare(
    `INSERT INTO conversations
       (id, project_id, title, session_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id,
    c.projectId,
    c.title ?? null,
    normalizeConversationSessionMode(c.sessionMode),
    c.createdAt,
    c.updatedAt,
  );
  return getConversation(db, c.id);
}

export function updateConversation(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getConversation(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    sessionMode: Object.prototype.hasOwnProperty.call(patch, 'sessionMode')
      ? normalizeConversationSessionMode(patch.sessionMode)
      : existing.sessionMode,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE conversations
        SET title = ?, session_mode = ?, updated_at = ? WHERE id = ?`,
  ).run(merged.title ?? null, merged.sessionMode, merged.updatedAt, id);
  return getConversation(db, id);
}

export function deleteConversation(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

// ---------- conversation intent signals ----------

// Latched per-conversation intent detections (deck / media / platform).
// These gate stable-region prompt blocks; the latch keeps a signal from
// flipping OFF when the visible transcript is trimmed (agent switch) or the
// client never resends prior turns. Keyed by conversation only — intent
// belongs to the conversation, not the agent.
export interface ConversationIntentSignals {
  deck: boolean;
  media: boolean;
  platform: boolean;
  /**
   * Which handheld shell the user's own words asked for (OD Next prototype
   * tasks). Latches like the booleans: the first resolved platform holds for
   * the conversation so a later "make the button blue" turn keeps quoting the
   * same shell and the stable context does not flip.
   */
  devicePlatform: OdNextDevicePlatformV1 | null;
}

const NO_INTENT_SIGNALS: ConversationIntentSignals = {
  deck: false,
  media: false,
  platform: false,
  devicePlatform: null,
};

function normalizeDevicePlatform(value: unknown): OdNextDevicePlatformV1 | null {
  return value === 'ios' || value === 'android' || value === 'mobile-neutral' ? value : null;
}

/**
 * Read the conversation's latched intent signals. A missing row, NULL
 * column, or unparsable value all read as all-false (pre-hotfix
 * conversations and fresh rows).
 */
export function readConversationIntentSignals(
  db: SqliteDb,
  conversationId: string,
): ConversationIntentSignals {
  const row = db
    .prepare(`SELECT intent_signals_json AS intentSignalsJson FROM conversations WHERE id = ?`)
    .get(conversationId) as DbRow | undefined;
  return normalizeIntentSignals(row?.intentSignalsJson);
}

function normalizeIntentSignals(value: unknown): ConversationIntentSignals {
  if (typeof value !== 'string' || value.length === 0) return { ...NO_INTENT_SIGNALS };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    return {
      deck: parsed?.deck === true,
      media: parsed?.media === true,
      platform: parsed?.platform === true,
      devicePlatform: normalizeDevicePlatform(parsed?.devicePlatform),
    };
  } catch {
    return { ...NO_INTENT_SIGNALS };
  }
}

/**
 * Latch this turn's fresh intent detections onto the conversation:
 * `effective = stored OR fresh`, persisted only when it changes. Signals
 * only ever turn ON for the life of a conversation (monotonic), so a
 * genuine mid-conversation activation costs exactly one stable-prompt miss
 * and a later signal-free turn cannot flip it back OFF. A conversationId
 * without a persisted row degrades to fresh detection (nothing to latch on).
 *
 * The read+merge+write runs inside a BEGIN IMMEDIATE transaction: the write
 * lock is taken before the read, so no other connection can commit between
 * them and clobber a previously latched bit. Within one daemon process the
 * sequence is already non-interleavable (better-sqlite3 is synchronous and
 * there is no await point between read and write); the transaction pins the
 * monotonic guarantee against future refactors and multi-connection writers.
 */
export function latchConversationIntentSignals(
  db: SqliteDb,
  conversationId: string,
  fresh: ConversationIntentSignals,
): ConversationIntentSignals {
  const latch = db.transaction((): ConversationIntentSignals => {
    const stored = readConversationIntentSignals(db, conversationId);
    const effective: ConversationIntentSignals = {
      deck: stored.deck || fresh.deck,
      media: stored.media || fresh.media,
      platform: stored.platform || fresh.platform,
      devicePlatform: stored.devicePlatform ?? fresh.devicePlatform ?? null,
    };
    if (
      effective.deck !== stored.deck ||
      effective.media !== stored.media ||
      effective.platform !== stored.platform ||
      effective.devicePlatform !== stored.devicePlatform
    ) {
      db.prepare(`UPDATE conversations SET intent_signals_json = ? WHERE id = ?`).run(
        JSON.stringify(effective),
        conversationId,
      );
    }
    return effective;
  });
  return latch.immediate();
}

// ---------- agent sessions ----------

export function getAgentSession(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT session_id FROM agent_sessions
        WHERE conversation_id = ? AND agent_id = ?`,
    )
    .get(conversationId, agentId) as DbRow | undefined;
  return row && typeof row.session_id === 'string' ? row.session_id : null;
}

export function upsertAgentSession(
  db: SqliteDb,
  input: {
    conversationId: string;
    agentId: string;
    sessionId: string;
    stablePromptHash?: string | null;
    stablePromptSections?: string | null;
    model?: string | null;
    cwd?: string | null;
    lastMessageId?: string | null;
    lastInputTokens?: number | null;
  },
): void {
  const lastInputTokens =
    typeof input.lastInputTokens === 'number' &&
    Number.isSafeInteger(input.lastInputTokens) &&
    input.lastInputTokens >= 0 &&
    input.lastInputTokens <= 1_000_000_000
      ? input.lastInputTokens
      : null;
  db.prepare(
    `INSERT INTO agent_sessions
       (conversation_id, agent_id, session_id, stable_prompt_hash, stable_prompt_sections,
        model, cwd, last_message_id, last_input_tokens, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id, agent_id)
       DO UPDATE SET session_id = excluded.session_id,
                     stable_prompt_hash = excluded.stable_prompt_hash,
                     stable_prompt_sections = excluded.stable_prompt_sections,
                     model = excluded.model,
                     cwd = excluded.cwd,
                     last_message_id = excluded.last_message_id,
                     last_input_tokens = CASE
                       WHEN excluded.session_id = agent_sessions.session_id
                         THEN COALESCE(excluded.last_input_tokens, agent_sessions.last_input_tokens)
                       ELSE excluded.last_input_tokens
                     END,
                     updated_at = excluded.updated_at`,
  ).run(
    input.conversationId,
    input.agentId,
    input.sessionId,
    input.stablePromptHash ?? null,
    input.stablePromptSections ?? null,
    input.model ?? null,
    input.cwd ?? null,
    input.lastMessageId ?? null,
    lastInputTokens,
    Date.now(),
  );
}

export function getAgentSessionRecord(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
): {
  sessionId: string;
  stablePromptHash: string | null;
  stablePromptSections: string | null;
  model: string | null;
  cwd: string | null;
  lastMessageId: string | null;
  lastInputTokens: number | null;
} | null {
  const row = db
    .prepare(
      `SELECT session_id, stable_prompt_hash, stable_prompt_sections, model, cwd, last_message_id,
              last_input_tokens
         FROM agent_sessions
        WHERE conversation_id = ? AND agent_id = ?`,
    )
    .get(conversationId, agentId) as DbRow | undefined;
  if (!row || typeof row.session_id !== 'string') return null;
  return {
    sessionId: row.session_id,
    stablePromptHash:
      typeof row.stable_prompt_hash === 'string' ? row.stable_prompt_hash : null,
    stablePromptSections:
      typeof row.stable_prompt_sections === 'string' ? row.stable_prompt_sections : null,
    model: typeof row.model === 'string' ? row.model : null,
    cwd: typeof row.cwd === 'string' ? row.cwd : null,
    lastMessageId: typeof row.last_message_id === 'string' ? row.last_message_id : null,
    lastInputTokens:
      typeof row.last_input_tokens === 'number' &&
      Number.isSafeInteger(row.last_input_tokens) &&
      row.last_input_tokens >= 0 &&
      row.last_input_tokens <= 1_000_000_000
        ? row.last_input_tokens
        : null,
  };
}

// Conversation cursor for the resume identity guard: the id of the latest
// COMPLETED assistant message in the conversation, EXCLUDING the current run's
// in-flight placeholder (`excludeMessageId`). At resolve time the session is in
// sync iff this equals the assistant message the session last produced —
// otherwise another agent completed a turn in between, or the session's own last
// message was edited/removed, and the session is behind. Returns null when there
// is no prior completed assistant turn.
//
// "Completed" means run_status = 'succeeded' — a run stamps its assistant
// message with the terminal status on finish (server.ts), so an intervening
// agent run that FAILED or was CANCELED leaves a placeholder that produced no
// completed turn; counting it as advancement would force a needless cold reseed
// (silently disabling the resume perf path) even though the stored session is
// still the latest completed turn. In-flight placeholders have a null run_status
// and are likewise excluded.
//
// `resumableMessageId` is the one allowed exception: the resume-on-failure path
// persists a session whose own last assistant turn FAILED transiently (the CLI
// session already committed a tool/artifact block and is resumable). That stored
// id is admitted through the filter so the session it owns still matches its
// cursor — while a DIFFERENT later failed/canceled turn (a different id) stays
// excluded, so genuine advancement by a later succeeded turn is still detected.
export function latestCompletedAssistantMessageId(
  db: SqliteDb,
  conversationId: string,
  excludeMessageId: string,
  resumableMessageId: string | null = null,
): string | null {
  const row = db
    .prepare(
      // `excludeMessageId` keeps the caller's in-flight placeholder — which the
      // stored session has never seen — from counting as advancement. When that
      // placeholder IS the stored cursor (a daemon-internal restart re-entering
      // with the same message), the session did produce it, so the exclusion
      // must not apply: that is what `resumableMessageId` is for, and the
      // exclusion used to consume the row before the admission could.
      // Advancement detection is unaffected — any later `succeeded` message
      // still wins on `position DESC` and still fails the cursor comparison.
      `SELECT id FROM messages
        WHERE conversation_id = ? AND role = 'assistant'
          AND (id != ? OR id = ?)
          AND (run_status = 'succeeded' OR id = ?)
        ORDER BY position DESC LIMIT 1`,
    )
    .get(
      conversationId,
      excludeMessageId,
      resumableMessageId,
      resumableMessageId,
    ) as DbRow | undefined;
  return row && typeof row.id === 'string' ? row.id : null;
}

export function updateAgentSessionStableHash(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
  stablePromptHash: string,
): void {
  db.prepare(
    `UPDATE agent_sessions SET stable_prompt_hash = ?, updated_at = ?
      WHERE conversation_id = ? AND agent_id = ?`,
  ).run(stablePromptHash, Date.now(), conversationId, agentId);
}

export function clearAgentSession(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
): void {
  db.prepare(
    `DELETE FROM agent_sessions WHERE conversation_id = ? AND agent_id = ?`,
  ).run(conversationId, agentId);
}

// ---------- messages ----------

/**
 * Number of messages in a conversation.
 *
 * For emptiness checks prefer this over `listMessages(...).length`: the latter
 * loads and parses every message's JSON columns — including the event log,
 * which grows with tool output — to answer a question `COUNT(*)` answers
 * without touching them.
 */
export function countMessages(db: SqliteDb, conversationId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?`)
    .get(conversationId) as DbRow | undefined;
  return Number(row?.count ?? 0);
}

export function listMessages(db: SqliteDb, conversationId: string) {
  const messages = db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              result_delivery_state AS resultDeliveryState,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              trace_object_files_json AS traceObjectFilesJson,
              feedback_json AS feedbackJson,
              pre_turn_file_names_json AS preTurnFileNamesJson,
              session_mode AS sessionMode,
              run_context_json AS runContextJson,
              task_analytics_json AS taskAnalyticsJson,
              applied_plugin_snapshot_json AS appliedPluginSnapshotJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages
        WHERE conversation_id = ?
        ORDER BY position ASC`,
    )
    .all(conversationId) as DbRow[];
  const eventBatches = readConversationMessageEventBatches(db, conversationId);
  return messages.map((message) => normalizeMessage(
    db,
    message,
    eventBatches.get(String(message.id)) ?? [],
  ));
}

export function getMessage(db: SqliteDb, id: string, conversationId?: string) {
  const row = db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              result_delivery_state AS resultDeliveryState,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              trace_object_files_json AS traceObjectFilesJson,
              feedback_json AS feedbackJson,
              pre_turn_file_names_json AS preTurnFileNamesJson,
              session_mode AS sessionMode,
              run_context_json AS runContextJson,
              applied_plugin_snapshot_json AS appliedPluginSnapshotJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages
        WHERE id = ?${conversationId ? ' AND conversation_id = ?' : ''}`,
    )
    .get(conversationId ? [id, conversationId] : id) as DbRow | undefined;
  return row ? normalizeMessage(db, row) : null;
}

export function conversationTurnIndexForRun(
  db: SqliteDb,
  conversationId: string,
  runId: string,
): number | null {
  const row = db
    .prepare(
      `SELECT (
          SELECT COUNT(*)
            FROM messages AS previous
           WHERE previous.conversation_id = current.conversation_id
             AND previous.role = 'assistant'
             AND previous.run_id IS NOT NULL
             AND previous.position < current.position
        ) AS conversationTurnIndex
         FROM messages AS current
        WHERE current.conversation_id = ?
          AND current.role = 'assistant'
          AND current.run_id = ?
        ORDER BY current.position ASC
        LIMIT 1`,
    )
    .get(conversationId, runId) as DbRow | undefined;
  const index = row?.conversationTurnIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0
    ? index
    : null;
}

export function upsertMessage(db: SqliteDb, conversationId: string, m: DbRow) {
  const persistedEvents = Array.isArray(m.events)
    ? compactAdjacentMessageAgentEvents(m.events)
    : m.events;
  const eventBatchProjection = hasMessageEventBatchStorage(db)
    ? `EXISTS(
                SELECT 1 FROM message_event_batches AS batch
                 WHERE batch.message_id = messages.id
              )`
    : '0';
  const existing = db
    .prepare(
      `SELECT position, run_id AS runId, run_status AS runStatus,
              content, events_json AS eventsJson,
              task_analytics_json AS taskAnalyticsJson,
              ${eventBatchProjection} AS hasEventBatches
         FROM messages WHERE id = ?`,
    )
    .get(m.id) as DbRow | undefined;
  const now = Date.now();
  if (existing) {
    // While the daemon owns an active run, its append-only batches are the
    // event source of truth. Browser PUT snapshots can arrive between two
    // daemon flushes; writing that whole snapshot here would duplicate the
    // same events when the next batch is read or finalized.
    const incomingRunIsTerminal = isTerminalMessageRunStatus(m.runStatus);
    const preserveDaemonEventSnapshot =
      existing.hasEventBatches === 1 ||
      (typeof existing.runId === 'string' &&
        (existing.runStatus === 'queued' || existing.runStatus === 'running') &&
        !incomingRunIsTerminal);
    const nextEventsJson = preserveDaemonEventSnapshot
      ? existing.eventsJson ?? null
      : persistedEvents
        ? JSON.stringify(persistedEvents)
        : null;
    const nextContent = preserveDaemonEventSnapshot
      ? existing.content ?? ''
      : m.content;
    // A turn's recovery lineage is written once, by whoever owns the turn. A
    // rewrite that carries no opinion about it — above all the run-create seed,
    // which rebuilds this row from the request that won the claim — must not
    // erase it, or an accepted answer loses the logical task it belongs to
    // after a reload. An explicit null still clears it.
    const nextTaskAnalyticsJson =
      m.taskAnalytics === undefined
        ? ((existing.taskAnalyticsJson as string | null) ?? null)
        : m.taskAnalytics
          ? JSON.stringify(m.taskAnalytics)
          : null;
    db.prepare(
      `UPDATE messages
          SET role = ?, content = ?, agent_id = ?, agent_name = ?,
              run_id = ?, run_status = ?, result_delivery_state = ?, last_run_event_id = ?,
              events_json = ?, attachments_json = ?, comment_attachments_json = ?,
              produced_files_json = ?, trace_object_files_json = ?, feedback_json = ?,
              pre_turn_file_names_json = ?,
              session_mode = ?, run_context_json = ?, task_analytics_json = ?,
              applied_plugin_snapshot_json = ?,
              telemetry_finalized_at = CASE
                WHEN ? THEN COALESCE(telemetry_finalized_at, ?)
                ELSE telemetry_finalized_at
              END,
              started_at = ?, ended_at = ?
        WHERE id = ?`,
    ).run(
      m.role,
      nextContent,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      normalizeResultDeliveryStateForStorage(m.resultDeliveryState),
      m.lastRunEventId ?? null,
      nextEventsJson,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.traceObjectFiles ? JSON.stringify(m.traceObjectFiles) : null,
      m.feedback ? JSON.stringify(m.feedback) : null,
      m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
      normalizeMessageSessionModeForStorage(m.sessionMode),
      m.runContext ? JSON.stringify(m.runContext) : null,
      nextTaskAnalyticsJson,
      m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
      m.telemetryFinalized === true ? 1 : 0,
      now,
      m.startedAt ?? null,
      m.endedAt ?? null,
      m.id,
    );
  } else {
    const max = db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = ?`,
      )
      .get(conversationId) as DbRow | undefined;
    const position = (max?.m ?? -1) + 1;
    const createdAt = typeof m.createdAt === 'number' && Number.isFinite(m.createdAt)
      ? m.createdAt
      : now;
    // 25 values: id, conversation_id, role, content, agent_id, agent_name,
    // run_id, run_status, result_delivery_state, last_run_event_id, events_json, attachments_json,
    // comment_attachments_json, produced_files_json, trace_object_files_json,
    // feedback_json, pre_turn_file_names_json, session_mode, run_context_json,
    // task_analytics_json, applied_plugin_snapshot_json,
    // telemetry_finalized_at, started_at, ended_at, position, created_at.
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, role, content, agent_id, agent_name,
          run_id, run_status, result_delivery_state, last_run_event_id, events_json,
          attachments_json, comment_attachments_json, produced_files_json,
          trace_object_files_json, feedback_json, pre_turn_file_names_json,
          session_mode, run_context_json, task_analytics_json,
          applied_plugin_snapshot_json,
          telemetry_finalized_at, started_at, ended_at, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id,
      conversationId,
      m.role,
      m.content,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      normalizeResultDeliveryStateForStorage(m.resultDeliveryState),
      m.lastRunEventId ?? null,
      persistedEvents ? JSON.stringify(persistedEvents) : null,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.traceObjectFiles ? JSON.stringify(m.traceObjectFiles) : null,
      m.feedback ? JSON.stringify(m.feedback) : null,
      m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
      normalizeMessageSessionModeForStorage(m.sessionMode),
      m.runContext ? JSON.stringify(m.runContext) : null,
      m.taskAnalytics ? JSON.stringify(m.taskAnalytics) : null,
      m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
      m.telemetryFinalized === true ? now : null,
      m.startedAt ?? null,
      m.endedAt ?? null,
      position,
      createdAt,
    );
  }
  // Bump conversation activity so the sidebar's recency sort works.
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(
    now,
    conversationId,
  );
  const row = db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              result_delivery_state AS resultDeliveryState,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              trace_object_files_json AS traceObjectFilesJson,
              feedback_json AS feedbackJson,
              pre_turn_file_names_json AS preTurnFileNamesJson,
              session_mode AS sessionMode,
              run_context_json AS runContextJson,
              task_analytics_json AS taskAnalyticsJson,
              applied_plugin_snapshot_json AS appliedPluginSnapshotJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages WHERE id = ?`,
    )
    .get(m.id) as DbRow | undefined;
  return row ? normalizeMessage(db, row) : null;
}

export function getMessageTelemetryFinalizationState(db: SqliteDb, messageId: string) {
  const row = db
    .prepare(
      `SELECT telemetry_finalized_at AS telemetryFinalizedAt
         FROM messages
        WHERE id = ?`,
    )
    .get(messageId) as DbRow | undefined;
  if (!row) {
    return {
      exists: false,
      finalizedAt: null,
    };
  }
  return {
    exists: true,
    finalizedAt:
      typeof row.telemetryFinalizedAt === 'number' ? row.telemetryFinalizedAt : null,
  };
}

export function appendMessageStatusEvent(db: SqliteDb, messageId: string, event: DbRow) {
  const label = typeof event?.label === 'string' ? event.label.trim() : '';
  const detail = typeof event?.detail === 'string' ? event.detail.trim() : '';
  if (!label) return null;
  // Status events are written outside the high-volume run stream (for
  // example, routine completion). Fold any crash-left batches first so this
  // update cannot strand or overwrite them.
  finalizeMessageAgentEvents(db, messageId);
  const row = db
    .prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
    .get(messageId) as DbRow | undefined;
  if (!row) return null;
  const parsed = parseJsonOrUndef(row.eventsJson);
  const events = Array.isArray(parsed) ? parsed : [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === label && (last.detail ?? '') === detail) {
    return events;
  }
  const nextEvent = detail
    ? { kind: 'status', label, detail }
    : { kind: 'status', label };
  const next = [...events, nextEvent];
  db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`)
    .run(JSON.stringify(next), messageId);
  return next;
}

export function compactAdjacentMessageAgentEvents(
  incomingEvents: readonly DbRow[],
): DbRow[] {
  const events: DbRow[] = [];
  for (const event of incomingEvents) {
    const kind = typeof event?.kind === 'string' ? event.kind : '';
    const last = events[events.length - 1];
    const isMergeableDelta =
      (kind === 'text' || kind === 'thinking') && typeof event?.text === 'string';
    if (isMergeableDelta && last?.kind === kind && typeof last.text === 'string') {
      events[events.length - 1] = { ...last, text: last.text + event.text };
    } else {
      events.push(event);
    }
  }
  return events;
}

function mergeMessageAgentEvents(
  existingEvents: readonly DbRow[],
  incomingEvents: readonly DbRow[],
): DbRow[] {
  const events = compactAdjacentMessageAgentEvents(existingEvents);
  for (const event of incomingEvents) {
    if (!event || typeof event !== 'object') continue;
    const kind = typeof event.kind === 'string' ? event.kind : '';
    if (!kind) continue;
    const last = events[events.length - 1];
    const isMergeableDelta =
      (kind === 'text' || kind === 'thinking') && typeof event.text === 'string';
    if (isMergeableDelta && last?.kind === kind && typeof last.text === 'string') {
      last.text += event.text;
      continue;
    }
    if (!isMergeableDelta && last && JSON.stringify(last) === JSON.stringify(event)) {
      continue;
    }
    events.push(event);
  }
  return events;
}

const messageEventBatchStorageByDb = new WeakMap<SqliteDb, boolean>();

function hasMessageEventBatchStorage(db: SqliteDb): boolean {
  const cached = messageEventBatchStorageByDb.get(db);
  if (cached !== undefined) return cached;
  let exists = false;
  try {
    exists = Boolean(
      db.prepare(
        `SELECT 1
           FROM sqlite_master
          WHERE type = 'table' AND name = 'message_event_batches'`,
      ).get(),
    );
  } catch {
    // A few integration boundaries deliberately expose only the prepared
    // statements they consume. Treat those lightweight DB adapters like a
    // pre-batch schema and preserve the legacy snapshot behavior.
  }
  messageEventBatchStorageByDb.set(db, exists);
  return exists;
}

export function clearMessageAgentEventBatches(db: SqliteDb, messageId: string): void {
  if (!hasMessageEventBatchStorage(db)) return;
  db.prepare(`DELETE FROM message_event_batches WHERE message_id = ?`).run(messageId);
}

function readMessageEventBatches(db: SqliteDb, messageId: string): DbRow[][] {
  if (!hasMessageEventBatchStorage(db)) return [];
  const rows = db.prepare(
    `SELECT events_json AS eventsJson
       FROM message_event_batches
      WHERE message_id = ?
      ORDER BY id ASC`,
  ).all(messageId) as DbRow[];
  return rows.flatMap((batch) => {
    const parsed = parseJsonOrUndef(batch.eventsJson);
    return Array.isArray(parsed) ? [parsed] : [];
  });
}

function readConversationMessageEventBatches(
  db: SqliteDb,
  conversationId: string,
): Map<string, DbRow[][]> {
  if (!hasMessageEventBatchStorage(db)) return new Map();
  const rows = db.prepare(
    `SELECT batch.message_id AS messageId, batch.events_json AS eventsJson
       FROM message_event_batches AS batch
       JOIN messages AS message ON message.id = batch.message_id
      WHERE message.conversation_id = ?
      ORDER BY batch.id ASC`,
  ).all(conversationId) as DbRow[];
  const batches = new Map<string, DbRow[][]>();
  for (const row of rows) {
    const parsed = parseJsonOrUndef(row.eventsJson);
    if (!Array.isArray(parsed)) continue;
    const messageId = String(row.messageId);
    const messageBatches = batches.get(messageId) ?? [];
    messageBatches.push(parsed);
    batches.set(messageId, messageBatches);
  }
  return batches;
}

function materializeMessageAgentEvents(
  db: SqliteDb,
  messageId: string,
  eventsJson: unknown,
  eventBatches?: DbRow[][],
): { events: DbRow[]; batchCount: number; baseEventCount: number; textDelta: string } {
  const parsed = parseJsonOrUndef(eventsJson);
  const baseEvents = Array.isArray(parsed) ? parsed : [];
  let events = compactAdjacentMessageAgentEvents(baseEvents);
  const batches = eventBatches ?? readMessageEventBatches(db, messageId);
  let textDelta = '';
  for (const batch of batches) {
    for (const event of batch) {
      if (event?.kind === 'text' && typeof event.text === 'string') textDelta += event.text;
    }
    events = mergeMessageAgentEvents(events, batch);
  }
  return {
    events,
    batchCount: batches.length,
    baseEventCount: baseEvents.length,
    textDelta,
  };
}

export function appendMessageAgentEvents(
  db: SqliteDb,
  messageId: string,
  incomingEvents: readonly DbRow[],
): DbRow[] | null {
  if (incomingEvents.length === 0) return null;
  const events = mergeMessageAgentEvents([], incomingEvents);
  if (events.length === 0) return null;
  if (!hasMessageEventBatchStorage(db)) {
    const row = db
      .prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get(messageId) as DbRow | undefined;
    if (!row) return null;
    const parsed = parseJsonOrUndef(row.eventsJson);
    const existingEvents = Array.isArray(parsed) ? parsed : [];
    const materializedEvents = mergeMessageAgentEvents(existingEvents, events);
    const textDelta = events
      .filter((event) => event?.kind === 'text' && typeof event.text === 'string')
      .map((event) => event.text)
      .join('');
    db.prepare(
      `UPDATE messages
          SET content = COALESCE(content, '') || ?, events_json = ?
        WHERE id = ?`,
    ).run(textDelta, JSON.stringify(materializedEvents), messageId);
    return materializedEvents;
  }
  const inserted = db.prepare(
    `INSERT INTO message_event_batches (message_id, events_json, created_at)
     SELECT ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM messages WHERE id = ?)`,
  ).run(messageId, JSON.stringify(events), Date.now(), messageId);
  return inserted.changes > 0 ? events : null;
}

export function finalizeMessageAgentEvents(
  db: SqliteDb,
  messageId: string,
): DbRow[] | null {
  return db.transaction(() => {
    const row = db.prepare(
      `SELECT events_json AS eventsJson FROM messages WHERE id = ?`,
    ).get(messageId) as DbRow | undefined;
    if (!row) return null;
    const materialized = materializeMessageAgentEvents(db, messageId, row.eventsJson);
    if (materialized.batchCount === 0 || !hasMessageEventBatchStorage(db)) {
      return materialized.events;
    }
    db.prepare(
      `UPDATE messages
          SET content = COALESCE(content, '') || ?, events_json = ?
        WHERE id = ?`,
    ).run(materialized.textDelta, JSON.stringify(materialized.events), messageId);
    clearMessageAgentEventBatches(db, messageId);
    return materialized.events;
  })();
}

export function appendMessageAgentEvent(
  db: SqliteDb,
  messageId: string,
  event: DbRow,
): DbRow[] | null {
  return appendMessageAgentEvents(db, messageId, [event]);
}

export function deleteMessage(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
}

// ---------- preview comments ----------

const PREVIEW_COMMENT_STATUSES = new Set([
  'open',
  'attached',
  'applying',
  'needs_review',
  'resolved',
  'failed',
]);

export function listPreviewComments(db: SqliteDb, projectId: string, conversationId: string) {
  return (db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson, style_json AS styleJson,
              attachments_json AS attachmentsJson,
              slide_index AS slideIndex,
              anchor_state AS anchorState, anchored_version AS anchoredVersion,
              author_member_id AS authorMemberId, last_good_position_json AS lastGoodPositionJson,
              pin_seq AS pinSeq, sort_key AS sortKey,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC, rowid ASC`,
    )
    .all(projectId, conversationId) as DbRow[])
    .map(normalizePreviewComment);
}

/**
 * Team preview annotations are project resources, not chat transcript rows.
 * Different daemons intentionally use different local conversation ids as the
 * SQLite foreign-key anchor, so shared reads must not filter on that local id.
 */
export function listProjectPreviewComments(db: SqliteDb, projectId: string) {
  return (db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson, style_json AS styleJson,
              attachments_json AS attachmentsJson,
              slide_index AS slideIndex,
              anchor_state AS anchorState, anchored_version AS anchoredVersion,
              author_member_id AS authorMemberId, last_good_position_json AS lastGoodPositionJson,
              pin_seq AS pinSeq, sort_key AS sortKey,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE project_id = ?
        ORDER BY created_at ASC, rowid ASC`,
    )
    .all(projectId) as DbRow[])
    .map(normalizePreviewComment);
}

export interface UpsertPreviewCommentOptions {
  /**
   * True when this project currently syncs comments to the collab cloud (see
   * `shouldSyncProjectComments`), so a genuinely NEW comment's `pin_seq`
   * starts unconfirmed (0) instead of final (1). Ignored on the edit branch —
   * `pin_seq`/`pin_seq_confirmed`/`sort_key` are assigned exactly once, at
   * creation, and never revisited by an edit. Only meaningful together with a
   * later `confirmPreviewCommentPinSeq` call once the cloud push resolves.
   */
  pinPendingCloudConfirm?: boolean;
}

export function upsertPreviewComment(
  db: SqliteDb,
  projectId: string,
  conversationId: string,
  input: DbRow,
  options: UpsertPreviewCommentOptions = {},
) {
  const target = input?.target ?? {};
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  const attachmentsProvided = Object.prototype.hasOwnProperty.call(input ?? {}, 'attachments');
  const incomingAttachments = normalizePreviewCommentAttachments(input?.attachments);
  const filePath = cleanRequiredString(target.filePath, 'filePath');
  const elementId = cleanRequiredString(target.elementId, 'elementId');
  const selector = cleanRequiredString(target.selector, 'selector');
  const label = cleanRequiredString(target.label, 'label');
  const text = typeof target.text === 'string' ? compactWhitespace(target.text).slice(0, 160) : '';
  const htmlHint = typeof target.htmlHint === 'string' ? compactWhitespace(target.htmlHint).slice(0, 180) : '';
  const position = normalizePosition(target.position);
  const selectionKind = target.selectionKind === 'pod' ? 'pod' : 'element';
  const podMembers = selectionKind === 'pod' ? normalizePodMembers(target.podMembers) : [];
  const style = normalizeAnnotationStyle(target.style);
  const memberCount = selectionKind === 'pod'
    ? (podMembers.length > 0
        ? podMembers.length
        : Number.isFinite(target.memberCount)
          ? Math.max(0, Math.round(target.memberCount))
          : 0)
    : 0;
  const slideIndex = Number.isFinite(target.slideIndex) ? Math.max(0, Math.round(target.slideIndex)) : null;
  const slideKey = slideIndex ?? -1;
  // Team collaboration creation metadata. anchor_state / last_good_position stay null at
  // creation — the drift ladder resolves and writes them back (updatePreviewCommentAnchor).
  const anchoredVersion = Number.isFinite(target.anchoredVersion)
    ? Math.max(0, Math.round(target.anchoredVersion))
    : null;
  const authorMemberId =
    typeof input?.authorMemberId === 'string' && input.authorMemberId.trim()
      ? input.authorMemberId.trim()
      : null;
  const requestedId =
    typeof input?.id === 'string' && input.id.trim()
      ? input.id.trim()
      : null;
  const now = Date.now();
  const existing = requestedId
    ? db
        .prepare(
          `SELECT id, created_at AS createdAt, attachments_json AS attachmentsJson
             FROM preview_comments
            WHERE id = ? AND project_id = ? AND conversation_id = ?`,
        )
        .get(requestedId, projectId, conversationId) as DbRow | undefined
    : undefined;
  const id = existing?.id ?? requestedId ?? randomCommentId();
  const createdAt = existing?.createdAt ?? now;
  const existingAttachments = normalizePreviewCommentAttachments(parseJsonOrUndef(existing?.attachmentsJson));
  const attachments = attachmentsProvided ? incomingAttachments : existingAttachments;
  // A comment must carry either a note or at least one image attachment.
  if (!note && attachments.length === 0) throw new Error('comment note required');
  // pin_seq / pin_seq_confirmed / sort_key are assigned exactly once, on the
  // INSERT branch, and are absent from the ON CONFLICT SET clause below so an
  // edit (existing !== undefined) never rewrites them — see
  // recvq5BVsolIxi / UpsertPreviewCommentOptions above. Computed against THIS
  // db file only: safe as the initial guess even when a sibling device
  // concurrently computes the same number for its own new comment, because a
  // team-shared project's pin_seq_confirmed=0 row gets reconciled to the
  // collab-cloud's globally-serialized seq by confirmPreviewCommentPinSeq
  // once its push resolves (never by recomputing locally again).
  let pinSeq: number | null = null;
  let sortKey: number | null = null;
  let pinSeqConfirmed = 1;
  if (!existing) {
    const pinScope = db
      .prepare(
        `SELECT COALESCE(MAX(pin_seq), 0) AS maxPinSeq
           FROM preview_comments
          WHERE project_id = ? AND file_path = ?`,
      )
      .get(projectId, filePath) as DbRow;
    pinSeq = Number(pinScope?.maxPinSeq ?? 0) + 1;
    const sortScope = db
      .prepare(
        `SELECT COALESCE(MAX(sort_key), 0) AS maxSortKey
           FROM preview_comments
          WHERE project_id = ? AND file_path = ?`,
      )
      .get(projectId, filePath) as DbRow;
    sortKey = Number(sortScope?.maxSortKey ?? 0) + 1;
    pinSeqConfirmed = options.pinPendingCloudConfirm ? 0 : 1;
  }
  db.prepare(
    `INSERT INTO preview_comments
       (id, project_id, conversation_id, file_path, element_id, selector, label,
        text, position_json, html_hint, selection_kind, member_count, pod_members_json,
        style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at,
        anchored_version, author_member_id, pin_seq, pin_seq_confirmed, sort_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       selector = excluded.selector,
       label = excluded.label,
       text = excluded.text,
       position_json = excluded.position_json,
       html_hint = excluded.html_hint,
       selection_kind = excluded.selection_kind,
       member_count = excluded.member_count,
       pod_members_json = excluded.pod_members_json,
       style_json = excluded.style_json,
       attachments_json = excluded.attachments_json,
       slide_index = excluded.slide_index,
       note = excluded.note,
       status = 'open',
       anchored_version = excluded.anchored_version,
       author_member_id = excluded.author_member_id,
       updated_at = excluded.updated_at
     WHERE preview_comments.project_id = excluded.project_id
       AND preview_comments.conversation_id = excluded.conversation_id`,
  ).run(
    id,
    projectId,
    conversationId,
    filePath,
    elementId,
    selector,
    label,
    text,
    JSON.stringify(position),
    htmlHint,
    selectionKind,
    selectionKind === 'pod' ? memberCount : null,
    selectionKind === 'pod' ? JSON.stringify(podMembers) : null,
    style ? JSON.stringify(style) : null,
    attachments.length > 0 ? JSON.stringify(attachments) : null,
    slideIndex,
    slideKey,
    note,
    'open',
    createdAt,
    now,
    anchoredVersion,
    authorMemberId,
    pinSeq,
    pinSeqConfirmed,
    sortKey,
  );
  return getPreviewComment(db, projectId, conversationId, id);
}

/**
 * Reconcile a comment's provisional `pin_seq` to the collab-cloud's
 * confirmed, globally-serialized push `seq` — the step that closes the
 * cross-device race: two daemons that each computed the same local
 * `MAX(pin_seq)+1` for a comment created in the same ~5s poll window
 * converge to distinct numbers once their own push resolves, because the
 * guard below only ever applies ONCE per comment (idempotent — a later edit's
 * push resolving after the create's is a harmless no-op here). Returns false
 * when the row was already confirmed (nothing to do) or does not exist.
 */
export function confirmPreviewCommentPinSeq(
  db: SqliteDb,
  projectId: string,
  id: string,
  seq: number,
): boolean {
  if (!Number.isFinite(seq)) return false;
  const result = db
    .prepare(
      `UPDATE preview_comments
          SET pin_seq = ?, pin_seq_confirmed = 1
        WHERE id = ? AND project_id = ? AND pin_seq_confirmed = 0`,
    )
    .run(Math.round(seq), id, projectId);
  return result.changes > 0;
}

/**
 * Persist the dragged comment's new sidebar position (Phase 2 of
 * recvq5BVsolIxi). The client computes `sortKey` itself (a midpoint between
 * the dragged item's new neighbors) — this is a single-row write, never a
 * table-wide renumber, and never touches `pin_seq`.
 */
export function reorderPreviewComment(
  db: SqliteDb,
  projectId: string,
  conversationId: string,
  id: string,
  sortKey: number,
) {
  db.prepare(
    `UPDATE preview_comments
        SET sort_key = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?`,
  ).run(sortKey, id, projectId, conversationId);
  return getPreviewComment(db, projectId, conversationId, id);
}

export function updatePreviewCommentStatus(db: SqliteDb, projectId: string, conversationId: string, id: string, status: string) {
  if (!PREVIEW_COMMENT_STATUSES.has(status)) throw new Error('invalid comment status');
  const now = Date.now();
  db.prepare(
    `UPDATE preview_comments
        SET status = ?, updated_at = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?`,
  ).run(status, now, id, projectId, conversationId);
  return getPreviewComment(db, projectId, conversationId, id);
}

/**
 * Team collaboration drift-ladder write-back: persist how a comment resolved this render.
 * `lastGoodPosition`/`anchoredVersion` are COALESCEd so a `lost` resolve (which omits
 * them) keeps the last known-good values instead of wiping them. Does not bump
 * `updated_at` — anchor resolution is a derived read, not a content edit.
 */
export function updatePreviewCommentAnchor(
  db: SqliteDb,
  projectId: string,
  conversationId: string,
  id: string,
  input: DbRow,
) {
  const anchorState = typeof input?.anchorState === 'string' ? input.anchorState : null;
  const lastGoodPosition = input?.lastGoodPosition ? normalizePosition(input.lastGoodPosition) : null;
  const anchoredVersion = Number.isFinite(input?.anchoredVersion)
    ? Math.max(0, Math.round(input.anchoredVersion))
    : null;
  db.prepare(
    `UPDATE preview_comments
        SET anchor_state = ?,
            last_good_position_json = COALESCE(?, last_good_position_json),
            anchored_version = COALESCE(?, anchored_version)
      WHERE id = ? AND project_id = ? AND conversation_id = ?`,
  ).run(
    anchorState,
    lastGoodPosition ? JSON.stringify(lastGoodPosition) : null,
    anchoredVersion,
    id,
    projectId,
    conversationId,
  );
  return getPreviewComment(db, projectId, conversationId, id);
}

export function deletePreviewComment(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  const result = db
    .prepare(
      `DELETE FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .run(id, projectId, conversationId);
  return result.changes > 0;
}

/** Return the most-recently updated local conversation for a project. */
export function getLatestConversationIdForProject(
  db: SqliteDb,
  projectId: string,
  excludeConversationId: string | null = null,
): string | null {
  const row = db
    .prepare(
      `SELECT id FROM conversations
        WHERE project_id = ?
          AND id NOT LIKE ?
          AND (? IS NULL OR id != ?)
        ORDER BY updated_at DESC, rowid DESC
        LIMIT 1`,
    )
    .get(
      projectId,
      `${PROJECT_COMMENT_ANCHOR_PREFIX}%`,
      excludeConversationId,
      excludeConversationId,
    ) as DbRow | undefined;
  return row && typeof row.id === 'string' ? row.id : null;
}

const PROJECT_COMMENT_ANCHOR_PREFIX = 'comment-anchor-';

export function isProjectCommentAnchorConversationId(
  conversationId: string,
): boolean {
  return conversationId.startsWith(PROJECT_COMMENT_ANCHOR_PREFIX);
}

/**
 * Return the daemon-local conversation reserved for Team preview comments.
 *
 * Synced comments are project resources, while conversation ids are private to
 * each daemon. A dedicated empty conversation gives those rows a stable FK that
 * does not follow whichever chat happened to be updated most recently.
 */
export function getProjectCommentAnchorConversationId(
  db: SqliteDb,
  projectId: string,
  excludeConversationId: string | null = null,
): string | null {
  const row = db
    .prepare(
      `SELECT id FROM conversations
        WHERE project_id = ?
          AND id LIKE ?
          AND (? IS NULL OR id != ?)
        ORDER BY created_at ASC, rowid ASC
        LIMIT 1`,
    )
    .get(
      projectId,
      `${PROJECT_COMMENT_ANCHOR_PREFIX}%`,
      excludeConversationId,
      excludeConversationId,
    ) as DbRow | undefined;
  return row && typeof row.id === 'string' ? row.id : null;
}

/**
 * Ensure a Team project has one dedicated LOCAL conversation row that preview
 * comments can use as their stable foreign-key anchor.
 *
 * Conversation ids and chat transcripts are daemon-local; Team project
 * materialization deliberately does not copy the owner's private conversations
 * or messages. A member mirror can therefore have zero conversations even
 * after every shared file is present. Preview comments still need a local
 * conversation FK, so the materializer creates one empty reserved thread exactly
 * once. Ordinary chat conversations never become comment anchors.
 */
export function ensureProjectCommentAnchorConversation(
  db: SqliteDb,
  projectId: string,
  now = Date.now(),
  excludeConversationId: string | null = null,
): { conversationId: string; created: boolean } | null {
  const existing = getProjectCommentAnchorConversationId(
    db,
    projectId,
    excludeConversationId,
  );
  if (existing) return { conversationId: existing, created: false };
  if (!getProject(db, projectId)) return null;

  const conversationId = `${PROJECT_COMMENT_ANCHOR_PREFIX}${randomUUID()}`;
  insertConversation(db, {
    id: conversationId,
    projectId,
    title: null,
    sessionMode: 'design',
    createdAt: now,
    updatedAt: now,
  });
  return { conversationId, created: true };
}

/**
 * Ensure a normal daemon-local conversation exists for UI/comment HTTP
 * routing. The internal comment anchor is deliberately excluded: it must never
 * become the user's active chat, but a read-only Team mirror with no private
 * chat still needs one routable conversation to create and read comments.
 */
export function ensureProjectCommentRoutingConversation(
  db: SqliteDb,
  projectId: string,
  now = Date.now(),
  excludeConversationId: string | null = null,
): { conversationId: string; created: boolean } | null {
  const existing = getLatestConversationIdForProject(
    db,
    projectId,
    excludeConversationId,
  );
  if (existing) return { conversationId: existing, created: false };
  if (!getProject(db, projectId)) return null;

  const conversationId = `conversation-${randomUUID()}`;
  insertConversation(db, {
    id: conversationId,
    projectId,
    title: null,
    sessionMode: 'design',
    createdAt: now,
    updatedAt: now,
  });
  return { conversationId, created: true };
}

export function ensureTeamProjectCommentConversations(
  db: SqliteDb,
  projectId: string,
  now = Date.now(),
  excludeConversationId: string | null = null,
): { anchorCreated: boolean; routingCreated: boolean } {
  return {
    anchorCreated:
      ensureProjectCommentAnchorConversation(
        db,
        projectId,
        now,
        excludeConversationId,
      )?.created === true,
    routingCreated:
      ensureProjectCommentRoutingConversation(
        db,
        projectId,
        now,
        excludeConversationId,
      )?.created === true,
  };
}

/**
 * Repair the comment-anchor invariant for historical active Team projects.
 *
 * Older databases can contain Team bindings created before pulled mirrors and
 * Team shares seeded a local conversation. Comments are project-scoped in the
 * collaboration protocol but still need a daemon-local conversation FK. Run
 * this once at startup instead of mutating the database from a comments GET.
 * Personal and deleted bindings intentionally keep their existing behavior.
 */
export function repairTeamProjectCommentAnchorConversations(
  db: SqliteDb,
  now = Date.now(),
): { checked: number; created: number } {
  const rows = db
    .prepare(
      `SELECT project_id AS projectId
         FROM workspace_projects
        WHERE visibility = 'team'
          AND resource_state != 'deleted'`,
    )
    .all() as Array<{ projectId: string }>;

  let created = 0;
  const repair = db.transaction(() => {
    for (const row of rows) {
      if (ensureTeamProjectCommentConversations(db, row.projectId, now).anchorCreated) {
        created += 1;
      }
    }
  });
  repair();
  return { checked: rows.length, created };
}

/**
 * Delete one validated project conversation while preserving Team comments.
 * A dedicated anchor is established and attached comments are moved to it
 * before the conversation delete can trigger its FK cascade. The whole repair
 * and delete is one SQLite transaction. Personal projects retain the existing
 * cascade-delete behavior.
 */
export function deleteConversationAndRepairTeamCommentAnchor(
  db: SqliteDb,
  projectId: string,
  conversationId: string,
  now = Date.now(),
): { anchorCreated: boolean } {
  let anchorCreated = false;
  const remove = db.transaction(() => {
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    if (binding?.visibility === 'team' && binding.resourceState !== 'deleted') {
      const repaired = ensureTeamProjectCommentConversations(
        db,
        projectId,
        now,
        conversationId,
      );
      anchorCreated = repaired.anchorCreated;
      const anchorConversationId = getProjectCommentAnchorConversationId(
        db,
        projectId,
        conversationId,
      );
      if (anchorConversationId) {
        db.prepare(
          `UPDATE preview_comments
              SET conversation_id = ?
            WHERE project_id = ? AND conversation_id = ?`,
        ).run(anchorConversationId, projectId, conversationId);
      }
    }
    deleteConversation(db, conversationId);
  });
  remove();
  return { anchorCreated };
}

/**
 * Delete a synced comment by its global id (the author daemon's own id). Used to
 * apply an inbound tombstone. Scoped by project so a stray id can't reach across
 * projects. Returns true when a row was removed.
 */
export function deleteSyncedPreviewComment(
  db: SqliteDb,
  projectId: string,
  id: string,
): boolean {
  const result = db
    .prepare(`DELETE FROM preview_comments WHERE id = ? AND project_id = ?`)
    .run(id, projectId);
  return result.changes > 0;
}

/**
 * Merge one collab-cloud comment into local `preview_comments`. The cloud
 * comment's id is used verbatim as the local id (it is the author daemon's own
 * id — a global dedup key), so a comment's whole lifecycle keys off that id:
 *
 * - Tombstone (`deleted: true`): delete the local row by id. Delete wins
 *   unconditionally (it does not compare `updatedAt`).
 * - Create/edit: UPSERT by id. A brand-new id inserts; an existing id updates
 *   IN PLACE only when the incoming `updatedAt` is strictly newer
 *   (last-writer-wins), so a re-pull of an unchanged comment is a no-op and a
 *   stale edit never overwrites a fresher local one. Comments are keyed by id,
 *   so multiple notes on the same element coexist, including from the same
 *   member.
 *
 * `conversationId` is the LOCAL project comment anchor (see
 * getProjectCommentAnchorConversationId);
 * the cloud comment's own conversationId is not a valid FK here. It is only used
 * when inserting a new row — an in-place update keeps the row's existing
 * conversation. Returns true when local state changed (insert, update, or delete).
 */
export function mergeSyncedPreviewComment(
  db: SqliteDb,
  projectId: string,
  conversationId: string,
  comment: CollabCloudComment,
): boolean {
  if (comment.deleted) {
    return deleteSyncedPreviewComment(db, projectId, comment.id);
  }
  const now = Date.now();
  const slideIndex = Number.isFinite(comment.slideIndex)
    ? Math.max(0, Math.round(comment.slideIndex as number))
    : null;
  const slideKey = slideIndex ?? -1;
  const selectionKind = comment.selectionKind === 'pod' ? 'pod' : 'element';
  const podMembers = selectionKind === 'pod' && Array.isArray(comment.podMembers)
    ? comment.podMembers
    : null;
  const memberCount = selectionKind === 'pod'
    ? (podMembers?.length ?? (Number.isFinite(comment.memberCount) ? comment.memberCount : 0))
    : null;
  const status = PREVIEW_COMMENT_STATUSES.has(comment.status) ? comment.status : 'open';
  const attachments = Array.isArray(comment.attachments) && comment.attachments.length > 0
    ? comment.attachments
    : null;
  const anchorState = typeof comment.anchorState === 'string' ? comment.anchorState : null;
  const anchoredVersion = Number.isFinite(comment.anchoredVersion)
    ? Math.max(0, Math.round(comment.anchoredVersion as number))
    : null;
  const updatedAt = Number.isFinite(comment.updatedAt) ? (comment.updatedAt as number) : now;
  const existing = db
    .prepare(`SELECT updated_at AS updatedAt FROM preview_comments WHERE id = ? AND project_id = ?`)
    .get(comment.id, projectId) as DbRow | undefined;
  if (existing) {
    // Last-writer-wins: only apply a strictly-newer edit. Keeps the existing
    // row's conversation/created_at/author identity; refreshes mutable content,
    // status, and drift-ladder anchor state.
    if (updatedAt <= Number(existing.updatedAt ?? 0)) return false;
    db.prepare(
      `UPDATE preview_comments SET
         selector = ?, label = ?, text = ?, position_json = ?, html_hint = ?,
         selection_kind = ?, member_count = ?, pod_members_json = ?, style_json = ?,
         attachments_json = ?, slide_index = ?, slide_key = ?, note = ?, status = ?,
         anchor_state = ?, anchored_version = ?, last_good_position_json = ?, updated_at = ?
       WHERE id = ? AND project_id = ?`,
    ).run(
      comment.selector,
      comment.label,
      typeof comment.text === 'string' ? comment.text : '',
      JSON.stringify(comment.position ?? { x: 0, y: 0, width: 0, height: 0 }),
      typeof comment.htmlHint === 'string' ? comment.htmlHint : '',
      selectionKind,
      memberCount,
      podMembers ? JSON.stringify(podMembers) : null,
      comment.style ? JSON.stringify(comment.style) : null,
      attachments ? JSON.stringify(attachments) : null,
      slideIndex,
      slideKey,
      typeof comment.note === 'string' ? comment.note : '',
      status,
      anchorState,
      anchoredVersion,
      comment.lastGoodPosition ? JSON.stringify(comment.lastGoodPosition) : null,
      updatedAt,
      comment.id,
      projectId,
    );
    return true;
  }
  // New comment. INSERT OR IGNORE guards against a rare id collision without
  // throwing.
  //
  // pin_seq is taken straight from the wire's `seq` — the collab-cloud's own
  // globally-serialized push sequence for this project (see
  // CollabCloudComment.seq) — rather than recomputed as a local MAX+1. That
  // is what makes a comment PULLED from a peer land on the exact same number
  // the peer's own device converged to via confirmPreviewCommentPinSeq: both
  // sides end up keyed off the one authoritative cloud value, never off a
  // second independent local count. Already confirmed (pin_seq_confirmed=1)
  // since the cloud is the source of truth here, not a local guess awaiting
  // reconciliation. Falls back to a local MAX+1 only for a comment that
  // somehow carries no real seq (e.g. an older relay build) so the row still
  // gets a usable number instead of a permanent NULL.
  const createdAt = Number.isFinite(comment.createdAt) ? comment.createdAt : now;
  const hasWireSeq = Number.isFinite(comment.seq) && comment.seq > 0;
  let pinSeq = hasWireSeq ? Math.round(comment.seq) : null;
  if (!hasWireSeq) {
    const pinScope = db
      .prepare(
        `SELECT COALESCE(MAX(pin_seq), 0) AS maxPinSeq
           FROM preview_comments
          WHERE project_id = ? AND file_path = ?`,
      )
      .get(projectId, comment.filePath) as DbRow;
    pinSeq = Number(pinScope?.maxPinSeq ?? 0) + 1;
  }
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO preview_comments
         (id, project_id, conversation_id, file_path, element_id, selector, label,
          text, position_json, html_hint, selection_kind, member_count, pod_members_json,
          style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at,
          anchor_state, anchored_version, author_member_id, last_good_position_json,
          pin_seq, pin_seq_confirmed, sort_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      comment.id,
      projectId,
      conversationId,
      comment.filePath,
      comment.elementId,
      comment.selector,
      comment.label,
      typeof comment.text === 'string' ? comment.text : '',
      JSON.stringify(comment.position ?? { x: 0, y: 0, width: 0, height: 0 }),
      typeof comment.htmlHint === 'string' ? comment.htmlHint : '',
      selectionKind,
      memberCount,
      podMembers ? JSON.stringify(podMembers) : null,
      comment.style ? JSON.stringify(comment.style) : null,
      attachments ? JSON.stringify(attachments) : null,
      slideIndex,
      slideKey,
      typeof comment.note === 'string' ? comment.note : '',
      status,
      createdAt,
      updatedAt,
      anchorState,
      anchoredVersion,
      typeof comment.memberId === 'string' ? comment.memberId : null,
      comment.lastGoodPosition ? JSON.stringify(comment.lastGoodPosition) : null,
      pinSeq,
      1,
      createdAt,
    );
  return result.changes > 0;
}

export function getPreviewComment(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  const row = db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson, style_json AS styleJson,
              attachments_json AS attachmentsJson,
              slide_index AS slideIndex,
              anchor_state AS anchorState, anchored_version AS anchoredVersion,
              author_member_id AS authorMemberId, last_good_position_json AS lastGoodPositionJson,
              pin_seq AS pinSeq, sort_key AS sortKey,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .get(id, projectId, conversationId) as DbRow | undefined;
  return row ? normalizePreviewComment(row) : null;
}

/** Resolve a Team annotation independently from its daemon-local FK anchor. */
export function getProjectPreviewComment(db: SqliteDb, projectId: string, id: string) {
  const row = db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson, style_json AS styleJson,
              attachments_json AS attachmentsJson,
              slide_index AS slideIndex,
              anchor_state AS anchorState, anchored_version AS anchoredVersion,
              author_member_id AS authorMemberId, last_good_position_json AS lastGoodPositionJson,
              pin_seq AS pinSeq, sort_key AS sortKey,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE id = ? AND project_id = ?`,
    )
    .get(id, projectId) as DbRow | undefined;
  return row ? normalizePreviewComment(row) : null;
}

function normalizePreviewComment(row: DbRow) {
  const podMembers = parseJsonOrUndef(row.podMembersJson);
  const normalizedPodMembers = Array.isArray(podMembers) ? podMembers : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    filePath: row.filePath,
    elementId: row.elementId,
    selector: row.selector,
    label: row.label,
    text: row.text,
    position: parseJsonOrUndef(row.positionJson) ?? { x: 0, y: 0, width: 0, height: 0 },
    htmlHint: row.htmlHint,
    style: normalizeAnnotationStyle(parseJsonOrUndef(row.styleJson)),
    selectionKind: row.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      normalizedPodMembers && normalizedPodMembers.length > 0
        ? normalizedPodMembers.length
        : Number.isFinite(row.memberCount)
          ? row.memberCount
          : undefined,
    podMembers: normalizedPodMembers,
    slideIndex: Number.isFinite(row.slideIndex) ? row.slideIndex : undefined,
    note: row.note,
    attachments: normalizePreviewCommentAttachments(parseJsonOrUndef(row.attachmentsJson)),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    anchorState: typeof row.anchorState === 'string' ? row.anchorState : undefined,
    anchoredVersion: Number.isFinite(row.anchoredVersion) ? row.anchoredVersion : undefined,
    authorMemberId: typeof row.authorMemberId === 'string' ? row.authorMemberId : undefined,
    lastGoodPosition: parseJsonOrUndef(row.lastGoodPositionJson),
    pinSeq: Number.isFinite(row.pinSeq) ? row.pinSeq : undefined,
    sortKey: Number.isFinite(row.sortKey) ? row.sortKey : undefined,
  };
}

function normalizePreviewCommentAttachments(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const path = typeof (item as DbRow).path === 'string' ? (item as DbRow).path.trim() : '';
      if (!path) return null;
      const rawName = typeof (item as DbRow).name === 'string' ? (item as DbRow).name.trim() : '';
      return { path, name: rawName || path.split('/').pop() || path };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function cleanRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function normalizePodMembers(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => {
      if (!member || typeof member !== 'object') return null;
      const elementId = cleanRequiredString(member.elementId, 'podMember.elementId');
      const selector = cleanRequiredString(member.selector, 'podMember.selector');
      const label = cleanRequiredString(member.label, 'podMember.label');
      return {
        elementId,
        selector,
        label,
        text:
          typeof member.text === 'string'
            ? compactWhitespace(member.text).slice(0, 160)
            : '',
        position: normalizePosition(member.position),
        htmlHint:
          typeof member.htmlHint === 'string'
            ? compactWhitespace(member.htmlHint).slice(0, 180)
            : '',
        style: normalizeAnnotationStyle(member.style),
      };
    })
    .filter(Boolean);
}

function normalizeAnnotationStyle(input: unknown) {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as DbRow;
  const style: DbRow = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = compactWhitespace(value);
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizePosition(input: unknown) {
  const value: DbRow = input && typeof input === 'object' ? input as DbRow : {};
  return {
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    width: finiteNumber(value.width),
    height: finiteNumber(value.height),
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function randomCommentId(): string {
  return `cmt_${randomUUID().slice(0, 8)}`;
}

const LEGACY_MESSAGE_EVENT_COMPACTION_MIN_CHARS = 256 * 1024;
const MESSAGE_EVENT_MAINTENANCE_QUEUE_LIMIT = 1;

type MessageEventMaintenanceJob =
  | {
      kind: 'compact_legacy';
      messageId: string;
      expectedEventsJson: string;
      events: DbRow[];
    }
  | {
      kind: 'finalize_batches';
      messageId: string;
    };

type MessageEventMaintenanceState = {
  queue: MessageEventMaintenanceJob[];
  queuedMessageIds: Set<string>;
  scheduled: boolean;
  running: boolean;
};

const messageEventMaintenanceStates = new WeakMap<SqliteDb, MessageEventMaintenanceState>();

function isTerminalMessageRunStatus(value: unknown): boolean {
  return value === 'succeeded' || value === 'failed' || value === 'canceled';
}

function scheduleMessageEventMaintenance(
  db: SqliteDb,
  job: MessageEventMaintenanceJob,
): void {
  let state = messageEventMaintenanceStates.get(db);
  if (!state) {
    state = {
      queue: [],
      queuedMessageIds: new Set(),
      scheduled: false,
      running: false,
    };
    messageEventMaintenanceStates.set(db, state);
  }
  if (
    state.queuedMessageIds.has(job.messageId) ||
    state.queuedMessageIds.size >= MESSAGE_EVENT_MAINTENANCE_QUEUE_LIMIT
  ) return;
  state.queue.push(job);
  state.queuedMessageIds.add(job.messageId);
  scheduleNextMessageEventMaintenance(db, state);
}

function scheduleNextMessageEventMaintenance(
  db: SqliteDb,
  state: MessageEventMaintenanceState,
): void {
  if (state.scheduled || state.running || state.queue.length === 0) return;
  state.scheduled = true;
  const immediate = setImmediate(() => {
    state.scheduled = false;
    const job = state.queue.shift();
    if (!job) return;
    state.running = true;
    try {
      if (!db.open) return;
      if (job.kind === 'finalize_batches') {
        finalizeMessageAgentEvents(db, job.messageId);
      } else {
        const compactedJson = JSON.stringify(job.events);
        if (compactedJson.length < job.expectedEventsJson.length) {
          const noPendingBatches = hasMessageEventBatchStorage(db)
            ? `AND NOT EXISTS (
                  SELECT 1 FROM message_event_batches AS batch
                   WHERE batch.message_id = messages.id
                )`
            : '';
          db.prepare(
            `UPDATE messages
                SET events_json = ?
              WHERE id = ?
                AND events_json = ?
                AND run_status IN ('succeeded', 'failed', 'canceled')
                ${noPendingBatches}`,
          ).run(compactedJson, job.messageId, job.expectedEventsJson);
        }
      }
    } catch (error) {
      console.warn('[db] message event maintenance failed', error);
    } finally {
      state.running = false;
      state.queuedMessageIds.delete(job.messageId);
      scheduleNextMessageEventMaintenance(db, state);
    }
  });
  immediate.unref?.();
}

function normalizeMessage(db: SqliteDb, row: DbRow, eventBatches?: DbRow[][]) {
  const eventsJson = typeof row.eventsJson === 'string' ? row.eventsJson : null;
  const materializedEvents = materializeMessageAgentEvents(
    db,
    String(row.id),
    eventsJson,
    eventBatches,
  );
  if (isTerminalMessageRunStatus(row.runStatus)) {
    if (materializedEvents.batchCount > 0) {
      // A terminal row with batches means the daemon stopped between its last
      // append and terminal folding. Recover only when that conversation is
      // actually read; startup never scans or parses every historical row.
      scheduleMessageEventMaintenance(db, {
        kind: 'finalize_batches',
        messageId: String(row.id),
      });
    } else if (
      eventsJson &&
      eventsJson.length >= LEGACY_MESSAGE_EVENT_COMPACTION_MIN_CHARS &&
      materializedEvents.events.length < materializedEvents.baseEventCount
    ) {
      scheduleMessageEventMaintenance(db, {
        kind: 'compact_legacy',
        messageId: String(row.id),
        expectedEventsJson: eventsJson,
        events: materializedEvents.events,
      });
    }
  }
  return {
    id: row.id,
    role: row.role,
    content: `${typeof row.content === 'string' ? row.content : ''}${materializedEvents.textDelta}`,
    agentId: row.agentId ?? undefined,
    agentName: row.agentName ?? undefined,
    runId: row.runId ?? undefined,
    runStatus: row.runStatus ?? undefined,
    resultDeliveryState: normalizeResultDeliveryState(row.resultDeliveryState),
    lastRunEventId: row.lastRunEventId ?? undefined,
    events:
      eventsJson !== null || materializedEvents.batchCount > 0
        ? materializedEvents.events
        : undefined,
    attachments: parseJsonOrUndef(row.attachmentsJson),
    commentAttachments: parseJsonOrUndef(row.commentAttachmentsJson),
    producedFiles: parseJsonOrUndef(row.producedFilesJson),
    traceObjectFiles: parseJsonOrUndef(row.traceObjectFilesJson),
    feedback: parseJsonOrUndef(row.feedbackJson),
    preTurnFileNames: parseJsonOrUndef(row.preTurnFileNamesJson),
    sessionMode: normalizeMessageSessionMode(row.sessionMode),
    runContext: parseJsonOrUndef(row.runContextJson),
    taskAnalytics: parseJsonOrUndef(row.taskAnalyticsJson),
    appliedPluginSnapshot: parseJsonOrUndef(row.appliedPluginSnapshotJson),
    createdAt: row.createdAt ?? undefined,
    startedAt: row.startedAt ?? undefined,
    endedAt: row.endedAt ?? undefined,
  };
}

function normalizeMessageSessionMode(value: unknown): ChatSessionMode | undefined {
  return value === 'chat' || value === 'design' || value === 'plan' ? value : undefined;
}

function normalizeResultDeliveryState(
  value: unknown,
): 'delivered' | 'no_result' | 'delivery_failed' | undefined {
  return value === 'delivered' || value === 'no_result' || value === 'delivery_failed'
    ? value
    : undefined;
}

function normalizeResultDeliveryStateForStorage(
  value: unknown,
): 'delivered' | 'no_result' | 'delivery_failed' | null {
  return normalizeResultDeliveryState(value) ?? null;
}

function normalizeMessageSessionModeForStorage(value: unknown): ChatSessionMode | null {
  return value === 'chat' || value === 'design' || value === 'plan' ? value : null;
}

function parseJsonOrUndef(s: unknown): any {
  if (typeof s !== 'string' || !s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------- routines ----------

const ROUTINE_COLS = `id, name, prompt,
  schedule_kind AS scheduleKind, schedule_value AS scheduleValue,
  schedule_json AS scheduleJson,
  project_mode AS projectMode, project_id AS projectId,
  skill_id AS skillId, agent_id AS agentId,
  context_json AS contextJson,
  enabled, created_at AS createdAt, updated_at AS updatedAt`;

const ROUTINE_RUN_COLS = `id, routine_id AS routineId, trigger, status,
  project_id AS projectId, conversation_id AS conversationId,
  agent_run_id AS agentRunId, started_at AS startedAt,
  completed_at AS completedAt, summary, error, error_code AS errorCode`;

export function listRoutines(db: SqliteDb) {
  return (db
    .prepare(`SELECT ${ROUTINE_COLS} FROM routines ORDER BY created_at ASC`)
    .all() as DbRow[])
    .map(normalizeRoutine);
}

export function getRoutine(db: SqliteDb, id: string) {
  const r = db
    .prepare(`SELECT ${ROUTINE_COLS} FROM routines WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return r ? normalizeRoutine(r) : null;
}

export function insertRoutine(db: SqliteDb, r: DbRow) {
  db.prepare(
    `INSERT INTO routines
       (id, name, prompt, schedule_kind, schedule_value, schedule_json,
        project_mode, project_id, skill_id, agent_id, context_json, enabled,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.name,
    r.prompt,
    r.scheduleKind,
    r.scheduleValue,
    r.scheduleJson ?? null,
    r.projectMode,
    r.projectId ?? null,
    r.skillId ?? null,
    r.agentId ?? null,
    r.contextJson ?? null,
    r.enabled ? 1 : 0,
    r.createdAt,
    r.updatedAt,
  );
  return getRoutine(db, r.id);
}

export function updateRoutine(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getRoutine(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE routines
        SET name = ?, prompt = ?,
            schedule_kind = ?, schedule_value = ?, schedule_json = ?,
            project_mode = ?, project_id = ?,
            skill_id = ?, agent_id = ?, context_json = ?,
            enabled = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.name,
    merged.prompt,
    merged.scheduleKind,
    merged.scheduleValue,
    merged.scheduleJson ?? null,
    merged.projectMode,
    merged.projectId ?? null,
    merged.skillId ?? null,
    merged.agentId ?? null,
    merged.contextJson ?? null,
    merged.enabled ? 1 : 0,
    merged.updatedAt,
    id,
  );
  return getRoutine(db, id);
}

export function deleteRoutine(db: SqliteDb, id: string): boolean {
  const result = db.prepare(`DELETE FROM routines WHERE id = ?`).run(id);
  return result.changes > 0;
}

function normalizeRoutine(row: DbRow) {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    scheduleKind: row.scheduleKind,
    scheduleValue: row.scheduleValue,
    scheduleJson: row.scheduleJson ?? null,
    projectMode: row.projectMode,
    projectId: row.projectId ?? null,
    skillId: row.skillId ?? null,
    agentId: row.agentId ?? null,
    contextJson: row.contextJson ?? null,
    enabled: Number(row.enabled) === 1,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function listRoutineRuns(db: SqliteDb, routineId: string, limit = 20) {
  return (db
    .prepare(
      `SELECT ${ROUTINE_RUN_COLS}
         FROM routine_runs
        WHERE routine_id = ?
        ORDER BY started_at DESC
        LIMIT ?`,
    )
    .all(routineId, limit) as DbRow[])
    .map(normalizeRoutineRun);
}

export function getLatestRoutineRun(db: SqliteDb, routineId: string) {
  const r = db
    .prepare(
      `SELECT ${ROUTINE_RUN_COLS}
         FROM routine_runs
        WHERE routine_id = ?
        ORDER BY started_at DESC
        LIMIT 1`,
    )
    .get(routineId) as DbRow | undefined;
  return r ? normalizeRoutineRun(r) : null;
}

export function getRoutineRun(db: SqliteDb, id: string) {
  const r = db
    .prepare(`SELECT ${ROUTINE_RUN_COLS} FROM routine_runs WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return r ? normalizeRoutineRun(r) : null;
}

export function insertRoutineRun(db: SqliteDb, r: DbRow) {
  db.prepare(
    `INSERT INTO routine_runs
       (id, routine_id, trigger, status, project_id, conversation_id,
        agent_run_id, started_at, completed_at, summary, error, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.routineId,
    r.trigger,
    r.status,
    r.projectId,
    r.conversationId,
    r.agentRunId,
    r.startedAt,
    r.completedAt ?? null,
    r.summary ?? null,
    r.error ?? null,
    r.errorCode ?? null,
  );
  return getRoutineRun(db, r.id);
}

export function insertScheduledRoutineRun(db: SqliteDb, r: DbRow, slotAt: number) {
  const insertClaim = db.prepare(
    `INSERT OR IGNORE INTO routine_schedule_claims
       (routine_id, slot_at, claimed_at)
     VALUES (?, ?, ?)`,
  );
  const insertRun = db.prepare(
    `INSERT INTO routine_runs
       (id, routine_id, trigger, status, project_id, conversation_id,
        agent_run_id, started_at, completed_at, summary, error, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    const claim = insertClaim.run(r.routineId, slotAt, Date.now());
    if (claim.changes === 0) return false;
    insertRun.run(
      r.id,
      r.routineId,
      r.trigger,
      r.status,
      r.projectId,
      r.conversationId,
      r.agentRunId,
      r.startedAt,
      r.completedAt ?? null,
      r.summary ?? null,
      r.error ?? null,
      r.errorCode ?? null,
    );
    return true;
  });
  if (!tx()) return null;
  return getRoutineRun(db, r.id);
}

export function updateRoutineRun(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getRoutineRun(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
  };
  db.prepare(
    `UPDATE routine_runs
        SET status = ?, project_id = ?, conversation_id = ?, agent_run_id = ?,
            completed_at = ?, summary = ?, error = ?, error_code = ?
      WHERE id = ?`,
  ).run(
    merged.status,
    merged.projectId,
    merged.conversationId,
    merged.agentRunId,
    merged.completedAt ?? null,
    merged.summary ?? null,
    merged.error ?? null,
    merged.errorCode ?? null,
    id,
  );
  return getRoutineRun(db, id);
}

function normalizeRoutineRun(row: DbRow) {
  return {
    id: row.id,
    routineId: row.routineId,
    trigger: row.trigger,
    status: row.status,
    projectId: row.projectId,
    conversationId: row.conversationId,
    agentRunId: row.agentRunId,
    startedAt: Number(row.startedAt),
    completedAt: row.completedAt == null ? null : Number(row.completedAt),
    summary: row.summary ?? null,
    error: row.error ?? null,
    errorCode: row.errorCode ?? null,
  };
}

// ---------- tabs ----------

function normalizeBrowserWorkspaceTab(value: unknown): ProjectBrowserWorkspaceTab | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.label !== 'string' || !record.label.trim()) return null;
  const tab: ProjectBrowserWorkspaceTab = {
    id: record.id,
    label: record.label,
  };
  if (record.insertAfter === null) tab.insertAfter = null;
  else if (typeof record.insertAfter === 'string') tab.insertAfter = record.insertAfter;
  if (typeof record.title === 'string' && record.title.trim()) tab.title = record.title;
  if (typeof record.url === 'string' && record.url.trim()) tab.url = record.url;
  if (typeof record.iconUrl === 'string' && record.iconUrl.trim()) tab.iconUrl = record.iconUrl;
  return tab;
}

function normalizeProjectTabsState(value: unknown): ProjectTabsState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tabs) || !record.tabs.every((tab) => typeof tab === 'string')) {
    return null;
  }
  const browserTabs = Array.isArray(record.browserTabs)
    ? record.browserTabs
        .map(normalizeBrowserWorkspaceTab)
        .filter((tab): tab is ProjectBrowserWorkspaceTab => Boolean(tab))
    : [];
  const state: ProjectTabsState = {
    tabs: record.tabs.slice(),
    active: typeof record.active === 'string' ? record.active : null,
  };
  if (browserTabs.length > 0) state.browserTabs = browserTabs;
  return state;
}

function parseProjectTabsStateJson(value: unknown): ProjectTabsState | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return normalizeProjectTabsState(JSON.parse(value));
  } catch {
    return null;
  }
}

export function listTabs(db: SqliteDb, projectId: string) {
  const rows = db
    .prepare(
      `SELECT name, position, is_active AS isActive
         FROM tabs WHERE project_id = ? ORDER BY position ASC`,
    )
    .all(projectId) as DbRow[];
  const state = db
    .prepare(`SELECT project_id, updated_at AS updatedAt, state_json AS stateJson FROM tabs_state WHERE project_id = ? LIMIT 1`)
    .get(projectId) as DbRow | undefined;
  const savedState = parseProjectTabsStateJson(state?.stateJson);
  if (savedState) {
    return {
      ...savedState,
      hasSavedState: true,
      updatedAt: Number(state?.updatedAt ?? Date.now()),
    };
  }
  const active = (rows as DbRow[]).find((r: DbRow) => r.isActive) ?? null;
  return {
    tabs: (rows as DbRow[]).map((r: DbRow) => r.name),
    active: active ? active.name : null,
    hasSavedState: rows.length > 0 || Boolean(state),
    updatedAt: state ? Number(state.updatedAt ?? Date.now()) : undefined,
  };
}

export function setTabs(
  db: SqliteDb,
  projectId: string,
  stateOrNames: ProjectTabsState | string[],
  activeName: string | null = null,
) {
  const state = normalizeProjectTabsState(
    Array.isArray(stateOrNames)
      ? { tabs: stateOrNames, active: activeName }
      : stateOrNames,
  ) ?? { tabs: [], active: null };
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO tabs_state (project_id, updated_at, state_json)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         updated_at = excluded.updated_at,
         state_json = excluded.state_json`,
    ).run(projectId, Date.now(), JSON.stringify(state));
    db.prepare(`DELETE FROM tabs WHERE project_id = ?`).run(projectId);
    const ins = db.prepare(
      `INSERT INTO tabs (project_id, name, position, is_active)
       VALUES (?, ?, ?, ?)`,
    );
    state.tabs.forEach((name: string, i: number) => {
      ins.run(projectId, name, i, name === state.active ? 1 : 0);
    });
  });
  tx();
  return listTabs(db, projectId);
}
