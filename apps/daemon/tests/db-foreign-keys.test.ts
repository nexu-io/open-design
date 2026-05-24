import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

describe('db foreign key migrations', () => {
  let dbPath: string;

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('adds missing foreign keys to existing tables', async () => {
    dbPath = path.join(os.tmpdir(), `od-fk-${Date.now()}.sqlite`);

    // Create a legacy database without the FKs.
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT);
      CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_project_id TEXT,
        files_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schedule_kind TEXT NOT NULL,
        schedule_value TEXT NOT NULL,
        project_mode TEXT NOT NULL,
        project_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE routine_runs (
        id TEXT PRIMARY KEY,
        routine_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        agent_run_id TEXT NOT NULL,
        started_at INTEGER NOT NULL
      );
    `);
    legacyDb.close();

    // Re-open through the migration path.
    const { openDatabase, closeDatabase } = await import('../src/db.js');
    const db = openDatabase(os.tmpdir(), { dataDir: path.dirname(dbPath) });

    function fkList(table: string) {
      return db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ from: string; table: string }>;
    }

    expect(fkList('templates').some((fk) => fk.from === 'source_project_id' && fk.table === 'projects')).toBe(true);
    expect(fkList('routines').some((fk) => fk.from === 'project_id' && fk.table === 'projects')).toBe(true);
    expect(fkList('routine_runs').some((fk) => fk.from === 'project_id' && fk.table === 'projects')).toBe(true);
    expect(fkList('routine_runs').some((fk) => fk.from === 'conversation_id' && fk.table === 'conversations')).toBe(true);

    closeDatabase();
  });
});
