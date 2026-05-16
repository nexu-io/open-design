// Plan §3.GG1 — inspectSqliteDatabase() pure helper.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { inspectSqliteDatabase } from '../src/storage/db-inspect.js';

let tmp: string;
let dbFile: string;
let db: Database.Database;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-db-inspect-'));
  dbFile = path.join(tmp, 'app.sqlite');
  db = new Database(dbFile);
});

afterEach(async () => {
  db.close();
  await rm(tmp, { recursive: true, force: true });
});

describe('inspectSqliteDatabase', () => {
  it('returns kind=sqlite and the absolute file path', async () => {
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    expect(report.kind).toBe('sqlite');
    expect(report.location).toBe(dbFile);
  });

  it('reports schemaVersion from the user_version PRAGMA', async () => {
    db.pragma('user_version = 7');
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    expect(report.schemaVersion).toBe(7);
  });

  it("reports schemaVersion=0 for a fresh DB (PRAGMA defaults)", async () => {
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    expect(report.schemaVersion).toBe(0);
  });

  it('lists user tables with row counts; excludes sqlite_* system tables', async () => {
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE files    (id INTEGER PRIMARY KEY, path TEXT);
      INSERT INTO projects (name) VALUES ('alpha'), ('beta'), ('gamma');
      INSERT INTO files (path) VALUES ('a.txt'), ('b.txt');
    `);
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    const byName = Object.fromEntries(report.tables.map((t) => [t.name, t.rowCount]));
    expect(byName).toEqual({ projects: 3, files: 2 });
    expect(report.tables.some((t) => t.name.startsWith('sqlite_'))).toBe(false);
  });

  it('walks tables in lexicographic order', async () => {
    db.exec(`
      CREATE TABLE zebra (id INTEGER PRIMARY KEY);
      CREATE TABLE alpha (id INTEGER PRIMARY KEY);
      CREATE TABLE mango (id INTEGER PRIMARY KEY);
    `);
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    expect(report.tables.map((t) => t.name)).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('sums file size = primary + WAL + SHM', async () => {
    db.exec('CREATE TABLE x (id INTEGER PRIMARY KEY); INSERT INTO x VALUES (1);');
    // Force-create a WAL companion file so the size sum exercises the
    // WAL-aware path even on platforms where SQLite hasn't yet flushed.
    await writeFile(`${dbFile}-wal`, Buffer.alloc(2048));
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    expect(report.sizeBytes).toBeGreaterThanOrEqual(2048);
  });

  it('records generatedAt as a recent epoch ms', async () => {
    const before = Date.now();
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    const after = Date.now();
    expect(report.generatedAt).toBeGreaterThanOrEqual(before);
    expect(report.generatedAt).toBeLessThanOrEqual(after + 50);
  });

  it('handles an empty database without error', async () => {
    const report = await inspectSqliteDatabase({ db, file: dbFile });
    expect(report.tables).toEqual([]);
    expect(report.sizeBytes).toBeGreaterThanOrEqual(0);
  });
});
