import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import { Agent, fetch } from 'undici';
import { afterEach, expect, it, vi } from 'vitest';
import { composeOdNextStrategyBundleHeadV2, serializeOdNextPromptBundleV2,
  type AppliedPluginSnapshot, type OpenDesignPlanContractV2 } from '@open-design/contracts';

const telemetry = vi.hoisted(() => ({ pending: null as Promise<void> | null, entered: false, runId: '' }));
vi.mock('../src/langfuse-bridge.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/langfuse-bridge.js')>();
  return { ...actual, reportRunCompletedFromDaemon: async (...args: Parameters<typeof actual.reportRunCompletedFromDaemon>) => {
    if (telemetry.pending && args[0].run.id === telemetry.runId) { telemetry.entered = true; await telemetry.pending; }
    return actual.reportRunCompletedFromDaemon(...args);
  } };
});

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase, insertProject, insertConversation, upsertMessage } from '../src/db.js';
import { writeAppConfig } from '../src/app-config.js';
import { ensureProject } from '../src/projects.js';
import { createSnapshot } from '../src/plugins/snapshots.js';
import { resolvePluginFolder } from '../src/plugins/registry.js';
import { createBundledStrategyBindingV2 } from '../src/plugins/strategy-package.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import type { ChatRun } from '../src/runtimes/chat-run-records.js';
import { snapshotProjectArtifacts, diffRunArtifacts } from '../src/run-artifact-fs.js';
import { buildOdNextTaskConfigurationV1, createOdNextTaskInputSnapshot, removeOdNextTaskInputSnapshot,
  type OdNextTaskInputSnapshotDescriptor } from '../src/strategies/od-next/task-input-snapshot.js';
import { createStrategyTaskExecution, getStrategyTaskExecution } from '../src/strategies/task-store.js';
import { prepareAutomaticStrategyContinuation } from '../src/strategies/od-next/automatic-simple-production.js';
import { startIntentResolution, captureIntentResolutionReply } from '../src/strategies/od-next/intent-resolution-store.js';
import { createStrategyRunWriteEvidenceRecorder } from '../src/strategies/od-next/run-write-evidence.js';
import { OdNextMachineProtocolStream } from '../src/strategies/od-next/protocol.js';
import { strategyTaskCreateIdentityFixture } from './strategies/strategy-task-test-fixtures.js';

const AGENT_ID = 'codex';
const REQUEST = 'Ask the required questions and discuss the plan. Do not create or modify files.';
const SOURCE_TEXT = 'The original plan remains available in chat.';
const EXECUTION = { productionRoutes: [{ id: 'html', available: true }], dependencies: [],
  inputs: [{ id: 'request', available: true }], renderers: [], exporters: [], templates: [],
  outputKinds: [{ id: 'prototype', supported: true }] };
const dataDir = (() => {
  const value = process.env.OD_DATA_DIR;
  if (!value) throw new Error('The daemon test setup must supply OD_DATA_DIR');
  return value;
})();
const runsLogDir = path.join(dataDir, 'runs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-bootstrap-'));
const snapshots: OdNextTaskInputSnapshotDescriptor[] = [];
const runIds: string[] = [];
const projectDirs: string[] = [];
let started: { url: string; server: Server; shutdown?: () => Promise<void> | void } | null = null;
let dispatcher: Agent | null = null;
let releaseTelemetry: (() => void) | null = null;

afterEach(async () => {
  releaseTelemetry?.();
  telemetry.pending = null;
  const ownedServer = started;
  try {
    // The production reconciliation promise intentionally is not awaited by
    // listen. Drain its real durable checkpoints before closing this test DB.
    if (ownedServer) await vi.waitFor(() => {
      for (const id of runIds) {
        const state = JSON.parse(fs.readFileSync(path.join(runsLogDir, id, 'state.json'), 'utf8'));
        expect(typeof state.langfuseCompletedAt).toBe('number');
      }
    });
  } finally {
    await ownedServer?.shutdown?.();
    await dispatcher?.destroy();
    if (ownedServer?.server.listening) await new Promise<void>(resolve => ownedServer.server.close(() => resolve()));
    closeDatabase();
    for (const descriptor of snapshots) removeOdNextTaskInputSnapshot(descriptor, path.join(scratch, 'task-inputs'));
    for (const id of runIds) fs.rmSync(path.join(runsLogDir, id), { recursive: true, force: true });
    for (const dir of projectDirs) fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});

// Seed crash-window inputs using real persistence APIs, then reopen SQLite and
// run the actual bootstrap/listen path. This is not a simulated process kill.
it('recovers saved planning replies before first HTTP hydration without reviving cancellation or starting a successor, while telemetry remains pending', async () => {
  vi.stubEnv('POSTHOG_KEY', '');
  vi.stubEnv('OD_NEXT_TASK_OBSERVABILITY_MODE', 'off');
  vi.stubEnv('OD_CODEX_TRANSPORT', 'exec-json');
  const bin = path.join(scratch, 'codex');
  const executionLog = path.join(scratch, 'unexpected-execution.log');
  const probeLog = path.join(scratch, 'capability-probes.log');
  fs.writeFileSync(bin, String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') { process.stdout.write('codex-cli 0.134.0\n'); process.exit(0); }
if (args.length === 1 && args[0] === '--help') { process.stdout.write('Usage: codex exec\n'); process.exit(0); }
// startServer warms these exact read-only probes via detectAgents. Keep their
// original nonzero response, so model/auth fallback behavior is unchanged.
if (args.length === 2 && ((args[0] === 'debug' && args[1] === 'models') || (args[0] === 'login' && args[1] === 'status'))) {
  fs.appendFileSync(${JSON.stringify(probeLog)}, JSON.stringify(args) + '\n'); process.exit(2);
}
fs.appendFileSync(${JSON.stringify(executionLog)}, JSON.stringify(process.argv) + '\n'); process.exit(2);
`, { mode: 0o755 });
  await writeAppConfig(dataDir, { agentId: AGENT_ID,
    agentCliEnv: { codex: { CODEX_BIN: bin, CODEX_HOME: scratch } },
    telemetry: { metrics: false, content: false, artifactManifest: false }, privacyDecisionAt: Date.now() });
  const db = openDatabase(process.cwd(), { dataDir });
  const fixtures = [];
  for (const window of ['saved-plan-only', 'provider-failed', 'user-canceled', 'consumed-produce-successor'] as const) {
    fixtures.push(await seedWindow(db, window));
  }
  // Task privacy tombstones suppress single-run reporting even in rollout off.
  // Use an ordinary, actually persisted failed run for the existing compatible
  // network seam; never enable telemetry consent merely to hit this gate.
  const ordinaryRuns = createChatRunService({ runsLogDir,
    createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
  } as unknown as Parameters<typeof createChatRunService>[0]);
  const ordinary = ordinaryRuns.create({ agentId: AGENT_ID });
  runIds.push(ordinary.id);
  ordinaryRuns.fail(ordinary, 'AGENT_EXECUTION_FAILED', 'Fixture ordinary provider failed.');
  telemetry.runId = ordinary.id;
  // Physical states and captured replies now exist before the server is constructed.
  closeDatabase();
  const preflight = vi.fn(() => EXECUTION);
  telemetry.pending = new Promise<void>(resolve => { releaseTelemetry = resolve; });
  started = await startServer({ port: 0, returnServer: true, odNextExecutionPreflightResolver: preflight }) as NonNullable<typeof started>;
  dispatcher = new Agent();
  await vi.waitFor(() => expect(telemetry.entered).toBe(true));
  // Do not release the telemetry gate until every first-read assertion completes.
  const ordinaryResponse = await fetch(`${started.url}/api/runs/${ordinary.id}`, { dispatcher });
  expect(ordinaryResponse.status).toBe(200);
  expect(await ordinaryResponse.json()).toMatchObject({ status: 'failed', errorCode: 'AGENT_EXECUTION_FAILED' });
  for (const fixture of fixtures) {
    const response = await fetch(`${started.url}/api/runs/${fixture.resolutionId}`, { dispatcher });
    expect(response.status).toBe(200);
    const expectedStatus = fixture.window === 'provider-failed' ? 'failed' : fixture.window === 'user-canceled' ? 'canceled' : 'succeeded';
    expect(await response.json()).toMatchObject({ status: expectedStatus });
    const reopened = openDatabase(process.cwd(), { dataDir });
    const task = getStrategyTaskExecution(reopened, fixture.taskId);
    expect(task?.intentResolution?.state).toBe('resolved');
    expect(task?.runs.filter(run => run.purpose === 'intent_resolution')).toHaveLength(1);
    if (fixture.window === 'saved-plan-only') {
      expect(task).toMatchObject({ outcome: 'completed', executionIntent: 'plan_only' });
      expect(task?.runs.filter(run => run.inputStage === 'production')).toHaveLength(0);
      const messages = await fetch(`${started.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`, { dispatcher });
      expect(messages.status).toBe(200);
      const body = await messages.json();
      expect(JSON.stringify(body)).toContain(REQUEST);
      expect(JSON.stringify(body)).toContain(SOURCE_TEXT);
    }
    if (fixture.successorId) {
      expect(task?.runs.filter(run => run.inputStage === 'production')).toHaveLength(1);
      const successor = await fetch(`${started.url}/api/runs/${fixture.successorId}`, { dispatcher });
      expect(successor.status).toBe(200);
      expect(await successor.json()).toMatchObject({ status: 'failed', errorCode: 'DAEMON_RESTARTED' });
    }
    expect(diffRunArtifacts(fixture.before, snapshotProjectArtifacts(fixture.cwd)).filesWritten).toBe(0);
  }
  // Wait for the real asynchronous startup detection, not a guessed delay.
  await vi.waitFor(() => {
    expect(fs.existsSync(probeLog)).toBe(true);
    const probes = fs.readFileSync(probeLog, 'utf8').trim().split('\n');
    expect([...new Set(probes)].sort()).toEqual(['["debug","models"]', '["login","status"]']);
  }, { timeout: 5_000 });
  console.log('BOOTSTRAP_CAPABILITY_PROBES', fs.readFileSync(probeLog, 'utf8'));
  expect(preflight).not.toHaveBeenCalled();
  expect(fs.existsSync(executionLog), fs.existsSync(executionLog) ? fs.readFileSync(executionLog, 'utf8') : undefined).toBe(false);
});

type Window = 'saved-plan-only' | 'provider-failed' | 'user-canceled' | 'consumed-produce-successor';
async function seedWindow(db: Database.Database, window: Window) {
  const projectId = `bootstrap-${window}`;
  const conversationId = `${projectId}-conversation`;
  insertProject(db, { id: projectId, name: projectId, createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: conversationId, projectId, title: window, createdAt: 1, updatedAt: 1 });
  const cwd = await ensureProject(path.join(dataDir, 'projects'), projectId);
  projectDirs.push(cwd);
  const before = snapshotProjectArtifacts(cwd);
  const evidence = () => ({ physicalStatus: 'succeeded' as const, deliverableValid: false,
    filesWritten: diffRunArtifacts(before, snapshotProjectArtifacts(cwd)).filesWritten,
    filesWrittenUnknown: false, filesWrittenSource: 'filesystem' as const });
  const sourcePath = path.resolve(import.meta.dirname, '../../../plugins/_official/scenarios/od-next-strategy');
  const resolved = await resolvePluginFolder({ folder: sourcePath, folderId: 'od-next-strategy', sourceKind: 'bundled', source: sourcePath, trust: 'bundled' });
  if (!resolved.ok) throw new Error(resolved.errors.join('; '));
  const snapshot = createSnapshot(db, { projectId, conversationId, runId: null,
    pluginId: 'od-next-strategy', pluginVersion: resolved.record.version,
    manifestSourceDigest: 'bootstrap-fixture', strategy: createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'prototype' }),
    taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] }, capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'], assetsStaged: [], connectorsRequired: [], connectorsResolved: [], mcpServers: [] });
  const runs = createChatRunService({ runsLogDir,
    createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
  } as unknown as Parameters<typeof createChatRunService>[0]);
  const create = () => { const run = runs.create({ projectId, conversationId, agentId: AGENT_ID }); runIds.push(run.id); return run; };
  const source = create();
  const taskId = `${projectId}-task`;
  const owner = createOdNextTaskInputSnapshot({ snapshotsRoot: path.join(scratch, 'task-inputs'), taskExecutionId: taskId,
    projectRoot: cwd, uploadRoot: cwd, taskConfiguration: buildOdNextTaskConfigurationV1({ taskType: 'prototype', locale: 'en',
      selectedAgentId: AGENT_ID, sessionMode: 'design', mediaExecution: { mode: 'enabled' } }) });
  snapshots.push(owner);
  Object.assign(source, { odNextTaskInputSnapshot: owner } satisfies Pick<ChatRun, 'odNextTaskInputSnapshot'>);
  const task = createStrategyTaskExecution(db, { taskExecutionId: taskId, projectId, conversationId, snapshotId: snapshot.snapshotId,
    selectedAgentId: AGENT_ID, initialRunId: source.id, ...strategyTaskCreateIdentityFixture(),
    taskInputManifestSha256: owner.manifestSha256, promptBundleText: realRequestBundle(snapshot, REQUEST) });
  const created: ReturnType<typeof create>[] = [];
  const service = {
    prepare: (input: Parameters<import('../src/services/internal-run-service.js').InternalRunCreationService<{ stage: string; instruction: string; taskRunIndex: number }, ReturnType<typeof create>>['prepare']>[0]) => {
      const run = create(); created.push(run);
      db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
      return { kind: 'ready' as const, run, creationKind: 'created' as const, resumed: false };
    }, start: vi.fn((run: ReturnType<typeof create>) => run),
  };
  const parsed = protocol([SOURCE_TEXT, block('open-design-plan-contract', planContract(snapshot)),
    block('open-design-runtime-state', { ...runtimeState({ outcome: 'plan_ready', executionMode: 'simple' }), executionIntent: undefined })].join('\n')).finish();
  const prepared = prepareAutomaticStrategyContinuation({ db, task, parsed, toolUseCount: 0, completionEvidence: evidence(), service,
    createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }) });
  expect(prepared.stage).toBe('intent_resolution');
  source.status = 'succeeded'; runs.persistState(source);
  const resolution = created[0];
  if (!resolution) throw new Error('Actual continuation did not claim an intent-resolution run');
  Object.assign(resolution, { odNextTaskInputSnapshot: owner } satisfies Pick<ChatRun, 'odNextTaskInputSnapshot'>);
  resolution.status = 'running'; runs.persistState(resolution);
  upsertMessage(db, conversationId, { id: `${taskId}-request`, role: 'user', content: REQUEST, createdAt: 1 });
  upsertMessage(db, conversationId, { id: `${taskId}-source`, role: 'assistant', content: SOURCE_TEXT, runId: source.id, runStatus: 'succeeded', createdAt: 2 });
  upsertMessage(db, conversationId, { id: `${taskId}-resolution`, role: 'assistant', content: '', runId: resolution.id, runStatus: 'running', createdAt: 3 });
  startIntentResolution(db, taskId, resolution.id);
  const produce = window === 'consumed-produce-successor';
  const reply = protocol(block('open-design-runtime-state', { ...runtimeState({ outcome: produce ? 'plan_ready' : 'completed', executionMode: 'simple' }),
    executionIntent: produce ? 'produce' : 'plan_only' })).finish();
  createStrategyRunWriteEvidenceRecorder(db).finish({ id: resolution.id, artifactOutcome: evidence() });
  captureIntentResolutionReply(db, { taskExecutionId: taskId, runId: resolution.id,
    replyJson: JSON.stringify({ runId: resolution.id, parsed: reply, toolUseCount: 0, completionEvidence: evidence() }) });
  if (window !== 'saved-plan-only') {
    const current = getStrategyTaskExecution(db, taskId);
    if (!current) throw new Error('Captured task missing');
    const consumed = prepareAutomaticStrategyContinuation({ db, task: current, parsed: reply, toolUseCount: 0,
      completionEvidence: evidence(), executionPreflight: EXECUTION, service,
      createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }) });
    expect(consumed.result.action).toBe(produce ? 'plan_ready' : 'completed');
  }
  if (window === 'provider-failed') runs.fail(resolution, 'AGENT_EXECUTION_FAILED', 'Fixture provider failed.');
  if (window === 'user-canceled') await runs.cancel(resolution, 'user_stop');
  expect(service.start).not.toHaveBeenCalled();
  return { window, projectId, conversationId, taskId, resolutionId: resolution.id, successorId: created[1]?.id, cwd, before };
}

function realRequestBundle(snapshot: AppliedPluginSnapshot, request: string) {
  const strategy = snapshot.strategy!;
  const assets = path.resolve(import.meta.dirname, "../../../plugins/_official/scenarios/od-next-strategy/assets");
  const head = composeOdNextStrategyBundleHeadV2({
    recipe: 'od-next-plan-build-v2', strategyId: 'od-next-strategy',
    strategyVersion: strategy.version, snapshotId: snapshot.snapshotId,
    packageHash: strategy.packageHash, taskProfileDigest: strategy.selectedTaskProfile.sha256,
    taskProfileVersion: strategy.selectedTaskProfile.version, taskType: 'prototype',
    executionProfile: 'filesystem',
    coreStrategy: fs.readFileSync(path.join(assets, 'core-system-prompt.md'), 'utf8'),
    generalOrchestration: fs.readFileSync(path.join(assets, 'general-orchestration.md'), 'utf8'),
    taskSkill: fs.readFileSync(path.join(assets, 'task-profiles/prototype.md'), 'utf8'),
    activeStages: [
      { name: 'discovery', atoms: [{ name: 'discovery-question-form' }] },
      { name: 'plan', atoms: [{ name: 'direction-picker' }, { name: 'todo-write' }] },
      { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
    ],
  });
  return serializeOdNextPromptBundleV2({ ...head,
    taskMetadata: { taskType: 'prototype', taskConfiguration: 'sessionMode: design' },
    context: { recipeIdentity: { recipe: 'od-next-plan-build-v2', strategyId: 'od-next-strategy', strategyVersion: strategy.version, appliedSnapshot: snapshot.snapshotId, taskProfileVersion: strategy.selectedTaskProfile.version } },
    userFirstPrompt: request,
  });
}

function planContract(snapshot: AppliedPluginSnapshot): OpenDesignPlanContractV2 {
  const strategy = snapshot.strategy!;
  return {
    schema: 'open-design.plan-contract/v2',
    strategy: {
      id: 'od-next-strategy',
      version: strategy.version,
      packageHash: strategy.packageHash,
      snapshotId: snapshot.snapshotId,
    },
    taskProfile: {
      schemaVersion: '2',
      taskType: 'prototype',
      taskProfileVersion: strategy.selectedTaskProfile.version,
      goal: 'Build a prototype',
      contextAndAudience: 'Product operators',
      inputsAndReferences: ['request'],
      constraints: [],
      canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
      requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
      designSpec: {
        source: 'resolved-baseline',
        version: '1',
        decisions: { palette: 'neutral' },
      },
      buildRequirements: [{ id: 'build', text: 'Build the prototype.' }],
      assumptions: [],
      risks: [],
      taskSpecific: {},
    },
    fullPlan: {
      executionMode: 'simple',
      steps: [{ id: 'build', objective: 'Build', outputs: ['prototype'] }],
      readinessArtifacts: [],
      buildPackages: [],
    },
    runManifest: {
      selectedAgentId: AGENT_ID,
      capabilitySnapshotHash: 'c'.repeat(64),
      inputRefs: ['request'],
      productionRoutes: ['html'],
      preflight: { intake: 'passed', execution: 'passed' },
    },
    decisionSummary: {
      goal: 'Build a prototype',
      deliverables: ['prototype'],
      keyConstraints: [],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

function block(tag: string, value: unknown, fenced = false): string {
  const json = JSON.stringify(value);
  return `<${tag}>\n${fenced ? `\`\`\`json\n${json}\n\`\`\`` : json}\n</${tag}>`;
}

function protocol(text: string): OdNextMachineProtocolStream {
  const stream = new OdNextMachineProtocolStream();
  for (let index = 0; index < text.length; index += 7) {
    stream.push(text.slice(index, index + 7));
  }
  return stream;
}

function runtimeState(input: {
  route?: 'direct_edit' | 'full_plan';
  inputStage?: 'request' | 'clarification' | 'contract_repair' | 'production';
  outcome: 'clarification_required' | 'plan_ready' | 'completed' | 'blocked';
  executionMode?: 'simple' | null;
}) {
  return {
    schema: 'open-design.strategy-state/v2' as const,
    executionIntent: 'produce' as const,
    route: input.route ?? 'full_plan',
    inputStage: input.inputStage ?? 'request',
    outcome: input.outcome,
    executionMode: input.executionMode === undefined ? null : input.executionMode,
    reasonCodes: [],
  };
}
