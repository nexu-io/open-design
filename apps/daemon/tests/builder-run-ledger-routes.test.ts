import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertBuilderApproval,
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

  it('persists, scopes, and resolves Builder approvals', async () => {
    const { app, db } = buildApp();
    seedRoutineRun(db);
    insertBuilderApproval(db as any, {
      id: 'approval-1',
      projectId: 'proj-1',
      runId: 'run-1',
      processId: 'routine:routine-1',
      kind: 'publish',
      title: 'Approve publish',
      description: 'Placeholder publish approval.',
      status: 'requested',
      requestedBy: 'agent',
      requestedAt: '2026-06-19T09:13:00.000Z',
      subject: { path: 'src/pages/index.astro' },
      metadata: { source: 'test' },
    });
    insertBuilderApproval(db as any, {
      id: 'approval-2',
      projectId: 'proj-1',
      runId: 'run-1',
      processId: 'routine:routine-1',
      kind: 'apply_file_changes',
      title: 'Reject file change',
      status: 'requested',
      requestedBy: 'system',
      requestedAt: '2026-06-19T09:14:00.000Z',
    });

    const { server, port } = await listen(app);
    try {
      const listRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/approvals`);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json() as { approvals: Array<Record<string, any>> };
      expect(listJson.approvals.map((approval) => approval.id)).toEqual(['approval-2', 'approval-1']);

      const runScopedRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs/run-1/approvals`);
      expect(runScopedRes.status).toBe(200);
      const runScopedJson = await runScopedRes.json() as { approvals: Array<Record<string, any>> };
      expect(runScopedJson.approvals).toHaveLength(2);

      const detailRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/approvals/approval-1`);
      expect(detailRes.status).toBe(200);
      const detailJson = await detailRes.json() as { approval: Record<string, any> };
      expect(detailJson.approval).toMatchObject({
        id: 'approval-1',
        projectId: 'proj-1',
        runId: 'run-1',
        processId: 'routine:routine-1',
        kind: 'publish',
        status: 'requested',
        requestedAt: '2026-06-19T09:13:00.000Z',
        subject: { path: 'src/pages/index.astro' },
        metadata: { source: 'test' },
      });

      const processRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/processes/routine:routine-1`);
      expect(processRes.status).toBe(200);
      const processJson = await processRes.json() as { process: Record<string, any> };
      expect(processJson.process.status).toBe('waiting_for_approval');

      const runRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs/run-1`);
      expect(runRes.status).toBe(200);
      const runJson = await runRes.json() as { run: Record<string, any> };
      expect(runJson.run).toMatchObject({
        id: 'run-1',
        status: 'waiting_for_approval',
        approvalIds: ['approval-2', 'approval-1'],
      });

      const eventsRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs/run-1/events`);
      expect(eventsRes.status).toBe(200);
      const eventsJson = await eventsRes.json() as { events: Array<Record<string, any>> };
      expect(eventsJson.events.map((event) => event.type)).toEqual([
        'process.started',
        'skill.loaded',
        'skill.loaded',
        'workflow.started',
        'approval.requested',
        'approval.requested',
        'process.heartbeat',
      ]);

      const approveRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/approvals/approval-1/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'reviewer-1' }),
      });
      expect(approveRes.status).toBe(200);
      const approveJson = await approveRes.json() as { approval: Record<string, any> };
      expect(approveJson.approval).toMatchObject({
        id: 'approval-1',
        status: 'approved',
        resolvedBy: 'reviewer-1',
      });
      expect(typeof approveJson.approval.resolvedAt).toBe('string');

      const rejectRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/approvals/approval-2/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: 'rejected', resolvedBy: 'reviewer-2' }),
      });
      expect(rejectRes.status).toBe(200);
      const rejectJson = await rejectRes.json() as { approval: Record<string, any> };
      expect(rejectJson.approval).toMatchObject({
        id: 'approval-2',
        status: 'rejected',
        resolvedBy: 'reviewer-2',
      });

      const rerunRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs/run-1`);
      const rerunJson = await rerunRes.json() as { run: Record<string, any> };
      expect(rerunJson.run.status).toBe('completed');

      const resolvedEventsRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/runs/run-1/events`);
      const resolvedEventsJson = await resolvedEventsRes.json() as { events: Array<Record<string, any>> };
      expect(resolvedEventsJson.events.map((event) => event.type)).toEqual([
        'process.started',
        'skill.loaded',
        'skill.loaded',
        'workflow.started',
        'approval.requested',
        'approval.resolved',
        'approval.requested',
        'approval.resolved',
        'process.completed',
      ]);

      const secondApproveRes = await fetch(`http://127.0.0.1:${port}/api/projects/proj-1/builder/approvals/approval-1/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(secondApproveRes.status).toBe(409);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
