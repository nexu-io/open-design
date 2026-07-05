/** @module connection/connection
 * Database lifecycle: opens and closes the module-level better-sqlite3 singleton.
 * Reaches the `schema` sibling barrel to run `migrate` immediately after every `openDatabase` call;
 * that is the only cross-concern edge in the db module.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { SqliteDb } from '../core/index.js';
import { migrate } from '../schema/index.js';

/** @internal Module-level singleton tracking the currently-open database handle and its resolved file path. */
let dbInstance: SqliteDb | null = null;
let dbFile: string | null = null;

/**
 * Open (or return the cached) project database at `<dataDir>/app.sqlite`, creating the
 * directory if needed, enabling WAL + foreign keys, and running all pending schema migrations.
 * Calling with a different resolved path closes the previous connection first.
 * @param projectRoot - fallback parent directory when `dataDir` is not supplied (uses `.od` subfolder)
 * @param options.dataDir - explicit data directory; overrides the default `.od` subfolder
 * @returns the live `SqliteDb` handle, ready for immediate use
 */
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

/**
 * Close the active database connection and clear the module-level singleton.
 * Safe to call when no connection is open (no-op in that case).
 */
export function closeDatabase() {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
  dbFile = null;
}

