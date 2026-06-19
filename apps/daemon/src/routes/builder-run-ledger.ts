import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import type {
  Approval,
  ApprovalResolution,
  BuilderRun,
  BuilderRunEvent,
  BuilderRunStatus,
  BuilderTriggerKind,
  HarnessProcess,
  HarnessProcessStatus,
  StartBuilderSkillRunRequest,
  StartBuilderSkillRunResponse,
} from '@open-design/contracts';
import {
  getBuilderApproval,
  getLatestRoutineRun,
  getProject,
  getRoutine,
  getRoutineRun,
  insertRoutine,
  listBuilderApprovals,
  listRoutineRuns,
  listRoutines,
  resolveBuilderApproval,
} from '../db.js';
import type { RouteDeps } from '../server-context.js';
import { findSkillById, type SkillInfo } from '../skills.js';
import { routineDbRowToContract, type RoutineRoutesService } from './routine.js';

export interface RegisterBuilderRunLedgerRoutesDeps extends RouteDeps<'db' | 'routines'> {
  resources?: {
    listAllSkillLikeEntries?: () => Promise<unknown[]>;
  };
}

type RoutineRow = ReturnType<typeof getRoutine> extends infer T ? NonNullable<T> : never;
type RoutineRunRow = ReturnType<typeof getRoutineRun> extends infer T ? NonNullable<T> : never;

const DEFAULT_LIMIT = 50;
const CANVAS_ROUTINE_NAME_PREFIX = 'Canvas skill run:';
const CANVAS_ROUTINE_SCHEDULE = {
  kind: 'daily',
  time: '09:00',
  timezone: 'UTC',
};

function iso(ms: number | null | undefined): string | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

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

function normalizeBuilderSkillRunContext(value: unknown) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('context must be an object');
  }
  const input = asRecord(value);
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

function routineSkillIds(routine: RoutineRow): string[] {
  const contract = routineDbRowToContract(routine, null);
  return uniqueIds([
    contract.skillId,
    ...((contract.context?.skillIds ?? []) as string[]),
  ]);
}

function mapRoutineRunStatus(status: string): BuilderRunStatus {
  if (status === 'succeeded') return 'completed';
  if (status === 'canceled') return 'cancelled';
  if (status === 'queued' || status === 'running' || status === 'failed') return status;
  return 'failed';
}

function processStatusForRoutine(
  routine: RoutineRow,
  latestRun: RoutineRunRow | null,
  approvals: Approval[] = [],
): HarnessProcessStatus {
  if (approvals.some((approval) => approval.status === 'requested')) {
    return 'waiting_for_approval';
  }
  if (!latestRun) return routine.enabled ? 'sleeping' : 'disabled';
  if (!routine.enabled && latestRun.trigger !== 'manual') return 'disabled';
  return mapRoutineRunStatus(latestRun.status);
}

function triggerKind(trigger: string | null | undefined): BuilderTriggerKind {
  return trigger === 'scheduled' ? 'scheduled' : 'manual';
}

function routineProcessId(routineId: string): string {
  return `routine:${routineId}`;
}

function routineIdFromProcessId(processId: string): string {
  return processId.startsWith('routine:') ? processId.slice('routine:'.length) : processId;
}

function projectRoutineRuns(db: unknown, projectId: string, limit: number): RoutineRunRow[] {
  const runs: RoutineRunRow[] = [];
  for (const routine of listRoutines(db as any)) {
    for (const run of listRoutineRuns(db as any, routine.id, limit)) {
      if (run.projectId === projectId) runs.push(run);
    }
  }
  return runs
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

function routinesForProject(db: unknown, projectId: string): RoutineRow[] {
  const runRoutineIds = new Set(projectRoutineRuns(db, projectId, 500).map((run) => run.routineId));
  return listRoutines(db as any).filter((routine) => (
    (routine.projectMode === 'reuse' && routine.projectId === projectId)
    || runRoutineIds.has(routine.id)
  ));
}

function findReusableCanvasRoutine(db: unknown, projectId: string, skillId: string): RoutineRow | null {
  return listRoutines(db as any).find((routine) => (
    routine.projectMode === 'reuse'
    && routine.projectId === projectId
    && routine.skillId === skillId
    && typeof routine.name === 'string'
    && routine.name.startsWith(CANVAS_ROUTINE_NAME_PREFIX)
  )) ?? null;
}

function approvalsForRun(db: unknown, projectId: string, runId: string): Approval[] {
  return listBuilderApprovals(db as any, { projectId, runId }) as Approval[];
}

function routineToProcessWithApprovals(
  routine: RoutineRow,
  projectId: string,
  latestRun: RoutineRunRow | null,
  routineService: RoutineRoutesService,
  approvals: Approval[],
): HarnessProcess {
  const contract = routineDbRowToContract(routine, latestRun);
  const nextRunAt = routineService?.nextRunAt(routine.id)?.toISOString() ?? null;
  const startedAt = iso(routine.createdAt);
  const lastHeartbeatAt = iso(latestRun?.completedAt ?? latestRun?.startedAt ?? routine.updatedAt);
  return {
    id: routineProcessId(routine.id),
    projectId,
    skillIds: routineSkillIds(routine),
    agentId: contract.agentId ?? 'default-agent',
    status: processStatusForRoutine(routine, latestRun, approvals),
    trigger: {
      kind: latestRun ? triggerKind(latestRun.trigger) : 'scheduled',
      source: 'routine',
      metadata: { routineId: routine.id },
    },
    autonomy: 'stage',
    schedule: {
      kind: 'routine',
      expression: JSON.stringify(contract.schedule),
      nextRunAt,
      metadata: { routineId: routine.id, routineName: routine.name },
    },
    ...(startedAt ? { startedAt } : {}),
    ...(lastHeartbeatAt ? { lastHeartbeatAt } : {}),
    nextRunAt,
    runId: latestRun?.id,
    enabled: routine.enabled,
    failureCount: latestRun?.status === 'failed' ? 1 : 0,
    metadata: {
      source: 'routine',
      routineId: routine.id,
      routineName: routine.name,
      target: contract.target,
    },
  };
}

function runStatusWithApprovals(run: RoutineRunRow, approvals: Approval[]): BuilderRunStatus {
  if (approvals.some((approval) => approval.status === 'requested')) {
    return 'waiting_for_approval';
  }
  return mapRoutineRunStatus(run.status);
}

function routineRunToBuilderRun(
  routine: RoutineRow,
  run: RoutineRunRow,
  approvals: Approval[] = [],
): BuilderRun {
  return {
    id: run.id,
    projectId: run.projectId,
    processId: routineProcessId(routine.id),
    skillIds: routineSkillIds(routine),
    agentId: routine.agentId ?? 'default-agent',
    status: runStatusWithApprovals(run, approvals),
    origin: triggerKind(run.trigger),
    autonomy: 'stage',
    prompt: routine.prompt,
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: iso(run.completedAt) ?? null,
    lastEventId: `event:${run.id}:terminal`,
    approvalIds: approvals.map((approval) => approval.id),
    outputEntityIds: [],
    error: run.error
      ? {
          code: run.errorCode ?? 'ROUTINE_RUN_FAILED',
          message: run.error,
          recoverable: true,
        }
      : null,
    metadata: {
      source: 'routine_run',
      routineId: routine.id,
      routineName: routine.name,
      conversationId: run.conversationId,
      agentRunId: run.agentRunId,
      summary: run.summary,
    },
  };
}

function approvalEvents(
  approvals: Approval[],
  base: { runId: string; projectId: string; timestamp: string },
  startSequence: number,
): BuilderRunEvent[] {
  let sequence = startSequence;
  const events: BuilderRunEvent[] = [];
  const orderedApprovals = [...approvals].sort((a, b) =>
    a.requestedAt.localeCompare(b.requestedAt),
  );
  for (const approval of orderedApprovals) {
    events.push({
      ...base,
      id: `event:${base.runId}:approval:${approval.id}:requested`,
      type: 'approval.requested',
      sequence: sequence++,
      source: 'builder',
      timestamp: approval.requestedAt,
      approvalId: approval.id,
      approvalKind: approval.kind,
      title: approval.title,
    });
    if (approval.status !== 'requested' && approval.resolvedAt) {
      events.push({
        ...base,
        id: `event:${base.runId}:approval:${approval.id}:resolved`,
        type: 'approval.resolved',
        sequence: sequence++,
        source: 'builder',
        timestamp: approval.resolvedAt,
        approvalId: approval.id,
        resolution: approval.status as ApprovalResolution,
        ...(approval.resolvedBy ? { resolvedBy: approval.resolvedBy } : {}),
      });
    }
  }
  return events;
}

function routineRunEvents(
  routine: RoutineRow,
  run: RoutineRunRow,
  approvals: Approval[] = [],
): BuilderRunEvent[] {
  const skillIds = routineSkillIds(routine);
  const base = {
    runId: run.id,
    projectId: run.projectId,
    timestamp: new Date(run.startedAt).toISOString(),
  };
  let sequence = 1;
  const events: BuilderRunEvent[] = [
    {
      ...base,
      id: `event:${run.id}:process-started`,
      type: 'process.started',
      sequence: sequence++,
      source: 'builder',
      processId: routineProcessId(routine.id),
      skillIds,
      autonomy: 'stage',
    },
  ];
  for (const skillId of skillIds) {
    events.push({
      ...base,
      id: `event:${run.id}:skill:${skillId}`,
      type: 'skill.loaded',
      sequence: sequence++,
      source: 'harness',
      skillId,
      version: 'unknown',
    });
  }
  events.push({
    ...base,
    id: `event:${run.id}:workflow-started`,
    type: 'workflow.started',
    sequence: sequence++,
    source: 'harness',
    workflowId: routine.id,
  });
  events.push(...approvalEvents(approvals, base, sequence));
  sequence = events.length + 1;
  if (approvals.some((approval) => approval.status === 'requested')) {
    events.push({
      ...base,
      id: `event:${run.id}:waiting-for-approval`,
      type: 'process.heartbeat',
      sequence: sequence++,
      source: 'builder',
      timestamp: approvals
        .filter((approval) => approval.status === 'requested')
        .map((approval) => approval.requestedAt)
        .sort()
        .at(-1) ?? base.timestamp,
      processId: routineProcessId(routine.id),
      status: 'waiting_for_approval',
      summary: 'Waiting for approval.',
    });
  } else if (run.status === 'running' || run.status === 'queued') {
    events.push({
      ...base,
      id: `event:${run.id}:heartbeat`,
      type: 'process.heartbeat',
      sequence: sequence++,
      source: 'builder',
      processId: routineProcessId(routine.id),
      status: mapRoutineRunStatus(run.status),
      summary: run.summary ?? undefined,
    });
  } else if (run.status === 'failed') {
    events.push({
      ...base,
      id: `event:${run.id}:terminal`,
      type: 'process.failed',
      sequence: sequence++,
      source: 'builder',
      timestamp: iso(run.completedAt) ?? base.timestamp,
      processId: routineProcessId(routine.id),
      error: {
        code: run.errorCode ?? 'ROUTINE_RUN_FAILED',
        message: run.error ?? 'Routine run failed.',
        recoverable: true,
      },
    });
  } else {
    events.push({
      ...base,
      id: `event:${run.id}:terminal`,
      type: 'process.completed',
      sequence: sequence++,
      source: 'builder',
      timestamp: iso(run.completedAt) ?? base.timestamp,
      processId: routineProcessId(routine.id),
      summary: run.summary ?? undefined,
    });
  }
  return events;
}

const APPROVAL_RESOLUTIONS = new Set(['approved', 'rejected', 'cancelled', 'expired']);

function parseApprovalResolution(value: unknown): ApprovalResolution | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return APPROVAL_RESOLUTIONS.has(normalized) ? normalized as ApprovalResolution : null;
}

function approvalBelongsToProject(approval: Approval | null, projectId: string): approval is Approval {
  return Boolean(approval && approval.projectId === projectId);
}

function approvalBelongsToRun(approval: Approval | null, projectId: string, runId: string): approval is Approval {
  return approvalBelongsToProject(approval, projectId) && approval.runId === runId;
}

function limitFromQuery(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : DEFAULT_LIMIT;
  return Math.min(100, Math.max(1, Number.isFinite(n) ? n : DEFAULT_LIMIT));
}

function sendMissingProject(res: { status: (code: number) => { json: (body: unknown) => void } }) {
  res.status(404).json({ error: 'project not found' });
}

export function registerBuilderRunLedgerRoutes(
  app: Express,
  ctx: RegisterBuilderRunLedgerRoutesDeps,
) {
  const { db } = ctx;
  const { routineService } = ctx.routines;

  app.get('/api/projects/:projectId/builder/processes', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const processes = routinesForProject(db, req.params.projectId).map((routine) => {
      const latest = listRoutineRuns(db, routine.id, 100)
        .find((run) => run.projectId === req.params.projectId) ?? null;
      const approvals = latest ? approvalsForRun(db, req.params.projectId, latest.id) : [];
      return routineToProcessWithApprovals(routine, req.params.projectId, latest, routineService, approvals);
    });
    res.json({ processes });
  });

  app.post('/api/projects/:projectId/builder/skill-runs', async (req, res) => {
    try {
      if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
      const body = asRecord(req.body) as unknown as StartBuilderSkillRunRequest;
      const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : '';
      if (!skillId) return res.status(400).json({ error: 'skillId is required' });
      const context = normalizeBuilderSkillRunContext(body.context);
      let skill: SkillInfo | null = null;
      if (ctx.resources?.listAllSkillLikeEntries) {
        const registry = await ctx.resources.listAllSkillLikeEntries();
        skill = findSkillById(registry, skillId) ?? null;
        const referencedSkillIds = uniqueIds([skillId, ...(context.skillIds ?? [])]);
        const missing = referencedSkillIds.filter((id) => !findSkillById(registry, id));
        if (missing.length > 0) {
          return res.status(400).json({ error: `unknown skill id${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}` });
        }
      }

      let routineCreated = false;
      let routine: RoutineRow | null = null;
      const requestedRoutineId = typeof body.routineId === 'string' ? body.routineId.trim() : '';
      if (requestedRoutineId) {
        routine = getRoutine(db, requestedRoutineId);
        if (!routine) return res.status(404).json({ error: 'routine not found' });
        if (routine.projectMode !== 'reuse' || routine.projectId !== req.params.projectId) {
          return res.status(400).json({ error: 'routine is not scoped to the requested project' });
        }
        if (routine.skillId !== skillId) {
          return res.status(400).json({ error: 'routine skillId does not match requested skillId' });
        }
      } else {
        routine = findReusableCanvasRoutine(db, req.params.projectId, skillId);
        if (!routine) {
          const now = Date.now();
          const defaultPrompt = `Run the "${skill?.name ?? skillId}" skill for this project from the canvas.`;
          routine = insertRoutine(db, {
            id: `routine-${randomUUID()}`,
            name: `${CANVAS_ROUTINE_NAME_PREFIX} ${skill?.name ?? skillId}`,
            prompt: typeof body.prompt === 'string' && body.prompt.trim()
              ? body.prompt
              : defaultPrompt,
            scheduleKind: CANVAS_ROUTINE_SCHEDULE.kind,
            scheduleValue: CANVAS_ROUTINE_SCHEDULE.time,
            scheduleJson: JSON.stringify(CANVAS_ROUTINE_SCHEDULE),
            projectMode: 'reuse',
            projectId: req.params.projectId,
            skillId,
            agentId: typeof body.agentId === 'string' && body.agentId.trim()
              ? body.agentId.trim()
              : null,
            contextJson: JSON.stringify(context),
            enabled: false,
            createdAt: now,
            updatedAt: now,
          });
          routineCreated = true;
        }
      }
      if (!routine) return res.status(500).json({ error: 'routine could not be prepared' });

      const start = await routineService.runNow(routine.id);
      const latest = getLatestRoutineRun(db, routine.id);
      if (!latest || latest.projectId !== req.params.projectId) {
        return res.status(500).json({ error: 'routine run was not projected into the requested project' });
      }
      const approvals = approvalsForRun(db, req.params.projectId, latest.id);
      const response: StartBuilderSkillRunResponse = {
        routineId: routine.id,
        routineCreated,
        process: routineToProcessWithApprovals(routine, req.params.projectId, latest, routineService, approvals),
        run: routineRunToBuilderRun(routine, latest, approvals),
        projectId: start.projectId,
        conversationId: start.conversationId,
        agentRunId: start.agentRunId,
      };
      res.status(202).json(response);
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.get('/api/projects/:projectId/builder/processes/:processId', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const routine = getRoutine(db, routineIdFromProcessId(req.params.processId));
    if (!routine) return res.status(404).json({ error: 'process not found' });
    const latest = listRoutineRuns(db, routine.id, 100)
      .find((run) => run.projectId === req.params.projectId) ?? null;
    if (routine.projectId !== req.params.projectId && !latest) {
      return res.status(404).json({ error: 'process not found' });
    }
    const approvals = latest ? approvalsForRun(db, req.params.projectId, latest.id) : [];
    res.json({
      process: routineToProcessWithApprovals(routine, req.params.projectId, latest, routineService, approvals),
    });
  });

  app.get('/api/projects/:projectId/builder/runs', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const runs = projectRoutineRuns(db, req.params.projectId, limitFromQuery(req.query.limit))
      .map((run) => {
        const routine = getRoutine(db, run.routineId);
        const approvals = approvalsForRun(db, req.params.projectId, run.id);
        return routine ? routineRunToBuilderRun(routine, run, approvals) : null;
      })
      .filter(Boolean);
    res.json({ runs });
  });

  app.get('/api/projects/:projectId/builder/runs/:runId', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const run = getRoutineRun(db, req.params.runId);
    const routine = run ? getRoutine(db, run.routineId) : null;
    if (!run || !routine || run.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'run not found' });
    }
    const approvals = approvalsForRun(db, req.params.projectId, run.id);
    res.json({ run: routineRunToBuilderRun(routine, run, approvals) });
  });

  app.get('/api/projects/:projectId/builder/runs/:runId/events', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const run = getRoutineRun(db, req.params.runId);
    const routine = run ? getRoutine(db, run.routineId) : null;
    if (!run || !routine || run.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'run not found' });
    }
    const approvals = approvalsForRun(db, req.params.projectId, run.id);
    res.json({ events: routineRunEvents(routine, run, approvals) });
  });

  app.get('/api/projects/:projectId/builder/runs/:runId/approvals', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const run = getRoutineRun(db, req.params.runId);
    if (!run || run.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'run not found' });
    }
    res.json({ approvals: approvalsForRun(db, req.params.projectId, req.params.runId) });
  });

  app.get('/api/projects/:projectId/builder/approvals', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const runId = typeof req.query.runId === 'string' ? req.query.runId : null;
    res.json({ approvals: listBuilderApprovals(db, { projectId: req.params.projectId, runId }) });
  });

  app.get('/api/projects/:projectId/builder/approvals/:approvalId', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const approval = getBuilderApproval(db, req.params.approvalId) as Approval | null;
    if (!approvalBelongsToProject(approval, req.params.projectId)) {
      return res.status(404).json({ error: 'approval not found' });
    }
    res.json({ approval });
  });

  app.get('/api/projects/:projectId/builder/runs/:runId/approvals/:approvalId', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const approval = getBuilderApproval(db, req.params.approvalId) as Approval | null;
    if (!approvalBelongsToRun(approval, req.params.projectId, req.params.runId)) {
      return res.status(404).json({ error: 'approval not found' });
    }
    res.json({ approval });
  });

  app.post('/api/projects/:projectId/builder/approvals/:approvalId/resolve', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const approval = getBuilderApproval(db, req.params.approvalId) as Approval | null;
    if (!approvalBelongsToProject(approval, req.params.projectId)) {
      return res.status(404).json({ error: 'approval not found' });
    }
    if (approval.status !== 'requested') {
      return res.status(409).json({ error: 'approval already resolved' });
    }
    const resolution = parseApprovalResolution(req.body?.resolution);
    if (!resolution || resolution === 'cancelled' || resolution === 'expired') {
      return res.status(400).json({ error: 'resolution must be approved or rejected' });
    }
    const resolved = resolveBuilderApproval(db, req.params.approvalId, {
      resolution,
      resolvedBy: typeof req.body?.resolvedBy === 'string' ? req.body.resolvedBy : null,
    });
    res.json({ approval: resolved });
  });

  app.post('/api/projects/:projectId/builder/approvals/:approvalId/approve', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const approval = getBuilderApproval(db, req.params.approvalId) as Approval | null;
    if (!approvalBelongsToProject(approval, req.params.projectId)) {
      return res.status(404).json({ error: 'approval not found' });
    }
    if (approval.status !== 'requested') {
      return res.status(409).json({ error: 'approval already resolved' });
    }
    const resolved = resolveBuilderApproval(db, req.params.approvalId, {
      resolution: 'approved',
      resolvedBy: typeof req.body?.resolvedBy === 'string' ? req.body.resolvedBy : null,
    });
    res.json({ approval: resolved });
  });

  app.post('/api/projects/:projectId/builder/approvals/:approvalId/reject', (req, res) => {
    if (!getProject(db, req.params.projectId)) return sendMissingProject(res);
    const approval = getBuilderApproval(db, req.params.approvalId) as Approval | null;
    if (!approvalBelongsToProject(approval, req.params.projectId)) {
      return res.status(404).json({ error: 'approval not found' });
    }
    if (approval.status !== 'requested') {
      return res.status(409).json({ error: 'approval already resolved' });
    }
    const resolved = resolveBuilderApproval(db, req.params.approvalId, {
      resolution: 'rejected',
      resolvedBy: typeof req.body?.resolvedBy === 'string' ? req.body.resolvedBy : null,
    });
    res.json({ approval: resolved });
  });
}
