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
  getWorkspaceProjectByProjectId,
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
import {
  AutomationWorkspaceScopeError,
  authorizePersistedAutomationWorkspaceScope,
  authorizePersistedProjectWorkspace,
  normalizePersistedAutomationWorkspaceScope,
} from '../automations/workspace-scope.js';
import type { WorkspaceDirectoryFetchResult } from '../collab/vela-workspace-context.js';
import type { PathDeps, RouteDeps } from '../server-context.js';

export interface RegisterRoutineRoutesDeps extends RouteDeps<'db' | 'routines'> {
  paths: Pick<PathDeps, 'RUNTIME_DATA_DIR'>;
  fetchWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
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
  const hasWorkspaceScope = Object.hasOwn(input, 'workspaceScope');
  const workspaceScope = hasWorkspaceScope
    ? normalizePersistedAutomationWorkspaceScope(input.workspaceScope)
    : null;
  if (hasWorkspaceScope && input.workspaceScope !== null && !workspaceScope) {
    throw new Error(
      'context.workspaceScope must contain workspaceId and workspaceMemberId',
    );
  }
  const context = {
    skillIds: cleanStringList(input.skillIds, 'context.skillIds'),
    pluginIds: cleanStringList(input.pluginIds, 'context.pluginIds'),
    mcpServerIds: cleanStringList(input.mcpServerIds, 'context.mcpServerIds'),
    connectorIds: cleanStringList(input.connectorIds, 'context.connectorIds'),
    ...(hasWorkspaceScope
      ? { workspaceScope }
      : {}),
  };
  return Object.fromEntries(
    Object.entries(context).filter(([key, value]) =>
      key === 'workspaceScope' ? value !== null : Array.isArray(value) && value.length > 0,
    ),
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

  async function authorizeRoutineWorkspaceContext(
    req: any,
    context: ReturnType<typeof normalizeRoutineContext>,
    targetMode: 'create_each_run' | 'reuse',
    verifyExplicitScope = true,
  ) {
    if (targetMode === 'reuse') {
      const { workspaceScope: _ignoredWorkspaceScope, ...projectBoundContext } = context;
      return projectBoundContext;
    }
    const scope = normalizePersistedAutomationWorkspaceScope(context.workspaceScope);
    if (!scope) return context;
    if (!verifyExplicitScope) return { ...context, workspaceScope: scope };
    const claimedWorkspaceId = String(req.get?.('x-od-workspace-id') ?? '').trim();
    const claimedMemberId = String(req.get?.('x-od-workspace-member-id') ?? '').trim();
    if (
      claimedWorkspaceId !== scope.workspaceId
      || claimedMemberId !== scope.workspaceMemberId
    ) {
      throw new Error('routine Workspace scope must match the explicit request identity');
    }
    await authorizePersistedAutomationWorkspaceScope(scope, ctx.fetchWorkspaceDirectory);
    return { ...context, workspaceScope: scope };
  }

  function claimedWorkspaceScope(req: any) {
    const workspaceId = String(req.get?.('x-od-workspace-id') ?? '').trim();
    const workspaceMemberId = String(
      req.get?.('x-od-workspace-member-id') ?? '',
    ).trim();
    if (!workspaceId && !workspaceMemberId) return null;
    if (!workspaceId || !workspaceMemberId) {
      throw new Error('both Workspace and member identity headers are required');
    }
    return { workspaceId, workspaceMemberId };
  }

  function persistedRoutineWorkspaceId(row: any): string | null {
    if (row.projectMode === 'reuse' && row.projectId) {
      return getWorkspaceProjectByProjectId(db, row.projectId)?.workspaceId ?? null;
    }
    return normalizePersistedAutomationWorkspaceScope(
      parseStoredRoutineContext(row).workspaceScope,
    )?.workspaceId ?? null;
  }

  async function authorizeRoutineRecord(req: any, row: any) {
    const claimed = claimedWorkspaceScope(req);
    if (row.projectMode === 'reuse' && row.projectId) {
      const binding = getWorkspaceProjectByProjectId(db, row.projectId);
      if (!binding?.workspaceId) return null;
      if (!claimed || claimed.workspaceId !== binding.workspaceId) {
        throw new AutomationWorkspaceScopeError(
          'WORKSPACE_ACCESS_DENIED',
          'the routine belongs to a different Workspace',
          false,
        );
      }
      const context = await authorizePersistedProjectWorkspace(
        binding.workspaceId,
        ctx.fetchWorkspaceDirectory,
      );
      if (context.workspaceMemberId !== claimed.workspaceMemberId) {
        throw new AutomationWorkspaceScopeError(
          'WORKSPACE_ACCESS_DENIED',
          'the routine belongs to a different Workspace member',
          false,
        );
      }
      return {
        workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId,
      };
    }

    const persisted = normalizePersistedAutomationWorkspaceScope(
      parseStoredRoutineContext(row).workspaceScope,
    );
    if (!persisted) return null;
    if (
      !claimed
      || claimed.workspaceId !== persisted.workspaceId
      || claimed.workspaceMemberId !== persisted.workspaceMemberId
    ) {
      throw new AutomationWorkspaceScopeError(
        'WORKSPACE_ACCESS_DENIED',
        'the routine belongs to a different Workspace',
        false,
      );
    }
    await authorizePersistedAutomationWorkspaceScope(
      persisted,
      ctx.fetchWorkspaceDirectory,
    );
    return persisted;
  }

  function exposeRoutineWorkspaceScope(
    routine: ReturnType<typeof routineDbRowToContract>,
    scope: { workspaceId: string; workspaceMemberId: string } | null,
  ) {
    if (!scope) return routine;
    return {
      ...routine,
      context: {
        ...routine.context,
        workspaceScope: scope,
      },
    };
  }

  function sendRoutineError(res: any, err: any, fallbackStatus: number) {
    const status = err instanceof AutomationWorkspaceScopeError
      ? err.code === 'WORKSPACE_AUTHORITY_UNAVAILABLE' ? 503 : 403
      : fallbackStatus;
    return res.status(status).json({
      error: String(err?.message ?? err),
      ...(err instanceof AutomationWorkspaceScopeError
        ? { code: err.code, ...(err.retryable ? { retryable: true } : {}) }
        : {}),
    });
  }

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

  app.get('/api/routines', async (req, res) => {
    try {
      const claimed = claimedWorkspaceScope(req);
      if (claimed) {
        await authorizePersistedAutomationWorkspaceScope(
          claimed,
          ctx.fetchWorkspaceDirectory,
        );
      }
      const routines = listRoutines(db).flatMap((row) => {
        const persistedWorkspaceId = persistedRoutineWorkspaceId(row);
        const persistedScope = row.projectMode === 'reuse'
          ? null
          : normalizePersistedAutomationWorkspaceScope(
              parseStoredRoutineContext(row).workspaceScope,
            );
        if (persistedWorkspaceId && persistedWorkspaceId !== claimed?.workspaceId) {
          return [];
        }
        if (
          persistedScope
          && persistedScope.workspaceMemberId !== claimed?.workspaceMemberId
        ) {
          return [];
        }
        const latest = getLatestRoutineRun(db, row.id);
        const contract = routineDbRowToContract(row, latest);
        const nextDate = routineService?.nextRunAt(row.id) ?? null;
        contract.nextRunAt = nextDate ? nextDate.getTime() : null;
        return [
          exposeRoutineWorkspaceScope(
            contract,
            persistedWorkspaceId
              ? persistedScope ?? claimed
              : null,
          ),
        ];
      });
      res.json({ routines });
    } catch (err: any) {
      sendRoutineError(res, err, 400);
    }
  });

  app.post('/api/routines', async (req, res) => {
    try {
      const body = req.body || {};
      validateRoutineInput(body, false);
      const id = `routine-${randomUUID()}`;
      const now = Date.now();
      const scheduleCols = scheduleToDbCols(body.schedule);
      const context = await authorizeRoutineWorkspaceContext(
        req,
        normalizeRoutineContext(body.context),
        body.target.mode,
      );
      const createdScope = body.target.mode === 'reuse'
        ? await authorizeRoutineRecord(req, {
            projectMode: 'reuse',
            projectId: body.target.projectId,
            contextJson: '{}',
          })
        : normalizePersistedAutomationWorkspaceScope(context.workspaceScope);
      insertRoutine(db, {
        id,
        name: body.name.trim(),
        prompt: body.prompt,
        ...scheduleCols,
        projectMode: body.target.mode,
        projectId: body.target.mode === 'reuse' ? body.target.projectId : null,
        skillId: body.skillId ?? null,
        agentId: body.agentId ?? null,
        contextJson: JSON.stringify(context),
        enabled: body.enabled !== false,
        createdAt: now,
        updatedAt: now,
      });
      routineService?.rescheduleOne(id);
      const routine = routineFromDb(id);
      res.status(201).json({
        routine: exposeRoutineWorkspaceScope(routine!, createdScope),
      });
    } catch (err: any) {
      const status = err instanceof AutomationWorkspaceScopeError
        ? err.code === 'WORKSPACE_AUTHORITY_UNAVAILABLE' ? 503 : 403
        : 400;
      res.status(status).json({
        error: String(err?.message ?? err),
        ...(err instanceof AutomationWorkspaceScopeError
          ? { code: err.code, ...(err.retryable ? { retryable: true } : {}) }
          : {}),
      });
    }
  });

  app.get('/api/routines/:id', async (req, res) => {
    try {
      const row = getRoutine(db, req.params.id);
      if (!row) return res.status(404).json({ error: 'routine not found' });
      const scope = await authorizeRoutineRecord(req, row);
      res.json({
        routine: exposeRoutineWorkspaceScope(routineFromDb(req.params.id)!, scope),
      });
    } catch (err: any) {
      sendRoutineError(res, err, 400);
    }
  });

  app.patch('/api/routines/:id', async (req, res) => {
    try {
      const existing = getRoutine(db, req.params.id);
      if (!existing) return res.status(404).json({ error: 'routine not found' });
      const existingScope = await authorizeRoutineRecord(req, existing);
      let resultingScope = existingScope;
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
      if (body.context !== undefined || body.target !== undefined) {
        const effectiveTargetMode = body.target?.mode ?? existing.projectMode;
        const storedContext = parseStoredRoutineContext(existing);
        let context = body.context !== undefined
          ? normalizeRoutineContext(body.context)
          : storedContext;
        const requestHasWorkspaceScope = Boolean(
          body.context
          && typeof body.context === 'object'
          && !Array.isArray(body.context)
          && Object.hasOwn(body.context, 'workspaceScope'),
        );
        if (
          effectiveTargetMode === 'create_each_run'
          && !requestHasWorkspaceScope
          && (storedContext.workspaceScope || existingScope)
        ) {
          context = {
            ...context,
            workspaceScope: storedContext.workspaceScope ?? existingScope,
          };
        }
        const authorizedContext = await authorizeRoutineWorkspaceContext(
          req,
          context,
          effectiveTargetMode,
          requestHasWorkspaceScope,
        );
        patch.contextJson = JSON.stringify(authorizedContext);
        resultingScope = effectiveTargetMode === 'create_each_run'
          ? normalizePersistedAutomationWorkspaceScope(
              authorizedContext.workspaceScope,
            )
          : await authorizeRoutineRecord(req, {
              ...existing,
              projectMode: 'reuse',
              projectId: body.target?.projectId ?? existing.projectId,
              contextJson: JSON.stringify(authorizedContext),
            });
      }
      if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
      updateRoutine(db, req.params.id, patch);
      routineService?.rescheduleOne(req.params.id);
      res.json({
        routine: exposeRoutineWorkspaceScope(
          routineFromDb(req.params.id)!,
          resultingScope,
        ),
      });
    } catch (err: any) {
      sendRoutineError(res, err, 400);
    }
  });

  app.delete('/api/routines/:id', async (req, res) => {
    try {
      const existing = getRoutine(db, req.params.id);
      if (!existing) return res.status(404).json({ error: 'routine not found' });
      await authorizeRoutineRecord(req, existing);
      routineService?.unschedule(req.params.id);
      dbDeleteRoutine(db, req.params.id);
      res.status(204).end();
    } catch (err: any) {
      sendRoutineError(res, err, 400);
    }
  });

  app.post('/api/routines/:id/run', async (req, res) => {
    try {
      const existing = getRoutine(db, req.params.id);
      if (!existing) return res.status(404).json({ error: 'routine not found' });
      // Execution is not a local membership decision. The routine/project
      // already persists its exact Workspace billing address; start the run
      // with that address and let the authenticated Vela backend make the
      // final membership, permission, and billing decision. Re-reading the
      // daemon directory here made a transient outage either block the run or
      // tempt callers to drop Team scope and charge Personal instead.
      const start = await routineService.runNow(req.params.id);
      res.status(202).json({
        routine: routineFromDb(req.params.id),
        run: getLatestRoutineRun(db, req.params.id),
        projectId: start.projectId,
        conversationId: start.conversationId,
        agentRunId: start.agentRunId,
      });
    } catch (err: any) {
      sendRoutineError(res, err, 500);
    }
  });

  app.get('/api/routines/:id/runs', async (req, res) => {
    try {
      const existing = getRoutine(db, req.params.id);
      if (!existing) return res.status(404).json({ error: 'routine not found' });
      await authorizeRoutineRecord(req, existing);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      res.json({ runs: listRoutineRuns(db, req.params.id, limit) });
    } catch (err: any) {
      sendRoutineError(res, err, 400);
    }
  });

  app.post('/api/routines/:id/runs/:runId/crystallize', async (req, res) => {
    try {
      const routine = getRoutine(db, req.params.id);
      if (!routine) return res.status(404).json({ error: 'routine not found' });
      await authorizeRoutineRecord(req, routine);
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
      sendRoutineError(res, err, 400);
    }
  });
}
