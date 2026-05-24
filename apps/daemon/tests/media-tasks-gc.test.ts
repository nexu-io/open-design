import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { getMediaTask, insertMediaTask } from '../src/media-tasks.js';

describe('media task GC with active waiters', () => {
  let server: http.Server | null = null;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    closeDatabase();
    delete process.env.OD_MEDIA_TASK_GC_TTL_MS;
  });

  it('removes a terminal task from cache and DB even when a waiter is present at GC time', async () => {
    process.env.OD_MEDIA_TASK_GC_TTL_MS = '50';

    const { startServer, __forTestMediaTasks, __forTestNotifyTaskWaiters } =
      await import('../src/server.js');

    const dataDir = process.env.OD_DATA_DIR;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });

    const projectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const now = Date.now() - 5_000;

    insertProject(db, {
      id: projectId,
      name: 'GC test project',
      createdAt: now,
      updatedAt: now,
    });

    insertMediaTask(db, {
      id: taskId,
      projectId,
      status: 'running',
      surface: 'video',
      model: 'seedance-2',
      progress: ['step 1'],
      startedAt: now,
      updatedAt: now,
    });

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    // Hydrate the task into the in-memory mediaTasks Map by calling /wait.
    await fetch(`${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: 0, timeoutMs: 0 }),
    });

    const liveTask = __forTestMediaTasks.get(taskId);
    expect(liveTask).toBeDefined();

    // Simulate a hung SSE connection: a waiter that never resolves.
    liveTask.waiters.add(() => {});

    // Mark the task terminal and schedule GC.
    liveTask.status = 'done';
    liveTask.endedAt = Date.now();
    __forTestNotifyTaskWaiters(db, liveTask);

    // Wait for the GC timer to fire (50ms TTL + buffer).
    await new Promise((resolve) => setTimeout(resolve, 150));

    // The task must be removed from the in-memory cache and the DB.
    expect(__forTestMediaTasks.has(taskId)).toBe(false);
    expect(getMediaTask(db, taskId)).toBeNull();
  });
});
