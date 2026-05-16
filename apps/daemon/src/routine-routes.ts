import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import {
  deleteRoutine as dbDeleteRoutine,
  getLatestRoutineRun,
  getProject,
  getRoutine,
  insertRoutine,
  listRoutineRuns,
  listRoutines,
  updateRoutine,
} from './db.js';
import {
  validateSchedule as validateRoutineSchedule,
  validateTarget as validateRoutineTarget,
  type RoutineService,
} from './routines.js';
import type { RouteDeps } from './server-context.js';

export interface RegisterRoutineRoutesDeps extends RouteDeps<'db' | 'routines'> {}

export type RoutineRoutesService = Pick<
  RoutineService,
  'nextRunAt' | 'rescheduleOne' | 'runNow' | 'unschedule'
>;

export function routineDbRowToContract(row: any, latestRun: any) {
  let schedule: any;
  if (row.scheduleJson) {
    try {
      schedule = JSON.parse(row.scheduleJson);
    } catch {
      schedule = null;
    }
  }
  if (!schedule) {
    schedule = {
      kind: row.scheduleKind || 'daily',
      time: row.scheduleValue || '09:00',
      timezone: 'UTC',
    };
  }
  const target = row.projectMode === 'reuse' && row.projectId
    ? { mode: 'reuse', projectId: row.projectId }
    : { mode: 'create_each_run' };
  const lastRun = latestRun
    ? {
        runId: latestRun.id,
        status: latestRun.status,
        trigger: latestRun.trigger,
        startedAt: latestRun.startedAt,
        ...(latestRun.completedAt == null ? {} : { completedAt: latestRun.completedAt }),
        projectId: latestRun.projectId,
        conversationId: latestRun.conversationId,
        agentRunId: latestRun.agentRunId,
        ...(latestRun.summary ? { summary: latestRun.summary } : {}),
      }
    : null;
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    schedule,
    target,
    skillId: row.skillId ?? null,
    agentId: row.agentId ?? null,
    enabled: row.enabled === true || row.enabled === 1,
    nextRunAt: null as number | null,
    lastRun,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function registerRoutineRoutes(app: Express, ctx: RegisterRoutineRoutesDeps) {
  const { db } = ctx;
  const { routineService } = ctx.routines;

  function scheduleToDbCols(schedule: any) {
    const json = JSON.stringify(schedule);
    let value = '';
    if (schedule.kind === 'hourly') value = String(schedule.minute);
    else if (schedule.kind === 'weekly') value = `${schedule.weekday}:${schedule.time}`;
    else value = schedule.time;
    return { scheduleKind: schedule.kind, scheduleValue: value, scheduleJson: json };
  }

  function routineFromDb(id: string) {
    const row = getRoutine(db, id);
    if (!row) return null;
    const latest = getLatestRoutineRun(db, id);
    const contract = routineDbRowToContract(row, latest);
    const nextDate = routineService?.nextRunAt(id) ?? null;
    contract.nextRunAt = nextDate ? nextDate.getTime() : null;
    return contract;
  }

  function validateRoutineInput(body: any, partial: boolean) {
    if (!body || typeof body !== 'object') throw new Error('Request body must be an object');
    if (!partial || body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) throw new Error('name is required');
    }
    if (!partial || body.prompt !== undefined) {
      if (typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('prompt is required');
    }
    if (!partial || body.schedule !== undefined) validateRoutineSchedule(body.schedule);
    if (!partial || body.target !== undefined) {
      validateRoutineTarget(body.target);
      if (body.target.mode === 'reuse') {
        const project = getProject(db, body.target.projectId);
        if (!project) throw new Error(`target project ${body.target.projectId} not found`);
      }
    }
  }

  app.get('/api/routines', (_req, res) => {
    try {
      const routines = listRoutines(db).map((row) => {
        const latest = getLatestRoutineRun(db, row.id);
        const contract = routineDbRowToContract(row, latest);
        const nextDate = routineService?.nextRunAt(row.id) ?? null;
        contract.nextRunAt = nextDate ? nextDate.getTime() : null;
        return contract;
      });
      res.json({ routines });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

  app.post('/api/routines', (req, res) => {
    try {
      const body = req.body || {};
      validateRoutineInput(body, false);
      const id = `routine-${randomUUID()}`;
      const now = Date.now();
      const scheduleCols = scheduleToDbCols(body.schedule);
      insertRoutine(db, {
        id,
        name: body.name.trim(),
        prompt: body.prompt,
        ...scheduleCols,
        projectMode: body.target.mode,
        projectId: body.target.mode === 'reuse' ? body.target.projectId : null,
        skillId: body.skillId ?? null,
        agentId: body.agentId ?? null,
        enabled: body.enabled !== false,
        createdAt: now,
        updatedAt: now,
      });
      routineService?.rescheduleOne(id);
      const routine = routineFromDb(id);
      res.status(201).json({ routine });
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.get('/api/routines/:id', (req, res) => {
    const routine = routineFromDb(req.params.id);
    if (!routine) return res.status(404).json({ error: 'routine not found' });
    res.json({ routine });
  });

  app.patch('/api/routines/:id', (req, res) => {
    try {
      const existing = getRoutine(db, req.params.id);
      if (!existing) return res.status(404).json({ error: 'routine not found' });
      const body = req.body || {};
      validateRoutineInput(body, true);
      const patch: any = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.prompt !== undefined) patch.prompt = body.prompt;
      if (body.schedule !== undefined) Object.assign(patch, scheduleToDbCols(body.schedule));
      if (body.target !== undefined) {
        patch.projectMode = body.target.mode;
        patch.projectId = body.target.mode === 'reuse' ? body.target.projectId : null;
      }
      if (body.skillId !== undefined) patch.skillId = body.skillId ?? null;
      if (body.agentId !== undefined) patch.agentId = body.agentId ?? null;
      if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
      updateRoutine(db, req.params.id, patch);
      routineService?.rescheduleOne(req.params.id);
      res.json({ routine: routineFromDb(req.params.id) });
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.delete('/api/routines/:id', (req, res) => {
    routineService?.unschedule(req.params.id);
    const removed = dbDeleteRoutine(db, req.params.id);
    if (!removed) return res.status(404).json({ error: 'routine not found' });
    res.status(204).end();
  });

  app.post('/api/routines/:id/run', async (req, res) => {
    try {
      const existing = getRoutine(db, req.params.id);
      if (!existing) return res.status(404).json({ error: 'routine not found' });
      const start = await routineService.runNow(req.params.id);
      res.status(202).json({
        routine: routineFromDb(req.params.id),
        run: getLatestRoutineRun(db, req.params.id),
        projectId: start.projectId,
        conversationId: start.conversationId,
        agentRunId: start.agentRunId,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

  app.get('/api/routines/:id/runs', (req, res) => {
    const existing = getRoutine(db, req.params.id);
    if (!existing) return res.status(404).json({ error: 'routine not found' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    res.json({ runs: listRoutineRuns(db, req.params.id, limit) });
  });
}
