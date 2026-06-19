import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertProject,
  insertRoutine,
  insertRoutineRun,
  openDatabase,
} from '../src/db.js';
import { registerBuilderRunLedgerRoutes } from '../src/routes/builder-run-ledger.js';

describe('builder run ledger routes', () => {
  let tempDir: string;

  async function listen(app: express.Express) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve test server port');
    }
    return { server, port: address.port };
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-builder-run-ledger-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function buildApp() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const app = express();
    app.use(express.json());
    registerBuilderRunLedgerRoutes(app, {
      db,
      routines: {
        routineService: {
          nextRunAt: vi.fn(() => new Date('2026-06-22T09:00:00.000Z')),
        },
      },
    } as any);
    return { app, db };
  }

  function seedRoutineRun(db: unknown) {
    const now = new Date('2026-06-19T09:12:00.000Z').getTime();
    insertProject(db as any, {
      id: 'proj-1',
      name: 'Run ledger target',
      createdAt: now,
      updatedAt: now,
    });
    insertRoutine(db as any, {
      id: 'routine-1',
      name: 'Weekly GSC keyword scan',
      prompt: 'Improve search traffic.',
      scheduleKind: 'weekly',
      scheduleValue: '1:09:00',
      scheduleJson: JSON.stringify({
        kind: 'weekly',
        weekday: 1,
        time: '09:00',
        timezone: 'America/Los_Angeles',
      }),
      projectMode: 'reuse',
      projectId: 'proj-1',
      skillId: 'gsc-keyword-optimization',
      agentId: 'growth-agent',
      contextJson: JSON.stringify({ skillIds: ['build-a-content-page'] }),
      enabled: true,
      createdAt: now - 1000,
      updatedAt: now,
    });
    insertRoutineRun(db as any, {
      id: 'run-1',
      routineId: 'routine-1',
      trigger: 'scheduled',
      status: 'succeeded',
      projectId: 'proj-1',
      conversationId: 'conv-1',
      agentRunId: 'agent-run-1',
      startedAt: now,
      completedAt: now + 120000,
      summary: 'Keyword pass completed.',
    });
  }

  it('projects routine data into Builder processes, runs, and events', async () => {
    const { app, db } = buildApp();
    seedRoutineRun(db);
    const { server, port } = await listen(app);
    try {
      const processRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/processes`);
      expect(processRes.status).toBe(200);
      const processJson = await processRes.json() as { processes: Array<Record<string, any>> };
      expect(processJson.processes).toHaveLength(1);
      expect(processJson.processes[0]).toMatchObject({
        id: 'routine:routine-1',
        projectId: 'proj-1',
        agentId: 'growth-agent',
        status: 'completed',
        autonomy: 'stage',
        skillIds: ['gsc-keyword-optimization', 'build-a-content-page'],
        nextRunAt: '2026-06-22T09:00:00.000Z',
      });

      const runsRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs`);
      expect(runsRes.status).toBe(200);
      const runsJson = await runsRes.json() as { runs: Array<Record<string, any>> };
      expect(runsJson.runs).toHaveLength(1);
      expect(runsJson.runs[0]).toMatchObject({
        id: 'run-1',
        projectId: 'proj-1',
        processId: 'routine:routine-1',
        status: 'completed',
        origin: 'scheduled',
        skillIds: ['gsc-keyword-optimization', 'build-a-content-page'],
      });

      const eventsRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs/run-1/events`);
      expect(eventsRes.status).toBe(200);
      const eventsJson = await eventsRes.json() as { events: Array<Record<string, any>> };
      expect(eventsJson.events.map((event) => event.type)).toEqual([
        'process.started',
        'skill.loaded',
        'skill.loaded',
        'workflow.started',
        'process.completed',
      ]);

      const approvalsRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/approvals`);
      expect(approvalsRes.status).toBe(200);
      expect(await approvalsRes.json()).toEqual({ approvals: [] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('scopes runs and events to the requested project', async () => {
    const { app, db } = buildApp();
    seedRoutineRun(db);
    insertProject(db as any, {
      id: 'proj-2',
      name: 'Other project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { server, port } = await listen(app);
    try {
      const runsRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-2/builder/runs`);
      expect(runsRes.status).toBe(200);
      expect(await runsRes.json()).toEqual({ runs: [] });

      const eventRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-2/builder/runs/run-1/events`);
      expect(eventRes.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
