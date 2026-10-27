import { lstat, realpath } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function isOwnedAndPrivate(stat: Stats): boolean {
  return !stat.isSymbolicLink()
    && (stat.mode & 0o022) === 0
    && (typeof process.getuid !== 'function' || stat.uid === process.getuid());
}

/**
 * Codex 0.146+ keeps archived rollouts in a flat directory. Its state_5.sqlite
 * primary-key index resolves only the known thread, independently of archive
 * size. The index is optional: callers retain their bounded directory fallback
 * for older, missing, busy, or incompatible native databases.
 */
export async function findIndexedCodexArchivedRolloutPath(
  codexHome: string,
  sessionId: string,
): Promise<string | null> {
  if (!path.isAbsolute(codexHome)
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(sessionId)) return null;
  const archiveRoot = path.join(codexHome, 'archived_sessions');
  const dbPath = path.join(codexHome, 'state_5.sqlite');
  const [rootStat, dbStat] = await Promise.all([
    lstat(archiveRoot).catch(() => null),
    lstat(dbPath).catch(() => null),
  ]);
  if (!rootStat?.isDirectory() || !isOwnedAndPrivate(rootStat)
    || !dbStat?.isFile() || !isOwnedAndPrivate(dbStat)) return null;
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 25 });
    // Requiring the native primary-key index also prevents an incompatible
    // schema from turning this lookup into a scan of unrelated thread rows.
    const row = db.prepare(`SELECT rollout_path FROM threads
      INDEXED BY sqlite_autoindex_threads_1 WHERE id = ? AND archived = 1 LIMIT 1`)
      .get(sessionId) as { rollout_path?: unknown } | undefined;
    const filePath = row?.rollout_path;
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return null;
    const name = path.basename(filePath);
    if (!name.startsWith('rollout-') || !name.endsWith(`-${sessionId}.jsonl`)) return null;
    const archiveRealPath = await realpath(archiveRoot);
    if (await realpath(path.dirname(filePath)) !== archiveRealPath) return null;
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || !isOwnedAndPrivate(fileStat)) return null;
    if (path.dirname(await realpath(filePath)) !== archiveRealPath) return null;
    return path.join(archiveRoot, name);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
