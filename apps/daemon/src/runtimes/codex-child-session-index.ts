import { lstat } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface IndexedCodexChildSession {
  sessionId: string;
  agentPath: string | null;
}

/** Read only this parent's native spawn edges, never unrelated transcripts.
 * The index nominates candidates; callers must verify their rollout metadata
 * and turn attribution before accepting any evidence. Archiving keeps edges.
 */
export async function findIndexedCodexChildSessions(
  codexHome: string,
  parentSessionId: string,
  maxSessions: number,
): Promise<
  | { ok: true; children: IndexedCodexChildSession[] }
  | { ok: false; reason: 'child_index_unavailable' | 'child_session_limit_exceeded' }
> {
  const unavailable = { ok: false, reason: 'child_index_unavailable' } as const;
  if (!path.isAbsolute(codexHome)) return unavailable;
  const dbPath = path.join(codexHome, 'state_5.sqlite');
  const stat = await lstat(dbPath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) return unavailable;
  if (process.platform !== 'win32' && ((stat.mode & 0o022) !== 0
    || (typeof process.getuid === 'function' && stat.uid !== process.getuid()))) return unavailable;
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 25 });
    // Require native indexes: no fallback to a full table/transcript scan on
    // incompatible databases. Read one extra row to detect incomplete lookup.
    const rows = db.prepare(`SELECT e.child_thread_id AS sessionId, t.agent_path AS agentPath
      FROM thread_spawn_edges AS e INDEXED BY idx_thread_spawn_edges_parent_status
      LEFT JOIN threads AS t INDEXED BY sqlite_autoindex_threads_1 ON t.id = e.child_thread_id
      WHERE e.parent_thread_id = ? LIMIT ?`).all(parentSessionId, maxSessions + 1) as IndexedCodexChildSession[];
    if (rows.length > maxSessions) return { ok: false, reason: 'child_session_limit_exceeded' };
    if (rows.some(row => typeof row.sessionId !== 'string'
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(row.sessionId)
      || (row.agentPath !== null && typeof row.agentPath !== 'string'))) return unavailable;
    return { ok: true, children: rows };
  } catch {
    return unavailable;
  } finally {
    db?.close();
  }
}
