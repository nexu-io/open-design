// Phase 5 / spec §15.6 / plan §3.GG1 — daemon-DB inspection helper.
//
// Pure helper that walks a SQLite db file + schema and returns a
// structured inventory: file size, table list, per-table row count,
// schema version (the user_version PRAGMA we already use for
// migrations).
//
// Used by:
//   - `od daemon db status` (CLI ops sanity check),
//   - the `od doctor` aggregator (a future patch can fold the
//     summary in without re-implementing the SQLite read).
//
// Pure relative to its inputs: callers pass the SQLite handle +
// the on-disk file path. The function never opens a new
// connection or mutates state.

import { promises as fsp } from 'node:fs';
import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

export interface DaemonDbTableInfo {
  name:      string;
  rowCount:  number;
}

export interface DaemonDbStatusReport {
  kind:           'sqlite' | 'postgres';
  // Absolute path on disk (sqlite); connection identifier
  // (postgres). For the postgres stub we surface 'host:port/db'.
  location:       string;
  // Total bytes the DB file occupies. Sums sqlite + sqlite-wal +
  // sqlite-shm so the report matches `du -h` rather than just the
  // primary file.
  sizeBytes:      number;
  schemaVersion:  number | null;
  tables:         DaemonDbTableInfo[];
  generatedAt:    number;
}

const SYSTEM_TABLE_PREFIXES = ['sqlite_', 'better_sqlite3_'];

function isSystemTable(name: string): boolean {
  return SYSTEM_TABLE_PREFIXES.some((p) => name.startsWith(p));
}

export async function inspectSqliteDatabase(input: {
  db: SqliteDb;
  file: string;
}): Promise<DaemonDbStatusReport> {
  const { db, file } = input;

  // 1. Schema version (user_version pragma).
  let schemaVersion: number | null = null;
  try {
    const v = db.pragma('user_version', { simple: true });
    schemaVersion = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(schemaVersion)) schemaVersion = null;
  } catch {
    schemaVersion = null;
  }

  // 2. Table list with row counts.
  const tables: DaemonDbTableInfo[] = [];
  try {
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    for (const { name } of names) {
      if (isSystemTable(name)) continue;
      try {
        const safe = sanitizeTableName(name);
        if (!safe) continue;
        const row = db.prepare(`SELECT count(*) AS c FROM "${safe}"`).get() as { c: number } | undefined;
        tables.push({ name: safe, rowCount: row?.c ?? 0 });
      } catch {
        // A malformed view / corrupted table shouldn't fail the
        // whole report; record 0 rows.
        tables.push({ name, rowCount: 0 });
      }
    }
  } catch {
    // ignore — empty tables[] surfaces 'cannot read schema' to the
    // caller (CLI shows 0 tables, which is itself a useful signal).
  }

  // 3. File size = primary + -wal + -shm so the number matches du.
  const sizeBytes = await sumFileSizes([file, `${file}-wal`, `${file}-shm`]);

  return {
    kind:          'sqlite',
    location:      file,
    sizeBytes,
    schemaVersion,
    tables,
    generatedAt:   Date.now(),
  };
}

async function sumFileSizes(paths: ReadonlyArray<string>): Promise<number> {
  let total = 0;
  for (const p of paths) {
    try {
      const stat = await fsp.stat(p);
      total += stat.size;
    } catch {
      // missing -wal / -shm is normal when the DB hasn't been written
      // since open.
    }
  }
  return total;
}

function sanitizeTableName(name: string): string | null {
  // Allow ASCII alphanumerics + underscore; SQLite identifier sanity
  // check. Prevents accidental SQL injection if a malicious migration
  // ever invents a hostile table name.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  return name;
}

// Plan §3.LL1 — daemon-DB integrity check.
//
// Wraps SQLite's PRAGMA integrity_check + foreign_key_check + the
// fast PRAGMA quick_check variant. Returns a structured report so
// the CLI can pretty-print + a CI tool can parse JSON.
//
// PRAGMA integrity_check returns either ['ok'] when the DB is
// healthy or one row per issue. PRAGMA foreign_key_check returns
// rows for each FK violation; we surface them as 'fk' issues.

export type DbIntegrityIssueKind = 'integrity' | 'foreign_key';

export interface DbIntegrityIssue {
  kind:    DbIntegrityIssueKind;
  message: string;
}

export interface DbIntegrityReport {
  ok:           boolean;
  // 'integrity_check' (default) or 'quick_check' — quick is faster
  // but skips the index-content check.
  mode:         'integrity_check' | 'quick_check';
  issues:       DbIntegrityIssue[];
  elapsedMs:    number;
  generatedAt:  number;
}

export interface VerifyDbOptions {
  db:    SqliteDb;
  quick?: boolean;
}

export function verifySqliteIntegrity(opts: VerifyDbOptions): DbIntegrityReport {
  const { db, quick = false } = opts;
  const startedAt = Date.now();
  const issues: DbIntegrityIssue[] = [];

  // 1. integrity_check / quick_check.
  const pragma = quick ? 'quick_check' : 'integrity_check';
  try {
    const rows = db.pragma(pragma) as Array<Record<string, unknown>>;
    for (const row of rows) {
      // SQLite returns the string under either `integrity_check`,
      // `quick_check`, or just the first column. Normalise to the
      // first string-valued field.
      const message = (row[pragma] ?? Object.values(row)[0]) as unknown;
      if (typeof message !== 'string') continue;
      if (message.toLowerCase() === 'ok') continue;
      issues.push({ kind: 'integrity', message });
    }
  } catch (err) {
    issues.push({ kind: 'integrity', message: `pragma ${pragma} threw: ${(err as Error).message}` });
  }

  // 2. foreign_key_check.
  try {
    const rows = db.pragma('foreign_key_check') as Array<{ table?: string; rowid?: number; parent?: string; fkid?: number }>;
    for (const row of rows) {
      const tbl = row.table ?? '?';
      const parent = row.parent ?? '?';
      const fkid = row.fkid ?? '?';
      const rowid = row.rowid ?? '?';
      issues.push({
        kind: 'foreign_key',
        message: `FK violation in ${tbl} (rowid=${rowid}) referencing ${parent} (fkid=${fkid})`,
      });
    }
  } catch (err) {
    issues.push({ kind: 'foreign_key', message: `pragma foreign_key_check threw: ${(err as Error).message}` });
  }

  return {
    ok:          issues.length === 0,
    mode:        quick ? 'quick_check' : 'integrity_check',
    issues,
    elapsedMs:   Date.now() - startedAt,
    generatedAt: Date.now(),
  };
}
