import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import { OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2, serializeCanonicalXml, StrategyTaskProjectionV2Schema } from '@open-design/contracts';
import type { AppliedPluginSnapshot, OpenDesignPlanContractV2 } from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase, upsertMessage } from '../../../src/db.js';

import { createChatRunService } from '../../../src/runtimes/runs.js';

import { removeOdNextTaskInputSnapshot, type OdNextTaskInputSnapshotDescriptor } from '../../../src/strategies/od-next/task-input-snapshot.js';
import { reconcileDurableRunTerminals } from '../../../src/runtimes/run-terminal-reconciliation.js';

import { createSnapshot } from '../../../src/plugins/snapshots.js';

import { createOdNextRunProtocol } from '../../../src/strategies/od-next/protocol.js';
import { createInternalRunCreationService, type InternalRunCreateInput } from '../../../src/services/internal-run-service.js';
import {
  prepareStrategyIntake,
} from '../../../src/strategies/od-next/coordinator.js';

import {
  completeAutomaticSimpleProduction,
  projectStrategyTask,
  prepareAutomaticStrategyContinuation,
} from '../../../src/strategies/od-next/automatic-simple-production.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  compareAndTransitionStrategyTaskExecution,
  cancelStrategyTaskExecution,
} from '../../../src/strategies/task-store.js';
import {
  strategyTaskCreateIdentityFixture,
} from '../strategy-task-test-fixtures.js';
import { resolveStrategyHandoff, strategyHandoffTranscript } from '../../../src/strategies/od-next/task-handoff.js';
import { OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS } from '@open-design/contracts';

const AGENT_ID = 'codex';

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

  function markerHarness(planOnly = false) {
    const identity = strategyTaskCreateIdentityFixture();
    let task = createStrategyTaskExecution(db, {
      taskExecutionId: 'task-marker', projectId: 'project-1', conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId, selectedAgentId: 'codex', initialRunId: 'marker-request',
      ...identity,
      promptBundleText: identity.promptBundleText.replace('Frozen test output contract.', OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS),
      createdAt: 100,
    });
    if (planOnly) task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId, expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'request', outcome: 'running', executionMode: null, executionIntent: 'plan_only' },
    });
    const physical = new Map<string, { id: string; status: string }>();
    const service = createInternalRunCreationService<InternalRunCreateInput, { id: string; status: string }>({
      runs: {
        createOrReuse: () => {
          const existing = physical.get('marker-production');
          if (existing) return { kind: 'reused', run: existing };
          const run = { id: 'marker-production', status: 'queued' }; physical.set(run.id, run);
          return { kind: 'created', run };
        },
        prepareRestart: () => null, get: id => physical.get(id) ?? null,
        drop: run => { physical.delete(run.id); }, start: run => run,
        isTerminal: status => ['succeeded', 'failed', 'canceled'].includes(status),
      },
      claimAssistantMessage: (_run, options) => db.transaction(() => {
        options?.beforeClaimCommit?.(); return { ok: true };
      })(),
      analyticsLifecycle: { install: () => {} },
    });
    return { task, service, physical };
  }
  const productionMarker = '<od-production-ready key="5e819e50c013db87" />';
  function markerReply(text: string) {
    const stream = createOdNextRunProtocol(null, '5e819e50c013db87');
    stream.push(text); return stream.finish().parsed;
  }

  it.each([
    `Build a landing page and a deck.\n${productionMarker}`,
    `Build a landing page and a deck.${productionMarker}`,
    'Build a landing page and a deck.\n<od-production-ready key="5e819e50c013db87">',
    'Build a landing page and a deck.\n<od-production-ready key="5e819e50c013db87>',
    'Build a landing page and a deck.\nod-production-ready key="5e819e50c013db87"',
  ])('marker protocol continues once without a Plan Contract, then settles without an entry: %s', text => {
    const { task, service, physical } = markerHarness();
    const input = {
      db, service, task, parsed: markerReply(text),
      createMeta: (_stage: string, instruction: string) => ({ message: instruction }),
      completionEvidence: { physicalStatus: 'succeeded' as const, deliverableValid: false },
    };
    const continued = prepareAutomaticStrategyContinuation(input);
    expect(continued.start).toBe(true);
    expect(continued.result.task).toMatchObject({ inputStage: 'production', outcome: 'running' });
    expect(continued.result.task.planContract).toBeUndefined();
    expect(continued.result.task.runs).toHaveLength(2);
    expect(StrategyTaskProjectionV2Schema.safeParse(projectStrategyTask(continued.result.task)).success).toBe(true);
    expect(prepareAutomaticStrategyContinuation(input).start).toBe(false);
    expect(physical.size).toBe(1);
    const final = prepareAutomaticStrategyContinuation({
      ...input, task: getStrategyTaskExecution(db, task.taskExecutionId)!,
      parsed: markerReply(`Files written.\n<open-design-runtime-state>\n{broken}\n</open-design-runtime-state>\n${productionMarker}`),
    });
    expect(final.start).toBe(false);
    expect(final.result.action).toBe('completed'); expect(final.result.reasonCodes).toEqual([]);
    expect(final.result.task.runs).toHaveLength(2);
    expect(projectStrategyTask(final.result.task, 'marker-request')).toMatchObject({ settlementReason: 'continued' });
    expect(projectStrategyTask(final.result.task, 'marker-production')).toMatchObject({ settlementReason: 'ended' });
    expect(StrategyTaskProjectionV2Schema.safeParse(projectStrategyTask(final.result.task)).success).toBe(true);
  });

  it.each([
    ['ordinary answer', 'Hello'],
    ['missing marker', 'Plan is ready.'],
    ['wrong key', 'Plan is ready.\n<od-production-ready key="0000" />'],
    ['malformed legacy state', 'Done.\n<open-design-runtime-state>\n{}\n</open-design-runtime-state>'],
    ['pending question', `<question-form id="scope">{"questions":[{"id":"audience","label":"Who is this for?"}]}</question-form>\n${productionMarker}`],
  ])('marker protocol settles %s without an error or automatic turn', (_label, text) => {
    const { task, service, physical } = markerHarness();
    const result = prepareAutomaticStrategyContinuation({
      db, service, task, parsed: markerReply(text), createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
    });
    expect(result.start).toBe(false); expect(result.result.action).toBe('completed');
    expect(result.result.reasonCodes).toEqual([]); expect(physical.size).toBe(0);
  });

  it.each([
    { text: 'Hello', facts: {}, reason: 'text_only' },
    { text: '', facts: {}, reason: 'empty_reply' },
    { text: 'Partial answer', facts: { truncated: true }, reason: 'truncated' },
    { text: 'Still working', facts: { todoUnfinished: true }, reason: 'todo_unfinished' },
    { text: 'Delivered', facts: { deliverableValid: true, todoUnfinished: true }, reason: 'deliverable_valid' },
    { text: '<question-form id="scope">{"questions":[{"id":"audience","label":"Who?"}]}</question-form>', facts: {}, reason: 'question' },
  ])('persists host settlement $reason without declaring delivery', ({ text, facts, reason }) => {
    const { task, service, physical } = markerHarness();
    const result = prepareAutomaticStrategyContinuation({
      db, service, task, parsed: markerReply(text), createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false, ...facts },
    });
    expect(result.start).toBe(false);
    expect(physical.size).toBe(0);
    const reloaded = getStrategyTaskExecution(db, task.taskExecutionId)!;
    expect(projectStrategyTask(reloaded)).toMatchObject({
      outcome: 'completed', settlementReason: reason === 'question' ? 'question' : 'ended',
      deliverableValid: facts.deliverableValid === true, settlementFacts: facts,
    });
  });

  it.each(['failed', 'canceled'] as const)('marker protocol does not continue a %s process', status => {
    const { task, service, physical } = markerHarness();
    const result = prepareAutomaticStrategyContinuation({
      db, service, task, parsed: markerReply(`Ready.\n${productionMarker}`), createMeta: () => ({}),
      completionEvidence: { physicalStatus: status, deliverableValid: true },
    });
    expect(result.result.action).toBe(status === 'failed' ? 'completed' : 'canceled');
    expect(physical.size).toBe(0);
    expect(projectStrategyTask(result.result.task).settlementReason).toBe('ended');
  });

  it.each(['succeeded', 'failed', 'canceled'] as const)('marker fallback persists physical %s separately from delivery', status => {
    const { task } = markerHarness();
    const result = completeAutomaticSimpleProduction(db, {
      runId: task.latestRunId, physicalStatus: status, deliverableValid: false,
    });
    expect(result).toMatchObject({
      outcome: status === 'canceled' ? 'canceled' : 'completed',
      deliverableValid: false,
    });
    expect(projectStrategyTask(result!).deliverableValid).toBe(false);
  });

  it('does not inherit plan file evidence as production delivery', () => {
    const { task, service } = markerHarness();
    const next = prepareAutomaticStrategyContinuation({ db, service, task,
      parsed: markerReply(`Ready.\n${productionMarker}`), createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
    });
    expect(next.start).toBe(true);
    expect(projectStrategyTask(next.result.task).deliverableValid).toBe(false);
    expect(projectStrategyTask(next.result.task, task.latestRunId)).toMatchObject({
      deliverableValid: true, settlementReason: 'continued', settlementFacts: { deliverableValid: true },
    });
  });

  it('duplicate trailing current markers still claim exactly one production run', () => {
    const { task, service, physical } = markerHarness();
    const input = {
      db, service, task, parsed: markerReply(`Ready.\n${productionMarker}\n${productionMarker}`),
      createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded' as const, deliverableValid: false },
    };
    expect(prepareAutomaticStrategyContinuation(input).start).toBe(true);
    expect(prepareAutomaticStrategyContinuation(input).start).toBe(false);
    expect(physical.size).toBe(1);
  });

  it('records an ended task and failed physical status', () => {
    const { task } = markerHarness();
    const settled = completeAutomaticSimpleProduction(db, {
      runId: task.latestRunId, physicalStatus: 'failed', deliverableValid: false,
    })!;
    expect(projectStrategyTask(settled)).toMatchObject({
      outcome: 'completed', terminal: true, settlementReason: 'ended',
      settlementFacts: { physicalStatus: 'failed', deliverableValid: false },
    });
  });

  it('records simultaneous file, truncation and todo facts without overwriting them', () => {
    const { task, service } = markerHarness();
    prepareAutomaticStrategyContinuation({
      db, service, task, parsed: markerReply('Part of the deliverable is written.'), createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true, truncated: true, todoUnfinished: true },
    });
    expect(projectStrategyTask(getStrategyTaskExecution(db, task.taskExecutionId)!)).toMatchObject({
      settlementReason: 'ended',
      settlementFacts: { physicalStatus: 'succeeded', deliverableValid: true, truncated: true, todoUnfinished: true },
    });
  });

  it('marker protocol honors a locked plan-only task despite an emitted marker', () => {
    const { task, service, physical } = markerHarness(true);
    const result = prepareAutomaticStrategyContinuation({
      db, service, task, parsed: markerReply(`Plan only.\n${productionMarker}`), createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
    });
    expect(result.result.action).toBe('completed'); expect(physical.size).toBe(0);
  });

  it('marker protocol rejects a stale marker after cancellation and rolls back its claim', () => {
    const { task, service, physical } = markerHarness();
    cancelStrategyTaskExecution(db, { taskExecutionId: task.taskExecutionId, expectedRevision: task.revision, updatedAt: 110 });
    expect(() => prepareAutomaticStrategyContinuation({
      db, service, task, parsed: markerReply(`Ready.\n${productionMarker}`), createMeta: () => ({}),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
    })).toThrow();
    expect(physical.size).toBe(0);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)?.outcome).toBe('canceled');
  });

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

  it('selects only the current conversation task and preserves request, plan, and user constraints', () => {
    upsertMessage(db, 'conversation-1', { id: 'old-answer', role: 'assistant',
      content: 'Plan: blue background. <open-design-runtime-state>{invalid}</open-design-runtime-state>',
      runId: 'run-request', runStatus: 'succeeded', createdAt: 101 });
    const input = { projectId: 'project-1', conversationId: 'conversation-1' };
    const task = resolveStrategyHandoff(db, input, []);
    expect(task?.taskExecutionId).toBe('task-1');
    const context = strategyHandoffTranscript(db, task!);
    expect(context).toContain('Plan: blue background.');
    expect(context).not.toContain('{invalid}');
    expect(context).toContain('Original user request:');
    expect(resolveStrategyHandoff(db, { ...input, pluginId: 'other-plugin' }, [])).toBeNull();
    expect(() => resolveStrategyHandoff(db, { ...input, projectId: 'foreign', taskExecutionId: 'task-1' }, [])).toThrow('another project');
    expect(() => resolveStrategyHandoff(db, { ...input, taskExecutionId: 'missing' }, [])).toThrow('not found');
    expect(() => resolveStrategyHandoff(db, input, [{ id: 'live', status: 'running' }])).toThrow('still active');
    upsertMessage(db, 'conversation-1', { id: 'ordinary-answer', role: 'assistant', content: 'An unrelated answer.', createdAt: 102 });
    expect(resolveStrategyHandoff(db, input, [])).toBeNull();
  });

  it.each([
    ['a bundle written by the pre-reshape v2 composer', (target: Database.Database) => {
      // Same schema id as today's composer over a layout its parser no longer reads.
      const text = serializeCanonicalXml({
        kind: 'element',
        tag: 'open_design_prompt_bundle',
        attributes: [['schema', OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2]],
        children: [{ kind: 'element', tag: 'system_prompt', children: [{ kind: 'text', tag: 'core_system_prompt', text: 'stale' }] }],
      });
      const utf8Bytes = Buffer.byteLength(text, 'utf8');
      const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
      target.prepare(`UPDATE strategy_task_executions SET prompt_bundle_text=?, prompt_bundle_utf8_bytes=?, prompt_bundle_sha256=?
        WHERE task_execution_id='task-1'`).run(text, utf8Bytes, sha256);
      target.prepare(`UPDATE strategy_task_runs SET final_text=?, final_text_utf8_bytes=?, final_text_sha256=?
        WHERE run_id='run-request'`).run(text, utf8Bytes, sha256);
    }],
    ['a record version this build does not know', (target: Database.Database) => {
      target.prepare(`UPDATE strategy_task_executions SET schema_version=99 WHERE task_execution_id='task-1'`).run();
    }],
  ])('starts a new task instead of blocking the conversation when the previous task is %s', (_name, corrupt) => {
    upsertMessage(db, 'conversation-1', { id: 'old-answer', role: 'assistant', content: 'Plan: blue background.',
      runId: 'run-request', runStatus: 'succeeded', createdAt: 101 });
    corrupt(db);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => getStrategyTaskExecutionByRunId(db, 'run-request')).toThrow();
    const input = { projectId: 'project-1', conversationId: 'conversation-1' };
    expect(resolveStrategyHandoff(db, input, [])).toBeNull();
    expect(resolveStrategyHandoff(db, { ...input, clientRequestId: 'retry' },
      [{ id: 'run-request', status: 'succeeded', clientRequestId: 'retry' }])).toBeNull();
    expect(warn).toHaveBeenCalledWith('[od-next-task] previous task unreadable; follow-up starts a new task',
      expect.objectContaining({ runId: 'run-request' }));
  });

  it('lets a follow-up through while the previous Run only drains after a stop', () => {
    upsertMessage(db, 'conversation-1', { id: 'old-answer', role: 'assistant', content: 'Plan: blue background.',
      runId: 'run-request', runStatus: 'running', createdAt: 101 });
    const input = { projectId: 'project-1', conversationId: 'conversation-1' };
    expect(resolveStrategyHandoff(db, input,
      [{ id: 'run-request', status: 'running', cancelRequested: true }])?.taskExecutionId).toBe('task-1');
    expect(() => resolveStrategyHandoff(db, input, [{ id: 'run-request', status: 'running' }])).toThrow('still active');
    expect(() => resolveStrategyHandoff(db, input,
      [{ id: 'queued', status: 'queued', cancelRequested: false }])).toThrow('still active');
  });

  it('ignores broken historical model contracts while keeping source tasks immutable', () => {
    db.prepare(`UPDATE strategy_task_executions SET plan_contract_json=?, plan_contract_hash=? WHERE task_execution_id=?`)
      .run('{not json', 'wrong hash', 'task-1');
    const task = getStrategyTaskExecution(db, 'task-1')!;
    expect(task.planContract).toBeUndefined();
    const source = db.prepare('SELECT * FROM strategy_task_executions WHERE task_execution_id=?').get('task-1');
    const next = createStrategyTaskExecution(db, {
      taskExecutionId: 'handed-off', projectId: 'project-1', conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: 'new-request',
      continuedFromTaskExecutionId: task.taskExecutionId, ...strategyTaskCreateIdentityFixture(), createdAt: 200,
    });
    expect(next.continuedFromTaskExecutionId).toBe('task-1');
    expect(next.intentResolution).toBeNull();
    expect(next.runs).toHaveLength(1);
    expect(db.prepare('SELECT * FROM strategy_task_executions WHERE task_execution_id=?').get('task-1')).toEqual(source);
  });

  it('reports unavailable host capabilities before the agent runs', () => {
    const result = prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: { ...intakePassed, selectedAgentAvailable: false },
    });
    expect(result).toEqual({ ok: false, reasonCodes: ['od_next_preflight_agent_unavailable'] });
  });
});
