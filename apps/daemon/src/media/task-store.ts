import type Database from 'better-sqlite3';
import type { MediaTaskInsert, MediaTaskPatch, MediaTaskRow, MediaTaskStatus } from './tasks.js';
import {
  deleteMediaTask,
  getMediaTask,
  insertMediaTask,
  updateMediaTask,
} from './tasks.js';

export interface LiveMediaTask {
  id: string;
  projectId: string;
  status: MediaTaskStatus;
  surface?: string | undefined;
  model?: string | undefined;
  progress: string[];
  file: unknown | null;
  error: MediaTaskRow['error'];
  startedAt: number;
  endedAt: number | null;
  waiters: Set<() => void>;
  _gcScheduled?: boolean;
}

export interface CreateMediaTaskInfo {
  surface?: string | undefined;
  model?: string | undefined;
}

export interface MediaTaskSnapshot {
  taskId: string;
  status: MediaTaskStatus;
  startedAt: number;
  endedAt: number | null;
  progress: string[];
  nextSince: number;
  file?: unknown | null;
  error?: MediaTaskRow['error'];
}

export const TASK_TTL_AFTER_DONE_MS = 10 * 60 * 1000;
const MEDIA_TERMINAL_STATUSES = new Set<MediaTaskStatus>(['done', 'failed', 'interrupted']);

export function createMediaTaskStore(db: Database.Database): {
  mediaTasks: Map<string, LiveMediaTask>;
  hydrateMediaTask(row: MediaTaskRow): LiveMediaTask;
  getLiveMediaTask(taskId: string): LiveMediaTask | null;
  createMediaTask(taskId: string, projectId: string, info?: CreateMediaTaskInfo): LiveMediaTask;
  persistMediaTask(task: LiveMediaTask): void;
  appendTaskProgress(task: LiveMediaTask, line: string): void;
  notifyTaskWaiters(task: LiveMediaTask): void;
  mediaTaskSnapshot(task: LiveMediaTask, since?: number): MediaTaskSnapshot;
} {
  const mediaTasks = new Map<string, LiveMediaTask>();

  function hydrateMediaTask(row: MediaTaskRow): LiveMediaTask {
    const task: LiveMediaTask = {
      id: row.id,
      projectId: row.projectId,
      status: row.status,
      surface: row.surface,
      model: row.model,
      progress: Array.isArray(row.progress) ? row.progress.slice() : [],
      file: row.file ?? null,
      error: row.error ?? null,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      waiters: new Set(),
    };
    mediaTasks.set(task.id, task);
    return task;
  }

  function getLiveMediaTask(taskId: string): LiveMediaTask | null {
    const cached = mediaTasks.get(taskId);
    if (cached) return cached;
    const row = getMediaTask(db, taskId);
    return row ? hydrateMediaTask(row) : null;
  }

  function createMediaTask(taskId: string, projectId: string, info: CreateMediaTaskInfo = {}): LiveMediaTask {
    const task: LiveMediaTask = {
      id: taskId,
      projectId,
      status: 'queued',
      surface: info.surface,
      model: info.model,
      progress: [],
      file: null,
      error: null,
      startedAt: Date.now(),
      endedAt: null,
      waiters: new Set(),
    };
    mediaTasks.set(taskId, task);
    const insert: MediaTaskInsert = {
      id: taskId,
      projectId,
      status: task.status,
      progress: task.progress,
      file: task.file,
      error: task.error,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      ...(task.surface !== undefined ? { surface: task.surface } : {}),
      ...(task.model !== undefined ? { model: task.model } : {}),
    };
    insertMediaTask(db, insert);
    return task;
  }

  function persistMediaTask(task: LiveMediaTask): void {
    const patch: MediaTaskPatch = {
      status: task.status,
      progress: task.progress,
      file: task.file,
      error: task.error,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      ...(task.surface !== undefined ? { surface: task.surface } : {}),
      ...(task.model !== undefined ? { model: task.model } : {}),
    };
    updateMediaTask(db, task.id, patch);
  }

  function appendTaskProgress(task: LiveMediaTask, line: string): void {
    task.progress.push(line);
    persistMediaTask(task);
    notifyTaskWaiters(task);
  }

  function notifyTaskWaiters(task: LiveMediaTask): void {
    const wakers = Array.from(task.waiters);
    for (const w of wakers) {
      try {
        w();
      } catch {
        // Never let one bad waiter block the rest.
      }
    }
    if (
      MEDIA_TERMINAL_STATUSES.has(task.status) &&
      !task._gcScheduled
    ) {
      task._gcScheduled = true;
      setTimeout(() => {
        if (task.waiters.size === 0) {
          mediaTasks.delete(task.id);
          deleteMediaTask(db, task.id);
        }
      }, TASK_TTL_AFTER_DONE_MS).unref?.();
    }
  }

  function mediaTaskSnapshot(task: LiveMediaTask, since = 0): MediaTaskSnapshot {
    const snapshot: MediaTaskSnapshot = {
      taskId: task.id,
      status: task.status,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      progress: task.progress.slice(since),
      nextSince: task.progress.length,
    };
    if (task.status === 'done') snapshot.file = task.file;
    if (task.status === 'failed' || task.status === 'interrupted') {
      snapshot.error = task.error;
    }
    return snapshot;
  }

  return {
    mediaTasks,
    hydrateMediaTask,
    getLiveMediaTask,
    createMediaTask,
    persistMediaTask,
    appendTaskProgress,
    notifyTaskWaiters,
    mediaTaskSnapshot,
  };
}
