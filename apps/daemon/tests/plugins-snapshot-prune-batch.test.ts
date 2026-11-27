import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { pruneExpiredSnapshots } from '../src/plugins/snapshots.js';

describe('large snapshot pruning batches', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE applied_plugin_snapshots (
        id TEXT PRIMARY KEY, expires_at INTEGER, run_id TEXT,
        applied_at INTEGER NOT NULL, project_id TEXT
      );
      CREATE TABLE projects (id TEXT PRIMARY KEY);
    `);
  });

  afterEach(() => db.close());

  function insertMany(count: number) {
    const statement = db.prepare(
      'INSERT INTO applied_plugin_snapshots (id, expires_at, applied_at) VALUES (?, 1, 1)',
    );
    db.transaction(() => {
      for (let index = 0; index < count; index += 1) statement.run(`snapshot-${index}`);
    })();
  }

  function remaining(): number {
    return (db.prepare('SELECT COUNT(*) AS count FROM applied_plugin_snapshots').get() as { count: number }).count;
  }

  it('prunes more expired rows than SQLite permits in one bound statement', () => {
    const options = db.pragma('compile_options') as Array<{ compile_options: string }>;
    const option = options.find((row) => row.compile_options.startsWith('MAX_VARIABLE_NUMBER='));
    const variableLimit = option ? Number(option.compile_options.split('=')[1]) : 32766;
    const count = variableLimit + 1;
    insertMany(count);
    db.prepare('INSERT INTO applied_plugin_snapshots (id, expires_at, applied_at) VALUES (?, 200, 1)').run('fresh');

    const result = pruneExpiredSnapshots(db, { now: 100 });

    assert.equal(result.removed, count);
    assert.equal(result.ids.length, count);
    assert.equal(new Set(result.ids).size, count);
    assert.equal(remaining(), 1);
    assert.ok(db.prepare('SELECT 1 FROM applied_plugin_snapshots WHERE id = ?').get('fresh'));
  });

  it('rolls back earlier deletions if a later batch fails', () => {
    insertMany(600);
    db.exec(`CREATE TRIGGER reject_snapshot_delete
      BEFORE DELETE ON applied_plugin_snapshots
      WHEN OLD.id = 'snapshot-599'
      BEGIN SELECT RAISE(ABORT, 'delete blocked'); END`);

    assert.throws(() => pruneExpiredSnapshots(db, { now: 100 }), /delete blocked/);
    assert.equal(remaining(), 600);

    db.exec('DROP TRIGGER reject_snapshot_delete');
    assert.equal(pruneExpiredSnapshots(db, { now: 100 }).removed, 600);
    assert.equal(remaining(), 0);
  });

  it('deduplicates overlapping candidates and preserves live project and task references', () => {
    db.exec(`
      CREATE TABLE strategy_task_executions (
        snapshot_id TEXT REFERENCES applied_plugin_snapshots(id)
      );
      INSERT INTO projects VALUES ('live');
      INSERT INTO applied_plugin_snapshots VALUES ('overlap', 1, NULL, 1, 'deleted');
      INSERT INTO applied_plugin_snapshots VALUES ('before', NULL, NULL, 1, NULL);
      INSERT INTO applied_plugin_snapshots VALUES ('retention', NULL, 'old-run', 1, 'deleted');
      INSERT INTO applied_plugin_snapshots VALUES ('live-project', NULL, 'live-run', 1, 'live');
      INSERT INTO applied_plugin_snapshots VALUES ('task-owned', 1, NULL, 1, 'deleted');
      INSERT INTO strategy_task_executions VALUES ('task-owned');
    `);

    const result = pruneExpiredSnapshots(db, { now: 200_000_000, before: 100, retentionDays: 1 });

    assert.equal(result.removed, 3);
    assert.deepEqual(new Set(result.ids), new Set(['overlap', 'before', 'retention']));
    assert.equal(remaining(), 2);
    assert.ok(db.prepare('SELECT 1 FROM applied_plugin_snapshots WHERE id = ?').get('task-owned'));
    assert.ok(db.prepare('SELECT 1 FROM applied_plugin_snapshots WHERE id = ?').get('live-project'));
  });
});
