import type Database from 'better-sqlite3';
import { MEDIA_FAILURE_NEXT_STEPS, type MediaFailureNextStep } from '@open-design/contracts';

export type MediaTaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'interrupted';

/** What a content-safety policy objected to, when the supplier proved it. */
export type MediaTaskErrorSubject = 'prompt' | 'input_image' | 'output_image';

export interface MediaTaskError {
  message: string;
  status?: number;
  code?: string;
  /**
   * Optional hint about what a content-safety policy objected to, forwarded
   * only when the upstream supplier proved it. Absent means "not proven", not
   * "not applicable" — a client must then name both the prompt and the
   * reference images rather than blame one of them.
   */
  subject?: MediaTaskErrorSubject;
  /**
   * Whether repeating the identical request could plausibly behave
   * differently. Undefined means the producer did not say; only an explicit
   * `false` licenses telling a user that retrying is pointless.
   */
  retryable?: boolean;
  /**
   * What the reader should do next. This is the field a user-facing sentence
   * and an agent's retry decision are both built from -- `code` names the
   * failure, `nextStep` answers it.
   */
  nextStep?: MediaFailureNextStep;
}

export interface MediaTaskRow {
  id: string;
  projectId: string;
  /**
   * Monotonic creation order (SQLite's rowid). Only the ordering it induces is
   * meaningful — never persist or display the value. It exists because
   * `started_at` ties on every parallel fan-out, and a tie broken by storage
   * order lets a batch's cells swap places between two reads.
   */
  sequence: number;
  runId?: string;
  status: MediaTaskStatus;
  surface?: string;
  model?: string;
  progress: string[];
  file: unknown | null;
  error: MediaTaskError | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MediaTaskInsert {
  id: string;
  projectId: string;
  runId?: string;
  status?: MediaTaskStatus;
  surface?: string;
  model?: string;
  progress?: string[];
  file?: unknown | null;
  error?: MediaTaskError | null;
  startedAt?: number;
  endedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface MediaTaskPatch {
  runId?: string | null;
  status?: MediaTaskStatus;
  surface?: string | null;
  model?: string | null;
  progress?: string[];
  file?: unknown | null;
  error?: MediaTaskError | null;
  startedAt?: number;
  endedAt?: number | null;
  updatedAt?: number;
}

interface RawMediaTaskRow {
  id: string;
  projectId: string;
  sequence: number;
  runId: string | null;
  status: string;
  surface: string | null;
  model: string | null;
  progressJson: string | null;
  fileJson: string | null;
  errorJson: string | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'running',
  'done',
  'failed',
  'interrupted',
]);

const TERMINAL_STATUSES = new Set(['done', 'failed', 'interrupted']);

const COLS = `
  id,
  rowid AS sequence,
  project_id AS projectId,
  run_id AS runId,
  status,
  surface,
  model,
  progress_json AS progressJson,
  file_json AS fileJson,
  error_json AS errorJson,
  started_at AS startedAt,
  ended_at AS endedAt,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export function migrateMediaTasks(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      run_id TEXT,
      status TEXT NOT NULL CHECK (status IN
        ('queued','running','done','failed','interrupted')),
      surface TEXT,
      model TEXT,
      progress_json TEXT NOT NULL DEFAULT '[]',
      file_json TEXT,
      error_json TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_tasks_project
      ON media_tasks(project_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_media_tasks_status
      ON media_tasks(status, updated_at DESC);
  `);
  const columns = db.prepare(`PRAGMA table_info(media_tasks)`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'run_id')) {
    db.exec(`ALTER TABLE media_tasks ADD COLUMN run_id TEXT`);
  }
}

export function insertMediaTask(
  db: Database.Database,
  input: MediaTaskInsert,
): MediaTaskRow {
  const now = Date.now();
  const status = input.status ?? 'queued';
  assertValidStatus(status);
  const startedAt = input.startedAt ?? now;
  db.prepare(
    `INSERT INTO media_tasks
       (id, project_id, run_id, status, surface, model, progress_json, file_json,
        error_json, started_at, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.projectId,
    input.runId ?? null,
    status,
    input.surface ?? null,
    input.model ?? null,
    JSON.stringify(input.progress ?? []),
    jsonOrNull(input.file ?? null),
    jsonOrNull(input.error ?? null),
    startedAt,
    input.endedAt ?? null,
    input.createdAt ?? startedAt,
    input.updatedAt ?? now,
  );
  const row = getMediaTask(db, input.id);
  if (row === null) throw new Error(`Failed to fetch media task after insert: ${input.id}`);
  return row;
}

export function getMediaTask(
  db: Database.Database,
  id: string,
): MediaTaskRow | null {
  const raw = db
    .prepare(`SELECT ${COLS} FROM media_tasks WHERE id = ?`)
    .get(id) as RawMediaTaskRow | undefined;
  return raw ? normalizeRow(raw) : null;
}

export function updateMediaTask(
  db: Database.Database,
  id: string,
  patch: MediaTaskPatch,
): MediaTaskRow | null {
  const existing = getMediaTask(db, id);
  if (existing === null) return null;
  const status = patch.status ?? existing.status;
  assertValidStatus(status);
  const updatedAt = patch.updatedAt ?? Date.now();
  db.prepare(
    `UPDATE media_tasks
        SET status = ?,
            run_id = ?,
            surface = ?,
            model = ?,
            progress_json = ?,
            file_json = ?,
            error_json = ?,
            started_at = ?,
            ended_at = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    status,
    'runId' in patch ? patch.runId ?? null : existing.runId ?? null,
    'surface' in patch ? patch.surface ?? null : existing.surface ?? null,
    'model' in patch ? patch.model ?? null : existing.model ?? null,
    JSON.stringify(patch.progress ?? existing.progress),
    'file' in patch ? jsonOrNull(patch.file ?? null) : jsonOrNull(existing.file),
    'error' in patch ? jsonOrNull(patch.error ?? null) : jsonOrNull(existing.error),
    patch.startedAt ?? existing.startedAt,
    'endedAt' in patch ? patch.endedAt ?? null : existing.endedAt,
    updatedAt,
    id,
  );
  return getMediaTask(db, id);
}

export function listMediaTasksByProject(
  db: Database.Database,
  projectId: string,
  options: { includeTerminal?: boolean } = {},
): MediaTaskRow[] {
  const includeTerminal = options.includeTerminal === true;
  const rows = db
    .prepare(
      `SELECT ${COLS}
         FROM media_tasks
        WHERE project_id = ?
        ORDER BY started_at DESC`,
    )
    .all(projectId) as RawMediaTaskRow[];
  return rows
    .map(normalizeRow)
    .filter((row) => includeTerminal || !TERMINAL_STATUSES.has(row.status));
}

export function listRecentMediaTasks(
  db: Database.Database,
  options: { terminalTtlMs: number; now?: number },
): MediaTaskRow[] {
  const now = options.now ?? Date.now();
  const cutoff = now - options.terminalTtlMs;
  const rows = db
    .prepare(
      `SELECT ${COLS}
         FROM media_tasks
        WHERE status IN ('queued', 'running')
           OR COALESCE(ended_at, updated_at) >= ?
        ORDER BY started_at DESC`,
    )
    .all(cutoff) as RawMediaTaskRow[];
  return rows.map(normalizeRow);
}

export function deleteMediaTask(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM media_tasks WHERE id = ?`).run(id);
}

export function reconcileMediaTasksOnBoot(
  db: Database.Database,
  options: { terminalTtlMs: number; now?: number },
): { interrupted: number; deleted: number } {
  const now = options.now ?? Date.now();
  const cutoff = now - options.terminalTtlMs;
  const interruptedError: MediaTaskError = {
    message: 'media task interrupted by daemon restart',
    status: 5,
    code: 'DAEMON_RESTART',
  };
  const tx = db.transaction(() => {
    const interrupted = db
      .prepare(
        `UPDATE media_tasks
            SET status = 'interrupted',
                error_json = ?,
                ended_at = COALESCE(ended_at, ?),
                updated_at = ?
          WHERE status IN ('queued', 'running')`,
      )
      .run(JSON.stringify(interruptedError), now, now).changes;

    const deleted = db
      .prepare(
        `DELETE FROM media_tasks
          WHERE status IN ('done', 'failed', 'interrupted')
            AND COALESCE(ended_at, updated_at) < ?`,
      )
      .run(cutoff).changes;

    return { interrupted, deleted };
  });
  return tx() as { interrupted: number; deleted: number };
}

function normalizeRow(raw: RawMediaTaskRow): MediaTaskRow {
  const row: MediaTaskRow = {
    id: raw.id,
    projectId: raw.projectId,
    sequence: Number(raw.sequence),
    status: raw.status as MediaTaskStatus,
    progress: parseArray(raw.progressJson),
    file: parseJson(raw.fileJson),
    error: normalizeError(parseJson(raw.errorJson)),
    startedAt: Number(raw.startedAt),
    endedAt: raw.endedAt == null ? null : Number(raw.endedAt),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
  };
  if (raw.surface !== null) row.surface = raw.surface;
  if (raw.model !== null) row.model = raw.model;
  if (raw.runId !== null) row.runId = raw.runId;
  return row;
}

function assertValidStatus(status: string): void {
  if (!VALID_STATUSES.has(status)) {
    throw new RangeError(`Invalid media task status: "${status}"`);
  }
}

function parseArray(json: string | null): string[] {
  const parsed = parseJson(json);
  return Array.isArray(parsed)
    ? parsed.filter((line): line is string => typeof line === 'string')
    : [];
}

/**
 * Subjects a content-safety refusal may name. Validated on read as well as on
 * write: the value crosses a JSON column, so a row written by a newer daemon
 * (or hand-edited) must not smuggle an unknown subject back into the API
 * response.
 */
const MEDIA_TASK_ERROR_SUBJECTS = ['prompt', 'input_image', 'output_image'] as const;

function isMediaTaskErrorSubject(value: unknown): value is MediaTaskErrorSubject {
  return (
    typeof value === 'string'
    && (MEDIA_TASK_ERROR_SUBJECTS as readonly string[]).includes(value)
  );
}

/**
 * Validated on read for the same reason `subject` is: the value crosses a JSON
 * column, and a row written by a newer daemon must not smuggle a next step
 * this build has no copy for into an API response.
 */
function isMediaFailureNextStep(value: unknown): value is MediaFailureNextStep {
  return (
    typeof value === 'string'
    && (MEDIA_FAILURE_NEXT_STEPS as readonly string[]).includes(value)
  );
}

/**
 * Rebuild a persisted error. Every field the write path stores has to be
 * reconstructed here or it silently disappears the moment a task is read back
 * from SQLite -- which is every daemon restart and every cache rehydration,
 * not an edge case. `subject` and `retryable` were lost that way: a refusal
 * survived until the process bounced, then reappeared as a bare failure with
 * no attribution and no retry verdict.
 */
function normalizeError(value: unknown): MediaTaskError | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const message = typeof obj.message === 'string' ? obj.message : '';
  if (!message) return null;
  const error: MediaTaskError = { message };
  if (typeof obj.status === 'number') error.status = obj.status;
  if (typeof obj.code === 'string') error.code = obj.code;
  if (isMediaTaskErrorSubject(obj.subject)) error.subject = obj.subject;
  // Only an explicit boolean survives: absent must stay absent, because
  // "the producer did not say" and "the producer said retrying is pointless"
  // are different answers to a client.
  if (typeof obj.retryable === 'boolean') error.retryable = obj.retryable;
  if (isMediaFailureNextStep(obj.nextStep)) error.nextStep = obj.nextStep;
  return error;
}

function parseJson(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function jsonOrNull(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}
