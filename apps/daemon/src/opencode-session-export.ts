import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  AGENT_SESSION_MAX_LINE_BYTES,
  AGENT_SESSION_TAIL_BYTES,
  type AgentSessionTimeWindow,
} from '@open-design/diagnostics';

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

interface RowMeta {
  kind: 'message' | 'part';
  id: string;
  message_id: string | null;
  session_id: string;
  time_created: number;
  /** Byte length of the row's `data`, read without loading the payload into JS. */
  bytes: number | null;
}

/**
 * Rows of `sessionId` and its descendant sessions written during any of
 * `windows` (several runs can resume one session) and not before
 * `notBeforeMs`, oldest first. Session rows carry only ids and the parent
 * link, not titles.
 *
 * Bounded before anything is materialized: rows are first listed by time and
 * payload size only; a payload above AGENT_SESSION_MAX_LINE_BYTES is never
 * read and becomes a stub that keeps its id, time and size. Past `maxBytes`
 * the first and last halves are kept and one record says how much was
 * omitted between them, as readAgentSessionWindow does for session files.
 */
export function exportOpenCodeSession(
  xdgDataHome: string,
  sessionId: string,
  windows: readonly AgentSessionTimeWindow[],
  notBeforeMs: number | null,
  maxBytes: number = AGENT_SESSION_TAIL_BYTES,
): string {
  if (windows.length === 0) return '';
  const db = new Database(openCodeDatabasePath(xdgDataHome), { readonly: true, fileMustExist: true, timeout: 1_000 });
  try {
    const ids = (db.prepare(`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT ?, 0
        UNION ALL
        SELECT session.id, tree.depth + 1 FROM session JOIN tree ON session.parent_id = tree.id WHERE tree.depth < ?
      ) SELECT id FROM tree LIMIT ?`).all(sessionId, MAX_DEPTH, MAX_SESSIONS) as Array<{ id: string }>)
      .map((row) => row.id);
    const bounds = windows.flatMap(({ startMs, endMs }) =>
      [Math.max(startMs - WINDOW_MARGIN_MS, notBeforeMs ?? Number.NEGATIVE_INFINITY), endMs + WINDOW_MARGIN_MS]);
    const during = windows.map(() => '(time_created >= ? AND time_created <= ?)').join(' OR ');
    const marks = ids.map(() => '?').join(',');
    const sessions = db.prepare(`SELECT id, parent_id FROM session WHERE id IN (${marks})`).all(...ids) as
      Array<{ id: string; parent_id: string | null }>;
    // Metadata only: octet_length() sizes each payload inside SQLite, so no
    // row's data reaches JS until it is known to fit.
    const rows = db.prepare(`SELECT kind, id, message_id, session_id, time_created, bytes FROM (
        SELECT * FROM (SELECT 'message' AS kind, id, NULL AS message_id, session_id, time_created, octet_length(data) AS bytes
          FROM message WHERE session_id IN (${marks}) AND (${during}) ORDER BY time_created LIMIT ?)
        UNION ALL
        SELECT * FROM (SELECT 'part' AS kind, id, message_id, session_id, time_created, octet_length(data) AS bytes
          FROM part WHERE session_id IN (${marks}) AND (${during}) ORDER BY time_created LIMIT ?)
      ) ORDER BY time_created, kind = 'part', id`)
      .all(...ids, ...bounds, MAX_MESSAGES, ...ids, ...bounds, MAX_PARTS) as RowMeta[];
    if (rows.length === 0) return '';
    const readData = {
      message: db.prepare('SELECT data FROM message WHERE id = ?').pluck(),
      part: db.prepare('SELECT data FROM part WHERE id = ?').pluck(),
    };
    const render = (row: RowMeta): string => {
      const base = {
        kind: row.kind, id: row.id, ...(row.kind === 'part' ? { messageId: row.message_id } : {}),
        sessionId: row.session_id, timestamp: new Date(row.time_created).toISOString(),
      };
      const stub = (bytes: number) => JSON.stringify({ ...base, truncated: true, bytes });
      const bytes = row.bytes ?? 0;
      if (bytes > AGENT_SESSION_MAX_LINE_BYTES) return stub(bytes);
      const line = JSON.stringify({ ...base, data: payload(readData[row.kind].get(row.id)) });
      // Escaping can grow a payload that was just under the limit.
      return Buffer.byteLength(line) > AGENT_SESSION_MAX_LINE_BYTES ? stub(bytes) : line;
    };
    const size = (line: string) => Buffer.byteLength(line) + 1;

    const headBudget = Math.floor(maxBytes / 2);
    const tailBudget = Math.max(0, maxBytes - headBudget - 256);
    const head = sessions.map((row) => JSON.stringify({ kind: 'session', id: row.id, parentId: row.parent_id }));
    let headBytes = head.reduce((sum, line) => sum + size(line), 0);
    let next = 0;
    for (; next < rows.length; next++) {
      const line = render(rows[next]!);
      if (headBytes + size(line) > headBudget) break;
      head.push(line);
      headBytes += size(line);
    }
    const tail: string[] = [];
    let tailBytes = 0;
    let last = rows.length - 1;
    for (; last >= next; last--) {
      const line = render(rows[last]!);
      if (tailBytes + size(line) > tailBudget) break;
      tail.push(line);
      tailBytes += size(line);
    }
    tail.reverse();
    if (last >= next) {
      let omittedBytes = 0;
      for (let i = next; i <= last; i++) omittedBytes += rows[i]!.bytes ?? 0;
      head.push(JSON.stringify({ truncated: 'middle', omittedLines: last - next + 1, omittedBytes }));
    }
    return [...head, ...tail].join('\n') + '\n';
  } finally {
    db.close();
  }
}
