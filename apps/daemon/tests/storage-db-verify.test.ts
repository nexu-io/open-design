// Plan §3.LL1 — verifySqliteIntegrity() pure helper.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { verifySqliteIntegrity } from '../src/storage/db-inspect.js';

let tmp: string;
let db: Database.Database;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-db-verify-'));
  db = new Database(path.join(tmp, 'app.sqlite'));
});

afterEach(async () => {
  db.close();
  await rm(tmp, { recursive: true, force: true });
});

describe('verifySqliteIntegrity', () => {
  it('returns ok=true on a healthy fresh DB', () => {
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);`);
    const report = verifySqliteIntegrity({ db });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.mode).toBe('integrity_check');
  });

  it("honours the --quick flag (mode='quick_check')", () => {
    const report = verifySqliteIntegrity({ db, quick: true });
    expect(report.mode).toBe('quick_check');
    expect(report.ok).toBe(true);
  });

  it('detects foreign-key violations', () => {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE parents (id INTEGER PRIMARY KEY);
      CREATE TABLE kids    (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id));
      INSERT INTO kids (id, parent_id) VALUES (1, 999);
    `);
    db.pragma('foreign_keys = ON');
    const report = verifySqliteIntegrity({ db });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.kind === 'foreign_key')).toBe(true);
    const fk = report.issues.find((i) => i.kind === 'foreign_key');
    expect(fk?.message).toMatch(/kids/);
    expect(fk?.message).toMatch(/parents/);
  });

  it('records elapsedMs + generatedAt', () => {
    const before = Date.now();
    const report = verifySqliteIntegrity({ db });
    const after = Date.now();
    expect(report.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(report.generatedAt).toBeGreaterThanOrEqual(before);
    expect(report.generatedAt).toBeLessThanOrEqual(after + 50);
  });

  it('returns ok=true when there are tables but no FK violations', () => {
    db.exec(`
      CREATE TABLE a (id INTEGER PRIMARY KEY);
      CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));
      INSERT INTO a VALUES (1), (2);
      INSERT INTO b VALUES (1, 1), (2, 2);
    `);
    const report = verifySqliteIntegrity({ db });
    expect(report.ok).toBe(true);
  });
});
