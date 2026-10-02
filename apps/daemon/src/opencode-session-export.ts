import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

/**
 * OpenCode 1.x stores sessions in one SQLite database (`<XDG_DATA_HOME>/opencode/opencode.db`):
 * `session` (with `parent_id` for the child sessions its task tool spawns),
 * `message` and `part`, each row's payload JSON in `data`. A diagnostic bundle
 * exports one session tree's rows as JSONL, read-only and bounded.
 */

const MAX_SESSIONS = 64;
const MAX_DEPTH = 4;
const MAX_MESSAGES = 5_000;
const MAX_PARTS = 20_000;
const WINDOW_MARGIN_MS = 5_000;

export function openCodeDatabasePath(xdgDataHome: string): string {
  return join(xdgDataHome, 'opencode', 'opencode.db');
}

export function openCodeDatabaseExists(xdgDataHome: string): boolean {
  return existsSync(openCodeDatabasePath(xdgDataHome));
}

function payload(data: unknown): unknown {
  if (typeof data !== 'string') return data ?? null;
  try { return JSON.parse(data); } catch { return data; }
}

/**
 * Rows of `sessionId` and its descendant sessions written during
 * [startMs, endMs] and not before `notBeforeMs`, oldest first. Session rows
 * carry only ids and the parent link, not titles.
 */
export function exportOpenCodeSession(
  xdgDataHome: string,
  session: { sessionId: string; startMs: number; endMs: number },
  notBeforeMs: number | null,
): string {
  const db = new Database(openCodeDatabasePath(xdgDataHome), { readonly: true, fileMustExist: true, timeout: 1_000 });
  try {
    const ids = (db.prepare(`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT ?, 0
        UNION ALL
        SELECT session.id, tree.depth + 1 FROM session JOIN tree ON session.parent_id = tree.id WHERE tree.depth < ?
      ) SELECT id FROM tree LIMIT ?`).all(session.sessionId, MAX_DEPTH, MAX_SESSIONS) as Array<{ id: string }>)
      .map((row) => row.id);
    const from = Math.max(session.startMs - WINDOW_MARGIN_MS, notBeforeMs ?? Number.NEGATIVE_INFINITY);
    const to = session.endMs + WINDOW_MARGIN_MS;
    const marks = ids.map(() => '?').join(',');
    const sessions = db.prepare(`SELECT id, parent_id FROM session WHERE id IN (${marks})`).all(...ids) as
      Array<{ id: string; parent_id: string | null }>;
    const messages = db.prepare(`SELECT id, session_id, time_created, data FROM message
      WHERE session_id IN (${marks}) AND time_created >= ? AND time_created <= ? ORDER BY time_created LIMIT ?`)
      .all(...ids, from, to, MAX_MESSAGES) as Array<{ id: string; session_id: string; time_created: number; data: unknown }>;
    const parts = db.prepare(`SELECT id, message_id, session_id, time_created, data FROM part
      WHERE session_id IN (${marks}) AND time_created >= ? AND time_created <= ? ORDER BY time_created LIMIT ?`)
      .all(...ids, from, to, MAX_PARTS) as Array<{ id: string; message_id: string; session_id: string; time_created: number; data: unknown }>;
    const records = [
      ...messages.map((row) => ({ at: row.time_created, record: { kind: 'message', id: row.id, sessionId: row.session_id,
        timestamp: new Date(row.time_created).toISOString(), data: payload(row.data) } })),
      ...parts.map((row) => ({ at: row.time_created, record: { kind: 'part', id: row.id, messageId: row.message_id,
        sessionId: row.session_id, timestamp: new Date(row.time_created).toISOString(), data: payload(row.data) } })),
    ].sort((a, b) => a.at - b.at);
    if (records.length === 0) return '';
    const header = sessions.map((row) => JSON.stringify({ kind: 'session', id: row.id, parentId: row.parent_id }));
    return [...header, ...records.map(({ record }) => JSON.stringify(record))].join('\n') + '\n';
  } finally {
    db.close();
  }
}
