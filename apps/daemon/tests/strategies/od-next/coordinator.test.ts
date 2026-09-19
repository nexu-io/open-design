import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import { composeOdNextStrategyBundleHeadV2, serializeOdNextPromptBundleV2, StrategyTaskProjectionV2Schema } from '@open-design/contracts';
import type { AppliedPluginSnapshot, OpenDesignPlanContractV2 } from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase, upsertMessage, getMessage } from '../../../src/db.js';
import { validateRunDeliverable } from '../../../src/run-deliverable-validation.js';
import { snapshotProjectArtifacts, diffRunArtifacts } from '../../../src/run-artifact-fs.js';
import { createClaudeStreamHandler } from '../../../src/runtimes/claude-stream.js';
import { createChatRunService } from '../../../src/runtimes/runs.js';
import type { ChatRun } from '../../../src/runtimes/chat-run-records.js';
import { recoverPlanningIntentResolution } from '../../../src/strategies/od-next/intent-resolution-recovery.js';
import { createStrategyRunWriteEvidenceRecorder } from '../../../src/strategies/od-next/run-write-evidence.js';
import { buildOdNextTaskConfigurationV1, createOdNextTaskInputSnapshot, removeOdNextTaskInputSnapshot, type OdNextTaskInputSnapshotDescriptor } from '../../../src/strategies/od-next/task-input-snapshot.js';
import { reconcileDurableRunTerminals } from '../../../src/runtimes/run-terminal-reconciliation.js';
import { captureIntentResolutionReply, startIntentResolution } from '../../../src/strategies/od-next/intent-resolution-store.js';
import { createRunSideEffectLedger, foldEventIntoRunSideEffectLedger, runFilesWrittenForRun } from '../../../src/runtimes/run-lifecycle-analytics.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import {
  beginStrategyClarification,
  odNextTurnMayInferProductionCompletion,
  finalizeStrategyPlanningTurn as finalizeStrategyPlanningTurnRaw,
  prepareStrategyIntake,
  prepareStrategyRequest,
} from '../../../src/strategies/od-next/coordinator.js';
import { OdNextMachineProtocolStream } from '../../../src/strategies/od-next/protocol.js';
import {
  beginAutomaticSimpleProduction as beginAutomaticSimpleProductionRaw,
  blockAutomaticContinuation,
  completeAutomaticSimpleProduction,
  projectStrategyTask,
  prepareAutomaticStrategyContinuation,
  prepareAutomaticSimpleProductionRun,
} from '../../../src/strategies/od-next/automatic-simple-production.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  compareAndTransitionStrategyTaskExecution,
  migrateStrategyTaskStore,
  cancelStrategyTaskExecution,
} from '../../../src/strategies/task-store.js';
import {
  strategyTaskCreateIdentityFixture,
  strategyTaskTurnText,
} from '../strategy-task-test-fixtures.js';


// Real bundled strategy assets and the current contract renderer.
// Provider replies below are controlled omissions, NOT a captured production session.
function realRequestBundle(snapshot: AppliedPluginSnapshot, request: string) {
  const strategy = snapshot.strategy!;
  const assets = path.resolve(import.meta.dirname, "../../../../../plugins/_official/scenarios/od-next-strategy/assets");
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

const AGENT_ID = 'codex';

type FinalizeInput = Parameters<typeof finalizeStrategyPlanningTurnRaw>[1];
type TestFinalizeInput = Omit<FinalizeInput, 'repairRun'> & {
  repairRun?: Omit<NonNullable<FinalizeInput['repairRun']>, 'finalText'> & {
    finalText?: string;
  };
};

function finalizeStrategyPlanningTurn(
  db: Database.Database,
  input: TestFinalizeInput,
) {
  const task = getStrategyTaskExecution(db, input.taskExecutionId);
  if (input.repairRun && !task) throw new Error('test task missing');
  const repairRun = input.repairRun
    ? {
        ...input.repairRun,
        finalText: input.repairRun.finalText ?? strategyTaskTurnText({
          taskExecutionId: input.taskExecutionId,
          inputStage: 'contract_repair',
          taskRunIndex: task!.runs.length,
        }),
      }
    : undefined;
  const { repairRun: _repairRun, ...restValue } = input;
  const rest: Omit<FinalizeInput, 'repairRun'> = restValue;
  return finalizeStrategyPlanningTurnRaw(db, {
    ...rest,
    ...(repairRun ? { repairRun } : {}),
  });
}

type BeginProductionInput = Parameters<typeof beginAutomaticSimpleProductionRaw>[1];
function beginAutomaticSimpleProduction(
  db: Database.Database,
  input: Omit<BeginProductionInput, 'finalText'> & { finalText?: string },
) {
  return beginAutomaticSimpleProductionRaw(db, {
    ...input,
    finalText: input.finalText ?? strategyTaskTurnText({
      taskExecutionId: input.task.taskExecutionId,
      inputStage: 'production',
      taskRunIndex: input.task.runs.length,
    }),
  });
}

function requireHostProtocolMeta(meta: Record<string, unknown> | null): {
  instruction: string;
  doneKey: string;
} {
  if (!meta || typeof meta.instruction !== 'string' || typeof meta.doneKey !== 'string') {
    throw new Error('expected captured host protocol metadata');
  }
  return { instruction: meta.instruction, doneKey: meta.doneKey };
}

function strategyBinding() {
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
  ];
  return {
    schema: 'open-design.applied-strategy/v2' as const,
    id: 'od-next-strategy' as const,
    version: '2.0.0',
    packageHash: strategyPackageHashFromDigests(assetDigests),
    assetDigests,
    selectedTaskProfile: {
      taskType: 'prototype' as const,
      version: '2.0.0',
      path: './assets/task-profiles/prototype.md',
      sha256: 'b'.repeat(64),
    },
    taskProfileVersions: ['2.0.0'],
    promptRecipe: 'od-next-plan-build-v2' as const,
  };
}

function createStrategySnapshot(db: Database.Database): AppliedPluginSnapshot {
  return createSnapshot(db, {
    projectId: 'project-1',
    conversationId: 'conversation-1',
    runId: null,
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: 'manifest-digest',
    strategy: strategyBinding(),
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

const intakePassed = {
  inputRefs: [{ id: 'request', accessible: true }],
  selectedAgentAvailable: true,
  nativeContinuation: 'verified' as const,
  taskProfileAvailable: true,
  dependencies: [],
};

const executionPassed = {
  productionRoutes: [{ id: 'html', available: true }],
  dependencies: [],
  inputs: [{ id: 'request', available: true }],
  renderers: [],
  exporters: [],
  templates: [],
  outputKinds: [{ id: 'prototype', supported: true }],
};

const directEligible = {
  editableBaselineExists: true,
  localAndUnambiguous: true,
  canonicalDeliverableStable: true,
  deliverableSetStable: true,
  dependenciesBounded: true,
};

describe('OD Next planning coordinator', () => {
  let tempDir: string;
  let db: Database.Database;
  let snapshot: AppliedPluginSnapshot;
  const startupSnapshots: OdNextTaskInputSnapshotDescriptor[] = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-coordinator-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project 1', 1, 1);
    db.prepare(
      `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conversation-1', 'project-1', 'Conversation 1', 1, 1);
    snapshot = createStrategySnapshot(db);
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-request',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const descriptor of startupSnapshots.splice(0)) removeOdNextTaskInputSnapshot(descriptor, path.join(tempDir, 'task-inputs'));
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function measuredNoWriteEvidence(writeDraft = false) {
    const cwd = path.join(tempDir, 'readonly-provider-cwd');
    fs.mkdirSync(cwd, { recursive: true });
    const before = snapshotProjectArtifacts(cwd);
    if (writeDraft) fs.writeFileSync(path.join(cwd, 'draft.html'), '<title>Unrequested first-turn draft</title>');
    // Observe the real fixture filesystem, including the deliberately violating first turn.
    const after = snapshotProjectArtifacts(cwd);
    return { physicalStatus: 'succeeded' as const, deliverableValid: false,
      filesWritten: diffRunArtifacts(before, after).filesWritten,
      filesWrittenUnknown: false, filesWrittenSource: 'filesystem' as const };
  }

  it.each(['saved-plan-only', 'consumed-physical-running', 'no-reply', 'produce-without-context', 'cancel-wins', 'hydrate-before-reconcile', 'state-write-failure', 'state-write-failure-then-hydrate', 'source-wrote', 'source-unknown', 'source-parser-defect', 'missing-owner', 'wrong-owner', 'cancel-origin', 'consumed-produce-successor', 'consumed-provider-failed', 'consumed-user-canceled', 'first-wrote-three-runs', 'first-unknown-three-runs'] as const)(
    'OPEND-2623 startup ordering: %s', async (window) => {
      const runsLogDir = path.join(tempDir, 'runs');
      const makeRuns = () => createChatRunService({
        createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
        createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
        runsLogDir,
      } as unknown as Parameters<typeof createChatRunService>[0]);
      const runs = makeRuns();
      let source = runs.create({ projectId: 'project-1', conversationId: 'conversation-1', agentId: AGENT_ID });
      const identity = strategyTaskCreateIdentityFixture();
      const owner = createOdNextTaskInputSnapshot({
        snapshotsRoot: path.join(tempDir, 'task-inputs'), taskExecutionId: 'startup-intent-task',
        projectRoot: tempDir, uploadRoot: tempDir,
        taskConfiguration: buildOdNextTaskConfigurationV1({ taskType: 'prototype', locale: 'en', selectedAgentId: AGENT_ID,
          sessionMode: 'design', mediaExecution: { mode: 'enabled' } }),
      });
      startupSnapshots.push(owner);
      Object.assign(source, { odNextTaskInputSnapshot: owner } satisfies Pick<ChatRun, 'odNextTaskInputSnapshot'>);
      let task = createStrategyTaskExecution(db, {
        taskExecutionId: 'startup-intent-task', projectId: 'project-1', conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: source.id,
        ...identity, taskInputManifestSha256: owner.manifestSha256, promptBundleText: realRequestBundle(snapshot, 'Do not create or modify files.'), createdAt: 100,
      });
      if (window === 'first-wrote-three-runs' || window === 'first-unknown-three-runs') {
        const question = '<question-form id="startup-question">{"questions":[{"id":"audience","type":"text","label":"Audience","required":true}]}</question-form>';
        const requested = finalizeStrategyPlanningTurnRaw(db, {
          taskExecutionId: task.taskExecutionId, runId: source.id, protocol: protocol(question), updatedAt: 105,
          completionEvidence: { ...measuredNoWriteEvidence(window === 'first-wrote-three-runs'), filesWrittenUnknown: window === 'first-unknown-three-runs' },
        });
        expect(requested.action).toBe('awaiting_clarification');
        const answerRun = runs.create({ projectId: 'project-1', conversationId: 'conversation-1', agentId: AGENT_ID });
        Object.assign(answerRun, { odNextTaskInputSnapshot: owner } satisfies Pick<ChatRun, 'odNextTaskInputSnapshot'>);
        const clarified = beginStrategyClarification(db, {
          taskExecutionId: task.taskExecutionId, sourceRunId: source.id, nextRunId: answerRun.id,
          answer: '[form answers — startup-question]\n- Audience: Investors', updatedAt: 108,
        });
        source.status = 'succeeded'; runs.persistState(source);
        source = answerRun;
        task = clarified.task;
      }
      const parsed = protocol([
        'The original plan is available in chat.',
        window === 'source-parser-defect'
          ? `<open-design-plan-contract>\n\`\`\`json\n${JSON.stringify(planContract(snapshot))}\n\`\`\`\n</open-design-plan-contract>`
          : block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', { ...runtimeState({ inputStage: task.inputStage, outcome: 'plan_ready', executionMode: 'simple' }), executionIntent: undefined }),
      ].join('\n')).finish();
      const created: ReturnType<typeof runs.create>[] = [];
      const service = {
        prepare: (input: Parameters<import('../../../src/services/internal-run-service.js').InternalRunCreationService<{ stage: string; instruction: string; taskRunIndex: number }, ReturnType<typeof runs.create>>['prepare']>[0]) => {
          const run = runs.create({ projectId: 'project-1', conversationId: 'conversation-1', agentId: AGENT_ID });
          created.push(run);
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready' as const, run, creationKind: 'created' as const, resumed: false };
        }, start: vi.fn((run: ReturnType<typeof runs.create>) => run),
      };
      const prepared = prepareAutomaticStrategyContinuation({
        db, task, parsed, toolUseCount: 0, completionEvidence: { ...measuredNoWriteEvidence(window === 'source-wrote'), filesWrittenUnknown: window === 'source-unknown' }, service,
        createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 110,
      });
      expect(prepared.stage).toBe('intent_resolution');
      source.status = 'succeeded'; runs.persistState(source);
      const resolution = created[0]!;
      Object.assign(resolution, { odNextTaskInputSnapshot: window === 'missing-owner' ? null
        : window === 'wrong-owner' ? { ...owner, manifestSha256: '0'.repeat(64) } : owner,
        cancelOrigin: window === 'cancel-origin' ? 'user_stop' : null,
      } satisfies Pick<ChatRun, 'odNextTaskInputSnapshot' | 'cancelOrigin'>);
      resolution.status = 'running'; runs.persistState(resolution);
      upsertMessage(db, 'conversation-1', { id: 'startup-resolution-message', role: 'assistant', content: '', runId: resolution.id, runStatus: 'running', createdAt: 110 });
      startIntentResolution(db, task.taskExecutionId, resolution.id);
      const reply = protocol(block('open-design-runtime-state', {
        ...runtimeState({ inputStage: task.inputStage, outcome: window === 'produce-without-context' || window === 'consumed-produce-successor' ? 'plan_ready' : 'completed', executionMode: 'simple' }),
        executionIntent: window === 'produce-without-context' || window === 'consumed-produce-successor' ? 'produce' : 'plan_only',
      })).finish();
      // Same terminal evidence recorder used by the server, before durable reply capture.
      createStrategyRunWriteEvidenceRecorder(db).finish({ id: resolution.id, artifactOutcome: measuredNoWriteEvidence() });
      if (window !== 'no-reply') captureIntentResolutionReply(db, {
        taskExecutionId: task.taskExecutionId, runId: resolution.id,
        replyJson: JSON.stringify({ runId: resolution.id, parsed: reply, toolUseCount: 0, completionEvidence: measuredNoWriteEvidence() }),
      });
      if (window === 'consumed-physical-running' || window === 'consumed-produce-successor' || window === 'consumed-provider-failed' || window === 'consumed-user-canceled') {
        const completed = prepareAutomaticStrategyContinuation({
          db, task: getStrategyTaskExecution(db, task.taskExecutionId)!, parsed: reply,
          toolUseCount: 0, completionEvidence: measuredNoWriteEvidence(), executionPreflight: executionPassed, service,
          createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 120,
        });
        expect(completed.result.action).toBe(window === 'consumed-produce-successor' ? 'plan_ready' : 'completed');
        expect(JSON.parse(fs.readFileSync(resolution.statePath!, 'utf8')).status).toBe('running');
      }
      if (window === 'consumed-provider-failed') runs.fail(resolution, 'AGENT_EXECUTION_FAILED', 'Fixture provider failed.');
      if (window === 'consumed-user-canceled') await runs.cancel(resolution, 'user_stop');
      if (window === 'cancel-wins') {
        const current = getStrategyTaskExecution(db, task.taskExecutionId)!;
        cancelStrategyTaskExecution(db, { taskExecutionId: task.taskExecutionId, expectedRevision: current.revision, updatedAt: 130 });
      }
      closeDatabase(); db = openDatabase(tempDir, { dataDir: tempDir });
      // Reproduce the production order: startup reads durable states directly.
      // Calling get before that is separately observed as destructive hydration.
      const restarted = makeRuns();
      if (window === 'hydrate-before-reconcile') {
        expect(restarted.get(resolution.id)?.status).toBe('failed');
        expect(JSON.parse(fs.readFileSync(resolution.statePath!, 'utf8')).errorCode).toBe('DAEMON_RESTARTED');
      }
      const reconcile = () => reconcileDurableRunTerminals({
        db, runsLogDir, appVersion: 'fixture', analytics: { capture: vi.fn(async () => undefined) },
        recoverBeforeInterrupt: (state, states, now) => recoverPlanningIntentResolution(db, state, states, now),
        reportLangfuse: vi.fn(async () => ({ langfuse_expected: false, langfuse_delivery_status: 'not_expected' as const })),
      });
      if (window === 'state-write-failure' || window === 'state-write-failure-then-hydrate') {
        const rename = fs.renameSync;
        const failure = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
          if (to === resolution.statePath) throw new Error('fixture terminal state rename denied');
          return rename(from, to);
        });
        await reconcile();
        expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({ outcome: 'completed', intentResolution: { state: 'resolved' } });
        expect(JSON.parse(fs.readFileSync(resolution.statePath!, 'utf8')).status).toBe('running');
        expect(getMessage(db, 'startup-resolution-message')?.runStatus).toBe('running');
        failure.mockRestore();
        if (window === 'state-write-failure-then-hydrate') {
          expect(restarted.get(resolution.id)?.status).toBe('failed');
          expect(JSON.parse(fs.readFileSync(resolution.statePath!, 'utf8')).errorCode).toBe('DAEMON_RESTARTED');
        }
        closeDatabase(); db = openDatabase(tempDir, { dataDir: tempDir });
      }
      await reconcile();
      const recovered = getStrategyTaskExecution(db, task.taskExecutionId)!;
      const state = JSON.parse(fs.readFileSync(resolution.statePath!, 'utf8'));
      expect(service.start).not.toHaveBeenCalled();
      expect(created).toHaveLength(window === 'consumed-produce-successor' ? 2 : 1);
      expect(recovered.runs.filter(run => run.purpose === 'intent_resolution')).toHaveLength(1);
      if (window === 'saved-plan-only' || window === 'consumed-physical-running' || window === 'state-write-failure' || window === 'state-write-failure-then-hydrate') {
        expect({ task: recovered.outcome, physical: state.status }).toEqual({ task: 'completed', physical: 'succeeded' });
        const hydrated = makeRuns().get(resolution.id);
        expect(hydrated?.status).toBe('succeeded');
        expect(hydrated?.events).not.toEqual(expect.arrayContaining([
          expect.objectContaining({ event: 'error', data: expect.objectContaining({ error: expect.objectContaining({ code: 'DAEMON_RESTARTED' }) }) }),
        ]));
        expect(hydrated?.events).not.toEqual(expect.arrayContaining([
          expect.objectContaining({ event: 'end', data: expect.objectContaining({ status: 'failed' }) }),
        ]));
        expect(state.terminalRecoveryReason).not.toBe('daemon_restart');
        expect(state.terminalTrigger).not.toBe('daemon_restart');
      } else if (window === 'consumed-provider-failed' || window === 'consumed-user-canceled') {
        expect(recovered.outcome).toBe('completed');
        expect(state.status).toBe(window === 'consumed-user-canceled' ? 'canceled' : 'failed');
        if (window === 'consumed-provider-failed') expect(state.errorCode).toBe('AGENT_EXECUTION_FAILED');
      } else if (window === 'consumed-produce-successor') {
        expect(state.status).toBe('succeeded');
        expect(recovered.intentResolution?.state).toBe('resolved');
        expect(recovered.outcome).toBe('blocked');
        expect(JSON.parse(fs.readFileSync(created[1]!.statePath!, 'utf8'))).toMatchObject({ status: 'failed', errorCode: 'DAEMON_RESTARTED' });
      } else if (window === 'source-wrote' || window === 'source-unknown' || window === 'source-parser-defect' || window === 'first-wrote-three-runs' || window === 'first-unknown-three-runs') {
        expect({ task: recovered.outcome, physical: state.status }).toEqual({ task: 'blocked', physical: 'succeeded' });
        expect(recovered.blockedContext?.reasonCodes).toContain(window === 'source-parser-defect'
          ? 'od_next_protocol_plan_contract_invalid_json' : 'od_next_planning_files_changed');
      } else {
        expect(recovered.outcome).toBe(window === 'cancel-wins' ? 'canceled' : 'blocked');
        expect(state).toMatchObject({ status: 'failed', errorCode: 'DAEMON_RESTARTED' });
      }
    },
  );

  it('keeps local restart interruption before pending network telemetry without treating the entire reconciliation promise as a startup barrier', async () => {
    const runsLogDir = path.join(tempDir, 'runs');
    const runs = createChatRunService({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }), runsLogDir,
    } as unknown as Parameters<typeof createChatRunService>[0]);
    const run = runs.create({ projectId: 'project-1', conversationId: 'conversation-1', agentId: AGENT_ID });
    runs.setAnalyticsRecovery(run, { context: {}, properties: { run_id: run.id }, insertId: 'startup-network-boundary' });
    run.status = 'running'; runs.persistState(run);
    let release!: () => void;
    let entered!: () => void;
    const network = new Promise<void>(resolve => { release = resolve; });
    const networkEntered = new Promise<void>(resolve => { entered = resolve; });
    let settled = false;
    const pending = reconcileDurableRunTerminals({
      db, runsLogDir, appVersion: 'fixture',
      analytics: { capture: async () => { entered(); await network; } },
      reportLangfuse: vi.fn(async () => ({ langfuse_expected: false, langfuse_delivery_status: 'not_expected' as const })),
    }).then(result => { settled = true; return result; });
    try {
      await networkEntered;
      expect(JSON.parse(fs.readFileSync(run.statePath!, 'utf8'))).toMatchObject({ status: 'failed', errorCode: 'DAEMON_RESTARTED' });
      expect(settled).toBe(false);
    } finally { release(); await pending; }
  });

  it('routes a new request once and completes an eligible Direct Edit in its request Run', () => {
    const prepared = prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'auto',
      directEdit: directEligible,
      intake: intakePassed,
      execution: executionPassed,
      updatedAt: 110,
    });
    expect(prepared.task).toMatchObject({
      route: 'direct_edit',
      executionMode: 'simple',
      inputStage: 'request',
      outcome: 'running',
    });
    expect(() => prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
    })).toThrowError(expect.objectContaining({
      reasonCodes: ['od_next_route_already_locked'],
    }));

    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        'Updated the existing header.',
        block('open-design-runtime-state', runtimeState({
          route: 'direct_edit',
          outcome: 'completed',
          executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 120,
    });
    expect(final).toMatchObject({
      action: 'completed',
      visibleText: 'Updated the existing header.\n',
      reasonCodes: [],
      task: { outcome: 'completed' },
    });
  });

  it('persists the one clarification round and refuses a second question after restart', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const awaiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    expect(awaiting).toMatchObject({
      action: 'awaiting_clarification',
      task: { outcome: 'clarification_required', clarificationCount: 0 },
    });

    const continued = beginStrategyClarification(db, {
      taskExecutionId: 'task-1',
      sourceRunId: 'run-request',
      nextRunId: 'run-clarification',
      answer: 'Use the operator console.',
      updatedAt: 130,
    });
    expect(continued).toMatchObject({
      instruction: {
        stage: 'clarification',
        nativeSessionResume: true,
        answer: 'Use the operator console.',
      },
      task: { inputStage: 'clarification', clarificationCount: 1 },
    });

    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    const repeated = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        inputStage: 'clarification',
        outcome: 'blocked',
      }))}`),
      updatedAt: 140,
    });
    expect(repeated).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_clarification_repeated'],
      task: { outcome: 'blocked', clarificationCount: 1 },
    });
  });

  // OPEND-2954 (0.22.1-prerelease.9, deepseek-v4-flash): the user answered the
  // one clarification round, and the agent came back with a complete, correctly
  // bound Full Plan whose Runtime State still said `inputStage: "request"` — the
  // value every example in the protocol reference shows, and the only stage the
  // clarification continuation never names. The coordinator refused the turn on
  // that field alone, the task went terminal-`blocked`, and a plan that would
  // have passed every other gate never reached production. The stage is
  // host-owned truth (the daemon wrote it into the turn wrapper), so a
  // declaration that disagrees with it carries no authority: adopt the host's
  // stage when the corrected state is a valid declaration for it.
  function answerTheOneClarificationRound(): void {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1',
      sourceRunId: 'run-request',
      nextRunId: 'run-clarification',
      answer: 'Both audiences; one 40-minute lesson.',
      updatedAt: 130,
    });
  }

  it('accepts a clarification turn whose plan-ready state still names the request stage', () => {
    answerTheOneClarificationRound();
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol([
        'Direction settled; building next.',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'request', outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 140,
    });
    expect(final).toMatchObject({
      action: 'plan_ready',
      reasonCodes: [],
      decisionSummary: plan.decisionSummary,
      task: {
        inputStage: 'clarification',
        outcome: 'plan_ready',
        executionMode: 'simple',
        clarificationCount: 1,
        planContract: plan,
      },
    });
  });

  it.each(['plan_only', 'produce'] as const)(
    'preserves locked %s intent when a clarification reply still declares request/plan_ready',
    (executionIntent) => {
      prepareStrategyRequest(db, {
        taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
        intake: intakePassed, updatedAt: 110,
      });
      const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
      const requested = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: 'task-1', runId: 'run-request', updatedAt: 120,
        protocol: protocol(`${question}\n${block('open-design-runtime-state', {
          ...runtimeState({ outcome: 'clarification_required' }), executionIntent,
        })}`),
        completionEvidence: measuredNoWriteEvidence(),
      });
      expect(requested).toMatchObject({
        action: 'awaiting_clarification', task: { executionIntent },
      });
      const clarification = beginStrategyClarification(db, {
        taskExecutionId: 'task-1', sourceRunId: 'run-request', nextRunId: 'run-clarification',
        answer: 'Use the operator console.', updatedAt: 130,
      });
      expect(clarification.task).toMatchObject({ inputStage: 'clarification', executionIntent });
      closeDatabase();
      db = openDatabase(tempDir, { dataDir: tempDir });

      const plan = planContract(snapshot);
      if (executionIntent === 'plan_only') {
        plan.taskProfile.constraints = ['Do not create or modify files'];
        plan.decisionSummary.keyConstraints = [...plan.taskProfile.constraints];
      }
      const final = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: 'task-1', runId: 'run-clarification', updatedAt: 140,
        protocol: protocol([
          'The plan is ready for review; the project files have not been changed.',
          block('open-design-plan-contract', plan),
          // Older providers omit intent and copy the request-stage example.
          // Neither omission may widen the intent already saved by the host.
          block('open-design-runtime-state', {
            ...runtimeState({ inputStage: 'request', outcome: 'plan_ready', executionMode: 'simple' }),
            executionIntent: undefined,
          }),
        ].join('\n')),
        executionPreflight: executionPassed,
        completionEvidence: measuredNoWriteEvidence(),
      });
      const outcome = executionIntent === 'plan_only' ? 'completed' : 'plan_ready';
      expect(final).toMatchObject({
        action: outcome, reasonCodes: [], decisionSummary: plan.decisionSummary,
        task: { inputStage: 'clarification', outcome, executionIntent, clarificationCount: 1, planContract: plan },
      });
      const persisted = getStrategyTaskExecution(db, 'task-1')!;
      expect(persisted.runs.map(run => run.inputStage)).toEqual(['request', 'clarification']);
      expect(StrategyTaskProjectionV2Schema.parse(projectStrategyTask(persisted)).terminal)
        .toBe(executionIntent === 'plan_only');
      expect(fs.readdirSync(path.join(tempDir, 'readonly-provider-cwd'))).toEqual([]);
    },
  );

  it('keeps the agent-declared attribution of a clarification block that names the request stage', () => {
    answerTheOneClarificationRound();
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol(`The answer contradicts the brief; nothing to plan.\n${block('open-design-runtime-state', runtimeState({
        inputStage: 'request', outcome: 'blocked',
      }))}`),
      updatedAt: 140,
    });
    // Same shape as any agent-declared block: the stage the agent wrote is not
    // promoted into a reason code, so the attribution stays the agent's own.
    expect(final).toMatchObject({
      action: 'blocked',
      reasonCodes: [],
      task: {
        inputStage: 'clarification',
        outcome: 'blocked',
        blockedContext: {
          reasonCodes: ['od_next_agent_declared_block'],
          visibleText: 'The answer contradicts the brief; nothing to plan.\n',
        },
      },
    });
  });

  it('still refuses a clarification turn whose outcome the host stage cannot admit', () => {
    answerTheOneClarificationRound();
    const question = '<question-form id="again">{"questions":[{"id":"tone","label":"Tone?"}]}</question-form>';
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        inputStage: 'request', outcome: 'clarification_required',
      }))}`),
      updatedAt: 140,
    });
    expect(final.action).toBe('blocked');
    expect(final.reasonCodes).toEqual(expect.arrayContaining([
      'od_next_protocol_stage_mismatch',
      'od_next_clarification_repeated',
    ]));
    expect(final.task).toMatchObject({ inputStage: 'clarification', outcome: 'blocked' });
  });

  it('anchors a clarification-turn repair on a plan whose state names the request stage', () => {
    answerTheOneClarificationRound();
    const plan = planContract(snapshot);
    const repair = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol([
        block('open-design-plan-contract', plan, true),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'request', outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      repairRun: { runId: 'run-repair', sourceRunId: 'run-clarification' },
      executionPreflight: executionPassed,
      updatedAt: 140,
    });
    expect(repair).toMatchObject({
      action: 'contract_repair',
      task: {
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
        planContractRepairAttempts: 1,
        planContract: plan,
      },
    });
  });

  it('persists a valid Full Plan and returns only its decision summary as structured output', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        'Planning complete.',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(final).toMatchObject({
      action: 'plan_ready',
      visibleText: 'Planning complete.\n\n',
      decisionSummary: plan.decisionSummary,
      task: {
        outcome: 'plan_ready',
        executionMode: 'simple',
        planContract: plan,
      },
    });
  });

  // Observed on a real OD Next turn: the agent decided it had nothing to ask
  // and STILL wrote the literal marker as a declaration line —
  // `<question-form> 无需提出——…` — unclosed, prose instead of JSON. The
  // renderable count is 0 for such a turn, so the coordinator scored it as a
  // clean no-clarification turn and recorded nothing at all. The stray marker
  // is a contract violation the daemon must report, but it is NOT a gate: the
  // planning turn still has to reach production.
  it('reports a stray question-form marker without blocking the handoff', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        '策略判断信息充足，将直接进入生产。\n\n<question-form> 无需提出',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(final.action).toBe('plan_ready');
    expect(final.task).toMatchObject({ outcome: 'plan_ready', executionMode: 'simple' });
    expect(final.reasonCodes).toContain('od_next_question_form_unterminated');
  });

  it('reports a closed question-form block the parser cannot render', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        'Planning complete. <question-form>无需提出</question-form>',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(final.action).toBe('plan_ready');
    expect(final.reasonCodes).toContain('od_next_question_form_unrenderable');
  });

  // A genuine, renderable form on a clarification turn must stay clean — the
  // new signal only fires on markers that can never render.
  it('raises no marker signal for a renderable clarification form', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>',
        block('open-design-runtime-state', runtimeState({ outcome: 'clarification_required' })),
      ].join('\n')),
      updatedAt: 120,
    });
    expect(final.action).toBe('awaiting_clarification');
    expect(final.reasonCodes).toEqual([]);
  });

  // OPEND-2364. The agent wrapped its clarification form in a duplicate of its
  // own open tag. The chat renders that: the web parser treats an outer block
  // whose body fails to parse but holds another open marker as a false
  // positive and unwinds to the inner form. The daemon's mirror had no such
  // unwind, scored the turn as carrying zero renderable forms, and blocked the
  // task on `od_next_clarification_form_missing` — leaving the user filling in
  // a live form whose answer came back 409 STRATEGY_TASK_STATE_MISMATCH,
  // because the task it belonged to was already terminal.
  //
  // The turn must be accepted exactly as the un-wrapped form above is: what
  // the daemon settles has to be what the user is looking at.
  it('accepts a clarification form the chat renders through a duplicated wrapper tag', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        '<question-form id="scope" title="Quick check">',
        '<question-form id="scope" title="Quick check">',
        '{"questions":[{"id":"surface","label":"Surface?"}]}',
        '</question-form>',
        '</question-form>',
        block('open-design-runtime-state', runtimeState({ outcome: 'clarification_required' })),
      ].join('\n')),
      updatedAt: 120,
    });
    expect(final.action).toBe('awaiting_clarification');
    expect(final.task).toMatchObject({ outcome: 'clarification_required' });
    expect(final.reasonCodes).not.toContain('od_next_clarification_form_missing');
    expect(final.reasonCodes).not.toContain('od_next_question_form_unrenderable');
  });

  it('allows one serialization-only repair only with a durable semantic hash anchor', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const repair = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', plan, true),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      repairRun: { runId: 'run-repair', sourceRunId: 'run-request' },
      toolUseCount: 2,
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(repair).toMatchObject({
      action: 'contract_repair',
      instruction: {
        stage: 'contract_repair',
        nativeSessionResume: true,
      },
      task: {
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
        planContractRepairAttempts: 1,
        planContract: plan,
      },
    });

    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    const repaired = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-repair',
      protocol: protocol([
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'contract_repair',
          outcome: 'plan_ready',
          executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 130,
    });
    expect(repaired).toMatchObject({
      action: 'plan_ready',
      task: { outcome: 'plan_ready', planContractRepairAttempts: 1 },
    });
  });

  it('blocks duplicate blocks, semantic drift, tools in repair, and unanchored malformed plans', () => {
    const cases = [
      {
        name: 'duplicate',
        text: (plan: OpenDesignPlanContractV2) => [
          block('open-design-plan-contract', plan),
          block('open-design-plan-contract', plan),
          block('open-design-runtime-state', runtimeState({ outcome: 'plan_ready', executionMode: 'simple' })),
        ].join('\n'),
        reason: 'od_next_protocol_plan_contract_duplicate',
      },
      {
        name: 'unanchored',
        text: () => [
          '<open-design-plan-contract>\n{not-json}\n</open-design-plan-contract>',
          block('open-design-runtime-state', runtimeState({ outcome: 'plan_ready', executionMode: 'simple' })),
        ].join('\n'),
        reason: 'od_next_protocol_plan_contract_invalid_json',
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const taskId = `task-${index + 2}`;
      const runId = `run-${index + 2}`;
      createStrategyTaskExecution(db, {
        taskExecutionId: taskId,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId,
        selectedAgentId: AGENT_ID,
        initialRunId: runId,
        ...strategyTaskCreateIdentityFixture(),
        createdAt: 200 + index * 20,
      });
      prepareStrategyRequest(db, {
        taskExecutionId: taskId,
        preference: 'full_plan',
        directEdit: directEligible,
        intake: intakePassed,
        updatedAt: 201 + index * 20,
      });
      const result = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: taskId,
        runId,
        protocol: protocol(testCase.text(planContract(snapshot))),
        repairRun: { runId: `${runId}-repair`, sourceRunId: runId },
        updatedAt: 202 + index * 20,
      });
      expect(result.action, testCase.name).toBe('blocked');
      expect(result.reasonCodes, testCase.name).toContain(testCase.reason);
    }

    const original = planContract(snapshot);
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 300,
    });
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', original, true),
        block('open-design-runtime-state', runtimeState({ outcome: 'plan_ready', executionMode: 'simple' })),
      ].join('\n')),
      repairRun: { runId: 'run-repair', sourceRunId: 'run-request' },
      executionPreflight: executionPassed,
      updatedAt: 301,
    });
    const changed = structuredClone(original);
    changed.taskProfile.goal = 'Changed semantic goal';
    changed.decisionSummary.goal = 'Changed semantic goal';
    const drift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-repair',
      protocol: protocol([
        block('open-design-plan-contract', changed),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'contract_repair', outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 302,
    });
    expect(drift).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_contract_repair_semantic_drift'],
    });
  });

  it('blocks locked route drift and any tool use during contract repair', () => {
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-route-drift',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-route-drift',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 400,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-route-drift',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 401,
    });
    const drift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-route-drift',
      runId: 'run-route-drift',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', outcome: 'completed', executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 402,
    });
    expect(drift).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_protocol_route_mismatch'],
    });

    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-profile-drift',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-profile-drift',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 405,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-profile-drift',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 406,
    });
    const mismatchedProfile = planContract(snapshot);
    mismatchedProfile.taskProfile.taskType = 'ppt';
    const profileDrift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-profile-drift',
      runId: 'run-profile-drift',
      protocol: protocol([
        block('open-design-plan-contract', mismatchedProfile),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 407,
    });
    expect(profileDrift).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_plan_task_profile_mismatch'],
    });

    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-repair-tools',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-repair-tools-request',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 410,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-repair-tools',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 411,
    });
    const plan = planContract(snapshot);
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-repair-tools',
      runId: 'run-repair-tools-request',
      protocol: protocol([
        block('open-design-plan-contract', plan, true),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      repairRun: {
        runId: 'run-repair-tools',
        sourceRunId: 'run-repair-tools-request',
      },
      executionPreflight: executionPassed,
      updatedAt: 412,
    });
    const toolUse = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-repair-tools',
      runId: 'run-repair-tools',
      protocol: protocol([
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'contract_repair', outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      toolUseCount: 1,
      executionPreflight: executionPassed,
      updatedAt: 413,
    });
    expect(toolUse).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_contract_repair_tool_use_forbidden'],
    });
  });

  it('maps strict and repair-anchor Plan identity drift to stable blocked reasons', () => {
    const cases: Array<{
      name: string;
      reason: string;
      mutate: (plan: OpenDesignPlanContractV2) => void;
    }> = [
      {
        name: 'snapshot',
        reason: 'od_next_plan_snapshot_mismatch',
        mutate: (plan) => { plan.strategy.snapshotId = 'snapshot-drift'; },
      },
      {
        name: 'version',
        reason: 'od_next_plan_strategy_version_mismatch',
        mutate: (plan) => { plan.strategy.version = '2.0.1'; },
      },
      {
        name: 'package-hash',
        reason: 'od_next_plan_strategy_package_hash_mismatch',
        mutate: (plan) => { plan.strategy.packageHash = 'd'.repeat(64); },
      },
      {
        name: 'selected-agent',
        reason: 'od_next_plan_selected_agent_mismatch',
        mutate: (plan) => { plan.runManifest.selectedAgentId = 'claude'; },
      },
    ];

    let sequence = 0;
    for (const testCase of cases) {
      for (const repairAnchor of [false, true]) {
        sequence += 1;
        const taskId = `task-identity-${sequence}`;
        const runId = `run-identity-${sequence}`;
        createStrategyTaskExecution(db, {
          taskExecutionId: taskId,
          projectId: 'project-1',
          conversationId: 'conversation-1',
          snapshotId: snapshot.snapshotId,
          selectedAgentId: AGENT_ID,
          initialRunId: runId,
          ...strategyTaskCreateIdentityFixture(),
          createdAt: 500 + sequence * 10,
        });
        prepareStrategyRequest(db, {
          taskExecutionId: taskId,
          preference: 'full_plan',
          directEdit: directEligible,
          intake: intakePassed,
          updatedAt: 501 + sequence * 10,
        });
        const drifted = planContract(snapshot);
        testCase.mutate(drifted);
        const result = finalizeStrategyPlanningTurn(db, {
          taskExecutionId: taskId,
          runId,
          protocol: protocol([
            block('open-design-plan-contract', drifted, repairAnchor),
            block('open-design-runtime-state', runtimeState({
              outcome: 'plan_ready', executionMode: 'simple',
            })),
          ].join('\n')),
          ...(repairAnchor
            ? { repairRun: { runId: `${runId}-repair`, sourceRunId: runId } }
            : {}),
          executionPreflight: executionPassed,
          updatedAt: 502 + sequence * 10,
        });
        expect(result.action, `${testCase.name}/${repairAnchor ? 'repair' : 'strict'}`).toBe(
          'blocked',
        );
        expect(
          result.reasonCodes,
          `${testCase.name}/${repairAnchor ? 'repair' : 'strict'}`,
        ).toContain(testCase.reason);
        expect(result.task.outcome).toBe('blocked');
      }
    }
  });

  it('atomically advances a hash-bound plan into one simple production Run', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });

    const production = beginAutomaticSimpleProduction(db, {
      task: planned.task,
      sourceRunId: 'run-request',
      nextRunId: 'run-production',
      updatedAt: 130,
    });
    expect(production).toMatchObject({
      outcome: 'running',
      inputStage: 'production',
      executionMode: 'simple',
      latestRunId: 'run-production',
      activeRunId: 'run-production',
    });
    expect(production.runs.map(({ finalText: _finalText, ...run }) => run)).toEqual([
      { runId: 'run-request', inputStage: 'request', taskRunIndex: 0 },
      {
        runId: 'run-production',
        inputStage: 'production',
        taskRunIndex: 1,
        sourceRunId: 'run-request',
      },
    ]);
    expect(projectStrategyTask(production, 'run-request')).toMatchObject({
      taskExecutionId: 'task-1',
      activeRunId: 'run-production',
      nextRunId: 'run-production',
      terminal: false,
    });

    expect(() => beginAutomaticSimpleProduction(db, {
      task: planned.task,
      sourceRunId: 'run-request',
      nextRunId: 'run-production-duplicate',
    })).toThrow();
  });

  it('prepares the production prompt and task CAS through the internal Run claim callback', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    let capturedMeta: Record<string, unknown> | null = null;
    const result = prepareAutomaticSimpleProductionRun({
      db,
      task: planned.task,
      service: {
        prepare(input) {
          capturedMeta = input.meta;
          const run = { id: 'run-production', status: 'queued' };
          input.beforeClaimCommit?.(run);
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (instruction, taskRunIndex) => ({ instruction, taskRunIndex }),
      updatedAt: 130,
    });
    expect(capturedMeta).toMatchObject({
      taskRunIndex: 1,
      instruction: expect.stringContaining(`planContractHash=${planned.task.planContractHash}`),
      doneKey: expect.stringMatching(/^[a-f0-9]{16}$/),
    });
    const hostProtocolMeta = requireHostProtocolMeta(capturedMeta);
    expect(hostProtocolMeta.instruction)
      .toContain(`<od-done key="${hostProtocolMeta.doneKey}"/>`);
    expect(result.task.latestRunId).toBe('run-production');
    expect(result.projection.nextRunId).toBe('run-production');
  });

  it.each([
    { sessionMode: 'plan', file: 'PRD.md', kind: 'other', request: 'Create PRD.md as an editable planning document.' },
    { sessionMode: 'chat', file: 'index.html', kind: 'prototype', request: 'Change only the page title to Updated.' },
  ] as const)('preserves $sessionMode mode file work explicitly requested by the user', async (sample) => {
    const identity = strategyTaskCreateIdentityFixture();
    const task = createStrategyTaskExecution(db, {
      taskExecutionId: 'mode-file-task', projectId: 'project-1', conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: 'mode-file-run',
      ...identity, promptBundleText: identity.promptBundleText.replace('冻结的用户请求。', sample.request),
      sessionMode: sample.sessionMode, createdAt: 100,
    });
    const projectsRoot = path.join(tempDir, 'projects');
    const projectRoot = path.join(projectsRoot, 'project-1');
    fs.mkdirSync(projectRoot, { recursive: true });
    const target = path.join(projectRoot, sample.file);
    if (sample.sessionMode === 'chat') fs.writeFileSync(target, '<title>Original</title>');
    const content = sample.sessionMode === 'plan' ? '# PRD\n\n## Requirements\nEditable plan.' : '<title>Updated</title>';
    fs.writeFileSync(target, content);
    const delivery = await validateRunDeliverable({
      projectsRoot, projectId: 'project-1', projectMetadata: { kind: sample.kind, entryFile: sample.file },
      runStatus: 'succeeded', artifactCount: 1, touchedPaths: [sample.file],
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: 'mode-file-run', updatedAt: 120,
      protocol: protocol(`Updated ${sample.file}.\n${block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', outcome: 'completed', executionMode: 'simple',
      }))}`),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: delivery.valid, filesWritten: 1 },
      executionPreflight: executionPassed,
    });
    expect({ delivery: delivery.valid, action: result.action }).toEqual({ delivery: true, action: 'completed' });
    expect(getStrategyTaskExecution(db, task.taskExecutionId)?.outcome).toBe('completed');
    expect(fs.readFileSync(target, 'utf8')).toBe(content);
  });

  it('does not let an observed no-write violation disappear across a question form', () => {
    const question = '<question-form id="discovery">{"questions":[{"id":"goal","label":"Goal?"}]}</question-form>';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request', updatedAt: 110,
      protocol: protocol(`${question}\n${block('open-design-runtime-state', {
        ...runtimeState({ outcome: 'clarification_required' }), executionIntent: 'plan_only',
      })}`),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false, filesWritten: 1 },
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toContain('od_next_planning_files_changed');
    expect(() => beginStrategyClarification(db, {
      taskExecutionId: 'task-1', sourceRunId: 'run-request', nextRunId: 'run-answer', answer: 'Planning only', updatedAt: 120,
    })).toThrow();
  });

  it.each(['observed-first-write', 'first-evidence-not-forwarded'] as const)(
    'OPEND-2623: %s cannot become a clean plan-only result in a later run',
    (firstEvidence) => {
      const request = 'Ask the four required questions first. Do not create or modify files.';
      const task = createStrategyTaskExecution(db, {
        taskExecutionId: 'task-write-provenance', projectId: 'project-1', conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: 'write-request',
        ...strategyTaskCreateIdentityFixture(), promptBundleText: realRequestBundle(snapshot, request), createdAt: 100,
      });
      const projectRoot = path.join(tempDir, 'project-write-evidence');
      fs.mkdirSync(projectRoot);
      const draft = path.join(projectRoot, 'draft.html');
      const runEvidence: Array<{ runId: string; filesWritten: number; toolFilesWritten: number }> = [];
      function observeTurn(runId: string, writeDraft: boolean) {
        const before = snapshotProjectArtifacts(projectRoot);
        const ledger = createRunSideEffectLedger();
        const parserEvents: Parameters<typeof foldEventIntoRunSideEffectLedger>[1][] = [];
        const parser = createClaudeStreamHandler((event) => {
          const record = { event: 'agent', data: event };
          parserEvents.push(record);
          foldEventIntoRunSideEffectLedger(ledger, record);
        });
        const frames: unknown[] = [{ type: 'system', subtype: 'init', session_id: `${runId}-session`, model: 'fixture' }];
        if (writeDraft) {
          fs.writeFileSync(draft, '<!doctype html><title>Unrequested draft</title>');
          frames.push({ type: 'assistant', message: { role: 'assistant', id: `${runId}-message`, stop_reason: 'tool_use', content: [
            { type: 'tool_use', id: `${runId}-write`, name: 'Write', input: { file_path: draft, content: fs.readFileSync(draft, 'utf8') } },
          ] } });
          frames.push({ type: 'user', message: { role: 'user', content: [
            { type: 'tool_result', tool_use_id: `${runId}-write`, content: 'File written.', is_error: false },
          ] } });
        }
        frames.push({ type: 'result', subtype: 'success', stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } });
        for (const frame of frames) parser.feed(`${JSON.stringify(frame)}\n`);
        parser.flush();
        const diff = diffRunArtifacts(before, snapshotProjectArtifacts(projectRoot));
        const observation = { runId, filesWritten: diff.filesWritten, toolFilesWritten: runFilesWrittenForRun({ sideEffectLedger: ledger }) };
        runEvidence.push(observation);
        if (writeDraft) {
          expect(parserEvents.some(record => (record.data as { type?: string }).type === 'tool_result')).toBe(true);
          expect(observation).toEqual({ runId, filesWritten: 1, toolFilesWritten: 1 });
        } else expect(observation).toEqual({ runId, filesWritten: 0, toolFilesWritten: 0 });
        return observation;
      }
      const initialEvidence = observeTurn('write-request', true);
      const asked = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: task.taskExecutionId, runId: 'write-request', updatedAt: 110,
        protocol: protocol('<question-form id="discovery">{"questions":[{"id":"goal","label":"Goal?"}]}</question-form>'),
        // Current server omits this object for unresolved clarification_required.
        // The stronger observed case supplies actual measured evidence and still loses it.
        ...(firstEvidence === 'observed-first-write' ? { completionEvidence: {
          physicalStatus: 'succeeded' as const, deliverableValid: false, filesWritten: initialEvidence.filesWritten,
        } } : {}),
      });
      expect(asked.action).toBe('awaiting_clarification');
      closeDatabase();
      db = openDatabase(tempDir, { dataDir: tempDir });
      const resumed = beginStrategyClarification(db, {
        taskExecutionId: task.taskExecutionId, sourceRunId: 'write-request', nextRunId: 'write-answer',
        answer: '[form answers — discovery]\n- Goal: Planning only; preserve the no-write request.', updatedAt: 120,
      });
      const answerEvidence = observeTurn('write-answer', false);
      const plan = planContract(snapshot);
      plan.taskProfile.constraints = ['Do not create or modify files'];
      plan.decisionSummary.keyConstraints = [...plan.taskProfile.constraints];
      const parsed = protocol([
        'The requested planning answer is complete.',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', { ...runtimeState({ inputStage: 'clarification', outcome: 'completed', executionMode: 'simple' }), executionIntent: 'plan_only' }),
      ].join('\n')).finish();
      expect(parsed.issues).toEqual([]);
      let preparedCount = 0;
      const completed = prepareAutomaticStrategyContinuation({
        db, task: resumed.task, parsed,
        completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false, filesWritten: answerEvidence.filesWritten },
        service: { prepare: () => { preparedCount += 1; throw new Error('Unexpected production preparation'); }, start: run => run },
        createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 130,
      });
      expect(preparedCount).toBe(0);
      expect(fs.existsSync(draft)).toBe(true);
      expect(completed.result.action).not.toBe('completed');
    },
  );

  it.each([
    { entry: 'missing-intent', providerIntent: undefined },
    { entry: 'question-only', providerIntent: undefined },
    { entry: 'explicit-plan-only', providerIntent: 'plan_only' },
    { entry: 'first-written-three-runs', providerIntent: undefined },
    { entry: 'first-unknown-three-runs', providerIntent: undefined },
    { entry: 'consume-verdict-rollback', providerIntent: undefined },
    { entry: 'resolved-produce', providerIntent: undefined },
    { entry: 'resolved-produce-rollback', providerIntent: undefined },
    { entry: 'source-parser-defect', providerIntent: undefined },
  ] as const)(
    'OPEND-2623 natural intent: $entry does not authorize production',
    ({ entry, providerIntent }) => {
      const sessionMode = 'design';
      const produce = entry === 'resolved-produce' || entry === 'resolved-produce-rollback';
      const request = produce ? 'Ask the four required questions, then build the requested HTML prototype.'
        : 'Ask the four required questions first. Do not create or modify files.';
      const identity = strategyTaskCreateIdentityFixture();
      const initial = createStrategyTaskExecution(db, {
        taskExecutionId: 'task-planning', projectId: 'project-1', conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: 'planning-request',
        ...identity, promptBundleText: realRequestBundle(snapshot, request),
        sessionMode, createdAt: 100,
      });
      expect(initial.promptBundle.text).toContain(request);
      expect(initial.promptBundle.text).toContain('Resolve executionIntent from');
      expect(initial.promptBundle.text).toContain('including an explicit no-write request');
      const question = `<question-form id="discovery">${JSON.stringify({ questions: ['Audience', 'Goal', 'Scope', 'Constraints'].map(label => ({ id: label.toLowerCase(), type: 'text', label, required: true })) })}</question-form>`;
      // The provider resolves this explicit no-write request, independently
      // of the session mode. Mode alone does not forbid document/file work.
      const intakeText = entry === 'question-only' ? question : `${question}\n${block('open-design-runtime-state', {
        ...runtimeState({ outcome: 'clarification_required' }),
        executionIntent: providerIntent,
      })}`;
      const intake = protocol(intakeText);
      const requested = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: initial.taskExecutionId, runId: 'planning-request', protocol: intake, updatedAt: 120,
        ...(entry === 'first-unknown-three-runs' ? {} : { completionEvidence: measuredNoWriteEvidence(entry === 'first-written-three-runs') }),
      });
      expect(requested.action).toBe('awaiting_clarification');
      const clarification = beginStrategyClarification(db, {
        taskExecutionId: initial.taskExecutionId, sourceRunId: 'planning-request', nextRunId: 'planning-answer',
        answer: produce ? '[form answers — discovery]\n- Goal: Build the requested prototype'
          : '[form answers — discovery]\n- Audience: Overseas seed funds\n- Goal: An investor pitch\n- Scope: Planning only\n- Constraints: Preserve the original no-write request', updatedAt: 130,
      });
      const plan = planContract(snapshot);
      plan.taskProfile.constraints = produce ? ['Build the requested HTML prototype'] : ['Do not create or modify files'];
      plan.decisionSummary.keyConstraints = [...plan.taskProfile.constraints];
      const parsed = protocol([
        'The plan is ready for review; the project files have not been changed.',
        entry === 'source-parser-defect'
          ? `<open-design-plan-contract>\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n</open-design-plan-contract>`
          : block('open-design-plan-contract', plan),
        block('open-design-runtime-state', { ...runtimeState({
          inputStage: 'clarification', outcome: 'plan_ready', executionMode: 'simple',
        }), executionIntent: undefined }),
      ].join('\n')).finish();
      if (entry === 'source-parser-defect') expect(parsed.issues.map(issue => issue.code)).toEqual(['od_next_protocol_plan_contract_invalid_json']);
      else expect(parsed.issues).toEqual([]);
      let preparedCount = 0;
      const preparedStages: string[] = [];
      const service = { prepare: (input: Parameters<import('../../../src/services/internal-run-service.js').InternalRunCreationService<{ stage: string; instruction: string; taskRunIndex: number }, { id: string; status: string }>['prepare']>[0]) => {
        preparedCount += 1;
        preparedStages.push(input.meta.stage);
        const run = { id: input.meta.stage === 'intent_resolution' ? 'intent-resolution-run' : 'unexpected-production', status: 'queued' };
        db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
        return { kind: 'ready' as const, run, creationKind: 'created' as const, resumed: false };
      }, start: (run: { id: string; status: string }) => run };
      let transition = prepareAutomaticStrategyContinuation({
        db, task: clarification.task, parsed, toolUseCount: 0, executionPreflight: executionPassed,
        completionEvidence: measuredNoWriteEvidence(), service,
        createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 140,
      });
      if (providerIntent === undefined) {
        expect(transition.stage).toBe('intent_resolution');
        expect(transition.result.task.runs.at(-1)?.finalText.text).toContain(request);
        startIntentResolution(db, initial.taskExecutionId, 'intent-resolution-run');
        closeDatabase(); db = openDatabase(tempDir, { dataDir: tempDir });
        const task = getStrategyTaskExecution(db, initial.taskExecutionId)!;
        const reply = protocol(block('open-design-runtime-state', {
          ...runtimeState({ inputStage: 'clarification', outcome: produce ? 'plan_ready' : 'completed', executionMode: 'simple' }),
          executionIntent: produce ? 'produce' : 'plan_only',
        })).finish();
        if (entry === 'consume-verdict-rollback' || entry === 'resolved-produce-rollback') {
          db.exec(produce
            ? "CREATE TEMP TRIGGER reject_completed BEFORE INSERT ON strategy_task_runs WHEN NEW.input_stage = 'production' BEGIN SELECT RAISE(ABORT, 'fixture verdict write rejected'); END"
            : "CREATE TEMP TRIGGER reject_completed BEFORE UPDATE ON strategy_task_executions WHEN NEW.outcome = 'completed' BEGIN SELECT RAISE(ABORT, 'fixture verdict write rejected'); END");
          expect(() => prepareAutomaticStrategyContinuation({
            db, task, parsed: reply, toolUseCount: 0, completionEvidence: measuredNoWriteEvidence(), executionPreflight: executionPassed, service,
            createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 150,
          })).toThrow('fixture verdict write rejected');
          const rolledBack = getStrategyTaskExecution(db, initial.taskExecutionId)!;
          expect(rolledBack.intentResolution?.state).toBe('started');
          expect(rolledBack.intentResolution?.replyJson).toBeTruthy();
          expect(rolledBack.executionIntent).toBeUndefined();
          expect(rolledBack.outcome).toBe('running');
          db.exec('DROP TRIGGER reject_completed');
          closeDatabase(); db = openDatabase(tempDir, { dataDir: tempDir });
          expect(() => startIntentResolution(db, initial.taskExecutionId, task.latestRunId)).toThrow();
        }
        const persisted = getStrategyTaskExecution(db, initial.taskExecutionId)!;
        const savedReply = persisted.intentResolution?.replyJson
          ? JSON.parse(persisted.intentResolution.replyJson).parsed : reply;
        transition = prepareAutomaticStrategyContinuation({
          db, task: persisted, parsed: savedReply, toolUseCount: 0, completionEvidence: measuredNoWriteEvidence(), executionPreflight: executionPassed, service,
          createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 150,
        });
      }
      expect(preparedStages.filter(stage => stage === 'production')).toHaveLength(entry === 'resolved-produce-rollback' ? 2 : produce ? 1 : 0);
      expect(preparedStages).not.toContain('contract_repair');
      const violation = entry === 'first-written-three-runs' || entry === 'first-unknown-three-runs';
      const parserDefect = entry === 'source-parser-defect';
      expect(transition.result.action).toBe(violation || parserDefect ? 'blocked' : produce ? 'plan_ready' : 'completed');
      if (parserDefect) expect(transition.result.reasonCodes).toContain('od_next_protocol_plan_contract_invalid_json');
      if (violation) expect(transition.result.reasonCodes).toContain('od_next_planning_files_changed');
      expect(transition.result.visibleText).toContain('The plan is ready for review');
      expect(transition.result.task.outcome).toBe(violation || parserDefect ? 'blocked' : produce ? 'running' : 'completed');
      expect(transition.start).toBe(produce);
      expect(preparedCount).toBe(entry === 'resolved-produce-rollback' ? 3 : produce ? 2 : providerIntent === undefined ? 1 : 0);
      const reloaded = getStrategyTaskExecution(db, initial.taskExecutionId)!;
      expect(reloaded.promptBundle.text).toBe(initial.promptBundle.text);
      expect(reloaded.runs.map(run => run.inputStage)).toEqual(produce ? ['request', 'clarification', 'clarification', 'production'] : providerIntent === undefined ? ['request', 'clarification', 'clarification'] : ['request', 'clarification']);
      expect(StrategyTaskProjectionV2Schema.parse(projectStrategyTask(reloaded)).terminal).toBe(!produce);
    },
  );

  it.each(['design', 'chat', 'plan'] as const)(
    'OPEND-2623: preserves a %s planning request through parsed intent and form continuation',
    (sessionMode) => {
      const request = 'Ask the four required questions first. Do not create or modify files.';
      const identity = strategyTaskCreateIdentityFixture();
      const initial = createStrategyTaskExecution(db, {
        taskExecutionId: 'task-planning', projectId: 'project-1', conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: 'planning-request',
        ...identity, promptBundleText: identity.promptBundleText.replace('冻结的用户请求。', request),
        sessionMode, createdAt: 100,
      });
      expect(initial.promptBundle.text).toContain(request);
      const question = `<question-form id="discovery">${JSON.stringify({ questions: ['Audience', 'Goal', 'Scope', 'Constraints'].map(label => ({ id: label.toLowerCase(), type: 'text', label, required: true })) })}</question-form>`;
      // The provider resolves this explicit no-write request, independently
      // of the session mode. Mode alone does not forbid document/file work.
      const intake = protocol(`${question}\n${block('open-design-runtime-state', {
        ...runtimeState({ outcome: 'clarification_required' }),
        executionIntent: 'plan_only',
      })}`);
      const requested = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: initial.taskExecutionId, runId: 'planning-request', protocol: intake, updatedAt: 120,
        completionEvidence: measuredNoWriteEvidence(),
      });
      expect(requested.action).toBe('awaiting_clarification');
      const clarification = beginStrategyClarification(db, {
        taskExecutionId: initial.taskExecutionId, sourceRunId: 'planning-request', nextRunId: 'planning-answer',
        answer: '[form answers — discovery]\n- Audience: Overseas seed funds\n- Goal: An investor pitch\n- Scope: Planning only\n- Constraints: Preserve the original no-write request', updatedAt: 130,
      });
      const plan = planContract(snapshot);
      plan.taskProfile.constraints = ['Do not create or modify files'];
      plan.decisionSummary.keyConstraints = [...plan.taskProfile.constraints];
      const parsed = protocol([
        'The plan is ready for review; the project files have not been changed.',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', { ...runtimeState({
          inputStage: 'clarification', outcome: 'plan_ready', executionMode: 'simple',
        }), executionIntent: undefined }),
      ].join('\n')).finish();
      expect(parsed.issues).toEqual([]);
      let preparedCount = 0;
      const transition = prepareAutomaticStrategyContinuation({
        db, task: clarification.task, parsed, toolUseCount: 0, executionPreflight: executionPassed,
        completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false, filesWritten: 0 },
        service: { prepare: (input) => {
          preparedCount += 1;
          const run = { id: 'unexpected-production', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        }, start: (run) => run },
        createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }), updatedAt: 140,
      });
      expect(transition.result.action).toBe('completed');
      expect(transition.result.task.outcome).toBe('completed');
      expect(transition.start).toBe(false);
      expect(preparedCount).toBe(0);
      const reloaded = getStrategyTaskExecution(db, initial.taskExecutionId)!;
      expect(reloaded.promptBundle.text).toBe(initial.promptBundle.text);
      expect(reloaded.runs.map(run => run.inputStage)).toEqual(['request', 'clarification']);
      expect(StrategyTaskProjectionV2Schema.parse(projectStrategyTask(reloaded)).terminal).toBe(true);
    },
  );

  it.each([
    { text: '', status: 'succeeded', filesWritten: 0, reason: 'od_next_planning_answer_missing' },
    { text: 'Planning answer', status: 'failed', filesWritten: 0, reason: 'od_next_physical_run_not_succeeded' },
    { text: 'Planning answer', status: 'canceled', filesWritten: 0, reason: 'od_next_physical_run_not_succeeded' },
    { text: 'Planning answer', status: 'succeeded', filesWritten: 1, reason: 'od_next_planning_files_changed' },
    { text: '<question-form id="still-waiting">{"questions":[{"id":"goal","label":"Goal?"}]}</question-form>', status: 'succeeded', filesWritten: 0, reason: 'od_next_clarification_form_unexpected' },
  ] as const)('refuses a planning completion without its required evidence: $reason', (sample) => {
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request', updatedAt: 110,
      protocol: protocol(`${sample.text}\n${block('open-design-runtime-state', {
        ...runtimeState({ outcome: 'completed' }), executionIntent: 'plan_only',
      })}`),
      completionEvidence: { physicalStatus: sample.status, deliverableValid: false, filesWritten: sample.filesWritten },
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toContain(sample.reason);
  });

  it('accepts a visible planning answer as a successful request without requiring a deliverable', () => {
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request', updatedAt: 110,
      protocol: protocol(`A complete planning answer.\n${block('open-design-runtime-state', {
        ...runtimeState({ outcome: 'completed' }), executionIntent: 'plan_only',
      })}`),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false, filesWritten: 0 },
    });
    expect(result.action).toBe('completed');
    expect(result.task.inputStage).toBe('request');
    expect(result.task.executionIntent).toBe('plan_only');
    expect(StrategyTaskProjectionV2Schema.parse(projectStrategyTask(result.task)).terminal).toBe(true);
  });

  it('does not let a form answer widen the persisted planning intent or claim a production Run', () => {
    const question = '<question-form id="discovery">{"questions":[{"id":"goal","label":"Goal?"}]}</question-form>';
    const requested = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request', updatedAt: 110,
      protocol: protocol(`${question}\n${block('open-design-runtime-state', {
        ...runtimeState({ outcome: 'clarification_required' }), executionIntent: 'plan_only',
      })}`),
    });
    expect(requested.action).toBe('awaiting_clarification');
    const clarification = beginStrategyClarification(db, {
      taskExecutionId: 'task-1', sourceRunId: 'run-request', nextRunId: 'run-answer',
      answer: 'Discuss an investor pitch.', updatedAt: 120,
    });
    expect(clarification.task.runs.at(-1)?.finalText.text).toContain('executionIntent plan_only');
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: 'task-1', expectedRevision: clarification.task.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple', executionIntent: 'produce' },
      updatedAt: 130,
    })).toThrow();
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-answer', updatedAt: 130,
      protocol: protocol(block('open-design-runtime-state', {
        ...runtimeState({ inputStage: 'clarification', outcome: 'plan_ready', executionMode: 'simple' }),
        executionIntent: 'produce',
      })),
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toContain('od_next_protocol_execution_intent_mismatch');
    expect(result.task.executionIntent).toBe('plan_only');
    expect(result.task.runs).toHaveLength(2);
  });

  it('migrates an older task store without changing its production intent', () => {
    // This row predates both intent mechanisms, unlike a newly created unresolved task.
    db.exec('DELETE FROM strategy_task_intent_resolution');
    db.exec('ALTER TABLE strategy_task_executions DROP COLUMN intent_resolution_version');
    const columns = db.prepare('PRAGMA table_info(strategy_task_executions)').all() as Array<{ name: string }>;
    if (columns.some(column => column.name === 'execution_intent')) {
      db.exec('ALTER TABLE strategy_task_executions DROP COLUMN execution_intent');
    }
    migrateStrategyTaskStore(db);
    expect(getStrategyTaskExecution(db, 'task-1')?.executionIntent).toBe('produce');
  });

  it('accepts the parsed server result and claims simple Production in one transaction', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const parsed = protocol([
      block('open-design-plan-contract', planContract(snapshot)),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    let capturedMeta: Record<string, unknown> | null = null;
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      executionPreflight: executionPassed,
      service: {
        prepare(input) {
          capturedMeta = input.meta;
          const run = { id: 'run-production-live', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (stage, instruction, taskRunIndex) => ({
        stage, instruction, taskRunIndex,
      }),
      updatedAt: 120,
    });
    expect(capturedMeta).toMatchObject({
      stage: 'production',
      taskRunIndex: 1,
      instruction: expect.stringContaining('planContractHash='),
      doneKey: expect.stringMatching(/^[a-f0-9]{16}$/),
    });
    const hostProtocolMeta = requireHostProtocolMeta(capturedMeta);
    expect(hostProtocolMeta.instruction)
      .toContain(`<od-next key="${hostProtocolMeta.doneKey}" value="Add an orders list page"/>`);
    expect(transition).toMatchObject({
      start: true,
      stage: 'production',
      result: {
        action: 'plan_ready',
        task: {
          inputStage: 'production',
          outcome: 'running',
          latestRunId: 'run-production-live',
        },
      },
    });
  });

  it('blocks an unknown production route instead of trusting the Plan string', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const plan = planContract(snapshot);
    plan.runManifest.productionRoutes = ['unregistered-host-route'];
    const parsed = protocol([
      block('open-design-plan-contract', plan),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      executionPreflight: {
        ...executionPassed,
        productionRoutes: [{ id: 'unregistered-host-route', available: false }],
      },
      service: {
        prepare(input) {
          const run = { id: 'must-rollback', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    expect(transition).toMatchObject({
      start: false,
      result: {
        action: 'blocked',
        reasonCodes: ['od_next_preflight_route_unavailable:unregistered-host-route'],
        task: { outcome: 'blocked', latestRunId: 'run-request' },
      },
    });
  });

  it('blocks plan continuation when daemon-owned execution facts are absent', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const parsed = protocol([
      block('open-design-plan-contract', planContract(snapshot)),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      service: {
        prepare(input) {
          const run = { id: 'must-not-start', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    expect(transition).toMatchObject({
      start: false,
      result: {
        action: 'blocked',
        reasonCodes: ['od_next_preflight_execution_facts_missing'],
        task: { outcome: 'blocked', latestRunId: 'run-request' },
      },
    });
  });

  it('claims a serialization-only repair Run before simple Production', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const parsed = protocol([
      block('open-design-plan-contract', plan, true),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      executionPreflight: executionPassed,
      service: {
        prepare(input) {
          const run = { id: 'run-contract-repair-live', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (stage, instruction) => ({ stage, instruction }),
      updatedAt: 120,
    });
    expect(transition).toMatchObject({
      start: true,
      stage: 'contract_repair',
      result: {
        action: 'contract_repair',
        task: {
          inputStage: 'contract_repair',
          outcome: 'running',
          latestRunId: 'run-contract-repair-live',
          planContractRepairAttempts: 1,
        },
      },
    });
  });

  it('blocks Direct Edit completion without physical success and canonical delivery', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'auto', directEdit: directEligible,
      intake: intakePassed, execution: executionPassed, updatedAt: 110,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', outcome: 'completed', executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 120,
    });
    expect(result).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_canonical_deliverable_invalid'],
      task: { outcome: 'blocked', terminalRunId: 'run-request' },
    });
  });

  it('requires both physical success and a canonical deliverable to complete production', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const completed = completeAutomaticSimpleProduction(db, {
      runId: 'run-production', physicalStatus: 'succeeded', deliverableValid: true,
      updatedAt: 140,
    });
    expect(completed).toMatchObject({
      outcome: 'completed', terminalRunId: 'run-production', activeRunId: null,
    });
  });

  it('attributes a production block that delivered no resolvable entry', () => {
    // Every other blocking path persists a `blockedContext`; this one did not,
    // so the most common production block reached the client with no reason
    // codes at all and could only be rendered as an anonymous failure.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const blocked = completeAutomaticSimpleProduction(db, {
      runId: 'run-production', physicalStatus: 'succeeded', deliverableValid: false,
      updatedAt: 140,
    });
    expect(blocked).toMatchObject({ outcome: 'blocked' });
    expect(blocked?.blockedContext?.reasonCodes)
      .toEqual(['od_next_canonical_deliverable_invalid']);
  });

  it('names a production block for the process failure, not the delivery', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const failed = completeAutomaticSimpleProduction(db, {
      runId: 'run-production', physicalStatus: 'failed', deliverableValid: false,
      updatedAt: 140,
    });
    expect(failed?.blockedContext?.reasonCodes).toEqual([
      'od_next_physical_run_not_succeeded',
      'od_next_canonical_deliverable_invalid',
    ]);
  });

  it('blocks a continuation when native-session continuity cannot be proved', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const waiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1', sourceRunId: waiting.task.latestRunId,
      nextRunId: 'run-clarification', answer: 'Desktop', updatedAt: 130,
    });
    const blocked = blockAutomaticContinuation(db, {
      runId: 'run-clarification', updatedAt: 140,
    });
    expect(blocked).toMatchObject({ outcome: 'blocked', terminalRunId: 'run-clarification' });
    expect(blocked?.blockedContext).toEqual({
      reasonCodes: ['od_next_native_session_continuity_unproven'],
      visibleText: null,
    });
  });

  // OPEND-2565. A blocked strategy task is the one verdict a user is asked to
  // act on, and `blockedContext` is the only durable channel that says why.
  // Two of the three blocking paths never wrote it: the request router computed
  // its reason codes and returned them without persisting, and the turn
  // finalizer passed an agent-declared `blocked` straight through. A field
  // report (Design Harness on, prototype task) landed on the second one and
  // reached the client with `blockedContext: null` — no reason codes, and the
  // agent's own written explanation dropped — so the chat could only render an
  // anonymous "the strategy task could not continue".
  it('records why the agent declared the task blocked', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const waiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1', sourceRunId: waiting.task.latestRunId,
      nextRunId: 'run-clarification', answer: 'skipped', updatedAt: 130,
    });
    const halted = 'Key requirements were skipped, so no runnable prototype plan can be formed. This task is blocked.';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-clarification',
      protocol: protocol(`${halted}\n${block('open-design-runtime-state', runtimeState({
        inputStage: 'clarification', outcome: 'blocked',
      }))}`),
      updatedAt: 140,
    });
    expect(result.task.outcome).toBe('blocked');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('blocked');
    expect(persisted?.blockedContext?.visibleText).toContain('This task is blocked.');
  });

  it('records why a request was blocked before any turn ran', () => {
    const result = prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: { ...intakePassed, selectedAgentAvailable: false }, updatedAt: 110,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes.length).toBeGreaterThan(0);
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('blocked');
    expect(persisted?.blockedContext?.reasonCodes).toEqual(result.reasonCodes);
  });

  it('accepts a form-only first turn by inferring the clarification runtime state', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    // The observed field failure: the agent renders a direction statement plus
    // exactly one discovery form but omits every machine-protocol block. The
    // turn has exactly one valid protocol meaning, so it must be accepted.
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`我们先对齐几个关键问题。
${question}`),
      updatedAt: 120,
    });
    expect(result.action).toBe('awaiting_clarification');
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
    expect(result.task.outcome).toBe('clarification_required');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('clarification_required');
    expect(persisted?.blockedContext).toBeUndefined();
  });

  /**
   * PARKED — pending the product design this behaviour needs, NOT pending a fix.
   *
   * The ruling that governs it is
   * `specs/current/chat-panel-issue-log-2026-08-28.md:58`, which closed the
   * attribution of this exact field failure: the run and transport really did
   * succeed and the card comes from the strategy protocol's fail-closed gate,
   * and the remedy is explicitly deferred — "不隐藏失败卡、不做关键词猜测。未来若要
   * 支持 Design 模式纯问答,需显式 structured intent,作为独立产品设计而非本次尾项".
   * The 2026-09-07 re-check (`07bd6d9149`) measured that boundary and recorded
   * the same verdict in the log: this asserts product behaviour nobody has
   * designed yet, and the spec offers exactly this parking as the alternative
   * to deleting it.
   *
   * Why it cannot simply be made to pass. Its fixture and the fixture of
   * `refuses to infer a Direct Edit completion without verified physical
   * delivery` below reach the coordinator IDENTICAL — same stage, same route,
   * same `completionEvidence: { physicalStatus: 'succeeded', deliverableValid:
   * false }` — and differ only in the agent's prose. Measured, not argued:
   * dropping the `deliverableValid !== true` guard in
   * `inferDirectEditCompletionRuntimeState` moves that neighbour's verdict from
   * `od_next_protocol_runtime_state_missing` to
   * `od_next_canonical_deliverable_invalid` — the silent-no-op guard is already
   * broken — while THIS turn still blocks, refused by that second fail-closed
   * gate. So no gate can separate "the user only wanted words" from "the agent
   * said it was done and wrote nothing"; only reading the prose could, and that
   * is the keyword guessing the ruling names and forbids.
   *
   * Unskip when the structured intent lands: the product owes what the intent
   * looks like, which outcome it settles on, and how `strategyTaskDelivered`
   * counts it. The field record it reproduces is kept below verbatim.
   *
   * Reproduces the field failure recorded on Open Design Beta
   * 0.21.1-beta.7, task `odnext_c4ee010be6b748dc9b92984946bc10a8`,
   * run `e5d6181b-1705-4a44-964b-cdcb3fbcb6ac`.
   *
   * The user asked, in an OD Next prototype project:
   *   「详细讲讲这个页面的实现思路,分十节展开,每节写满一段。
   *     只输出文字,不要创建或修改文件。」
   * The agent obeyed: 2940 characters of prose, no question form, no machine
   * block, no file touched. The child process exited 0 and the daemon persisted
   * the Run as `succeeded` with `errorCode: null` and `artifactCount: 0`.
   *
   * The task nevertheless landed terminal-`blocked` on
   * `od_next_protocol_runtime_state_missing`, and the web client remapped the
   * succeeded Run to `failed`, so a fully answered question was presented to
   * the user as a task failure.
   *
   * Fixture shape is taken from that record, not invented: the route is still
   * unlocked (production calls `prepareStrategyIntake`, never
   * `prepareStrategyRequest`, on the request turn — routes.ts:2808), the
   * clarification budget is untouched, and the completion evidence is what
   * `validateRunDeliverable` resolves for a Run that wrote nothing.
   */
  it.skip('does not fail a request turn whose only output was the answer the user asked for', () => {
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const proseOnlyAnswer = [
      '这份页面的实现思路,分十节讲。',
      '',
      '**一、单文件架构与可编辑性**',
      '整页收敛在一个 HTML 文件里,样式与脚本内联,便于整体替换。',
      '',
      '**二、版式栅格**',
      '主栏与侧注共用一套基线网格,行高按字号的整数倍对齐。',
    ].join('\n');
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(proseOnlyAnswer),
      // The process succeeded; nothing was written, because nothing was asked
      // to be written.
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 120,
    });

    expect(result.action).not.toBe('blocked');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).not.toBe('blocked');
    expect(persisted?.blockedContext).toBeUndefined();
  });

  /**
   * Companion evidence for the spec above — expected to PASS today.
   *
   * It establishes that the block is not the agent misbehaving. Enumerate every
   * Runtime State the schema admits for an unrouted request turn and feed each
   * one to the same prose-only turn: all of them are refused too. There is no
   * declaration the agent could have emitted that would have let a
   * deliverable-free answer through, so "the reply did not carry the
   * machine-readable state" describes a contract with no legal move, not a
   * protocol violation.
   */
  it('admits no request-stage runtime state for a turn that delivers nothing', () => {
    const declarable = [
      runtimeState({ route: 'full_plan', outcome: 'clarification_required' }),
      runtimeState({ route: 'full_plan', outcome: 'plan_ready', executionMode: 'simple' }),
      runtimeState({ route: 'direct_edit', outcome: 'completed', executionMode: 'simple' }),
    ];
    const refusals = declarable.map((state, index) => {
      const taskExecutionId = `task-declared-${index}`;
      createStrategyTaskExecution(db, {
        taskExecutionId,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId,
        selectedAgentId: AGENT_ID,
        initialRunId: `run-declared-${index}`,
        ...strategyTaskCreateIdentityFixture(),
        createdAt: 100,
      });
      prepareStrategyIntake(db, {
        taskExecutionId,
        intake: intakePassed,
        execution: executionPassed,
      });
      const outcome = finalizeStrategyPlanningTurn(db, {
        taskExecutionId,
        runId: `run-declared-${index}`,
        protocol: protocol(`答案正文。\n${block('open-design-runtime-state', state)}`),
        completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
        updatedAt: 120,
      });
      return { declared: state.outcome, action: outcome.action };
    });
    expect(refusals).toEqual([
      { declared: 'clarification_required', action: 'blocked' },
      { declared: 'plan_ready', action: 'blocked' },
      { declared: 'completed', action: 'blocked' },
    ]);
  });

  /**
   * The parser refuses before `validateAcceptedTurn` is ever reached, so every
   * block-less turn used to be filed under the parser's own code — and
   * `reasonCodes[0]` is what the failure card, the diagnostics export and the
   * analytics bucket all read. A user who got nothing this round was told a
   * marker was missing, which is true of the reply and useless to them, while
   * the identical failure with a DECLARED block reported the real gate.
   *
   * The verdict does not move: both shapes still block. Only the name does.
   */
  it('names the evidence that refused an undeclared completion, not the parser', () => {
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('好的,已经按计划做完了。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 120,
    });

    expect(result.action).toBe('blocked');
    // The acting cause first: it is a host fact the user can act on.
    expect(result.reasonCodes[0]).toBe('od_next_canonical_deliverable_invalid');
    // The parser's own code is kept behind it, because "declared badly" and
    // "declared nothing" have different remedies and only the first is ever
    // eligible for a serialization repair.
    expect(result.reasonCodes).toContain('od_next_protocol_runtime_state_missing');
    expect(getStrategyTaskExecution(db, 'task-1')?.blockedContext?.reasonCodes)
      .toEqual(result.reasonCodes);
  });

  it('gives the undeclared and declared shapes of one failure the same name', () => {
    // The invariant the reattribution exists to hold: an empty-handed turn is
    // reported the same way whether or not the agent wrote its machine block.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const undeclared = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('做完了。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 120,
    });

    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-declared',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-declared',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 100,
    });
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-declared',
      intake: intakePassed,
      execution: executionPassed,
    });
    const declared = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-declared',
      runId: 'run-declared',
      protocol: protocol(`做完了。\n${block('open-design-runtime-state', runtimeState({
        route: 'direct_edit',
        outcome: 'completed',
        executionMode: 'simple',
      }))}`),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 120,
    });

    expect(undeclared.reasonCodes[0]).toBe(declared.reasonCodes[0]);
    expect(declared.reasonCodes[0]).toBe('od_next_canonical_deliverable_invalid');
  });

  it('leaves a turn the evidence accepts to the inference, unrenamed', () => {
    // Reattribution must fire only where the evidence actually refused. A turn
    // that DID deliver is recovered, not renamed.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('做完了,文件已经写好。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 120,
    });

    expect(result.action).toBe('completed');
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
  });

  it('keeps the parser code for a block-less turn no inference was shaped for', () => {
    // A clarification-stage turn that answers in prose has no host fact that
    // refused it — the declaration really is the thing that is missing, and
    // renaming it would invent a cause.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        route: 'full_plan',
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1',
      sourceRunId: 'run-request',
      nextRunId: 'run-clarification',
      answer: '深色,三页',
      updatedAt: 130,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol('明白了,我按深色三页来做。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 140,
    });

    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);
  });

  it('accepts a clarification turn whose state predicted a premature execution mode', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', {
        schema: 'open-design.strategy-state/v2',
        route: 'full_plan',
        inputStage: 'request',
        outcome: 'clarification_required',
        executionMode: 'simple',
        reasonCodes: ['scope_required'],
      })}`),
      updatedAt: 120,
    });
    expect(result.action).toBe('awaiting_clarification');
    expect(result.task.outcome).toBe('clarification_required');
    expect(result.task.executionMode).toBeNull();
  });

  it('keeps ambiguous protocol-less turns fail-closed instead of inferring', () => {
    // Two forms: not inferable.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const form = (id: string) => `<question-form id="${id}">{"questions":[{"id":"q","label":"Q?"}]}</question-form>`;
    const two = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${form('a')}
${form('b')}`),
      updatedAt: 120,
    });
    expect(two.action).toBe('blocked');
    expect(two.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);

    // A recovered plan block without runtime state: ambiguous intent, no inference.
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-plan-no-state',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-plan-no-state',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 200,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-plan-no-state', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 201,
    });
    const withPlan = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-plan-no-state', runId: 'run-plan-no-state',
      protocol: protocol(`${form('c')}
${block('open-design-plan-contract', planContract(snapshot))}`),
      executionPreflight: executionPassed,
      updatedAt: 202,
    });
    expect(withPlan.action).toBe('blocked');
    expect(withPlan.reasonCodes).toContain('od_next_protocol_runtime_state_missing');
  });

  it('names a repeated clarification even when the turn carried no machine block', () => {
    // The observed field failure: the user answers the one allowed question
    // form, and the agent replies with ANOTHER form and no Runtime State block.
    // The verdict is right — the clarification stage admits only plan_ready
    // (which needs a Plan Contract this turn never had), blocked or canceled —
    // but the attribution was the generic `runtime_state_missing`, because the
    // missing-block gate fires before `validateAcceptedTurn` ever sees the
    // repeat. The declared variant of the SAME failure (the sibling test
    // 'persists the one clarification round and refuses a second question
    // after restart') reports `od_next_clarification_repeated`; both shapes
    // must name the same gate.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1',
      sourceRunId: 'run-request',
      nextRunId: 'run-clarification',
      answer: 'Use the operator console.',
      updatedAt: 130,
    });

    const repeated = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-clarification',
      protocol: protocol(`还需要再确认一点。\n${question}`),
      updatedAt: 140,
    });

    // Attribution: the precise gate, and ONLY it. `reasonCodes[0]` is what the
    // web client turns into the user-visible error code, so a list that merely
    // contains the precise name still shows the generic one.
    expect(repeated.reasonCodes).toEqual(['od_next_clarification_repeated']);
    // Guardrail: the verdict must NOT move. Fail-closed is correct here.
    expect(repeated.action).toBe('blocked');
    expect(repeated.task.outcome).toBe('blocked');
    expect(repeated.task.inputStage).toBe('clarification');
    expect(repeated.task.clarificationCount).toBe(1);
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('blocked');
    expect(persisted?.blockedContext?.reasonCodes).toEqual([
      'od_next_clarification_repeated',
    ]);
  });

  it('keeps a block-less clarification turn that asked nothing on the generic gate', () => {
    // Reverse control for the test above. Same stage, same missing block, but
    // the agent did not ask again — it merely forgot the Runtime State. That is
    // genuinely `runtime_state_missing`, and re-attributing it to a repeated
    // clarification would fold two different failures back into one bucket.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1',
      sourceRunId: 'run-request',
      nextRunId: 'run-clarification',
      answer: 'Use the operator console.',
      updatedAt: 130,
    });

    const proseOnly = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-clarification',
      protocol: protocol('明白了，我按操作台这个方向来做，下面是完整方案……'),
      updatedAt: 140,
    });

    expect(proseOnly.action).toBe('blocked');
    expect(proseOnly.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);
  });

  it('lets the main Agent choose Direct Edit on an unrouted first turn', () => {
    // Product spec 3.1: the main Agent decides Direct Edit vs Full Plan.
    // The daemon leaves the route unlocked through the request turn and
    // adopts the Agent's declaration, so a local edit finishes in ONE
    // Request Turn instead of being forced through planning + production.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const beforeTurn = getStrategyTaskExecution(db, 'task-1');
    expect(beforeTurn?.route).toBeNull();

    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', inputStage: 'request', outcome: 'completed',
        executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.action).toBe('completed');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.route).toBe('direct_edit');
    expect(persisted?.executionMode).toBe('simple');
    expect(persisted?.inputStage).toBe('request');
    // One Request Turn: Direct Edit never claims a production Run.
    expect(persisted?.runs).toHaveLength(1);
  });

  it('recovers a Direct Edit completion the agent delivered but never declared', () => {
    // The observed field failure: the agent writes the canonical deliverable
    // correctly, Open Design's own validator resolves it, and then the agent
    // answers in prose without emitting a single machine block. Refusing that
    // turn stranded a finished artifact behind a generic failure card, and no
    // repair could rescue it — `tryBeginSerializationRepair` needs a recovered
    // Plan Contract to anchor on, and this turn produces none.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('已创建 index.html，点击按钮会显示 Hello。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
    expect(result.task.outcome).toBe('completed');
    expect(result.task.route).toBe('direct_edit');
    expect(result.task.executionMode).toBe('simple');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('completed');
    expect(persisted?.blockedContext).toBeUndefined();
  });

  it('recovers a production completion the agent delivered but never declared', () => {
    // Production is only entered from a locked Full Plan and its schema admits
    // no non-terminal outcome, so a production turn that ran the frozen plan,
    // delivered a canonical entry Open Design resolved itself, and then answered
    // in prose has exactly one thing it could have declared. Refusing it
    // discarded a finished deliverable already sitting in the project.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-production',
      protocol: protocol('三个页面已生成，入口是 index.html。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      executionPreflight: executionPassed,
      updatedAt: 140,
    });
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
    expect(result.task.outcome).toBe('completed');
    expect(result.task.inputStage).toBe('production');
    expect(getStrategyTaskExecution(db, 'task-1')?.blockedContext).toBeUndefined();
  });

  it('refuses to infer a production completion that delivered nothing', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-production',
      protocol: protocol('已完成。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      executionPreflight: executionPassed,
      updatedAt: 140,
    });
    // What this test owns is the VERDICT: an undeclared production turn that
    // delivered nothing must not be laundered into a completion. The name it
    // blocks under is owned by the reattribution specs above — the evidence
    // that actually refused leads, and the parser's code rides behind it.
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes[0]).toBe('od_next_canonical_deliverable_invalid');
    expect(result.reasonCodes).toContain('od_next_protocol_runtime_state_missing');
  });

  it('refuses to infer a Direct Edit completion without verified physical delivery', () => {
    // The inference may only ever accept evidence Open Design resolved itself.
    // An undeclared turn that delivered nothing must still block, so a silent
    // no-op can never be laundered into a completed task.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('我已经完成了。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes[0]).toBe('od_next_canonical_deliverable_invalid');
    expect(result.reasonCodes).toContain('od_next_protocol_runtime_state_missing');
    expect(getStrategyTaskExecution(db, 'task-1')?.outcome).toBe('blocked');
  });

  it('adopts a Full Plan declaration on an unrouted first turn', () => {
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.action).toBe('plan_ready');
    expect(getStrategyTaskExecution(db, 'task-1')?.route).toBe('full_plan');
  });

  it('still rejects a route change once the route is locked', () => {
    // The unlocked-first-turn allowance must not weaken the existing guard:
    // later turns may never re-route the task chain.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const drift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', inputStage: 'request', outcome: 'completed',
        executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 120,
    });
    expect(drift.action).toBe('blocked');
    expect(drift.reasonCodes).toContain('od_next_protocol_route_mismatch');
  });

  it('persists blocked attribution so a blocked task can be diagnosed from the store', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    // Mirrors the observed field failure: a visible-only reply without any
    // machine-protocol block must block AND leave queryable attribution.
    const visible = '这轮回复没有携带机器协议块，只有普通文本。';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(visible),
      updatedAt: 120,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes.length).toBeGreaterThan(0);
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('blocked');
    expect(persisted?.blockedContext).toEqual({
      reasonCodes: result.reasonCodes,
      visibleText: visible,
    });
  });

  it('projects blocked attribution to clients so the UI can terminate form interaction', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const visible = '这轮回复没有携带机器协议块，只有普通文本。';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(visible),
      updatedAt: 120,
    });
    expect(result.action).toBe('blocked');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    const projection = projectStrategyTask(persisted!, 'run-request');
    expect(projection.terminal).toBe(true);
    expect(projection.outcome).toBe('blocked');
    // The run-status / SSE projection must carry the persisted gate verdict so
    // the web client can disable the clarification form and explain why.
    expect(projection.blockedContext).toEqual({
      reasonCodes: result.reasonCodes,
      visibleText: visible,
    });
    // And the wire contract must accept + preserve that attribution.
    expect(StrategyTaskProjectionV2Schema.parse(projection).blockedContext).toEqual(
      projection.blockedContext,
    );
  });

  it('projects no blocked attribution on a non-blocked task', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const waiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>',
        block('open-design-runtime-state', runtimeState({ outcome: 'clarification_required' })),
      ].join('\n')),
      updatedAt: 120,
    });
    expect(waiting.task.outcome).toBe('clarification_required');
    const projection = projectStrategyTask(waiting.task, 'run-request');
    expect(projection.terminal).toBe(false);
    expect(projection.blockedContext).toBeUndefined();
  });
});

describe('OD Next production completion inference', () => {
  it('never infers a complex completion from a turn that declared nothing', () => {
    // The inference rests on Open Design having resolved the evidence the agent
    // failed to declare, and for a simple plan that evidence IS the canonical
    // deliverable. A complex plan additionally owes verified native Child
    // lifecycle — the property that makes it complex — which no deliverable
    // check substitutes for. Accepting complex here certified Children nobody
    // observed: an AMR complex Run whose Vela build ships no child-lifecycle
    // producer reported `knownChildCount: 0` and still landed `completed`,
    // walking past `evaluateOdNextComplexChildEvidence` entirely.
    const parsed = protocol('Built all three pages and wired the navigation.').finish();

    expect(odNextTurnMayInferProductionCompletion(
      { route: 'full_plan', inputStage: 'production', executionMode: 'simple' },
      parsed,
    )).toBe(true);
    expect(odNextTurnMayInferProductionCompletion(
      { route: 'full_plan', inputStage: 'production', executionMode: 'complex' },
      parsed,
    )).toBe(false);
  });
});
