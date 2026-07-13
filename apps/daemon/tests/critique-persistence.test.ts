import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  migrateCritique,
  insertCritiqueRun,
  getCritiqueRun,
  updateCritiqueRun,
  listCritiqueRunsByProject,
  deleteCritiqueRun,
  reconcileStaleRuns,
  CRITIQUE_RUN_STATUSES,
  type CritiqueRunRow,
} from '../src/critique/persistence.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // The persistence module has FKs into projects/conversations; create stubs
  // with the columns the FK references actually need.
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'p2', 0, 0);
    INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES ('c1', 'p1', 0, 0);
  `);
  migrateCritique(db);
  return db;
}

describe('critique persistence', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  it('migrate is idempotent', () => {
    expect(() => { migrateCritique(db); migrateCritique(db); }).not.toThrow();
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='critique_runs'`,
    ).all() as Array<{ name: string }>;
    expect(tables.length).toBe(1);
  });

  it('insert + get round-trips a row with rounds payload preserved', () => {
    const now = 1700000000000;
    const row = insertCritiqueRun(db, {
      id: 'crun_1',
      projectId: 'p1',
      conversationId: 'c1',
      artifactPath: '.od/artifacts/crun_1/v1.html',
      status: 'shipped',
      score: 8.6,
      rounds: [
        { n: 1, composite: 6.18, mustFix: 7, decision: 'continue' },
        { n: 2, composite: 7.86, mustFix: 3, decision: 'continue' },
        { n: 3, composite: 8.62, mustFix: 0, decision: 'ship' },
      ],
      transcriptPath: '.od/artifacts/crun_1/transcript.ndjson',
      protocolVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(row.id).toBe('crun_1');
    expect(row.rounds).toHaveLength(3);
    expect(row.rounds[2]?.decision).toBe('ship');
    const fetched = getCritiqueRun(db, 'crun_1');
    expect(fetched).toEqual(row);
  });

  it('default rounds is an empty array when not provided', () => {
    insertCritiqueRun(db, {
      id: 'crun_empty',
      projectId: 'p1',
      status: 'failed',
      protocolVersion: 1,
    });
    const row = getCritiqueRun(db, 'crun_empty');
    expect(row?.rounds).toEqual([]);
  });

  it('rejects an invalid status at insert time', () => {
    expect(() => insertCritiqueRun(db, {
      id: 'crun_bad',
      projectId: 'p1',
      status: 'not_a_status' as never,
      protocolVersion: 1,
    })).toThrow(RangeError);
  });

  it('updateCritiqueRun bumps updated_at and applies the patch', async () => {
    const r1 = insertCritiqueRun(db, {
      id: 'crun_upd',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(r1.updatedAt).toBe(1);
    const r2 = updateCritiqueRun(db, 'crun_upd', {
      score: 9.1,
      status: 'shipped',
      updatedAt: 1234,
    });
    expect(r2?.score).toBe(9.1);
    expect(r2?.updatedAt).toBe(1234);
  });

  it('updateCritiqueRun returns null for unknown id', () => {
    expect(updateCritiqueRun(db, 'crun_missing', { score: 1 })).toBeNull();
  });

  it('listCritiqueRunsByProject returns rows ordered by updated_at DESC', () => {
    insertCritiqueRun(db, { id: 'a', projectId: 'p1', status: 'shipped', protocolVersion: 1, createdAt: 100, updatedAt: 100 });
    insertCritiqueRun(db, { id: 'b', projectId: 'p1', status: 'shipped', protocolVersion: 1, createdAt: 200, updatedAt: 200 });
    insertCritiqueRun(db, { id: 'c', projectId: 'p2', status: 'shipped', protocolVersion: 1, createdAt: 300, updatedAt: 300 });
    const rows = listCritiqueRunsByProject(db, 'p1');
    expect(rows.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('deleteCritiqueRun removes the row', () => {
    insertCritiqueRun(db, { id: 'gone', projectId: 'p1', status: 'shipped', protocolVersion: 1 });
    deleteCritiqueRun(db, 'gone');
    expect(getCritiqueRun(db, 'gone')).toBeNull();
  });

  it('CRITIQUE_RUN_STATUSES exposes every public status', () => {
    expect(CRITIQUE_RUN_STATUSES).toEqual([
      'shipped', 'below_threshold', 'timed_out', 'interrupted',
      'degraded', 'failed', 'legacy',
    ]);
  });

  it('reconcileStaleRuns flips stale running rows to interrupted with recoveryReason', () => {
    db.prepare(
      `INSERT INTO critique_runs
         (id, project_id, status, rounds_json, protocol_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('stuck1', 'p1', 'running', '[]', 1, 0, 100);
    db.prepare(
      `INSERT INTO critique_runs
         (id, project_id, status, rounds_json, protocol_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('stuck2', 'p1', 'running', '[]', 1, 0, 200);
    db.prepare(
      `INSERT INTO critique_runs
         (id, project_id, status, rounds_json, protocol_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('fresh', 'p1', 'running', '[]', 1, 0, 1_000_000);

    const now = 1_000_500;
    const flipped = reconcileStaleRuns(db, { staleAfterMs: 1000, now });
    expect(flipped).toBe(2);
    const r1 = getCritiqueRun(db, 'stuck1');
    expect(r1?.status).toBe('interrupted');
    const fresh = getCritiqueRun(db, 'fresh');
    expect(fresh?.status).toBe('running');
    // recoveryReason is on rounds_json (top-level alongside the round entries).
    const raw = db.prepare(`SELECT rounds_json AS j FROM critique_runs WHERE id = 'stuck1'`).get() as { j: string };
    const parsed = JSON.parse(raw.j);
    expect(parsed.recoveryReason).toBe('daemon_restart');
  });

  it('CASCADEs critique_runs deletion when project is deleted', () => {
    insertCritiqueRun(db, { id: 'doomed', projectId: 'p2', status: 'shipped', protocolVersion: 1 });
    db.prepare(`DELETE FROM projects WHERE id = ?`).run('p2');
    expect(getCritiqueRun(db, 'doomed')).toBeNull();
  });
});
