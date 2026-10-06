import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';

import express from 'express';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, listMessages, openDatabase } from '../src/db.js';
import { createSnapshot, linkSnapshotToRun } from '../src/plugins/snapshots.js';
import { registerRunRoutes } from '../src/routes/runs.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import { pinAssistantMessageOnRunCreate } from '../src/runtimes/chat-run-messages.js';
import { createInternalRunCreationService } from '../src/services/internal-run-service.js';
import { createSseResponse } from '../src/server.js';
import { finalizeStrategyPlanningTurn, prepareStrategyRequest } from '../src/strategies/od-next/coordinator.js';
import { OdNextMachineProtocolStream } from '../src/strategies/od-next/protocol.js';
import { createStrategyTaskExecution, getStrategyTaskExecution } from '../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from './strategies/strategy-task-test-fixtures.js';

type Runs = ReturnType<typeof createChatRunService>;
type Db = ReturnType<typeof openDatabase>;
const PROJECT = 'cold-clarification-project';
const CONVERSATION = 'cold-clarification-conversation';
const TASK = 'cold-clarification-task';
let root: string | undefined;
let server: http.Server | undefined;
let coldRuns: Runs | undefined;

async function finishRun(runs: Runs, run: NonNullable<ReturnType<Runs['get']>>) {
  // Open the actual journal before finish so its completion is awaitable.
  runs.emit(run, 'agent', { type: 'text_delta', delta: 'Fixture execution boundary.' });
  const stream = run.eventsLogStream;
  if (!stream) throw new Error('Run event journal was not opened');
  const flushed = finished(stream);
  runs.finish(run, 'succeeded', 0, null);
  await flushed;
}

afterEach(async () => {
  if (server) {
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((error) => error ? reject(error) : resolve());
      current.closeAllConnections();
    });
  }
  // The execution adapter deliberately stops at admission (no model). Close
  // any created continuation's real event log before removing the fixture.
  if (coldRuns) {
    for (const run of coldRuns.list({})) {
      if (!coldRuns.isTerminal(run.status)) await finishRun(coldRuns, run);
    }
  }
  coldRuns = undefined;
  closeDatabase();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function newRuns(directory: string) {
  return createChatRunService({
    createSseResponse,
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    // Existing @ts-nocheck service infers this option from its null default.
    runsLogDir: path.join(directory, 'runs') as unknown as null,
  });
}

async function seed(journal: 'new' | 'legacy') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'od-cold-clarification-'));
  root = directory;
  const db = openDatabase(directory, { dataDir: directory });
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(PROJECT, 'Cold clarification', 1, 1);
  db.prepare('INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(CONVERSATION, PROJECT, 'Cold clarification', 1, 1);
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
  ];
  const snapshot = createSnapshot(db, {
    projectId: PROJECT, conversationId: CONVERSATION, runId: null,
    pluginId: 'od-next-strategy', pluginVersion: '2.0.0', manifestSourceDigest: 'cold-clarification',
    strategy: {
      schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: '2.0.0',
      packageHash: strategyPackageHashFromDigests(assetDigests), assetDigests,
      selectedTaskProfile: {
        taskType: 'prototype', version: '2.0.0', path: './assets/task-profiles/prototype.md',
        sha256: 'b'.repeat(64),
      },
      taskProfileVersions: ['2.0.0'], promptRecipe: 'od-next-plan-build-v2',
    },
    taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'], capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [], connectorsRequired: [], connectorsResolved: [], mcpServers: [],
  });
  const identity = strategyTaskCreateIdentityFixture();
  const warmRuns = newRuns(directory);
  const run = warmRuns.create({
    projectId: PROJECT, conversationId: CONVERSATION, assistantMessageId: 'question-assistant',
    agentId: 'codex', appliedPluginSnapshotId: snapshot.snapshotId,
    odNextTaskInputSnapshot: {
      taskExecutionId: TASK, snapshotDir: path.join(directory, 'task-input'),
      manifestSha256: identity.taskInputManifestSha256,
    },
  });
  linkSnapshotToRun(db, snapshot.snapshotId, run.id);
  createStrategyTaskExecution(db, {
    taskExecutionId: TASK, projectId: PROJECT, conversationId: CONVERSATION,
    snapshotId: snapshot.snapshotId, selectedAgentId: 'codex', initialRunId: run.id,
    ...identity,
  });
  prepareStrategyRequest(db, {
    taskExecutionId: TASK, preference: 'full_plan',
    directEdit: {
      editableBaselineExists: false, localAndUnambiguous: false, canonicalDeliverableStable: false,
      deliverableSetStable: false, dependenciesBounded: false,
    },
    intake: {
      inputRefs: [{ id: 'request', accessible: true }], selectedAgentAvailable: true,
      nativeContinuation: 'verified', taskProfileAvailable: true, dependencies: [],
    },
  });
  const protocol = new OdNextMachineProtocolStream();
  protocol.push([
    '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>',
    '<open-design-runtime-state>',
    JSON.stringify({
      schema: 'open-design.strategy-state/v2', route: 'full_plan', inputStage: 'request',
      outcome: 'clarification_required', executionMode: null, reasonCodes: [],
    }),
    '</open-design-runtime-state>',
  ].join('\n'));
  finalizeStrategyPlanningTurn(db, { taskExecutionId: TASK, runId: run.id, protocol });
  await finishRun(warmRuns, run);
  const statePath = path.join(directory, 'runs', run.id, 'state.json');
  if (journal === 'legacy') {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.schemaVersion).toBe(1);
    delete state.appliedPluginSnapshotId;
    fs.writeFileSync(statePath, JSON.stringify(state));
  }
  closeDatabase();
  return { directory, sourceRunId: run.id, snapshotId: snapshot.snapshotId };
}

async function serve(db: Db, runs: Runs, directory: string) {
  const requests: Array<{ method: string; path: string }> = [];
  const executions: Array<{ runId: string; message: unknown }> = [];
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    requests.push({ method: req.method, path: req.path });
    next();
  });
  const internalRuns = createInternalRunCreationService({
    runs: {
      ...runs,
      createOrReuse(meta) {
        // The real JS-inferred service widens kind to string; preserve its
        // result while checking the internal registry's literal union.
        const result = runs.createOrReuse(meta);
        switch (result.kind) {
          case 'created': return { kind: 'created', run: result.run };
          case 'reused': return { kind: 'reused', run: result.run };
          case 'conflict': return { kind: 'conflict', run: result.run };
          default: throw new Error(`Unexpected run creation kind: ${result.kind}`);
        }
      },
    },
    claimAssistantMessage: (run, options) => pinAssistantMessageOnRunCreate(db, run, options),
    analyticsLifecycle: { install() {} },
  });
  registerRunRoutes(app, {
    db, internalRuns,
    design: { runs, analytics: { capture() {} }, getAppVersion: () => 'test' },
    http: {
      createSseResponse,
      sendApiError: (res: express.Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { PROJECTS_DIR: path.join(directory, 'projects'), RUNTIME_DATA_DIR: directory },
    agents: { detectAgents: async () => [], getAgentDef: () => null },
    lifecycle: { isDaemonShuttingDown: () => false },
    chat: {
      startChatRun: async (meta: { currentPrompt?: unknown }, run: { id: string }) => {
        executions.push({ runId: run.id, message: meta.currentPrompt });
        signalStarted();
      },
    },
    plugins: {
      connectorService: {}, detectSkillPluginCandidateOnRunSuccess() {}, firePipelineForRun() {},
      loadPluginRegistryView: async () => ({}), renderPluginBriefTemplate: (text: string) => text,
    },
    telemetry: {
      reportRunCompletionTelemetryFallback() {}, resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined }, runRetryEventsForAnalytics: () => [],
    },
    messages: { pinAssistantMessageOnRunCreate, reconcileAssistantMessageOnRunEnd() {} },
  } as unknown as Parameters<typeof registerRunRoutes>[1]);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP listener missing');
  return { base: `http://127.0.0.1:${address.port}`, requests, executions, started };
}

describe('PR 7575 clarification acceptance from a real cold service without a prior GET', () => {
  for (const journal of ['new', 'legacy'] as const) {
    it.each(['/api/runs', '/api/chat'] as const)(`${journal} journal accepts the first HTTP request directly through %s`, async (route) => {
      const fixture = await seed(journal);
      const db = openDatabase(fixture.directory, { dataDir: fixture.directory });
      expect(getStrategyTaskExecution(db, TASK)).toMatchObject({
        outcome: 'clarification_required', inputStage: 'request', latestRunId: fixture.sourceRunId,
        activeRunId: null, terminalRunId: null, clarificationCount: 0,
      });
      // No cold get/status/list call: only the actual first POST may hydrate.
      const runs = newRuns(fixture.directory);
      coldRuns = runs;
      const httpFixture = await serve(db, runs, fixture.directory);
      const payload = {
        taskExecutionId: TASK, projectId: PROJECT, conversationId: CONVERSATION, agentId: 'codex',
        userMessageId: 'clarification-user', assistantMessageId: 'clarification-assistant',
        clientRequestId: 'clarification-client', message: 'Desktop workspace', currentPrompt: 'Desktop workspace',
      };
      const response = await fetch(`${httpFixture.base}${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const expectedStatus = route === '/api/runs' ? 202 : 200;
      if (response.status !== expectedStatus) {
        expect(response.status, await response.text()).toBe(expectedStatus);
      }
      expect(response.status).toBe(expectedStatus);
      if (route === '/api/chat') {
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        await response.body?.cancel();
      } else await response.json();
      const allocated = runs.list({ conversationId: CONVERSATION })
        .filter((candidate) => candidate.id !== fixture.sourceRunId);
      expect(allocated).toHaveLength(1);
      expect(allocated[0]?.status, allocated[0]?.error ?? '').not.toBe('failed');
      await httpFixture.started;
      expect(httpFixture.requests).toEqual([{ method: 'POST', path: route }]);
      expect(httpFixture.executions).toHaveLength(1);
      const task = getStrategyTaskExecution(db, TASK);
      expect(task).toMatchObject({ outcome: 'running', inputStage: 'clarification', clarificationCount: 1 });
      expect(task?.runs).toHaveLength(2);
      const continuation = task?.runs[1];
      expect(continuation).toMatchObject({ sourceRunId: fixture.sourceRunId, inputStage: 'clarification' });
      if (!continuation) throw new Error('Persisted clarification mapping missing');
      expect(httpFixture.executions[0]?.runId).toBe(continuation.runId);
      expect(httpFixture.executions[0]?.message).toEqual(expect.stringContaining('Desktop workspace'));
      expect(runs.get(continuation.runId)).toMatchObject({
        projectId: PROJECT, conversationId: CONVERSATION, agentId: 'codex',
        appliedPluginSnapshotId: fixture.snapshotId, assistantMessageId: payload.assistantMessageId,
      });
      expect(runs.get(fixture.sourceRunId)).toMatchObject({ status: 'succeeded', exitCode: 0 });
      expect(listMessages(db, CONVERSATION)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: payload.assistantMessageId, role: 'assistant', runId: continuation.runId }),
      ]));
    });
  }
});
