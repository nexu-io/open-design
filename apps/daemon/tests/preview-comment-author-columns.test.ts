import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { closeDatabase, openDatabase } from '../src/db.js';

/**
 * The preview_comments author columns, and the ordering rule that keeps them.
 *
 * `migratePreviewCommentsSlideKey` and
 * `migratePreviewCommentsAllowMultiplePerElement` rebuild this table:
 * CREATE a new one, INSERT SELECT an EXPLICIT column list across, DROP the
 * old. A column added BEFORE those run is not in either list, so when an
 * older database upgrades it is silently dropped — along with everything
 * stored in it. Two comments in db.ts warn about this; nothing enforced it.
 *
 * These tests enforce it, by upgrading a database old enough to actually
 * trigger the rebuilds and checking the columns are still there afterwards
 * with their data intact. Asserting on a freshly-created database would
 * prove nothing: a fresh one never runs the rebuilds at all, which is
 * exactly why this class of bug reaches users and not CI.
 */

let tempDirs: string[] = [];

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

const AUTHOR_COLUMNS = [
  'author_kind',
  'author_app_user_id',
  'author_display_name',
  'author_key',
] as const;

function tempDir(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `od-author-cols-${label}-`));
  tempDirs.push(dir);
  return dir;
}

function columnNames(db: InstanceType<typeof Database>, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

/**
 * Write a preview_comments table shaped the way it was BEFORE either rebuild
 * migration existed — no slide_index, no allow-multiple-per-element rework —
 * so that opening it drives both rebuilds for real.
 */
function seedLegacyDatabase(dir: string): void {
  const db = new Database(path.join(dir, 'app.sqlite'));
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE preview_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      element_id TEXT NOT NULL,
      selector TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      html_hint TEXT NOT NULL,
      position_json TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO projects VALUES ('project-1', 'Project', 1, 1);
    INSERT INTO conversations VALUES ('conversation-1', 'project-1', 'Chat', 1, 1);
    INSERT INTO preview_comments VALUES (
      'comment-legacy', 'project-1', 'conversation-1', 'index.html', 'hero',
      '[data-od-id="hero"]', 'h1', 'Title', '<h1>', '{"x":0,"y":0,"width":1,"height":1}',
      'A note from before any of this existed', 'open', 1, 1
    );
  `);
  db.close();
}

describe('preview_comments author columns', () => {
  it('exist after a fresh open', () => {
    const dir = tempDir('fresh');
    const db = openDatabase(dir, { dataDir: dir });
    const columns = columnNames(db, 'preview_comments');
    for (const column of AUTHOR_COLUMNS) {
      expect(columns, `${column} missing on a fresh database`).toContain(column);
    }
  });

  it('survive the table rebuilds when a legacy database upgrades', () => {
    const dir = tempDir('legacy');
    seedLegacyDatabase(dir);

    const db = openDatabase(dir, { dataDir: dir });

    // Prove we are looking at the UPGRADED legacy database and not a fresh
    // one. `slide_index` alone would not prove it — a fresh database has that
    // column too, so asserting on it by itself passes even when the seed was
    // written to the wrong path and silently ignored. The legacy row is what
    // only the seeded database can have.
    const seeded = db
      .prepare(`SELECT note FROM preview_comments WHERE id = ?`)
      .get('comment-legacy') as { note?: string } | undefined;
    expect(seeded?.note, 'legacy row absent — this is a fresh database, not an upgrade').toBe(
      'A note from before any of this existed',
    );

    const columns = columnNames(db, 'preview_comments');
    expect(columns, 'slide_index absent, so the rebuild path never ran').toContain(
      'slide_index',
    );

    for (const column of AUTHOR_COLUMNS) {
      expect(
        columns,
        `${column} was dropped by a table rebuild — it must be added AFTER `
          + 'backfillPreviewCommentPinSeqAndSortKey in db.ts, not before',
      ).toContain(column);
    }
  });

  it('keep their data across a reopen of an upgraded database', () => {
    const dir = tempDir('persist');
    seedLegacyDatabase(dir);

    const first = openDatabase(dir, { dataDir: dir });
    first
      .prepare(
        `UPDATE preview_comments
            SET author_kind = ?, author_app_user_id = ?, author_display_name = ?, author_key = ?
          WHERE id = ?`,
      )
      .run('user', 'app-user-7', 'Ada', 'a'.repeat(64), 'comment-legacy');
    closeDatabase();

    const second = openDatabase(dir, { dataDir: dir });
    const row = second
      .prepare(
        `SELECT author_kind AS authorKind, author_app_user_id AS authorAppUserId,
                author_display_name AS authorDisplayName, author_key AS authorKey
           FROM preview_comments WHERE id = ?`,
      )
      .get('comment-legacy') as Record<string, unknown>;

    expect(row).toEqual({
      authorKind: 'user',
      authorAppUserId: 'app-user-7',
      authorDisplayName: 'Ada',
      authorKey: 'a'.repeat(64),
    });
  });

  it('leave a member-authored comment reading exactly as before', () => {
    const dir = tempDir('member');
    seedLegacyDatabase(dir);

    const db = openDatabase(dir, { dataDir: dir });
    const row = db
      .prepare(
        `SELECT note, author_kind AS authorKind, author_app_user_id AS authorAppUserId,
                author_display_name AS authorDisplayName, author_key AS authorKey
           FROM preview_comments WHERE id = ?`,
      )
      .get('comment-legacy') as Record<string, unknown>;

    // The pre-existing row came through the rebuilds with its content, and the
    // new columns are null rather than defaulted to something that would make
    // it look like an external author.
    expect(row.note).toBe('A note from before any of this existed');
    expect(row.authorKind).toBeNull();
    expect(row.authorAppUserId).toBeNull();
    expect(row.authorDisplayName).toBeNull();
    expect(row.authorKey).toBeNull();
  });
});
