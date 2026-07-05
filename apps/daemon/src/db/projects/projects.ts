/** @module projects
 * CRUD, run-status queries, and awaiting-input detection for the `projects` SQLite table.
 * Also queries `messages` and `conversations` for run-status and input-gate state.
 * Imports only the core/ kernel (SqliteDb, DbRow); reaches no sibling concern.
 */
import type { SqliteDb, DbRow } from '../core/index.js';

/** @internal Column alias list used in every SELECT against the projects table. */
const PROJECT_COLS = `id, name, skill_id AS skillId,
  design_system_id AS designSystemId,
  pending_prompt AS pendingPrompt,
  metadata_json AS metadataJson,
  applied_plugin_snapshot_id AS appliedPluginSnapshotId,
  custom_instructions AS customInstructions,
  created_at AS createdAt,
  updated_at AS updatedAt`;

/**
 * Returns all projects ordered by most-recently updated first.
 */
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
 * Returns the most recent run status for each project, keyed by projectId.
 * Scans messages with a run_status column and collapses to one entry per project,
 * so callers can render project-level status badges without iterating conversations.
 */
export function listLatestProjectRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT c.project_id AS projectId,
              m.run_id AS runId,
              m.run_status AS status,
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
        value: normalizeProjectRunStatus(row.status),
        updatedAt: Number(row.updatedAt),
        runId: row.runId ?? undefined,
      });
    }
  }
  return latestByProject;
}

/**
 * Returns the most recent run status for each conversation, keyed by conversationId.
 * Used to display per-conversation activity state in the project sidebar.
 */
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

/**
 * Returns the earliest run status for each conversation, keyed by conversationId.
 * Useful for determining when a conversation's first agent turn began.
 */
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

/**
 * Returns the most recent run status for each individual run, keyed by runId.
 * Powers per-run status indicators in the conversation thread.
 */
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
 * Returns the set of project IDs whose latest assistant message contains a
 * <question-form> or <ask-question> artifact and has not yet received a user reply.
 * This is the data source for the "awaiting input" badge on the project list.
 */
export function listProjectsAwaitingInput(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT latest.projectId
         FROM (
           SELECT c.project_id AS projectId,
                  m.conversation_id AS conversationId,
                  m.created_at AS createdAt,
                  m.position AS position,
                  ROW_NUMBER() OVER (
                    PARTITION BY c.project_id
                    ORDER BY m.created_at DESC, m.position DESC
                  ) AS rowNum
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
            WHERE m.role = 'assistant'
              -- ask-question is an accepted alias for question-form (UI parser
              -- + daemon open-tag matcher), so an alias-form turn must also
              -- count as awaiting input.
              AND (
                LOWER(m.content) LIKE '%<question-form%'
                OR LOWER(m.content) LIKE '%<ask-question%'
              )
         ) latest
        WHERE latest.rowNum = 1
          AND NOT EXISTS (
            SELECT 1
              FROM messages reply
             WHERE reply.conversation_id = latest.conversationId
               AND reply.role = 'user'
               AND (
                 reply.created_at > latest.createdAt
                 OR (reply.created_at = latest.createdAt AND reply.position > latest.position)
               )
          )`,
    )
    .all() as DbRow[];
  return new Set((rows as DbRow[]).map((row: DbRow) => row.projectId));
}

/**
 * Returns the set of conversation IDs whose latest assistant message contains a
 * <question-form> or <ask-question> artifact and has not yet received a user reply.
 */
export function listConversationsAwaitingInput(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT latest.conversationId
         FROM (
           SELECT m.conversation_id AS conversationId,
                  m.created_at AS createdAt,
                  m.position AS position,
                  ROW_NUMBER() OVER (
                    PARTITION BY m.conversation_id
                    ORDER BY m.created_at DESC, m.position DESC
                  ) AS rowNum
             FROM messages m
            WHERE m.role = 'assistant'
              AND (
                LOWER(m.content) LIKE '%<question-form%'
                OR LOWER(m.content) LIKE '%<ask-question%'
              )
         ) latest
        WHERE latest.rowNum = 1
          AND NOT EXISTS (
            SELECT 1
              FROM messages reply
             WHERE reply.conversation_id = latest.conversationId
               AND reply.role = 'user'
               AND (
                 reply.created_at > latest.createdAt
                 OR (reply.created_at = latest.createdAt AND reply.position > latest.position)
               )
          )`,
    )
    .all() as DbRow[];
  return new Set((rows as DbRow[]).map((row: DbRow) => row.conversationId));
}

/**
 * Fetches a single project by id, or returns null if it does not exist.
 */
export function getProject(db: SqliteDb, id: string) {
  const row = db
    .prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return row ? normalizeProject(row) : null;
}

/**
 * Inserts a new project row and returns the freshly read, normalized record.
 * Metadata is serialized to JSON; all nullable fields default to null on omission.
 */
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

/**
 * Applies a partial patch to an existing project, preserving all unpatched fields.
 * Returns null when the project does not exist; otherwise returns the updated record.
 * updatedAt defaults to Date.now() when the patch omits it.
 */
export function updateProject(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getProject(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
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

/**
 * Permanently removes a project row. Cascading deletes for related rows are
 * handled at the SQLite schema level, not here.
 */
export function deleteProject(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

/** @internal Converts a raw SQLite row into the typed project shape, parsing
 *  metadataJson and casting numeric timestamps. */
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

/** @internal Maps raw DB run_status strings to the canonical client-facing enum,
 *  collapsing 'starting' → 'running' and 'cancelled' → 'canceled', and defaulting
 *  unknown values to 'not_started'. */
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

