import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import {
  getAnyAutomationTemplate,
  listAllAutomationTemplates,
} from '../automation-templates.js';
import {
  deleteRoutine as dbDeleteRoutine,
  getLatestRoutineRun,
  getProject,
  getRoutine,
  getRoutineRun,
  insertRoutine,
  listRoutineRuns,
  listRoutines,
  updateRoutine,
} from '../db.js';
import { ingestAutomationSource } from '../automation-ingestions.js';
import {
  validateSchedule as validateRoutineSchedule,
  validateTarget as validateRoutineTarget,
  type RoutineService,
} from '../routines.js';
import type { PathDeps, RouteDeps } from '../server-context.js';

export interface RegisterRoutineRoutesDeps extends RouteDeps<'db' | 'routines'> {
  paths: Pick<PathDeps, 'RUNTIME_DATA_DIR'>;
}

export type RoutineRoutesService = Pick<
  RoutineService,
  'nextRunAt' | 'rescheduleOne' | 'runNow' | 'unschedule'
>;

function cleanStringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`${field} must contain strings`);
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeRoutineContext(value: unknown) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('context must be an object');
  }
  const input = value as Record<string, unknown>;
  const context = {
    skillIds: cleanStringList(input.skillIds, 'context.skillIds'),
    pluginIds: cleanStringList(input.pluginIds, 'context.pluginIds'),
    mcpServerIds: cleanStringList(input.mcpServerIds, 'context.mcpServerIds'),
    connectorIds: cleanStringList(input.connectorIds, 'context.connectorIds'),
  };
  return Object.fromEntries(
    Object.entries(context).filter(([, ids]) => ids.length > 0),
  );
}

function parseStoredRoutineContext(row: any) {
  if (!row.contextJson) return {};
  try {
    return normalizeRoutineContext(JSON.parse(row.contextJson));
  } catch {
    return {};
  }
}

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
        ...(latestRun.error ? { error: latestRun.error } : {}),
        ...(latestRun.errorCode ? { errorCode: latestRun.errorCode } : {}),
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
    context: parseStoredRoutineContext(row),
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

  app.get('/api/automation-templates', async (_req, res) => {
    try {
      res.json({
        templates: await listAllAutomationTemplates(ctx.paths.RUNTIME_DATA_DIR),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

  app.get('/api/automation-templates/:id', async (req, res) => {
    try {
      const template = await getAnyAutomationTemplate(
        ctx.paths.RUNTIME_DATA_DIR,
        req.params.id,
      );
      if (!template) return res.status(404).json({ error: 'automation template not found' });
      res.json({ template });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

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
    if (!partial || body.context !== undefined) normalizeRoutineContext(body.context);
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
        contextJson: JSON.stringify(normalizeRoutineContext(body.context)),
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
      if (body.context !== undefined) patch.contextJson = JSON.stringify(normalizeRoutineContext(body.context));
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

  app.post('/api/routines/:id/runs/:runId/crystallize', async (req, res) => {
    try {
      const routine = getRoutine(db, req.params.id);
      if (!routine) return res.status(404).json({ error: 'routine not found' });
      const run = getRoutineRun(db, req.params.runId);
      if (!run || run.routineId !== req.params.id) {
        return res.status(404).json({ error: 'routine run not found' });
      }
      if (run.status !== 'succeeded') {
        return res.status(400).json({ error: 'only succeeded routine runs can be crystallized' });
      }
      const bodyMarkdown = [
        `# ${routine.name} reusable workflow`,
        '',
        `Routine id: ${routine.id}`,
        `Routine run: ${run.id}`,
        `Project id: ${run.projectId}`,
        `Conversation id: ${run.conversationId}`,
        `Agent run id: ${run.agentRunId}`,
        '',
        '## Original Automation Prompt',
        '',
        routine.prompt,
        '',
        '## Run Summary',
        '',
        run.summary || 'No run summary was recorded; crystallize from the automation prompt and run metadata.',
      ].join('\n');
      const result = await ingestAutomationSource(ctx.paths.RUNTIME_DATA_DIR, {
        templateId: 'crystallize-run-into-skill',
        sourceKind: 'chat',
        sourceRef: `routine-run:${run.id}`,
        title: `${routine.name} run`,
        bodyMarkdown,
        projectId: run.projectId,
        conversationId: run.conversationId,
        tokenCompression: 'balanced',
        metadata: {
          routineId: routine.id,
          routineRunId: run.id,
          agentRunId: run.agentRunId,
        },
      });
      res.json({ ...result, routineId: routine.id, runId: run.id });
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });
}
