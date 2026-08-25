// Run creation is a billing-address boundary, not a local project-file
// mutation gate. The persisted `workspace_projects` row supplies the exact
// Team or Personal Workspace id to Vela/AMR. Headerless local callers remain
// valid for Personal-bound, unbound, and scratch projects; a shared Team
// project requires the explicit project-owner identity because starting a run
// mutates its files and conversation state. Membership, balance, and
// subscription eligibility remain backend decisions.

import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  ensureWorkspaceProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  getProject,
  insertProject,
  openDatabase,
} from '../src/db.js';
import {
  createSnapshot,
  linkSnapshotToProject,
} from '../src/plugins/snapshots.js';
import { createAuthorizeProjectRequest } from '../src/collab/project-request-authority.js';
import { resolveOptionalLocalWorkspaceRequestAuthority } from '../src/collab/workspace-resource-mutation.js';
import { createEnforceWorkspaceProjectMutation } from '../src/routes/project/index.js';
import { workspaceContextFromDirectoryItem } from '../src/collab/vela-workspace-context.js';
import { registerRunRoutes } from '../src/routes/runs.js';
import { connectorService } from '../src/connectors/service.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import {
  finalizeStrategyPlanningTurn,
  prepareStrategyRequest,
} from '../src/strategies/od-next/coordinator.js';
import { OdNextMachineProtocolStream } from '../src/strategies/od-next/protocol.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
} from '../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from './strategies/strategy-task-test-fixtures.js';

let server: http.Server | null = null;
let tempDir: string | null = null;
let createdRunCount = 0;
let lastCreatedRun: any = null;
let strategyTaskAtPhysicalCancel: any = null;
let runsServiceStub: ReturnType<typeof createRunsServiceStub> | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  closeDatabase();
  runsServiceStub = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

const TEAM_PROJECT = 'p-team-run';
const PERSONAL_PROJECT = 'p-personal-run';
const UNBOUND_PROJECT = 'p-unbound-run';
const WORKSPACE_ID = 'ws-run-gate';
const OWNER_MEMBER_ID = 'member-owner-run';

function sendApiError(
  res: any,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: { code, message, ...details } });
}

function workspaceHeaders(memberId: string, role: 'owner' | 'admin' | 'member') {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-member-id': memberId,
    'x-od-workspace-role': role,
  };
}

function seedPluginSnapshot(projectId: string) {
  const db = openDatabase(tempDir!);
  const snapshot = createSnapshot(db, {
    projectId,
    pluginId: 'scope-test-plugin',
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'scope-test-digest',
    taskKind: 'new-generation',
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: [],
    capabilitiesRequired: [],
    assetsStaged: [],
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
  });
  linkSnapshotToProject(db, snapshot.snapshotId, projectId);
  return snapshot;
}

function snapshotProjectId(snapshotId: string): string | null {
  const row = openDatabase(tempDir!)
    .prepare('SELECT project_id AS projectId FROM applied_plugin_snapshots WHERE id = ?')
    .get(snapshotId) as { projectId?: string | null } | undefined;
  return typeof row?.projectId === 'string' ? row.projectId : null;
}

function seedAwaitingClarificationTask() {
  const db = openDatabase(tempDir!);
  const now = Date.now();
  db.prepare(
    `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('conversation-strategy', PERSONAL_PROJECT, 'Strategy', now, now);
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
  ];
  const snapshot = createSnapshot(db, {
    projectId: PERSONAL_PROJECT,
    conversationId: 'conversation-strategy',
    runId: null,
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: 'strategy-manifest',
    strategy: {
      schema: 'open-design.applied-strategy/v2',
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: strategyPackageHashFromDigests(assetDigests),
      assetDigests,
      selectedTaskProfile: {
        taskType: 'prototype',
        version: '2.0.0',
        path: './assets/task-profiles/prototype.md',
        sha256: 'b'.repeat(64),
      },
      taskProfileVersions: ['2.0.0'],
      promptRecipe: 'od-next-plan-build-v2',
    },
    taskKind: 'new-generation',
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
  });
  runsServiceStub?.seed({
    id: 'run-strategy-request',
    projectId: PERSONAL_PROJECT,
    conversationId: 'conversation-strategy',
    assistantMessageId: 'assistant-strategy-request',
    agentId: 'codex',
    pluginId: 'od-next-strategy',
    appliedPluginSnapshotId: snapshot.snapshotId,
    odNextTaskInputSnapshot: {
      taskExecutionId: 'task-strategy-clarification',
      snapshotDir: path.join(tempDir!, 'strategy-input-fixture'),
      manifestSha256: 'd'.repeat(64),
    },
    status: 'succeeded',
  });
  createStrategyTaskExecution(db, {
    taskExecutionId: 'task-strategy-clarification',
    projectId: PERSONAL_PROJECT,
    conversationId: 'conversation-strategy',
    snapshotId: snapshot.snapshotId,
    selectedAgentId: 'codex',
    initialRunId: 'run-strategy-request',
    ...strategyTaskCreateIdentityFixture(),
    createdAt: now,
  });
  prepareStrategyRequest(db, {
    taskExecutionId: 'task-strategy-clarification',
    preference: 'full_plan',
    directEdit: {
      editableBaselineExists: false,
      localAndUnambiguous: false,
      canonicalDeliverableStable: false,
      deliverableSetStable: false,
      dependenciesBounded: false,
    },
    intake: {
      inputRefs: [{ id: 'request', accessible: true }],
      selectedAgentAvailable: true,
      nativeContinuation: 'verified',
      taskProfileAvailable: true,
      dependencies: [],
    },
  });
  const protocol = new OdNextMachineProtocolStream();
  protocol.push([
    '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>',
    '<open-design-runtime-state>',
    JSON.stringify({
      schema: 'open-design.strategy-state/v2',
      route: 'full_plan',
      inputStage: 'request',
      outcome: 'clarification_required',
      executionMode: null,
      reasonCodes: [],
    }),
    '</open-design-runtime-state>',
  ].join('\n'));
  finalizeStrategyPlanningTurn(db, {
    taskExecutionId: 'task-strategy-clarification',
    runId: 'run-strategy-request',
    protocol,
  });
  return snapshot;
}

// A minimal in-memory ChatRunService stub. It deliberately does not spawn a
// process, but it does preserve enough run state to exercise the complete
// create -> status/events -> cancel HTTP lifecycle.
function createRunsServiceStub() {
  const runs = new Map<string, any>();
  let seq = 0;
  const service = {
    seed(input: Record<string, unknown>) {
      const run: Record<string, any> = {
        clientRequestId: null,
        requestFingerprint: null,
        workspaceScope: null,
        message: null,
        currentPrompt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        clients: new Set(),
        ...input,
      };
      runs.set(String(run.id), run);
      return run;
    },
    create(meta: any) {
      createdRunCount += 1;
      const run = {
        id: `run-${++seq}`,
        projectId: typeof meta.projectId === 'string' ? meta.projectId : null,
        // Deliberately left unset: with no conversationId, the handler's
        // post-response `detectSkillPluginCandidateOnRunSuccess` branch
        // (gated on `run.projectId && run.conversationId`) never fires, so
        // this stub does not need a real on-disk project directory.
        conversationId: typeof meta.conversationId === 'string' ? meta.conversationId : null,
        assistantMessageId: typeof meta.assistantMessageId === 'string' ? meta.assistantMessageId : null,
        agentId: typeof meta.agentId === 'string' ? meta.agentId : null,
        message: meta.message,
        currentPrompt: meta.currentPrompt,
        appliedPluginSnapshotId: meta.appliedPluginSnapshotId,
        clientRequestId: meta.clientRequestId,
        requestFingerprint: meta.requestFingerprint,
        workspaceScope: meta.workspaceScope,
        odNextTaskInputSnapshot: meta.odNextTaskInputSnapshot ?? null,
        status: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        clients: new Set(),
      };
      runs.set(run.id, run);
      lastCreatedRun = run;
      return run;
    },
    createOrReuse(meta: any) {
      const existing = typeof meta.clientRequestId === 'string'
        ? Array.from(runs.values()).find(
            (candidate) => candidate.clientRequestId === meta.clientRequestId,
          )
        : null;
      if (existing) {
        if (
          typeof existing.requestFingerprint === 'string'
          && typeof meta.requestFingerprint === 'string'
          && existing.requestFingerprint !== meta.requestFingerprint
        ) {
          return { kind: 'conflict' as const, run: existing };
        }
        return { kind: 'reused' as const, run: existing };
      }
      return { kind: 'created' as const, run: service.create(meta) };
    },
    get: (id: string) => runs.get(id) ?? null,
    list: (filters: { projectId?: unknown } = {}) =>
      Array.from(runs.values()).filter(
        (run) =>
          typeof filters.projectId !== 'string'
          || run.projectId === filters.projectId,
      ),
    statusBody: (run: any) => ({ ...run }),
    stream: (run: any, req: any, res: any) => {
      res.status(req.method === 'GET' ? 200 : 202).json({
        runId: run.id,
        ...(run.strategyTask
          ? {
              taskExecutionId: run.strategyTask.taskExecutionId,
              strategyTask: run.strategyTask,
            }
          : {}),
      });
    },
    // Intentionally does NOT invoke `starter` — this test only asserts on the
    // HTTP response to POST /api/runs, not on real agent-process spawning.
    start: (run: any) => run,
    fail: (run: any, code: string, message: string) => {
      run.status = 'failed';
      run.errorCode = code;
      run.error = message;
    },
    wait: async () => ({ status: 'succeeded' }),
    cancel: async (run: any) => {
      strategyTaskAtPhysicalCancel = run.strategyTask ?? null;
      run.status = 'canceled';
      run.updatedAt = Date.now();
      return { ...run };
    },
    isTerminal: (status: string) => status === 'succeeded' || status === 'failed' || status === 'canceled',
  };
  return service;
}

async function startServer(opts?: {
  /**
   * Legacy mutation-gate seam retained by RegisterRunRoutes for compatibility.
   * Run creation deliberately ignores its membership verdict: only the
   * persisted binding and an optional explicit Workspace mismatch matter.
   */
  enforceWorkspaceProjectMutation?: (
    req: any,
    res: any,
    sendError: any,
    getWp: any,
    getWpByProjectId: any,
    dbArg: any,
    projectId: string,
    capability: any,
  ) => Promise<boolean>;
  isAmrSignedIn?: () => boolean | Promise<boolean>;
  verifyWorkspaceRequestAuthority?: (req: any) => Promise<any>;
  authorizePluginRequest?: (req: any, res: any, pluginId: string) => Promise<boolean>;
  authorizePluginWithWorkspaceAuthority?: boolean;
  seedImplicitScenarioPlugin?: boolean;
  teamProjectResourceState?: 'active' | 'deleted';
  loadPluginRegistryView?: () => Promise<any>;
}) {
  createdRunCount = 0;
  lastCreatedRun = null;
  strategyTaskAtPhysicalCancel = null;
  runsServiceStub = null;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-ws-gate-'));
  const db = openDatabase(tempDir);
  const now = Date.now();
  for (const id of [TEAM_PROJECT, PERSONAL_PROJECT, UNBOUND_PROJECT]) {
    insertProject(db, {
      id,
      name: id,
      createdAt: now,
      updatedAt: now,
      ...(id === PERSONAL_PROJECT && opts?.seedImplicitScenarioPlugin
        ? { metadata: { kind: 'prototype' } }
        : {}),
    });
  }
  if (opts?.seedImplicitScenarioPlugin) {
    upsertInstalledPlugin(db, {
      id: 'example-web-prototype',
      title: 'Bundled prototype scenario',
      version: '1.0.0',
      sourceKind: 'bundled',
      source: '/bundled/example-web-prototype',
      trust: 'bundled',
      capabilitiesGranted: [],
      manifest: {
        name: 'example-web-prototype',
        title: 'Bundled prototype scenario',
        version: '1.0.0',
      } as any,
      fsPath: '/bundled/example-web-prototype',
      installedAt: now,
      updatedAt: now,
    });
  }
  ensureWorkspaceProject(db, {
    projectId: TEAM_PROJECT,
    workspaceId: WORKSPACE_ID,
    visibility: 'team',
    resourceState: opts?.teamProjectResourceState ?? 'active',
    createdByWorkspaceMemberId: OWNER_MEMBER_ID,
  });
  ensureWorkspaceProject(db, {
    projectId: PERSONAL_PROJECT,
    workspaceId: WORKSPACE_ID,
    visibility: 'personal',
    createdByWorkspaceMemberId: OWNER_MEMBER_ID,
  });
  // UNBOUND_PROJECT deliberately gets no `workspace_projects` row — the
  // "legacy / never claimed" control case the gate must leave alone
  // (personal / solo usage with no workspace at all).

  const verifyWorkspaceRequestAuthority =
    opts?.verifyWorkspaceRequestAuthority ??
    (async (req: any) => {
      const workspaceId = req.get('x-od-workspace-id');
      const memberId = req.get('x-od-workspace-member-id');
      if (!workspaceId || !memberId) {
        return {
          ok: false,
          status: 400,
          code: 'WORKSPACE_CONTEXT_REQUIRED',
          message: 'an explicit workspace context is required',
        };
      }
      return {
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId,
          workspaceName: workspaceId,
          workspaceType: 'team',
          workspaceMemberId: memberId,
          role: memberId === OWNER_MEMBER_ID ? 'owner' : 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      };
    });

  const app = express();
  app.use(express.json());
  runsServiceStub = createRunsServiceStub();
  registerRunRoutes(app, {
    db,
    design: {
      runs: runsServiceStub,
      analytics: { capture: () => {} },
      getAppVersion: () => 'test',
    },
    http: {
      createSseResponse: () => ({ send() {}, end() {}, cleanup() {} }),
      sendApiError,
    },
    paths: { PROJECTS_DIR: tempDir, RUNTIME_DATA_DIR: tempDir },
    agents: {
      detectAgents: async () => [],
      getAgentDef: () => null,
    },
    chat: { startChatRun: async () => undefined },
    byokCredentials: { has: async (profileId: string) => profileId === 'test-profile' },
    lifecycle: { isDaemonShuttingDown: () => false },
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess: () => {},
      firePipelineForRun: () => {},
      loadPluginRegistryView: opts?.loadPluginRegistryView ?? (async () => ({} as any)),
      renderPluginBriefTemplate: (template: string) => template,
      authorizePluginRequest: opts?.authorizePluginRequest ?? (
        opts?.authorizePluginWithWorkspaceAuthority
          ? async (req: any, res: any) => {
              const authority = resolveOptionalLocalWorkspaceRequestAuthority(req);
              if (!authority.ok) {
                sendApiError(
                  res,
                  authority.status,
                  authority.code,
                  authority.message,
                );
                return false;
              }
              return true;
            }
          : undefined
      ),
    },
    telemetry: {
      reportRunCompletionTelemetryFallback: () => {},
      resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined },
      runRetryEventsForAnalytics: () => [],
    },
    messages: {
      pinAssistantMessageOnRunCreate: (_db: any, _run: any, options?: any) => {
        options?.beforeClaimCommit?.();
        return { ok: true };
      },
      reconcileAssistantMessageOnRunEnd: () => {},
    },
    enforceWorkspaceProjectMutation:
      opts?.enforceWorkspaceProjectMutation ??
      createEnforceWorkspaceProjectMutation(async (req: any) => {
        const workspaceId = req.get('x-od-workspace-id');
        const memberId = req.get('x-od-workspace-member-id');
        if (!workspaceId || !memberId) {
          return {
            ok: false,
            status: 400,
            code: 'WORKSPACE_CONTEXT_REQUIRED',
            message: 'an explicit workspace context is required',
          };
        }
        return {
          ok: true,
          context: workspaceContextFromDirectoryItem({
            workspaceId,
            workspaceName: workspaceId,
            workspaceType: 'team',
            workspaceMemberId: memberId,
            role: memberId === OWNER_MEMBER_ID ? 'owner' : 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          }),
        };
      }),
    amrWorkspaceScope: {
      isSignedIn: opts?.isAmrSignedIn ?? (() => false),
    },
    authorizeProjectRequest: createAuthorizeProjectRequest({
      db,
      getWorkspaceProject: (dbArg: unknown, workspaceId: string, projectId: string) =>
        getWorkspaceProject(
          dbArg as ReturnType<typeof openDatabase>,
          workspaceId,
          projectId,
        ),
      getWorkspaceProjectByProjectId: (dbArg: unknown, projectId: string) =>
        getWorkspaceProjectByProjectId(
          dbArg as ReturnType<typeof openDatabase>,
          projectId,
        ),
      verifyWorkspaceRequestAuthority,
      sendApiError,
    }),
    projectStore: {
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      ensureWorkspaceProject: (dbArg: any, input: any) =>
        ensureWorkspaceProject(dbArg, input),
    },
  } as any);
  const created = http.createServer(app);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, resolve));
  const address = created.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('POST /api/runs — workspace mutation gate', () => {
  it.each(['/api/runs', '/api/chat'])(
    'atomically binds an explicit clarification handle through %s',
    async (route) => {
    const baseUrl = await startServer();
    const snapshot = seedAwaitingClarificationTask();
    expect(runsServiceStub?.get('run-strategy-request')).toMatchObject({
      projectId: PERSONAL_PROJECT,
      conversationId: 'conversation-strategy',
      agentId: 'codex',
      appliedPluginSnapshotId: snapshot.snapshotId,
      status: 'succeeded',
    });
    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskExecutionId: 'task-strategy-clarification',
        projectId: PERSONAL_PROJECT,
        conversationId: 'conversation-strategy',
        agentId: 'codex',
        userMessageId: 'user-strategy-answer',
        assistantMessageId: 'assistant-strategy-answer',
        clientRequestId: 'client-strategy-answer',
        message: 'Desktop workspace',
        currentPrompt: 'Desktop workspace',
      }),
    });
    const responseText = await response.text();
    expect(response.status, responseText).toBe(202);
    const body = JSON.parse(responseText) as any;
    expect(body.strategyTask).toMatchObject({
      taskExecutionId: 'task-strategy-clarification',
      inputStage: 'clarification',
      outcome: 'running',
      activeRunId: body.runId,
    });
    expect(body.taskExecutionId).toBe('task-strategy-clarification');
    expect(lastCreatedRun).toMatchObject({
      id: body.runId,
      agentId: 'codex',
      appliedPluginSnapshotId: snapshot.snapshotId,
    });
    expect(lastCreatedRun.currentPrompt).toContain(
      'OD Next native continuation — clarification',
    );
    const task = getStrategyTaskExecution(
      openDatabase(tempDir!),
      'task-strategy-clarification',
    );
    expect(task?.runs.map(({ finalText: _finalText, ...run }) => run)).toEqual([
      { runId: 'run-strategy-request', inputStage: 'request', taskRunIndex: 0 },
      {
        runId: body.runId,
        inputStage: 'clarification',
        taskRunIndex: 1,
        sourceRunId: 'run-strategy-request',
      },
    ]);

    const repeatedResponse = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskExecutionId: 'task-strategy-clarification',
        projectId: PERSONAL_PROJECT,
        conversationId: 'conversation-strategy',
        agentId: 'codex',
        userMessageId: 'user-strategy-answer',
        assistantMessageId: 'assistant-strategy-answer',
        clientRequestId: 'client-strategy-answer',
        message: 'Desktop workspace',
        currentPrompt: 'Desktop workspace',
      }),
    });
    expect(repeatedResponse.status).toBe(202);
    await expect(repeatedResponse.json()).resolves.toMatchObject({
      runId: body.runId,
      ...(route === '/api/runs' ? { reused: true } : {}),
      strategyTask: {
        taskExecutionId: 'task-strategy-clarification',
        inputStage: 'clarification',
        activeRunId: body.runId,
      },
    });
    expect(getStrategyTaskExecution(
      openDatabase(tempDir!),
      'task-strategy-clarification',
    )?.runs).toHaveLength(2);

    const cancelResponse = await fetch(
      `${baseUrl}/api/runs/${encodeURIComponent(body.runId)}/cancel`,
      { method: 'POST' },
    );
    expect(cancelResponse.status).toBe(200);
    expect(strategyTaskAtPhysicalCancel).toMatchObject({
      taskExecutionId: 'task-strategy-clarification',
      outcome: 'canceled',
      terminal: true,
    });
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'keeps a handle-less follow-up ordinary through %s',
    async (route) => {
      const baseUrl = await startServer();
      seedAwaitingClarificationTask();
      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: PERSONAL_PROJECT,
          conversationId: 'conversation-strategy',
          agentId: 'codex',
          assistantMessageId: `assistant-ordinary-${route.length}`,
          clientRequestId: `client-ordinary-${route.length}`,
          message: 'This is a separate ordinary follow-up',
          currentPrompt: 'This is a separate ordinary follow-up',
        }),
      });
      expect(response.status).toBe(202);
      const body = await response.json() as any;
      expect(body.strategyTask).toBeUndefined();
      expect(body.taskExecutionId).toBeUndefined();
      expect(lastCreatedRun).toMatchObject({
        message: 'This is a separate ordinary follow-up',
        currentPrompt: 'This is a separate ordinary follow-up',
      });
      expect(getStrategyTaskExecution(
        openDatabase(tempDir!),
        'task-strategy-clarification',
      )).toMatchObject({
        inputStage: 'request',
        outcome: 'clarification_required',
        latestRunId: 'run-strategy-request',
      });
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'fails closed for an unknown explicit clarification handle through %s',
    async (route) => {
      const baseUrl = await startServer();
      seedAwaitingClarificationTask();
      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taskExecutionId: 'task-does-not-exist',
          projectId: PERSONAL_PROJECT,
          conversationId: 'conversation-strategy',
          agentId: 'codex',
          assistantMessageId: `assistant-wrong-${route.length}`,
          clientRequestId: `client-wrong-${route.length}`,
          message: 'Wrong handle',
        }),
      });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'STRATEGY_TASK_NOT_FOUND' },
      });
      expect(createdRunCount).toBe(0);
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'rejects locked agent drift for an explicit clarification handle through %s',
    async (route) => {
      const baseUrl = await startServer();
      seedAwaitingClarificationTask();
      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taskExecutionId: 'task-strategy-clarification',
          projectId: PERSONAL_PROJECT,
          conversationId: 'conversation-strategy',
          agentId: 'claude',
          assistantMessageId: `assistant-drift-${route.length}`,
          clientRequestId: `client-drift-${route.length}`,
          message: 'Wrong agent',
        }),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'STRATEGY_TASK_AGENT_MISMATCH' },
      });
      expect(createdRunCount).toBe(0);
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'keeps project and local plugin gates off the remote Workspace directory through %s',
    async (route) => {
      const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Team',
          workspaceType: 'team',
          workspaceMemberId: OWNER_MEMBER_ID,
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      }));
      const baseUrl = await startServer({
        verifyWorkspaceRequestAuthority,
        authorizePluginWithWorkspaceAuthority: true,
        seedImplicitScenarioPlugin: true,
      });

      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          pluginId: 'example-web-prototype',
          message: 'authorize once',
        }),
      });

      expect(response.status).toBe(202);
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'keeps project-only run creation off the remote Workspace directory through %s',
    async (route) => {
      const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Team',
          workspaceType: 'team',
          workspaceMemberId: OWNER_MEMBER_ID,
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      }));
      const baseUrl = await startServer({
        verifyWorkspaceRequestAuthority,
        authorizePluginWithWorkspaceAuthority: true,
      });

      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          message: 'project-only authority',
        }),
      });

      expect(response.status).toBe(202);
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'continues local run creation when the remote Workspace directory is unavailable through %s',
    async (route) => {
      const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
        ok: false,
        status: 503 as const,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true as const,
      }));
      const baseUrl = await startServer({
        verifyWorkspaceRequestAuthority,
        authorizePluginWithWorkspaceAuthority: true,
        seedImplicitScenarioPlugin: true,
      });

      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          pluginId: 'example-web-prototype',
          message: 'must fail closed',
        }),
      });

      expect(response.status).toBe(202);
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
      expect(createdRunCount).toBe(1);
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'does not let stale remote membership state interrupt local run creation through %s',
    async (route) => {
      let memberStatus: 'active' | 'removed' = 'active';
      const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Team',
          workspaceType: 'team',
          workspaceMemberId: OWNER_MEMBER_ID,
          role: 'owner',
          memberStatus,
          lifecycleState: 'active',
        }),
      }));
      const baseUrl = await startServer({
        verifyWorkspaceRequestAuthority,
        authorizePluginWithWorkspaceAuthority: true,
        seedImplicitScenarioPlugin: true,
      });
      const create = () => fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          pluginId: 'example-web-prototype',
          message: 'request-scoped membership',
        }),
      });

      expect((await create()).status).toBe(202);
      memberStatus = 'removed';
      expect((await create()).status).toBe(202);
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
    },
  );

  it('authorizes concurrent local runs from persisted bindings without a remote witness', async () => {
    const pending: Array<{
      memberId: string;
      resolve: (value: any) => void;
    }> = [];
    const verifyWorkspaceRequestAuthority = vi.fn((req: any) => {
      const memberId = String(req.get('x-od-workspace-member-id'));
      if (pending.length >= 2) {
        return Promise.resolve({
          ok: true,
          context: workspaceContextFromDirectoryItem({
            workspaceId: WORKSPACE_ID,
            workspaceName: 'Team',
            workspaceType: 'team',
            workspaceMemberId: memberId,
            role: memberId === OWNER_MEMBER_ID ? 'owner' : 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          }),
        });
      }
      return new Promise((resolve) => pending.push({ memberId, resolve }));
    });
    const baseUrl = await startServer({
      verifyWorkspaceRequestAuthority,
      authorizePluginWithWorkspaceAuthority: true,
      seedImplicitScenarioPlugin: true,
    });
    const create = (memberId: string, role: 'owner' | 'member') =>
      fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(memberId, role),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          pluginId: 'example-web-prototype',
          message: 'concurrent authority',
        }),
      });

    const ownerRequest = create(OWNER_MEMBER_ID, 'owner');
    const memberRequest = create('member-concurrent-run', 'member');
    const [ownerResponse, memberResponse] = await Promise.all([
      ownerRequest,
      memberRequest,
    ]);
    expect(ownerResponse.status).toBe(202);
    expect(memberResponse.status).toBe(403);
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
  });

  it.each(['/api/runs', '/api/chat'])(
    'does not let an explicit plugin id bypass the request-scoped catalog through %s',
    async (route) => {
      const authorizePluginRequest = vi.fn(async (_req, res) => {
        sendApiError(res, 404, 'PLUGIN_NOT_FOUND', 'plugin not found');
        return false;
      });
      const baseUrl = await startServer({ authorizePluginRequest });
      const resp = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: PERSONAL_PROJECT,
          pluginId: 'private-plugin-owned-by-another-member',
          agentId: 'claude',
          message: 'must fail before global snapshot resolution',
        }),
      });

      expect(resp.status).toBe(404);
      await expect(resp.json()).resolves.toMatchObject({
        error: { code: 'PLUGIN_NOT_FOUND' },
      });
      expect(authorizePluginRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'private-plugin-owned-by-another-member',
      );
    },
  );

  it(
    'authorizes an implicit project-kind plugin before snapshot resolution through /api/runs',
    async () => {
      const authorizePluginRequest = vi.fn(async (_req, res) => {
        sendApiError(res, 404, 'PLUGIN_NOT_FOUND', 'plugin not found');
        return false;
      });
      const baseUrl = await startServer({
        authorizePluginRequest,
        seedImplicitScenarioPlugin: true,
      });
      const resp = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: PERSONAL_PROJECT,
          agentId: 'claude',
          message: 'fallback must use scoped plugin lookup',
        }),
      });

      expect(resp.status).toBe(404);
      expect(authorizePluginRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'example-web-prototype',
      );
    },
  );

  it('allows a headerless local run against a personal bound project so billing uses the persisted binding', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PERSONAL_PROJECT, agentId: 'claude', message: 'hi' }),
    });
    expect(resp.status).toBe(202);
    const payload = (await resp.json()) as { runId: string };
    expect(typeof payload.runId).toBe('string');
  });

  it.each(['/api/runs', '/api/chat'])(
    'persists the exact project binding on the run before spawning through %s',
    async (route) => {
      const baseUrl = await startServer();
      const createResponse = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: PERSONAL_PROJECT,
          agentId: 'amr',
          message: 'pin billing scope',
        }),
      });
      expect(createResponse.status).toBe(202);
      const { runId } = (await createResponse.json()) as { runId: string };

      const statusResponse = await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      });
      expect(statusResponse.status).toBe(200);
      await expect(statusResponse.json()).resolves.toMatchObject({
        workspaceScope: {
          schemaVersion: 1,
          projectId: PERSONAL_PROJECT,
          workspaceId: WORKSPACE_ID,
          source: 'persisted_project_binding',
        },
      });
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'allows the shared-project owner to create a run through %s',
    async (route) => {
      const baseUrl = await startServer();
      const resp = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          message: 'hi',
        }),
      });
      expect(resp.status).toBe(202);
      const payload = (await resp.json()) as { runId: string };
      expect(typeof payload.runId).toBe('string');
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'requires an explicit owner identity for a shared Team project through %s',
    async (route) => {
      const baseUrl = await startServer();
      const resp = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          message: 'headerless shared-project mutation',
        }),
      });

      expect(resp.status).toBe(400);
      await expect(resp.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_CONTEXT_REQUIRED' },
      });
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'rejects a stale direct run against a revoked Team mirror through %s',
    async (route) => {
      const baseUrl = await startServer({
        teamProjectResourceState: 'deleted',
      });
      const resp = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          message: 'must not run stale mirror bytes',
        }),
      });

      expect(resp.status).toBe(403);
      await expect(resp.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
      });
    },
  );

  it.each(['/api/runs', '/api/chat'])(
    'rejects a Team workspace owner who is not the shared-project owner through %s',
    async (route) => {
      const workspaceOwnerId = 'member-workspace-owner';
      const baseUrl = await startServer({
        verifyWorkspaceRequestAuthority: async () => ({
          ok: true,
          context: workspaceContextFromDirectoryItem({
            workspaceId: WORKSPACE_ID,
            workspaceName: 'Team',
            workspaceType: 'team',
            workspaceMemberId: workspaceOwnerId,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          }),
        }),
      });
      const resp = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(workspaceOwnerId, 'owner'),
        },
        body: JSON.stringify({
          projectId: TEAM_PROJECT,
          agentId: 'claude',
          message: 'must not mutate another member shared project',
        }),
      });

      expect(resp.status).toBe(403);
      await expect(resp.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
      });
    },
  );

  it('still allows a headerless run creation against a never-claimed (legacy) project', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: UNBOUND_PROJECT, agentId: 'claude', message: 'hi' }),
    });
    expect(resp.status).toBe(202);
    const payload = (await resp.json()) as { runId: string };
    expect(typeof payload.runId).toBe('string');
  });

  it.each(['/api/runs', '/api/chat'])(
    'ignores a client-forged workspace scope for an unbound project through %s',
    async (route) => {
      const baseUrl = await startServer();
      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UNBOUND_PROJECT,
          agentId: 'claude',
          message: 'do not trust request scope',
          workspaceScope: {
            schemaVersion: 1,
            projectId: UNBOUND_PROJECT,
            workspaceId: 'forged-workspace',
            workspaceMemberId: 'forged-member',
            source: 'persisted_project_binding',
          },
        }),
      });

      expect(response.status).toBe(202);
      const { runId } = (await response.json()) as { runId: string };
      const statusResponse = await fetch(`${baseUrl}/api/runs/${runId}`);
      expect(statusResponse.status).toBe(200);
      const run = await statusResponse.json() as Record<string, unknown>;
      expect(run.workspaceScope).toBeNull();
    },
  );

  it('keeps an untyped historical AMR run account-scoped during a directory outage', async () => {
    const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
      ok: false,
      status: 503,
      code: 'WORKSPACE_DIRECTORY_UNAVAILABLE',
      message: 'workspace directory temporarily unavailable',
    }));
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority,
    });
    const db = openDatabase(tempDir!);

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        message: 'local send must survive the outage',
      }),
    });

    expect(response.status).toBe(202);
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
    expect(getWorkspaceProjectByProjectId(db, UNBOUND_PROJECT)).toBeUndefined();
  });

  it('authorizes the final run plugin before loading the scoped registry', async () => {
    const calls: string[] = [];
    const baseUrl = await startServer({
      seedImplicitScenarioPlugin: true,
      loadPluginRegistryView: async () => {
        calls.push('registry');
        return {};
      },
      authorizePluginRequest: async () => {
        calls.push('plugin');
        return true;
      },
    });

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: PERSONAL_PROJECT,
        agentId: 'claude',
        pluginId: 'example-web-prototype',
        message: 'authorize before reading the registry',
      }),
    });

    expect(response.status).toBe(202);
    expect(calls).toEqual(['plugin', 'registry']);
  });

  it('adopts an explicitly Personal local scope before authorizing its chat plugin', async () => {
    const calls: string[] = [];
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority: async () => {
        calls.push('adoption');
        return {
          ok: true,
          context: workspaceContextFromDirectoryItem({
            workspaceId: WORKSPACE_ID,
            workspaceName: WORKSPACE_ID,
            workspaceType: 'personal',
            workspaceMemberId: OWNER_MEMBER_ID,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          }),
        };
      },
      authorizePluginRequest: async () => {
        calls.push('plugin');
        return true;
      },
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        'x-od-workspace-type': 'personal',
      },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        pluginId: 'explicit-plugin',
        message: 'adopt before plugin lookup',
      }),
    });

    expect(response.status).toBe(202);
    expect(calls).toEqual(['plugin']);
    expect(getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT))
      .toMatchObject({
        workspaceId: WORKSPACE_ID,
        createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      });
  });

  it('still allows a headerless run creation with no projectId at all (scratch / non-project usage)', async () => {
    const baseUrl = await startServer();
    const resp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'claude', message: 'hi' }),
    });
    expect(resp.status).toBe(202);
    const payload = (await resp.json()) as { runId: string };
    expect(typeof payload.runId).toBe('string');
  });

  it('rejects a snapshot pinned to another project before changing either persisted link', async () => {
    const baseUrl = await startServer();
    const snapshot = seedPluginSnapshot(TEAM_PROJECT);

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: PERSONAL_PROJECT,
        agentId: 'claude',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'must not move a snapshot across projects',
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'snapshot-not-found' },
    });
    expect(snapshotProjectId(snapshot.snapshotId)).toBe(TEAM_PROJECT);
    expect(getProject(openDatabase(tempDir!), TEAM_PROJECT)?.appliedPluginSnapshotId)
      .toBe(snapshot.snapshotId);
    expect(getProject(openDatabase(tempDir!), PERSONAL_PROJECT)?.appliedPluginSnapshotId ?? null)
      .toBeNull();
  });

  it('rejects a cross-project snapshot on chat before creating a run', async () => {
    const baseUrl = await startServer();
    const snapshot = seedPluginSnapshot(TEAM_PROJECT);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: PERSONAL_PROJECT,
        agentId: 'claude',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'must not read another project plugin snapshot',
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'snapshot-not-found' },
    });
    expect(createdRunCount).toBe(0);
    expect(snapshotProjectId(snapshot.snapshotId)).toBe(TEAM_PROJECT);
    expect(getProject(openDatabase(tempDir!), PERSONAL_PROJECT)?.appliedPluginSnapshotId ?? null)
      .toBeNull();
  });

  it.each(['/api/runs', '/api/chat'])(
    'rejects another member before creating a run through %s and preserves same-project snapshot links',
    async (route) => {
      const loadPluginRegistryView = vi.fn(async () => ({}));
      const baseUrl = await startServer({ loadPluginRegistryView });
      const snapshot = seedPluginSnapshot(PERSONAL_PROJECT);
      const otherMemberId = 'member-other-run';

      const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(otherMemberId, 'member'),
        },
        body: JSON.stringify({
          projectId: PERSONAL_PROJECT,
          agentId: 'claude',
          appliedPluginSnapshotId: snapshot.snapshotId,
          message: 'must not run another member personal project',
        }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
      });
      expect(loadPluginRegistryView).not.toHaveBeenCalled();
      expect(createdRunCount).toBe(0);
      expect(snapshotProjectId(snapshot.snapshotId)).toBe(PERSONAL_PROJECT);
      expect(getProject(openDatabase(tempDir!), PERSONAL_PROJECT)?.appliedPluginSnapshotId)
        .toBe(snapshot.snapshotId);
    },
  );

  it('keeps an exact owner run on its already-pinned snapshot', async () => {
    const baseUrl = await startServer();
    const snapshot = seedPluginSnapshot(PERSONAL_PROJECT);

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: PERSONAL_PROJECT,
        agentId: 'claude',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'same project snapshot',
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      appliedPluginSnapshotId: snapshot.snapshotId,
    });
    expect(snapshotProjectId(snapshot.snapshotId)).toBe(PERSONAL_PROJECT);
    expect(getProject(openDatabase(tempDir!), PERSONAL_PROJECT)?.appliedPluginSnapshotId)
      .toBe(snapshot.snapshotId);
  });
});

describe('Workspace-bound run lifecycle authority', () => {
  it('keeps headerless local CLI/MCP lifecycle operations working for representative non-AMR runtimes', async () => {
    const baseUrl = await startServer();
    const bodies = [
      { projectId: TEAM_PROJECT, agentId: 'claude', message: 'claude run' },
      { projectId: TEAM_PROJECT, agentId: 'codex', message: 'codex run' },
      { projectId: TEAM_PROJECT, agentId: 'opencode', message: 'opencode run' },
      {
        projectId: TEAM_PROJECT,
        agentId: 'byok-opencode',
        model: 'test-model',
        message: 'byok run',
        byokProvider: {
          protocol: 'openai',
          baseUrl: 'http://127.0.0.1:1234/v1',
          requiresApiKey: false,
        },
      },
    ];

    for (const body of bodies) {
      const createResponse = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        },
        body: JSON.stringify(body),
      });
      const createResponseText = await createResponse.text();
      expect(
        createResponse.status,
        `${body.agentId}: ${createResponseText}`,
      ).toBe(202);
      const { runId } = JSON.parse(createResponseText) as { runId: string };

      const statusResponse = await fetch(`${baseUrl}/api/runs/${runId}`);
      expect(statusResponse.status).toBe(200);
      await expect(statusResponse.json()).resolves.toMatchObject({
        id: runId,
        agentId: body.agentId,
        projectId: TEAM_PROJECT,
      });

      const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
      expect(eventsResponse.status).toBe(200);
      await expect(eventsResponse.json()).resolves.toMatchObject({ runId });

      const cancelResponse = await fetch(`${baseUrl}/api/runs/${runId}/cancel`, {
        method: 'POST',
      });
      expect(cancelResponse.status).toBe(200);
      await expect(cancelResponse.json()).resolves.toMatchObject({
        ok: true,
        run: { id: runId, status: 'canceled' },
      });
    }
  });

  it('keeps persisted local AMR run status, events, and cancel available offline', async () => {
    const baseUrl = await startServer();
    const createResponse = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: TEAM_PROJECT,
        agentId: 'amr',
        message: 'cloud run',
      }),
    });
    expect(createResponse.status).toBe(202);
    const { runId } = (await createResponse.json()) as { runId: string };

    for (const [path, method] of [
      [`/api/runs/${runId}`, 'GET'],
      [`/api/runs/${runId}/events`, 'GET'],
      [`/api/runs/${runId}/cancel`, 'POST'],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(200);
    }

    const exactHeaders = workspaceHeaders(OWNER_MEMBER_ID, 'owner');
    expect(
      (await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: exactHeaders,
      })).status,
    ).toBe(200);
    expect(
      (await fetch(`${baseUrl}/api/runs/${runId}/events`, {
        headers: exactHeaders,
      })).status,
    ).toBe(200);
    expect(
      (await fetch(`${baseUrl}/api/runs/${runId}/cancel`, {
        method: 'POST',
        headers: exactHeaders,
      })).status,
    ).toBe(200);
  });

  it('still validates an explicitly asserted Workspace identity for a non-AMR run', async () => {
    const baseUrl = await startServer();
    const createResponse = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: TEAM_PROJECT,
        agentId: 'claude',
        message: 'local run',
      }),
    });
    const { runId } = (await createResponse.json()) as { runId: string };

    const response = await fetch(`${baseUrl}/api/runs/${runId}`, {
      headers: { 'x-od-workspace-id': WORKSPACE_ID },
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_CONTEXT_INCOMPLETE' },
    });
  });

  it('keeps a persisted historical run available without relying on runtime identity', async () => {
    const baseUrl = await startServer();
    const createResponse = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
      },
      body: JSON.stringify({
        projectId: TEAM_PROJECT,
        message: 'historical run without runtime identity',
      }),
    });
    expect(createResponse.status).toBe(202);
    const { runId } = (await createResponse.json()) as { runId: string };

    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    expect(response.status).toBe(200);
  });

  it.each([
    ['AMR is inserted first', ['amr', 'claude']],
    ['non-AMR is inserted first', ['claude', 'amr']],
  ])(
    'lists only non-AMR runs for a headerless caller when %s, independent of representative order',
    async (_label, agentIds) => {
      const baseUrl = await startServer();
      for (const agentId of agentIds) {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
          },
          body: JSON.stringify({
            projectId: TEAM_PROJECT,
            agentId,
            message: `${agentId} run`,
          }),
        });
        expect(createResponse.status).toBe(202);
      }

      const headerlessResponse = await fetch(
        `${baseUrl}/api/runs?projectId=${TEAM_PROJECT}`,
      );
      expect(headerlessResponse.status).toBe(200);
      const headerlessBody = (await headerlessResponse.json()) as {
        runs: Array<{ agentId: string }>;
      };
      expect(headerlessBody.runs.map((run) => run.agentId)).toEqual(['claude']);

      const exactResponse = await fetch(
        `${baseUrl}/api/runs?projectId=${TEAM_PROJECT}`,
        { headers: workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
      );
      expect(exactResponse.status).toBe(200);
      const exactBody = (await exactResponse.json()) as {
        runs: Array<{ agentId: string }>;
      };
      expect(exactBody.runs.map((run) => run.agentId)).toEqual(agentIds);
    },
  );
});

describe('POST /api/runs — delegates membership and balance eligibility to Vela/AMR', () => {
  it('does not let an ambient directory verdict override the persisted project billing binding', async () => {
    const baseUrl = await startServer({
      enforceWorkspaceProjectMutation: createEnforceWorkspaceProjectMutation(async () => ({
        ok: false,
        status: 403,
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'the requested workspace is not available to this member',
      })),
    });
    const resp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
      body: JSON.stringify({ projectId: TEAM_PROJECT, agentId: 'claude', message: 'hi' }),
    });
    expect(resp.status).toBe(202);
    const payload = (await resp.json()) as { runId: string };
    expect(typeof payload.runId).toBe('string');
  });

  it('allows the same headers when the authoritative directory confirms ownership', async () => {
    const baseUrl = await startServer({
      enforceWorkspaceProjectMutation: createEnforceWorkspaceProjectMutation(async () => ({
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId: WORKSPACE_ID,
          workspaceName: WORKSPACE_ID,
          workspaceType: 'team',
          workspaceMemberId: OWNER_MEMBER_ID,
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      })),
    });
    const resp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...workspaceHeaders(OWNER_MEMBER_ID, 'owner') },
      body: JSON.stringify({ projectId: TEAM_PROJECT, agentId: 'claude', message: 'hi' }),
    });
    expect(resp.status).toBe(202);
    const payload = (await resp.json()) as { runId: string };
    expect(typeof payload.runId).toBe('string');
  });
});

describe('POST /api/runs — one-time Personal adoption for signed-in AMR', () => {
  it.each(['/api/runs', '/api/chat'])(
    'transactionally binds an unbound historical project to the exact local Personal Workspace through %s',
    async (route) => {
    const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
      ok: true,
      context: workspaceContextFromDirectoryItem({
        workspaceId: WORKSPACE_ID,
        workspaceName: 'Personal',
        workspaceType: 'personal',
        workspaceMemberId: OWNER_MEMBER_ID,
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      }),
    }));
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority,
    });

    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        'x-od-workspace-type': 'personal',
      },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        message: 'migrate and run',
      }),
    });

      expect(response.status).toBe(202);
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
      expect(
        getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
      ).toMatchObject({
        workspaceId: WORKSPACE_ID,
        visibility: 'personal',
        createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      });
    },
  );

  it('keeps an adopted Personal project runnable only by its persisted creator', async () => {
    const verifyWorkspaceRequestAuthority = vi.fn(async (req: any) => {
      const memberId = req.get('x-od-workspace-member-id');
      return {
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Personal',
          workspaceType: 'personal',
          workspaceMemberId: memberId,
          role: memberId === OWNER_MEMBER_ID ? 'owner' : 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      };
    });
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority,
    });

    const run = (memberId: string, role: 'owner' | 'member') =>
      fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...workspaceHeaders(memberId, role),
          'x-od-workspace-type': 'personal',
        },
        body: JSON.stringify({
          projectId: UNBOUND_PROJECT,
          agentId: 'amr',
          message: 'run adopted project',
        }),
      });

    expect((await run(OWNER_MEMBER_ID, 'owner')).status).toBe(202);
    expect(
      getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      visibility: 'personal',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
    });
    expect((await run(OWNER_MEMBER_ID, 'owner')).status).toBe(202);

    const foreignResponse = await run('member-foreign-adopted', 'member');
    expect(foreignResponse.status).toBe(403);
    await expect(foreignResponse.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
    });
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
  });

  it.each(['/api/runs', '/api/chat'])(
    'keeps a signed-in AMR run through %s account-scoped when its local project is unbound',
    async (route) => {
    const verifyWorkspaceRequestAuthority = vi.fn();
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority,
    });

    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        message: 'must not use account wallet',
      }),
    });

      expect(response.status).toBe(202);
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
      expect(
        getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
      ).toBeUndefined();
    },
  );

  it('never adopts an unbound historical project into a Team Workspace', async () => {
    const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
      ok: true,
      context: workspaceContextFromDirectoryItem({
        workspaceId: WORKSPACE_ID,
        workspaceName: 'Team',
        workspaceType: 'team',
        workspaceMemberId: OWNER_MEMBER_ID,
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      }),
    }));
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority,
    });

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        'x-od-workspace-type': 'team',
      },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        message: 'must stay personal',
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AMR_PERSONAL_WORKSPACE_REQUIRED' },
    });
    expect(
      getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
    ).toBeUndefined();
  });

  it('adopts an explicitly Personal project locally when Workspace authority is unavailable', async () => {
    const verifyWorkspaceRequestAuthority = vi.fn(async () => ({
      ok: false,
      status: 503,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      message: 'workspace membership authority is temporarily unavailable',
      retryable: true,
    }));
    const baseUrl = await startServer({
      isAmrSignedIn: () => true,
      verifyWorkspaceRequestAuthority,
    });

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        'x-od-workspace-type': 'personal',
      },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        message: 'keep local send available',
      }),
    });

    expect(response.status).toBe(202);
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
    expect(
      getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      visibility: 'personal',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
    });
  });

  it.each(['/api/runs', '/api/chat'])(
    'does not fetch authority, bind, or refuse unbound non-AMR and BYOK runs through %s',
    async (route) => {
      const isAmrSignedIn = vi.fn(() => true);
      const verifyWorkspaceRequestAuthority = vi.fn();
      const baseUrl = await startServer({
        isAmrSignedIn,
        verifyWorkspaceRequestAuthority,
      });

      for (const body of [
        { projectId: UNBOUND_PROJECT, agentId: 'claude', message: 'local cli' },
        { projectId: UNBOUND_PROJECT, agentId: 'codex', message: 'local cli' },
        { projectId: UNBOUND_PROJECT, agentId: 'opencode', message: 'local cli' },
        {
          projectId: UNBOUND_PROJECT,
          agentId: 'byok-opencode',
          model: 'test-model',
          message: 'byok',
          byokProvider: {
            protocol: 'openai',
            baseUrl: 'http://127.0.0.1:1234/v1',
            requiresApiKey: false,
          },
        },
      ]) {
        const response = await fetch(`${baseUrl}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(202);
      }

      expect(isAmrSignedIn).not.toHaveBeenCalled();
      expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
      expect(
        getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
      ).toBeUndefined();
    },
  );

  it('does not fetch authority, bind, or synchronously refuse an unlogged AMR run', async () => {
    const verifyWorkspaceRequestAuthority = vi.fn();
    const baseUrl = await startServer({
      isAmrSignedIn: () => false,
      verifyWorkspaceRequestAuthority,
    });

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceHeaders(OWNER_MEMBER_ID, 'owner'),
        'x-od-workspace-type': 'personal',
      },
      body: JSON.stringify({
        projectId: UNBOUND_PROJECT,
        agentId: 'amr',
        message: 'auth guard remains the owner',
      }),
    });

    expect(response.status).toBe(202);
    expect(verifyWorkspaceRequestAuthority).not.toHaveBeenCalled();
    expect(
      getWorkspaceProjectByProjectId(openDatabase(tempDir!), UNBOUND_PROJECT),
    ).toBeUndefined();
  });
});
