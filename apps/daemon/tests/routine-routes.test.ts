import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  getRoutine,
  insertProject,
  insertRoutineRun,
  openDatabase,
} from '../src/db.js';
import { registerRoutineRoutes } from '../src/routes/routine.js';

describe('routine routes', () => {
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
    return {
      server,
      port: address.port,
    };
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-routine-routes-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function buildApp() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const nextRunAt = vi.fn(() => new Date('2026-05-13T01:00:00.000Z'));
    const rescheduleOne = vi.fn();
    const unschedule = vi.fn();
    const runNow = vi.fn(async (routineId: string) => {
      insertRoutineRun(db, {
        id: 'run-1',
        routineId,
        trigger: 'manual',
        status: 'queued',
        projectId: 'proj-run',
        conversationId: 'conv-run',
        agentRunId: 'agent-run-1',
        startedAt: Date.now(),
      });
      return {
        projectId: 'proj-run',
        conversationId: 'conv-run',
        agentRunId: 'agent-run-1',
        completion: Promise.resolve({ status: 'queued' }),
      };
    });

    const app = express();
    app.use(express.json());
    registerRoutineRoutes(app, {
      db,
      paths: { RUNTIME_DATA_DIR: tempDir },
      routines: {
        routineService: {
          nextRunAt,
          rescheduleOne,
          runNow,
          unschedule,
        },
      },
    } as any);

    return { app, db, nextRunAt, rescheduleOne, runNow, unschedule };
  }

  it('lists and fetches built-in automation templates', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const listRes = await fetch(`http://127.0.0.1:${port}/api/automation-templates`);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json() as {
        templates: Array<{ id: string; outputSinks: string[]; tokenCompression: string }>;
      };
      expect(listJson.templates.map((template) => template.id)).toEqual(expect.arrayContaining([
        'ingest-source-memory-tree',
        'extract-design-system',
        'crystallize-run-into-skill',
      ]));

      const templateRes = await fetch(`http://127.0.0.1:${port}/api/automation-templates/extract-design-system`);
      expect(templateRes.status).toBe(200);
      const templateJson = await templateRes.json() as {
        template: { id: string; outputSinks: string[]; tokenCompression: string };
      };
      expect(templateJson.template).toMatchObject({
        id: 'extract-design-system',
        outputSinks: ['design-system', 'memory'],
        tokenCompression: 'balanced',
      });

      const missingRes = await fetch(`http://127.0.0.1:${port}/api/automation-templates/missing`);
      expect(missingRes.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('creates a reuse-mode routine and includes the computed next run', async () => {
    const { app, db, rescheduleOne } = buildApp();
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Routine target',
      createdAt: now,
      updatedAt: now,
    });

    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Weekly digest',
          prompt: 'Summarize GitHub and design activity.',
          schedule: {
            kind: 'weekly',
            weekday: 3,
            time: '09:00',
            timezone: 'UTC',
          },
          target: { mode: 'reuse', projectId: 'proj-1' },
          context: {
            skillIds: ['live-artifact'],
            pluginIds: ['od-new-generation'],
            mcpServerIds: ['figma-mcp'],
            connectorIds: ['github'],
          },
          enabled: true,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json() as {
        routine: {
          id: string;
          name: string;
          target: { mode: string; projectId: string };
          context: {
            skillIds?: string[];
            pluginIds?: string[];
            mcpServerIds?: string[];
            connectorIds?: string[];
          };
          nextRunAt: number;
        };
      };
      expect(json.routine.name).toBe('Weekly digest');
      expect(json.routine.target).toEqual({ mode: 'reuse', projectId: 'proj-1' });
      expect(json.routine.context).toEqual({
        skillIds: ['live-artifact'],
        pluginIds: ['od-new-generation'],
        mcpServerIds: ['figma-mcp'],
        connectorIds: ['github'],
      });
      expect(json.routine.nextRunAt).toBe(new Date('2026-05-13T01:00:00.000Z').getTime());

      const stored = getRoutine(db, json.routine.id);
      expect(stored?.projectId).toBe('proj-1');
      expect(JSON.parse(stored?.contextJson ?? '{}')).toEqual(json.routine.context);
      expect(rescheduleOne).toHaveBeenCalledWith(json.routine.id);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('patches enabled state and target mode, then reschedules the routine', async () => {
    const { app, db, rescheduleOne } = buildApp();
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Routine target',
      createdAt: now,
      updatedAt: now,
    });

    const { server: createServer, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      const patchRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          target: { mode: 'reuse', projectId: 'proj-1' },
        }),
      });
      expect(patchRes.status).toBe(200);

      const patched = await patchRes.json() as {
        routine: { enabled: boolean; target: { mode: string; projectId: string } };
      };
      expect(patched.routine.enabled).toBe(false);
      expect(patched.routine.target).toEqual({ mode: 'reuse', projectId: 'proj-1' });
      expect(rescheduleOne).toHaveBeenLastCalledWith(created.routine.id);
    } finally {
      await new Promise<void>((resolve) => createServer.close(() => resolve()));
    }
  });

  it('rejects patching to a missing reuse-mode target project', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      const patchRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: { mode: 'reuse', projectId: 'missing-project' },
        }),
      });

      expect(patchRes.status).toBe(400);
      const json = await patchRes.json() as { error: string };
      expect(json.error).toContain('target project missing-project not found');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('runs a routine now and exposes its run history', async () => {
    const { app, runNow } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      const runRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}/run`, {
        method: 'POST',
      });
      expect(runRes.status).toBe(202);
      const runJson = await runRes.json() as {
        projectId: string;
        conversationId: string;
        agentRunId: string;
        run: { status: string; trigger: string };
      };
      expect(runJson.projectId).toBe('proj-run');
      expect(runJson.conversationId).toBe('conv-run');
      expect(runJson.agentRunId).toBe('agent-run-1');
      expect(runJson.run.status).toBe('queued');
      expect(runNow).toHaveBeenCalledWith(created.routine.id);

      const runsRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}/runs?limit=10`);
      expect(runsRes.status).toBe(200);
      const runsJson = await runsRes.json() as { runs: Array<{ id: string; status: string }> };
      expect(runsJson.runs).toHaveLength(1);
      expect(runsJson.runs[0]).toMatchObject({ id: 'run-1', status: 'queued' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('crystallizes a succeeded routine run into skill and memory proposals', async () => {
    const { app, db } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Artifact polish loop',
          prompt: 'Review a generated artifact and extract durable layout guidance.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };
      insertRoutineRun(db, {
        id: 'run-succeeded-1',
        routineId: created.routine.id,
        trigger: 'manual',
        status: 'succeeded',
        projectId: 'proj-crystallize',
        conversationId: 'conv-crystallize',
        agentRunId: 'agent-crystallize',
        startedAt: Date.now() - 5_000,
        completedAt: Date.now(),
        summary: 'Use compact control panels, keep artifact previews unframed, and promote repeatable QA steps.',
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/api/routines/${created.routine.id}/runs/run-succeeded-1/crystallize`,
        { method: 'POST' },
      );
      expect(res.status).toBe(200);
      const json = await res.json() as {
        routineId: string;
        runId: string;
        packet: { sourceKind: string; sourceRef: string; metadata?: Record<string, unknown> };
        proposals: Array<{ targetKind: string; title: string }>;
      };
      expect(json.routineId).toBe(created.routine.id);
      expect(json.runId).toBe('run-succeeded-1');
      expect(json.packet).toMatchObject({
        sourceKind: 'chat',
        sourceRef: 'routine-run:run-succeeded-1',
      });
      expect(json.packet.metadata).toMatchObject({
        routineId: created.routine.id,
        routineRunId: 'run-succeeded-1',
        agentRunId: 'agent-crystallize',
        templateId: 'crystallize-run-into-skill',
      });
      expect(json.proposals.map((proposal) => proposal.targetKind).sort()).toEqual([
        'memory-node',
        'skill',
      ]);
      expect(json.proposals.map((proposal) => proposal.title)).toEqual(expect.arrayContaining([
        'Skill: Artifact polish loop run',
        'Memory: Artifact polish loop run',
      ]));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects crystallizing routine runs that have not succeeded', async () => {
    const { app, db } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };
      insertRoutineRun(db, {
        id: 'run-running-1',
        routineId: created.routine.id,
        trigger: 'manual',
        status: 'running',
        projectId: 'proj-running',
        conversationId: 'conv-running',
        agentRunId: 'agent-running',
        startedAt: Date.now(),
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/api/routines/${created.routine.id}/runs/run-running-1/crystallize`,
        { method: 'POST' },
      );
      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toBe('only succeeded routine runs can be crystallized');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('maps the latest persisted run into the routine contract', async () => {
    const { app, db } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      insertRoutineRun(db, {
        id: 'run-failed-1',
        routineId: created.routine.id,
        trigger: 'manual',
        status: 'failed',
        projectId: 'proj-failed',
        conversationId: 'conv-failed',
        agentRunId: 'agent-run-failed',
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        summary: 'Connector auth failed',
        error: 'provider rejected credentials',
        errorCode: 'AGENT_AUTH_REQUIRED',
      });

      const getRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}`);
      expect(getRes.status).toBe(200);
      const json = await getRes.json() as {
        routine: {
          lastRun: {
            runId: string;
            status: string;
            trigger: string;
            projectId: string;
            conversationId: string;
            agentRunId: string;
            summary: string;
            error: string;
            errorCode: string;
            completedAt: number;
          } | null;
        };
      };
      expect(json.routine.lastRun).toMatchObject({
        runId: 'run-failed-1',
        status: 'failed',
        trigger: 'manual',
        projectId: 'proj-failed',
        conversationId: 'conv-failed',
        agentRunId: 'agent-run-failed',
        summary: 'Connector auth failed',
        error: 'provider rejected credentials',
        errorCode: 'AGENT_AUTH_REQUIRED',
      });
      expect(json.routine.lastRun?.completedAt).toBeTypeOf('number');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 500 when running a routine now throws', async () => {
    const { app, runNow } = buildApp();
    runNow.mockImplementationOnce(async () => {
      throw new Error('agent unavailable');
    });

    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      const runRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}/run`, {
        method: 'POST',
      });
      expect(runRes.status).toBe(500);
      const json = await runRes.json() as { error: string };
      expect(json.error).toContain('agent unavailable');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects reuse-mode creation when the target project does not exist', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Weekly digest',
          prompt: 'Summarize GitHub and design activity.',
          schedule: {
            kind: 'weekly',
            weekday: 3,
            time: '09:00',
            timezone: 'UTC',
          },
          target: { mode: 'reuse', projectId: 'missing-project' },
          enabled: true,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toContain('target project missing-project not found');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects unsupported target modes during creation', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Weird target digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'teleport' },
          enabled: true,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toContain('Unsupported routine target mode');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deletes a routine and unschedules it', async () => {
    const { app, unschedule } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      const deleteRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(204);
      expect(unschedule).toHaveBeenCalledWith(created.routine.id);

      const getRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}`);
      expect(getRes.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 404 for run history on an unknown routine', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines/missing/runs?limit=10`);
      expect(res.status).toBe(404);
      const json = await res.json() as { error: string };
      expect(json.error).toBe('routine not found');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects invalid schedule input during routine creation', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Broken hourly digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'hourly', minute: 75 },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toContain('minute');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects invalid timezone values during creation', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad timezone digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'Mars/Olympus' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toContain('Invalid timezone');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects invalid weekly weekday values during creation', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad weekday digest',
          prompt: 'Summarize activity.',
          schedule: {
            kind: 'weekly',
            weekday: 8,
            time: '09:00',
            timezone: 'UTC',
          },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toContain('weekly.weekday');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects invalid schedule input during routine patch updates', async () => {
    const { app } = buildApp();
    const { server, port } = await listen(app);
    try {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily digest',
          prompt: 'Summarize activity.',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'create_each_run' },
          enabled: true,
        }),
      });
      const created = await createRes.json() as { routine: { id: string } };

      const patchRes = await fetch(`http://127.0.0.1:${port}/api/routines/${created.routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schedule: { kind: 'daily', time: '25:99', timezone: 'UTC' },
        }),
      });

      expect(patchRes.status).toBe(400);
      const json = await patchRes.json() as { error: string };
      expect(json.error).toContain('Invalid time');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
