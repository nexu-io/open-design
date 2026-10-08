import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';

import express from 'express';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import type { ChatRunStatusResponse } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../src/db.js';
import { createSnapshot } from '../src/plugins/snapshots.js';
import { registerRunRoutes } from '../src/routes/runs.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import {
  compareAndTransitionStrategyTaskExecution,
  createStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
} from '../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from './strategies/strategy-task-test-fixtures.js';

type Runs = ReturnType<typeof createChatRunService>;
type Db = ReturnType<typeof openDatabase>;
const PROJECT = 'cold-strategy-project';
const CONVERSATION = 'cold-strategy-conversation';
const TASK = 'cold-strategy-task';
const REASON = 'od_next_protocol_runtime_state_missing';
let tempDir: string | undefined;
let server: http.Server | undefined;

async function closeHttp() {
  if (!server) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => {
    current.close((error) => error ? reject(error) : resolve());
    current.closeAllConnections();
  });
}

afterEach(async () => {
  await closeHttp();
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function newRuns(root: string) {
  return createChatRunService({
    createSseResponse: () => ({ send: () => true, end() {}, cleanup() {} }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    // The JS-inferred options on this @ts-nocheck service narrow its null default.
    runsLogDir: path.join(root, 'runs') as unknown as null,
  });
}

async function serve(db: Db, runs: Runs, root: string) {
  const app = express();
  app.use(express.json());
  // Only unrelated creation/analytics integrations are stubs. GET, run journal,
  // hydration, task validation/projection, and SQLite reads are production code.
  registerRunRoutes(app, {
    db,
    design: { runs, analytics: { capture() {} }, getAppVersion: () => 'test' },
    http: {
      createSseResponse: () => ({ send() {}, end() {}, cleanup() {} }),
      sendApiError: (res: express.Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { PROJECTS_DIR: path.join(root, 'projects'), RUNTIME_DATA_DIR: root },
    agents: { detectAgents: async () => [], getAgentDef: () => null },
    chat: { startChatRun: async () => undefined },
    plugins: {
      connectorService: {},
      detectSkillPluginCandidateOnRunSuccess() {},
      firePipelineForRun() {},
      loadPluginRegistryView: async () => ({}),
      renderPluginBriefTemplate: (text: string) => text,
    },
    telemetry: {
      reportRunCompletionTelemetryFallback() {},
      resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined },
      runRetryEventsForAnalytics: () => [],
    },
    messages: {
      pinAssistantMessageOnRunCreate: () => ({ ok: true }),
      reconcileAssistantMessageOnRunEnd() {},
    },
  } as unknown as Parameters<typeof registerRunRoutes>[1]);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP listener missing');
  return `http://127.0.0.1:${address.port}`;
}

async function readStatus(base: string, runId: string): Promise<ChatRunStatusResponse> {
  const response = await fetch(`${base}/api/runs/${runId}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<ChatRunStatusResponse>;
}

async function seed(strategy = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-cold-strategy-'));
  tempDir = root;
  const db = openDatabase(root, { dataDir: root });
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(PROJECT, 'Cold strategy', 1, 1);
  db.prepare('INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(CONVERSATION, PROJECT, 'Cold strategy', 1, 1);
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
  ];
  const snapshot = createSnapshot(db, {
    projectId: PROJECT, conversationId: CONVERSATION, runId: null,
    pluginId: 'od-next-strategy', pluginVersion: '2.0.0', manifestSourceDigest: 'cold-strategy',
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
  const runs = newRuns(root);
  const run = runs.create({
    projectId: PROJECT, conversationId: CONVERSATION, assistantMessageId: 'cold-assistant', agentId: 'codex',
    ...(strategy ? {
      appliedPluginSnapshotId: snapshot.snapshotId,
      odNextTaskInputSnapshot: {
        taskExecutionId: TASK, snapshotDir: path.join(root, 'task-input'),
        manifestSha256: identity.taskInputManifestSha256,
      },
    } : {}),
  });
  if (strategy) {
    const task = createStrategyTaskExecution(db, {
      taskExecutionId: TASK, projectId: PROJECT, conversationId: CONVERSATION,
      snapshotId: snapshot.snapshotId, selectedAgentId: 'codex', initialRunId: run.id,
      ...identity,
    });
    compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: TASK, expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'request', outcome: 'blocked', executionMode: null },
      blockedContext: { reasonCodes: [REASON], visibleText: 'A real task was blocked.' },
    });
  }
  runs.setDeliverableValidation(run, { valid: false, validation: 'no_artifact' });
  runs.emit(run, 'agent', { type: 'text_delta', delta: 'Persisted physical output.' });
  const log = run.eventsLogStream;
  if (!log) throw new Error('Real event journal was not opened');
  const flushed = finished(log);
  runs.finish(run, 'succeeded', 0, null);
  await flushed;
  const warm = await readStatus(await serve(db, runs, root), run.id);
  expect(warm).toMatchObject({ status: 'succeeded', exitCode: 0, deliverableValid: false });
  if (strategy) {
    expect(warm.strategyTask).toMatchObject({ taskExecutionId: TASK, outcome: 'blocked', terminal: true });
  } else {
    expect(warm.strategyTask).toBeUndefined();
  }
  await closeHttp();
  closeDatabase();
  return { root, runId: run.id, snapshotId: snapshot.snapshotId, statePath: path.join(root, 'runs', run.id, 'state.json') };
}

async function coldStatus(fixture: Awaited<ReturnType<typeof seed>>, strategy = true) {
  const db = openDatabase(fixture.root, { dataDir: fixture.root });
  const persistedTask = getStrategyTaskExecutionByRunId(db, fixture.runId);
  if (strategy) {
    expect(persistedTask).toMatchObject({
      taskExecutionId: TASK, outcome: 'blocked', snapshotId: fixture.snapshotId,
      blockedContext: { reasonCodes: [REASON] },
    });
  } else expect(persistedTask).toBeNull();
  return readStatus(await serve(db, newRuns(fixture.root), fixture.root), fixture.runId);
}

function expectBlocked(status: Awaited<ReturnType<typeof readStatus>>, snapshotId: string) {
  expect(status).toMatchObject({ status: 'succeeded', exitCode: 0, deliverableValid: false, deliverableValidation: 'no_artifact', appliedPluginSnapshotId: snapshotId });
  expect(status.strategyTask).toMatchObject({
    taskExecutionId: TASK, strategy: { snapshotId }, outcome: 'blocked', terminal: true,
    blockedContext: { reasonCodes: [REASON], visibleText: 'A real task was blocked.' },
  });
}

describe('GET run strategy projection after real durable-service restart', () => {
  it('round-trips a newly persisted terminal task without changing physical succeeded', async () => {
    const fixture = await seed();
    expectBlocked(await coldStatus(fixture), fixture.snapshotId);
  });

  it('restores an existing schema-1 journal missing only applied snapshot identity', async () => {
    const fixture = await seed();
    const state = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
    expect(state.schemaVersion).toBe(1);
    // Real service produced every byte of the record; remove only the field
    // omitted by the deployed writer so this stays a legacy guard after fixing it.
    delete state.appliedPluginSnapshotId;
    fs.writeFileSync(fixture.statePath, JSON.stringify(state));
    expectBlocked(await coldStatus(fixture), fixture.snapshotId);
  });

  it('leaves an ordinary physical run without strategy metadata', async () => {
    const fixture = await seed(false);
    const status = await coldStatus(fixture, false);
    expect(status).toMatchObject({ id: fixture.runId, status: 'succeeded', exitCode: 0 });
    expect(status.strategyTask).toBeUndefined();
  });

  it.each(['snapshot', 'manifest', 'project', 'conversation', 'agent', 'task owner'] as const)(
    'rejects explicit %s mismatch without leaking a task or rewriting physical outcome', async (mismatch) => {
      const fixture = await seed();
      const state = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
      // Begin with the deployed legacy shape, then alter exactly one identity.
      // Missing-field recovery must not excuse a genuinely conflicting owner.
      delete state.appliedPluginSnapshotId;
      switch (mismatch) {
        case 'snapshot': state.appliedPluginSnapshotId = 'different-explicit-snapshot'; break;
        case 'manifest': state.odNextTaskInputSnapshot.manifestSha256 = 'e'.repeat(64); break;
        case 'project': state.projectId = 'different-project'; break;
        case 'conversation': state.conversationId = 'different-conversation'; break;
        case 'agent': state.agentId = 'different-agent'; break;
        case 'task owner': state.odNextTaskInputSnapshot.taskExecutionId = 'different-task'; break;
      }
      fs.writeFileSync(fixture.statePath, JSON.stringify(state));
      const status = await coldStatus(fixture);
      expect(status).toMatchObject({ id: fixture.runId, status: 'succeeded', exitCode: 0 });
      expect(status.strategyTask).toBeUndefined();
    },
  );
});
