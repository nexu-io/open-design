import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  deleteMediaTask,
  getMediaTask,
  insertMediaTask,
  listMediaTasksByProject,
  listRecentMediaTasks,
  migrateMediaTasks,
  reconcileMediaTasksOnBoot,
  updateMediaTask,
} from '../src/media-tasks.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'p2', 0, 0);
  `);
  migrateMediaTasks(db);
  return db;
}

describe('media task persistence', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('migrates idempotently', () => {
    expect(() => {
      migrateMediaTasks(db);
      migrateMediaTasks(db);
    }).not.toThrow();
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='media_tasks'`)
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('media_tasks');
  });

  it('round-trips task metadata and updates progress, file, and error fields', () => {
    insertMediaTask(db, {
      id: 'task_1',
      projectId: 'p1',
      status: 'queued',
      surface: 'video',
      model: 'seedance-2',
      startedAt: 100,
      createdAt: 100,
      updatedAt: 100,
    });

    updateMediaTask(db, 'task_1', {
      status: 'running',
      progress: ['accepted', 'polling'],
      updatedAt: 150,
    });
    updateMediaTask(db, 'task_1', {
      status: 'done',
      file: {
        name: 'clip.mp4',
        size: 1234,
        mime: 'video/mp4',
      },
      endedAt: 200,
      updatedAt: 200,
    });

    const row = getMediaTask(db, 'task_1');
    expect(row).toMatchObject({
      id: 'task_1',
      projectId: 'p1',
      status: 'done',
      surface: 'video',
      model: 'seedance-2',
      progress: ['accepted', 'polling'],
      file: {
        name: 'clip.mp4',
        size: 1234,
        mime: 'video/mp4',
      },
      startedAt: 100,
      endedAt: 200,
    });
  });

  it('lists active tasks by default and includes terminal tasks on request', () => {
    insertMediaTask(db, { id: 'running', projectId: 'p1', status: 'running', startedAt: 100 });
    insertMediaTask(db, { id: 'done', projectId: 'p1', status: 'done', startedAt: 200, endedAt: 250 });
    insertMediaTask(db, { id: 'other-project', projectId: 'p2', status: 'running', startedAt: 300 });

    expect(listMediaTasksByProject(db, 'p1').map((task) => task.id)).toEqual(['running']);
    expect(
      listMediaTasksByProject(db, 'p1', { includeTerminal: true }).map((task) => task.id),
    ).toEqual(['done', 'running']);
  });

  it('marks queued and running tasks interrupted on daemon boot', () => {
    insertMediaTask(db, {
      id: 'queued',
      projectId: 'p1',
      status: 'queued',
      progress: ['queued provider request'],
      startedAt: 100,
      updatedAt: 100,
    });
    insertMediaTask(db, {
      id: 'running',
      projectId: 'p1',
      status: 'running',
      startedAt: 200,
      updatedAt: 200,
    });
    insertMediaTask(db, {
      id: 'done',
      projectId: 'p1',
      status: 'done',
      startedAt: 300,
      endedAt: 350,
      updatedAt: 350,
    });

    const result = reconcileMediaTasksOnBoot(db, {
      terminalTtlMs: 10_000,
      now: 1_000,
    });
    expect(result).toEqual({ interrupted: 2, deleted: 0 });

    const queued = getMediaTask(db, 'queued');
    const running = getMediaTask(db, 'running');
    const done = getMediaTask(db, 'done');
    expect(queued).toMatchObject({
      status: 'interrupted',
      endedAt: 1_000,
      progress: ['queued provider request'],
      error: {
        message: 'media task interrupted by daemon restart',
        status: 5,
        code: 'DAEMON_RESTART',
      },
    });
    expect(running?.status).toBe('interrupted');
    expect(done?.status).toBe('done');
  });

  it('keeps recent terminal rows and deletes expired terminal rows by TTL', () => {
    insertMediaTask(db, {
      id: 'recent',
      projectId: 'p1',
      status: 'done',
      startedAt: 9_000,
      endedAt: 9_500,
      updatedAt: 9_500,
    });
    insertMediaTask(db, {
      id: 'expired',
      projectId: 'p1',
      status: 'failed',
      startedAt: 1_000,
      endedAt: 1_500,
      updatedAt: 1_500,
      error: { message: 'provider failed' },
    });

    const result = reconcileMediaTasksOnBoot(db, {
      terminalTtlMs: 5_000,
      now: 10_000,
    });
    expect(result).toEqual({ interrupted: 0, deleted: 1 });
    expect(getMediaTask(db, 'recent')?.status).toBe('done');
    expect(getMediaTask(db, 'expired')).toBeNull();
    expect(listRecentMediaTasks(db, { terminalTtlMs: 5_000, now: 10_000 }).map((t) => t.id))
      .toEqual(['recent']);
  });

  it('cascades task deletion when a project is deleted', () => {
    insertMediaTask(db, { id: 'doomed', projectId: 'p2', status: 'running' });
    db.prepare(`DELETE FROM projects WHERE id = ?`).run('p2');
    expect(getMediaTask(db, 'doomed')).toBeNull();
  });

  it('deletes tasks explicitly after the retention window', () => {
    insertMediaTask(db, { id: 'task_delete', projectId: 'p1', status: 'failed' });
    deleteMediaTask(db, 'task_delete');
    expect(getMediaTask(db, 'task_delete')).toBeNull();
  });
});
