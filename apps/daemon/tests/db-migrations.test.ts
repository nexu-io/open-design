import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';

const legacyProjects = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    skill_id TEXT,
    design_system_id TEXT,
    pending_prompt TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'open-design-db-migrations-'));
}

function createLegacyDatabase(dir: string): void {
  const db = new Database(path.join(dir, 'app.sqlite'));
  db.exec(legacyProjects);
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run('project-1', 'Preserved project', 1, 2);
  db.pragma('user_version = 0');
  db.close();
}

afterEach(() => {
  closeDatabase();
});

describe('SQLite schema lifecycle', () => {
  it('records a versioned fresh schema and is idempotent on reopen', () => {
    const dir = tempDir();
    const logs: string[] = [];
    const logger = { info: (message: string) => logs.push(message), warn: () => {} };

    const first = openDatabase(dir, { dataDir: dir, logger });
    expect(first.pragma('user_version', { simple: true })).toBe(1);
    expect(first.prepare(
      `SELECT version, name FROM schema_migrations`,
    ).all()).toEqual([{ version: 1, name: 'initial-schema-and-domain-tables' }]);
    closeDatabase();

    const backupsAfterFirstOpen = fs.readdirSync(dir).filter((name) => name.includes('.pre-migration-'));
    const second = openDatabase(dir, { dataDir: dir, logger });
    expect(second.pragma('user_version', { simple: true })).toBe(1);
    expect(fs.readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual(backupsAfterFirstOpen);
    expect(logs.some((message) => message.includes('applying migration 1'))).toBe(true);
  });

  it('upgrades a legacy database transactionally without losing rows', () => {
    const dir = tempDir();
    createLegacyDatabase(dir);
    const logger = { info: () => {}, warn: () => {} };
    const db = openDatabase(dir, { dataDir: dir, logger });

    expect(db.prepare(`SELECT name, metadata_json, custom_instructions FROM projects WHERE id = ?`).get('project-1'))
      .toEqual({ name: 'Preserved project', metadata_json: null, custom_instructions: null });
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(fs.readdirSync(dir).some((name) => name.includes('.pre-migration-v1-'))).toBe(true);
  });

  it('fails closed for an unsupported schema before creating migration state', () => {
    const dir = tempDir();
    const file = path.join(dir, 'app.sqlite');
    const db = new Database(file);
    db.exec(`CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES ('keep')`);
    db.pragma('user_version = 99');
    db.close();

    expect(() => openDatabase(dir, { dataDir: dir })).toThrow(/newer than supported/);
    const check = new Database(file, { readonly: true });
    expect(check.prepare(`SELECT value FROM sentinel`).get()).toEqual({ value: 'keep' });
    expect(check.prepare(`SELECT name FROM sqlite_master WHERE name = 'schema_migrations'`).get()).toBeUndefined();
    check.close();
    expect(fs.readdirSync(dir).some((name) => name.includes('.pre-migration-'))).toBe(false);
  });

  it('retains a pre-migration backup when migration fails and rolls back', () => {
    const dir = tempDir();
    const db = new Database(path.join(dir, 'app.sqlite'));
    db.exec(`${legacyProjects};
      CREATE TABLE preview_comments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        element_id TEXT NOT NULL,
        UNIQUE(project_id, conversation_id, file_path, element_id)
      );`);
    db.pragma('user_version = 0');
    db.close();

    expect(() => openDatabase(dir, { dataDir: dir })).toThrow();
    expect(fs.readdirSync(dir).filter((name) => name.includes('.pre-migration-v1-')).length).toBe(1);
    const check = new Database(path.join(dir, 'app.sqlite'), { readonly: true });
    expect(check.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`).get())
      .toBeUndefined();
    expect(check.pragma('user_version', { simple: true })).toBe(0);
    check.close();

    // Repair the deliberately malformed legacy table and prove the retained
    // backup allows the ordered migration to be retried successfully.
    const repaired = new Database(path.join(dir, 'app.sqlite'));
    repaired.exec(`DROP TABLE preview_comments`);
    repaired.close();
    const reopened = openDatabase(dir, { dataDir: dir });
    expect(reopened.pragma('user_version', { simple: true })).toBe(1);
    expect(reopened.prepare(`SELECT version FROM schema_migrations`).all()).toEqual([{ version: 1 }]);
    expect(fs.readdirSync(dir).filter((name) => name.includes('.pre-migration-v1-')).length).toBe(2);
  });
});
