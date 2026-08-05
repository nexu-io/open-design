import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrateMediaTasks } from '../../src/media/tasks.js';
import { createMediaTaskStore } from '../../src/media/task-store.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
  `);
  migrateMediaTasks(db);
  return db;
}

describe('media task store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('owns live task creation, persistence, and hydration', () => {
    const store = createMediaTaskStore({ db, ttlAfterDoneMs: 60_000, now: () => 100 });
    const task = store.create('task-1', 'p1', { surface: 'image', model: 'gpt-image-2' });

    task.status = 'running';
    store.appendProgress(task, 'accepted');
    task.status = 'done';
    task.file = { name: 'hero.png', size: 12 };
    store.persist(task);

    const hydratedStore = createMediaTaskStore({ db, ttlAfterDoneMs: 60_000 });
    expect(hydratedStore.get('task-1')).toMatchObject({
      id: 'task-1',
      status: 'done',
      surface: 'image',
      model: 'gpt-image-2',
      progress: ['accepted'],
      file: { name: 'hero.png', size: 12 },
      startedAt: 100,
    });
  });

  it('notifies every waiter without letting one failure stop the others', () => {
    const store = createMediaTaskStore({ db, ttlAfterDoneMs: 60_000 });
    const task = store.create('task-2', 'p1');
    const calls: string[] = [];
    task.waiters.add(() => { throw new Error('bad waiter'); });
    task.waiters.add(() => calls.push('woke'));

    expect(() => store.notifyWaiters(task)).not.toThrow();
    expect(calls).toEqual(['woke']);
  });
});
