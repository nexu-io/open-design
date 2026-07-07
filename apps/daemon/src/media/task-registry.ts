// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module media/task-registry
 * In-memory registry for long-running media-generation tasks, layered over the
 * SQLite persistence in `./tasks.ts`.
 *
 * `mediaTasks` holds the live task objects (each with a `waiters` Set of SSE
 * wakers) keyed by task id; the helpers here create/hydrate/persist those
 * objects, fan progress out to waiters, and garbage-collect terminal tasks
 * after a TTL. Every mutating helper takes the `db` handle explicitly so the
 * registry stays a pure move out of server.ts with no module-scope database.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 2).
 * server.ts imports these back and wires them into startServer's boot
 * rehydration and the media route deps object.
 */

import {
  deleteMediaTask,
  getMediaTask,
  insertMediaTask,
  updateMediaTask,
} from './tasks.js';

/**
 * Live registry of in-flight media tasks, keyed by task id. Each value carries
 * the persisted task fields plus an in-memory `waiters` Set of SSE wakers.
 */
export const mediaTasks = new Map();
/**
 * How long a terminal (done/failed/interrupted) task stays resident before it
 * is evicted from `mediaTasks` and deleted from the database.
 */
export const TASK_TTL_AFTER_DONE_MS = 10 * 60 * 1000;
/** Statuses that make a task eligible for TTL-based garbage collection. */
const MEDIA_TERMINAL_STATUSES = new Set(['done', 'failed', 'interrupted']);

/**
 * Build a live task object from a persisted row and register it in
 * `mediaTasks`. Used on boot rehydration and on cache misses.
 * @param row Persisted media-task row from the database.
 * @returns The hydrated, registered task object.
 */
export function hydrateMediaTask(row) {
  const task = {
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

/**
 * Resolve a task from the in-memory registry, falling back to the database and
 * hydrating on a cache miss.
 * @param db Database handle.
 * @param taskId Task id to look up.
 * @returns The live task object, or null if it does not exist.
 */
export function getLiveMediaTask(db, taskId) {
  const cached = mediaTasks.get(taskId);
  if (cached) return cached;
  const row = getMediaTask(db, taskId);
  return row ? hydrateMediaTask(row) : null;
}

/**
 * Create a new queued media task, register it in memory, and insert the
 * persisted row.
 * @param db Database handle.
 * @param taskId Caller-assigned task id.
 * @param projectId Owning project id.
 * @param info Optional `{ surface, model }` seed metadata.
 * @returns The newly created live task object.
 */
export function createMediaTask(db, taskId, projectId, info = {}) {
  const task = {
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
  insertMediaTask(db, {
    id: taskId,
    projectId,
    status: task.status,
    surface: task.surface,
    model: task.model,
    progress: task.progress,
    file: task.file,
    error: task.error,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
  });
  return task;
}

/**
 * Flush the current in-memory task state to the persisted row.
 * @param db Database handle.
 * @param task Live task object to persist.
 */
export function persistMediaTask(db, task) {
  updateMediaTask(db, task.id, {
    status: task.status,
    surface: task.surface,
    model: task.model,
    progress: task.progress,
    file: task.file,
    error: task.error,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
  });
}

/**
 * Append a progress line to a task, persist it, and wake any SSE waiters.
 * @param db Database handle.
 * @param task Live task object.
 * @param line Progress line to append.
 */
export function appendTaskProgress(db, task, line) {
  task.progress.push(line);
  persistMediaTask(db, task);
  notifyTaskWaiters(db, task);
}

/**
 * Wake every SSE waiter registered on a task, then schedule TTL-based garbage
 * collection when the task has reached a terminal status.
 * @param db Database handle.
 * @param task Live task object whose waiters should be notified.
 */
export function notifyTaskWaiters(db, task) {
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

/**
 * Produce the client-facing snapshot of a task's state for the SSE stream,
 * emitting only the progress lines after `since`.
 * @param task Live task object.
 * @param since Progress index already delivered to the client.
 * @returns Snapshot `{ taskId, status, startedAt, endedAt, progress, nextSince }`
 *   plus `file` on done and `error` on failed/interrupted.
 */
export function mediaTaskSnapshot(task, since = 0) {
  const snapshot = {
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
