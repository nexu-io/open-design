import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
} from '../../src/media/tasks.js';
import { createMediaTaskStore, TASK_TTL_AFTER_DONE_MS } from '../../src/media/task-store.js';
import { resolveChatToolTokenTtlMs, ToolTokenRegistry } from '../../src/tool-tokens.js';

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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retains a terminal task while its owning run token stays active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const registry = new ToolTokenRegistry();
    const runId = 'run-active';
    const tokenTtlMs = resolveChatToolTokenTtlMs(30 * 60 * 1000);
    const grant = registry.mint({ runId, projectId: 'p1', ttlMs: tokenTtlMs });
    const store = createMediaTaskStore(db, {
      isRunActive: (candidateRunId) => registry.activeRunTokenCount(candidateRunId) > 0,
    });
    const task = store.createMediaTask('terminal-task', 'p1', { runId });
    task.status = 'done';
    task.endedAt = Date.now();
    store.persistMediaTask(task);
    store.notifyTaskWaiters(task);

    vi.advanceTimersByTime(30 * 60 * 1000);
    registry.refreshToken(grant.token, { ttlMs: tokenTtlMs });
    vi.advanceTimersByTime(30 * 60 * 1000);
    registry.refreshToken(grant.token, { ttlMs: tokenTtlMs });
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(Date.now()).toBeGreaterThan(TASK_TTL_AFTER_DONE_MS);
    expect(store.getLiveMediaTask(task.id)?.status).toBe('done');
    expect(getMediaTask(db, task.id)?.status).toBe('done');

    registry.revokeRun(runId, 'child_exit');
    vi.advanceTimersByTime(TASK_TTL_AFTER_DONE_MS - 10 * 60 * 1000);
    expect(store.getLiveMediaTask(task.id)).toBeNull();
    expect(getMediaTask(db, task.id)).toBeNull();
  });

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

// A refusal's attribution and retry verdict have to survive the database, not
// just the request that produced them. Every daemon restart and every cache
// rehydration reads the task back through normalizeError, so a field the write
// path stores but the read path drops disappears on the first bounce -- and a
// mocked-transport test cannot see that, because it never touches SQLite.
describe('media task error round-trip', () => {
  it('preserves subject and retryable through insert and read-back', () => {
    const db = freshDb();
    insertMediaTask(db, {
      id: 'task-refused',
      projectId: 'p1',
      status: 'failed',
      error: {
        message: 'the request was rejected by a content safety policy',
        status: 400,
        code: 'safety_rejection',
        subject: 'prompt',
        retryable: false,
      },
    });

    const reloaded = getMediaTask(db, 'task-refused');

    expect(reloaded?.error).toEqual({
      message: 'the request was rejected by a content safety policy',
      status: 400,
      code: 'safety_rejection',
      subject: 'prompt',
      retryable: false,
    });
    db.close();
  });

  it.each(['prompt', 'input_image', 'output_image'] as const)(
    'preserves the %s subject',
    (subject) => {
      const db = freshDb();
      insertMediaTask(db, {
        id: `task-${subject}`,
        projectId: 'p1',
        status: 'failed',
        error: { message: 'refused', code: 'safety_rejection', subject },
      });
      expect(getMediaTask(db, `task-${subject}`)?.error?.subject).toBe(subject);
      db.close();
    },
  );

  it('preserves the fields across an update, not only an insert', () => {
    const db = freshDb();
    insertMediaTask(db, { id: 'task-update', projectId: 'p1', status: 'running' });
    updateMediaTask(db, 'task-update', {
      status: 'failed',
      error: {
        message: 'refused',
        code: 'safety_rejection',
        subject: 'input_image',
        retryable: false,
      },
    });

    const reloaded = getMediaTask(db, 'task-update');
    expect(reloaded?.error?.subject).toBe('input_image');
    expect(reloaded?.error?.retryable).toBe(false);
    db.close();
  });

  // Absent must stay absent. "The producer did not say" and "the producer said
  // retrying is pointless" are different answers, and defaulting the first to
  // the second tells a user a transient outage is permanent.
  it('leaves absent fields absent rather than defaulting them', () => {
    const db = freshDb();
    insertMediaTask(db, {
      id: 'task-plain',
      projectId: 'p1',
      status: 'failed',
      error: { message: 'the image provider request failed', code: 'provider_error' },
    });

    const error = getMediaTask(db, 'task-plain')?.error;
    expect(error?.code).toBe('provider_error');
    expect(error).not.toHaveProperty('subject');
    expect(error).not.toHaveProperty('retryable');
    db.close();
  });

  // The column is JSON, so a row written by a newer daemon (or edited by hand)
  // can carry a vocabulary this build does not know. Validating on read keeps
  // an unknown subject out of the API response instead of passing it through.
  it('drops a subject outside the known vocabulary on read', () => {
    const db = freshDb();
    insertMediaTask(db, {
      id: 'task-unknown-subject',
      projectId: 'p1',
      status: 'failed',
      error: {
        message: 'refused',
        code: 'safety_rejection',
        subject: 'something_added_later' as never,
        retryable: false,
      },
    });

    const error = getMediaTask(db, 'task-unknown-subject')?.error;
    expect(error).not.toHaveProperty('subject');
    expect(error?.retryable).toBe(false);
    db.close();
  });

  it('ignores a non-boolean retryable on read', () => {
    const db = freshDb();
    insertMediaTask(db, {
      id: 'task-bad-retryable',
      projectId: 'p1',
      status: 'failed',
      error: {
        message: 'refused',
        code: 'safety_rejection',
        retryable: 'false' as never,
      },
    });

    expect(getMediaTask(db, 'task-bad-retryable')?.error).not.toHaveProperty('retryable');
    db.close();
  });
});
