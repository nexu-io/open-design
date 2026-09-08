import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, insertProject, openDatabase } from '../../src/db.js';
import { insertMediaTask } from '../../src/media/tasks.js';
import { startServer } from '../../src/server.js';

interface ListedTask {
  taskId: string;
  sequence?: number;
  batchId?: string;
  batchIndex?: number;
  batchSize?: number;
  startedAt: number;
}

describe('media task batch coordinates', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    closeDatabase();
  });

  async function listTasks(projectId: string): Promise<ListedTask[]> {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;
    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/media/tasks?includeDone=1`,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { tasks: ListedTask[] };
    return body.tasks;
  }

  it('reports N/M coordinates for an overlapping image batch in creation order', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const projectId = `project_${randomUUID()}`;
    const runId = `run_${randomUUID()}`;
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'Batched media project',
      createdAt: now,
      updatedAt: now,
    });

    // A parallel fan-out: every task is created in the same millisecond, so
    // `startedAt` alone cannot order the cells.
    const ids = ['first', 'second', 'third'].map((label) => `task_${label}_${randomUUID()}`);
    for (const id of ids) {
      insertMediaTask(db, {
        id,
        projectId,
        runId,
        status: 'running',
        surface: 'image',
        progress: [],
        startedAt: now,
        endedAt: null,
      });
    }

    const tasks = await listTasks(projectId);
    const byId = new Map(tasks.map((task) => [task.taskId, task]));
    expect(tasks).toHaveLength(3);
    ids.forEach((id, index) => {
      expect(byId.get(id)).toMatchObject({
        batchId: ids[0],
        batchIndex: index + 1,
        batchSize: 3,
      });
    });
    // Creation order must be recoverable even when startedAt ties.
    const sequences = ids.map((id) => byId.get(id)?.sequence);
    expect(sequences.every((value) => typeof value === 'number')).toBe(true);
    expect(sequences).toEqual([...sequences].sort((a, b) => (a ?? 0) - (b ?? 0)));
    // The response itself is newest-first with creation order breaking the tie,
    // so two polls can never disagree about which cell is which.
    expect(tasks.map((task) => task.taskId)).toEqual([...ids].reverse());
  });

  it('keeps one-at-a-time generation as separate single-cell batches', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const projectId = `project_${randomUUID()}`;
    const runId = `run_${randomUUID()}`;
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'Sequential media project',
      createdAt: now,
      updatedAt: now,
    });

    const doneId = `task_done_${randomUUID()}`;
    const liveId = `task_live_${randomUUID()}`;
    insertMediaTask(db, {
      id: doneId,
      projectId,
      runId,
      status: 'done',
      surface: 'image',
      progress: [],
      file: { name: 'one.png', size: 3 },
      startedAt: now - 10_000,
      endedAt: now - 5_000,
    });
    insertMediaTask(db, {
      id: liveId,
      projectId,
      runId,
      status: 'running',
      surface: 'image',
      progress: [],
      startedAt: now - 1_000,
      endedAt: null,
    });

    const byId = new Map((await listTasks(projectId)).map((task) => [task.taskId, task]));
    expect(byId.get(doneId)).toMatchObject({ batchId: doneId, batchIndex: 1, batchSize: 1 });
    expect(byId.get(liveId)).toMatchObject({ batchId: liveId, batchIndex: 1, batchSize: 1 });
  });
});
