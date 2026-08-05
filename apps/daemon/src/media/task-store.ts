import type Database from 'better-sqlite3';
import {
  deleteMediaTask,
  getMediaTask,
  insertMediaTask,
  updateMediaTask,
  type MediaTaskError,
  type MediaTaskPatch,
  type MediaTaskRow,
  type MediaTaskStatus,
} from './tasks.js';

export interface LiveMediaTask {
  id: string;
  projectId: string;
  status: MediaTaskStatus;
  surface?: string;
  model?: string;
  progress: string[];
  file: unknown | null;
  error: MediaTaskError | null;
  startedAt: number;
  endedAt: number | null;
  waiters: Set<() => void>;
  gcScheduled?: boolean;
}

export interface MediaTaskCreateInfo {
  surface?: string;
  model?: string;
}

export interface MediaTaskStore {
  readonly tasks: Map<string, LiveMediaTask>;
  hydrate(row: MediaTaskRow): LiveMediaTask;
  get(taskId: string): LiveMediaTask | null;
  create(taskId: string, projectId: string, info?: MediaTaskCreateInfo): LiveMediaTask;
  persist(task: LiveMediaTask): void;
  appendProgress(task: LiveMediaTask, line: string): void;
  notifyWaiters(task: LiveMediaTask): void;
  clear(): void;
}

export function createMediaTaskStore(options: {
  db: Database.Database;
  ttlAfterDoneMs: number;
  now?: () => number;
}): MediaTaskStore {
  const tasks = new Map<string, LiveMediaTask>();
  const now = options.now ?? Date.now;

  const hydrate = (row: MediaTaskRow): LiveMediaTask => {
    const task: LiveMediaTask = {
      id: row.id,
      projectId: row.projectId,
      status: row.status,
      ...(row.surface === undefined ? {} : { surface: row.surface }),
      ...(row.model === undefined ? {} : { model: row.model }),
      progress: row.progress.slice(),
      file: row.file,
      error: row.error,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      waiters: new Set(),
    };
    tasks.set(task.id, task);
    return task;
  };

  const get = (taskId: string): LiveMediaTask | null => {
    const cached = tasks.get(taskId);
    if (cached) return cached;
    const row = getMediaTask(options.db, taskId);
    return row ? hydrate(row) : null;
  };

  const persist = (task: LiveMediaTask): void => {
    const patch: MediaTaskPatch = {
      status: task.status,
      ...(task.surface === undefined ? {} : { surface: task.surface }),
      ...(task.model === undefined ? {} : { model: task.model }),
      progress: task.progress,
      file: task.file,
      error: task.error,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
    };
    updateMediaTask(options.db, task.id, patch);
  };

  const notifyWaiters = (task: LiveMediaTask): void => {
    const wakers = Array.from(task.waiters);
    for (const wake of wakers) {
      try {
        wake();
      } catch {
        // Never let one bad waiter block the rest.
      }
    }
    if (
      (task.status === 'done' || task.status === 'failed' || task.status === 'interrupted') &&
      !task.gcScheduled
    ) {
      task.gcScheduled = true;
      const timer = setTimeout(() => {
        if (task.waiters.size === 0) {
          tasks.delete(task.id);
          deleteMediaTask(options.db, task.id);
        }
      }, options.ttlAfterDoneMs);
      timer.unref?.();
    }
  };

  const store: MediaTaskStore = {
    tasks,
    hydrate,
    get,
    create(taskId, projectId, info = {}) {
      const task: LiveMediaTask = {
        id: taskId,
        projectId,
        status: 'queued',
        ...(info.surface === undefined ? {} : { surface: info.surface }),
        ...(info.model === undefined ? {} : { model: info.model }),
        progress: [],
        file: null,
        error: null,
        startedAt: now(),
        endedAt: null,
        waiters: new Set(),
      };
      tasks.set(taskId, task);
      insertMediaTask(options.db, {
        id: taskId,
        projectId,
        status: task.status,
        ...(task.surface === undefined ? {} : { surface: task.surface }),
        ...(task.model === undefined ? {} : { model: task.model }),
        progress: task.progress,
        file: task.file,
        error: task.error,
        startedAt: task.startedAt,
        endedAt: task.endedAt,
      });
      return task;
    },
    persist,
    appendProgress(task, line) {
      task.progress.push(line);
      persist(task);
      notifyWaiters(task);
    },
    notifyWaiters,
    clear() {
      tasks.clear();
    },
  };

  return store;
}
