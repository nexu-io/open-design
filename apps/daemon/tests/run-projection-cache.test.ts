import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { ChatRun } from '../src/runtimes/chat-run-records.js';
import {
  createRunProjectionCache,
  readRunProjectionEpoch,
} from '../src/routes/run-projection-cache.js';

const makeDb = () => new Database(':memory:');

const seedTables = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE strategy_task_executions (
      task_execution_id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE strategy_task_runs (
      task_execution_id TEXT NOT NULL,
      run_id TEXT NOT NULL
    );
    CREATE TABLE strategy_task_observation_delivery (
      task_execution_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
};

const run = (id: string, status: string, updatedAt: number) =>
  ({ id, status, updatedAt }) as ChatRun;

const statusBody = (id: string) => ({ id }) as never;

describe('readRunProjectionEpoch', () => {
  it('reports absent markers before the strategy tables exist', () => {
    const db = makeDb();
    expect(readRunProjectionEpoch(db)).toBe('absent:absent:absent');
    db.close();
  });

  it('moves when a strategy task row is written or updated', () => {
    const db = makeDb();
    seedTables(db);
    const initial = readRunProjectionEpoch(db);
    db.prepare(
      'INSERT INTO strategy_task_executions (task_execution_id, updated_at) VALUES (?, ?)',
    ).run('task-1', 10);
    const afterInsert = readRunProjectionEpoch(db);
    expect(afterInsert).not.toBe(initial);
    db.prepare(
      'UPDATE strategy_task_executions SET updated_at = ? WHERE task_execution_id = ?',
    ).run(20, 'task-1');
    expect(readRunProjectionEpoch(db)).not.toBe(afterInsert);
    db.close();
  });

  it('moves when a task-run mapping or delivery row is appended', () => {
    const db = makeDb();
    seedTables(db);
    const initial = readRunProjectionEpoch(db);
    db.prepare(
      'INSERT INTO strategy_task_runs (task_execution_id, run_id) VALUES (?, ?)',
    ).run('task-1', 'run-1');
    const afterMapping = readRunProjectionEpoch(db);
    expect(afterMapping).not.toBe(initial);
    db.prepare(
      'INSERT INTO strategy_task_observation_delivery (task_execution_id, status) VALUES (?, ?)',
    ).run('task-1', 'observed');
    expect(readRunProjectionEpoch(db)).not.toBe(afterMapping);
    db.close();
  });
});

describe('createRunProjectionCache', () => {
  it('hits for an unchanged terminal run inside the same epoch', () => {
    const cache = createRunProjectionCache();
    const terminal = run('run-1', 'succeeded', 100);
    const status = statusBody('run-1');
    cache.set(terminal, 'epoch-a', status);
    expect(cache.get(run('run-1', 'succeeded', 100), 'epoch-a')?.status).toBe(
      status,
    );
  });

  it('misses when the strategy epoch moved', () => {
    const cache = createRunProjectionCache();
    const terminal = run('run-1', 'succeeded', 100);
    cache.set(terminal, 'epoch-a', statusBody('run-1'));
    expect(
      cache.get(run('run-1', 'succeeded', 100), 'epoch-b'),
    ).toBeUndefined();
  });

  it('misses when the run row itself moved', () => {
    const cache = createRunProjectionCache();
    const terminal = run('run-1', 'succeeded', 100);
    cache.set(terminal, 'epoch-a', statusBody('run-1'));
    expect(
      cache.get(run('run-1', 'succeeded', 101), 'epoch-a'),
    ).toBeUndefined();
  });

  it('never caches runs that are still live', () => {
    const cache = createRunProjectionCache();
    for (const status of ['queued', 'running']) {
      const live = run('run-live', status, 100);
      cache.set(live, 'epoch-a', statusBody('run-live'));
      expect(cache.get(live, 'epoch-a')).toBeUndefined();
    }
  });

  it('replays the cached strategyTask onto the fresh run object', () => {
    const cache = createRunProjectionCache();
    const terminal = run('run-1', 'succeeded', 100) as ChatRun & {
      strategyTask?: unknown;
    };
    terminal.strategyTask = { outcome: 'completed' } as never;
    cache.set(terminal, 'epoch-a', statusBody('run-1'));
    const fresh = run('run-1', 'succeeded', 100);
    const hit = cache.get(fresh, 'epoch-a');
    expect(hit?.strategyTask).toEqual({ outcome: 'completed' });
  });

  it('evicts the oldest entry beyond maxEntries', () => {
    const cache = createRunProjectionCache(2);
    cache.set(run('run-1', 'succeeded', 1), 'e', statusBody('run-1'));
    cache.set(run('run-2', 'succeeded', 1), 'e', statusBody('run-2'));
    cache.set(run('run-3', 'succeeded', 1), 'e', statusBody('run-3'));
    expect(cache.get(run('run-1', 'succeeded', 1), 'e')).toBeUndefined();
    expect(cache.get(run('run-2', 'succeeded', 1), 'e')).toBeDefined();
    expect(cache.get(run('run-3', 'succeeded', 1), 'e')).toBeDefined();
  });
});
