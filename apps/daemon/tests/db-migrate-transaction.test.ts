import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

describe('db migrate transaction', () => {
  let dbPath: string;

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('applies all migrations atomically and is idempotent', async () => {
    dbPath = path.join(os.tmpdir(), `od-migrate-${Date.now()}.sqlite`);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const { openDatabase, closeDatabase } = await import('../src/db.js');
    const db2 = openDatabase(os.tmpdir(), { dataDir: path.dirname(dbPath) });

    const tables = db2
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('deployments');
    expect(tableNames).toContain('routines');
    expect(tableNames).toContain('routine_runs');

    closeDatabase();

    // Idempotent: running migrate again on the same file should not throw.
    expect(() => {
      const db3 = openDatabase(os.tmpdir(), { dataDir: path.dirname(dbPath) });
      closeDatabase();
    }).not.toThrow();

    db.close();
  });
});
