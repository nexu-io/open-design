import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrateStrategyTaskStore } from '../../src/strategies/task-store.js';

it('adds answered without losing legacy task rows, child references, indexes, or FK enforcement', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE conversations (id TEXT PRIMARY KEY);
      CREATE TABLE applied_plugin_snapshots (id TEXT PRIMARY KEY);
      CREATE TABLE strategy_task_executions (
        task_execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        snapshot_id TEXT NOT NULL REFERENCES applied_plugin_snapshots(id),
        outcome TEXT NOT NULL CHECK (outcome IN ('running','completed','blocked','canceled')),
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE old_task_children (
        task_id TEXT NOT NULL REFERENCES strategy_task_executions(task_execution_id),
        body TEXT NOT NULL
      );
      CREATE INDEX old_task_outcome ON strategy_task_executions(outcome);
      INSERT INTO projects VALUES ('p');
      INSERT INTO conversations VALUES ('c');
      INSERT INTO applied_plugin_snapshots VALUES ('s');
      INSERT INTO strategy_task_executions VALUES ('task','p','c','s','completed',1);
      INSERT INTO old_task_children VALUES ('task','keep exact child');
    `);
    migrateStrategyTaskStore(db);
    expect(db.prepare('SELECT outcome FROM strategy_task_executions').get()).toEqual({ outcome: 'completed' });
    expect(db.prepare('SELECT * FROM old_task_children').get()).toEqual({ task_id: 'task', body: 'keep exact child' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'old_task_outcome'").get()).toBeDefined();
    db.prepare("UPDATE strategy_task_executions SET outcome = 'answered' WHERE task_execution_id = 'task'").run();
    expect(() => db.prepare("UPDATE strategy_task_executions SET outcome = 'unknown'").run()).toThrow();
    expect(() => db.prepare("INSERT INTO old_task_children VALUES ('missing','invalid')").run()).toThrow();
    migrateStrategyTaskStore(db);
    expect(db.prepare('SELECT outcome FROM strategy_task_executions').get()).toEqual({ outcome: 'answered' });
  } finally { db.close(); }
});
