import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import {
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
  OD_NEXT_REQUEST_TURN_SCHEMA_V1,
  deriveOdNextPromptBundleV2,
  serializeCanonicalXml,
  serializeOdNextPromptBundleV1,
  type AppliedPluginSnapshot,
} from '@open-design/contracts';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase } from '../../src/db.js';
import { bindOdNextExactSendPromptEvidence, assertOdNextExactSendPromptEvidence, buildPromptStackTelemetry } from '../../src/prompt-telemetry.js';
import { createSnapshot, getSnapshot, pruneExpiredSnapshots } from '../../src/plugins/snapshots.js';
import { reconcileDurableRunTerminals } from '../../src/runtimes/run-terminal-reconciliation.js';
import {
  StrategyTaskTransitionConflictError,
  InvalidStrategyTaskRecordError,
  isInitialStrategyTaskRun,
  reconcileStrategyTaskRunTerminal,
  type CompareAndTransitionStrategyTaskInput,
  cancelStrategyTaskExecution,
  compareAndTransitionStrategyTaskExecution as compareAndTransitionStrategyTaskExecutionRaw,
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  migrateStrategyTaskStore,
  strategyTaskTurnsForRunIds,
} from '../../src/strategies/task-store.js';
import {
  TEST_PROMPT_BUNDLE,
  strategyTaskCreateIdentityFixture,
  strategyTaskTurnText,
} from './strategy-task-test-fixtures.js';

const AGENT_ID = 'codex';

// A bundle written by the pre-reshape v2 composer: the same schema id today's
// composer stamps, wrapped in the `system_prompt` element that the reshape
// replaced with `open_design_core_system_prompt`.
const STALE_V2_PROMPT_BUNDLE = serializeCanonicalXml({
  kind: 'element',
  tag: 'open_design_prompt_bundle',
  attributes: [['schema', OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2]],
  children: [
    {
      kind: 'element',
      tag: 'system_prompt',
      children: [{ kind: 'text', tag: 'core_system_prompt', text: 'stale' }],
    },
  ],
});

// A row persisted before the v2 composer landed, byte-for-byte.
const LEGACY_PROMPT_BUNDLE = serializeOdNextPromptBundleV1({
  systemPrompt: 'Frozen legacy system prompt.',
  userPrompt: '遗留的用户请求。',
  taskConfig: 'Frozen legacy task configuration.',
  context: 'Frozen legacy context.',
});

function finalTextColumns(text: string) {
  return {
    text,
    utf8Bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

/**
 * Rewrite a task's persisted Bundle row to a given schema label and text with a
 * self-consistent byte count and digest, so the only thing under test is how
 * reads dispatch on the stored version -- never a tamper signal.
 */
function persistBundleAs(
  db: Database.Database,
  taskExecutionId: string,
  schema: string,
  text: string,
): void {
  const columns = finalTextColumns(text);
  db.prepare(`
    UPDATE strategy_task_executions
       SET prompt_bundle_schema = ?, prompt_bundle_text = ?,
           prompt_bundle_utf8_bytes = ?, prompt_bundle_sha256 = ?
     WHERE task_execution_id = ?
  `).run(schema, columns.text, columns.utf8Bytes, columns.sha256, taskExecutionId);
  db.prepare(`
    UPDATE strategy_task_runs
       SET final_text_schema = ?, final_text = ?,
           final_text_utf8_bytes = ?, final_text_sha256 = ?
     WHERE task_execution_id = ? AND task_run_index = 0
  `).run(schema, columns.text, columns.utf8Bytes, columns.sha256, taskExecutionId);
}

type TestTransitionInput = Omit<CompareAndTransitionStrategyTaskInput, 'nextRun'> & {
  nextRun?: Omit<NonNullable<CompareAndTransitionStrategyTaskInput['nextRun']>, 'finalText'> & {
    finalText?: string;
  };
};

function compareAndTransitionStrategyTaskExecution(
  db: Database.Database,
  input: TestTransitionInput,
) {
  const current = getStrategyTaskExecution(db, input.taskExecutionId);
  if (input.nextRun && !current) throw new Error('test task missing');
  const nextRun = input.nextRun
    ? {
        ...input.nextRun,
        finalText: input.nextRun.finalText ?? strategyTaskTurnText({
          taskExecutionId: input.taskExecutionId,
          inputStage: input.to.inputStage as Exclude<typeof input.to.inputStage, 'request'>,
          taskRunIndex: current!.runs.length,
        }),
      }
    : undefined;
  const { nextRun: _nextRun, ...restValue } = input;
  const rest: Omit<CompareAndTransitionStrategyTaskInput, 'nextRun'> = restValue;
  return compareAndTransitionStrategyTaskExecutionRaw(db, {
    ...rest,
    ...(nextRun ? { nextRun } : {}),
  });
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

function seedParents(db: Database.Database): AppliedPluginSnapshot {
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run('project-1', 'Project 1', 1, 1);
  db.prepare(
    `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('conversation-1', 'project-1', 'Conversation 1', 1, 1);
  return createStrategySnapshot(db);
}

function createTask(
  db: Database.Database,
  snapshot: AppliedPluginSnapshot,
  runId = 'run-request',
  taskExecutionId = 'task-1',
) {
  return createStrategyTaskExecution(db, {
    taskExecutionId,
    projectId: 'project-1',
    conversationId: 'conversation-1',
    snapshotId: snapshot.snapshotId,
    selectedAgentId: AGENT_ID,
    initialRunId: runId,
    ...strategyTaskCreateIdentityFixture(),
    createdAt: 100,
  });
}

describe('durable strategy task store', () => {
  let tempDir: string;
  let db: Database.Database;
  let snapshot: AppliedPluginSnapshot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-strategy-task-store-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    snapshot = seedParents(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function startBuildRound(task: ReturnType<typeof createTask>, options: {
    runId?: string;
    kind?: 'turn' | 'bundle';
    reason?: 'note_only' | 'text_only' | 'todo_unfinished' | 'truncated' | 'write_evidence_unknown';
    updatedAt?: number;
  } = {}) {
    const runId = options.runId ?? 'run-build';
    const kind = options.kind ?? 'turn';
    return compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple' },
      nextRun: {
        runId,
        sourceRunId: task.latestRunId,
        kind,
        finalText: kind === 'bundle'
          ? deriveOdNextPromptBundleV2(task.promptBundle.text, { userFirstPrompt: 'Build round in a new process.' })
          : strategyTaskTurnText({ taskExecutionId: task.taskExecutionId, inputStage: 'production', taskRunIndex: task.runs.length }),
      },
      autoRound: { reason: options.reason ?? 'note_only' },
      ...(options.updatedAt === undefined ? {} : { updatedAt: options.updatedAt }),
    });
  }

  it('adds nullable/versioned tables without changing ordinary Run queries', () => {
    const columns = db.prepare('PRAGMA table_info(strategy_task_executions)').all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'schema_version', notnull: 1 }),
      expect.objectContaining({ name: 'route', notnull: 0 }),
      expect.objectContaining({ name: 'execution_mode', notnull: 0 }),
      expect.objectContaining({ name: 'plan_contract_hash', notnull: 0 }),
      expect.objectContaining({ name: 'settlement_reason', notnull: 0 }),
      expect.objectContaining({ name: 'auto_round_count', notnull: 1 }),
      expect.objectContaining({ name: 'deliverable_written', notnull: 1 }),
    ]));
    expect(getStrategyTaskExecution(db, 'ordinary-run')).toBeNull();
    expect(getStrategyTaskExecutionByRunId(db, 'ordinary-run')).toBeNull();

    const legacy = new Database(':memory:');
    legacy.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT);
      INSERT INTO projects (id) VALUES ('legacy-project');
      INSERT INTO conversations (id, project_id) VALUES ('legacy-conversation', 'legacy-project');
    `);
    expect(() => migrateStrategyTaskStore(legacy)).not.toThrow();
    expect(getStrategyTaskExecutionByRunId(legacy, 'legacy-run')).toBeNull();
    legacy.close();
  });

  it('persists the canonical Unicode Bundle and all frozen input identities exactly', () => {
    const task = createTask(db, snapshot);
    expect(task.promptBundle).toMatchObject({
      kind: 'bundle',
      schema: OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
      text: expect.stringContaining('冻结的用户请求。'),
      utf8Bytes: Buffer.byteLength(task.promptBundle.text, 'utf8'),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(task.promptBundle.utf8Bytes).toBeGreaterThan(task.promptBundle.text.length);
    expect(task.runs[0]?.finalText).toEqual(task.promptBundle);
    expect(task.frozenInputIdentity).toEqual({
      schema: 'open-design.od-next-frozen-input-identity/v1',
      snapshotId: snapshot.snapshotId,
      strategyPackageHash: snapshot.strategy!.packageHash,
      frozenSkillPackageIdentity: strategyTaskCreateIdentityFixture().frozenSkillPackage.identity,
      taskInputManifestSha256: 'd'.repeat(64),
    });
  });

  it('creates a task locked to the one route and mode this daemon runs, with nothing settled yet', () => {
    const task = createTask(db, snapshot);
    expect(task).toMatchObject({
      schemaVersion: 1,
      revision: 0,
      taskExecutionId: 'task-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      strategyId: 'od-next-strategy',
      strategyVersion: '2.0.0',
      strategyPackageHash: snapshot.strategy!.packageHash,
      selectedAgentId: AGENT_ID,
      route: 'full_plan',
      inputStage: 'request',
      outcome: 'running',
      executionMode: 'simple',
      clarificationCount: 0,
      planContractRepairAttempts: 0,
      settlementReason: null,
      autoRoundCount: 0,
      deliverableWritten: false,
      initialRunId: 'run-request',
      latestRunId: 'run-request',
      activeRunId: 'run-request',
      terminalRunId: null,
      runs: [{ runId: 'run-request', inputStage: 'request', taskRunIndex: 0 }],
    });
    expect(task.planContractHash).toBeUndefined();
    expect(isInitialStrategyTaskRun(task, 'run-request')).toBe(true);
    expect(getStrategyTaskExecutionByRunId(db, 'run-request')).toEqual(task);
    expect(task.frozenSkillPackage).toMatchObject({
      schema: 'open-design.od-next-frozen-skill-package/v1',
      selections: [],
    });

    const ordinary = createSnapshot(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      pluginId: 'ordinary-plugin',
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'ordinary',
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
    expect(() => createStrategyTaskExecution(db, {
      taskExecutionId: 'task-ordinary',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: ordinary.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-ordinary',
      ...strategyTaskCreateIdentityFixture(),
    })).toThrow(/verified OD Next strategy binding/i);

    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-2', 'Project 2', 1, 1);
    db.prepare(
      `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conversation-2', 'project-2', 'Conversation 2', 1, 1);
    expect(() => createStrategyTaskExecution(db, {
      taskExecutionId: 'task-cross-project',
      projectId: 'project-2',
      conversationId: 'conversation-2',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-cross-project',
      ...strategyTaskCreateIdentityFixture(),
    })).toThrow(/Snapshot owner/i);

    db.prepare(`
      UPDATE strategy_task_executions
         SET project_id = 'project-2', conversation_id = 'conversation-2'
       WHERE task_execution_id = ?
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/Snapshot owner/i);
  });

  it('settles a task with its reason and keeps the delivered fact sticky', () => {
    const task = createTask(db, snapshot);
    expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'request', outcome: 'completed', executionMode: 'simple' },
    })).toThrow(/requires its settlement/i);
    expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'request', outcome: 'running', executionMode: 'simple' },
      settlement: { reason: 'question', deliverableWritten: false },
    })).toThrow(/only valid when transitioning to completed/i);

    const settled = compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'request', outcome: 'completed', executionMode: 'simple' },
      settlement: { reason: 'deliverable_changed', deliverableWritten: true },
      updatedAt: 200,
    });
    expect(settled).toMatchObject({
      outcome: 'completed',
      settlementReason: 'deliverable_changed',
      deliverableWritten: true,
      autoRoundCount: 0,
      terminalRunId: 'run-request',
      activeRunId: null,
    });
    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toEqual(settled);
    expect(strategyTaskTurnsForRunIds(db, ['run-request'], { projectId: 'project-1', conversationId: 'conversation-1' }).get('run-request'))
      .toEqual({ taskExecutionId: task.taskExecutionId, taskRunIndex: 0, delivered: true, blocked: false, blockedText: null });
  });

  it('claims one automatic build round into a continued session and refuses a second', () => {
    const task = createTask(db, snapshot);
    const building = startBuildRound(task, { updatedAt: 200 });
    expect(building).toMatchObject({
      inputStage: 'production',
      outcome: 'running',
      autoRoundCount: 1,
      latestRunId: 'run-build',
      activeRunId: 'run-build',
    });
    expect(building.runs.map((run) => [run.inputStage, run.finalText.kind, run.finalText.schema])).toEqual([
      ['request', 'bundle', OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2],
      ['production', 'turn', OD_NEXT_REQUEST_TURN_SCHEMA_V1],
    ]);
    expect(isInitialStrategyTaskRun(building, 'run-build')).toBe(false);
    expect(getStrategyTaskExecutionByRunId(db, 'run-build')).toEqual(building);

    // The build round did not deliver either: the task settles, and the
    // "continue remaining tasks" offer reads the reason and the missing fact.
    const settled = compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: building.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'completed', executionMode: 'simple' },
      settlement: { reason: 'todo_unfinished', deliverableWritten: false },
      updatedAt: 300,
    });
    expect(settled).toMatchObject({ outcome: 'completed', settlementReason: 'todo_unfinished', deliverableWritten: false, autoRoundCount: 1 });
    expect(strategyTaskTurnsForRunIds(db, ['run-build'], { projectId: 'project-1', conversationId: 'conversation-1' }).get('run-build'))
      .toMatchObject({ taskRunIndex: 1, delivered: false });

    const second = createTask(db, snapshot, 'run-request-2', 'task-2');
    const secondBuilding = startBuildRound(second, { runId: 'run-build-2' });
    expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: second.taskExecutionId,
      expectedRevision: secondBuilding.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple' },
      nextRun: {
        runId: 'run-build-3',
        sourceRunId: 'run-build-2',
        finalText: strategyTaskTurnText({ taskExecutionId: second.taskExecutionId, inputStage: 'production', taskRunIndex: 2 }),
      },
      autoRound: { reason: 'text_only' },
    })).toThrow(/exactly one automatic round|different physical stage/i);
  });

  it('claims a cold-started build round as a derived Bundle and reopens it exactly', () => {
    const task = createTask(db, snapshot);
    const building = startBuildRound(task, { kind: 'bundle', runId: 'run-cold-build', updatedAt: 200 });
    const mapping = building.runs[1]!;
    expect(mapping.finalText).toMatchObject({ kind: 'bundle', schema: OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2 });
    expect(mapping.finalText.text).toContain('Build round in a new process.');
    expect(mapping.finalText.text).not.toBe(task.promptBundle.text);
    // The first round's Bundle is untouched and still identifies the task.
    expect(building.promptBundle).toEqual(task.promptBundle);
    expect(isInitialStrategyTaskRun(building, 'run-cold-build')).toBe(false);
    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    const reopened = getStrategyTaskExecutionByRunId(db, 'run-cold-build');
    expect(reopened?.runs[1]?.finalText).toEqual(mapping.finalText);

    // Exact-send evidence accepts a Bundle on a later Run, and refuses a Bundle
    // on the first Run that is not at the request stage.
    const telemetry = bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({ composedPrompt: mapping.finalText.text, sections: [{ kind: 'odNextExactFinalText', content: mapping.finalText.text }] }),
      finalText: mapping.finalText.text, persisted: mapping.finalText, stage: 'production', taskRunIndex: 1,
    });
    expect(telemetry.odNextExactSend).toMatchObject({ kind: 'bundle', stage: 'production' });
    expect(() => assertOdNextExactSendPromptEvidence({ telemetry, persisted: mapping.finalText, stage: 'production', taskRunIndex: 1 })).not.toThrow();
    expect(() => bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({ composedPrompt: mapping.finalText.text, sections: [{ kind: 'odNextExactFinalText', content: mapping.finalText.text }] }),
      finalText: mapping.finalText.text, persisted: mapping.finalText, stage: 'production', taskRunIndex: 0,
    })).toThrow(/does not match its mapped task stage/i);
  });

  it('rejects a corrupt Bundle offered as a cold-started build round', () => {
    const task = createTask(db, snapshot);
    expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple' },
      nextRun: { runId: 'run-bad-bundle', sourceRunId: 'run-request', kind: 'bundle', finalText: STALE_V2_PROMPT_BUNDLE },
      autoRound: { reason: 'note_only' },
    })).toThrow();
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({ revision: 0, latestRunId: 'run-request' });
  });

  it('binds exact-send evidence for a first round sent without its transcript', () => {
    const task = createTask(db, snapshot);
    const sent = deriveOdNextPromptBundleV2(task.promptBundle.text, { context: { priorTranscript: undefined } });
    const withTranscript = deriveOdNextPromptBundleV2(task.promptBundle.text, { context: { priorTranscript: '## user\nearlier' } });
    db.prepare(`UPDATE strategy_task_executions SET prompt_bundle_text = ?, prompt_bundle_utf8_bytes = ?, prompt_bundle_sha256 = ? WHERE task_execution_id = ?`)
      .run(withTranscript, Buffer.byteLength(withTranscript, 'utf8'), createHash('sha256').update(withTranscript, 'utf8').digest('hex'), task.taskExecutionId);
    db.prepare(`UPDATE strategy_task_runs SET final_text = ?, final_text_utf8_bytes = ?, final_text_sha256 = ? WHERE run_id = 'run-request'`)
      .run(withTranscript, Buffer.byteLength(withTranscript, 'utf8'), createHash('sha256').update(withTranscript, 'utf8').digest('hex'));
    const persisted = getStrategyTaskExecution(db, task.taskExecutionId)!.runs[0]!.finalText;
    const telemetry = bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({ composedPrompt: sent, sections: [{ kind: 'odNextExactFinalText', content: sent }] }),
      finalText: sent, persisted, stage: 'request', taskRunIndex: 0, derivation: 'prior_transcript_omitted',
    });
    expect(telemetry.odNextExactSend).toMatchObject({ kind: 'bundle', derivation: 'prior_transcript_omitted' });
    expect(telemetry.odNextExactSend?.sha256).not.toBe(persisted.sha256);
    expect(() => assertOdNextExactSendPromptEvidence({ telemetry, persisted, stage: 'request', taskRunIndex: 0 })).not.toThrow();
    // The derivation is only honest when the sent text really is the persisted text minus the slot.
    expect(() => bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({ composedPrompt: withTranscript, sections: [{ kind: 'odNextExactFinalText', content: withTranscript }] }),
      finalText: withTranscript, persisted, stage: 'request', taskRunIndex: 0, derivation: 'prior_transcript_omitted',
    })).toThrow(/does not match its persisted SHA-256/u);
  });

  it('loads rows an earlier daemon wrote with the stages, outcomes and supplemental rounds it used', () => {
    // A task that asked a question, got the answer as a clarification round,
    // then a supplemental intent round on the same stage, and was blocked.
    const task = createTask(db, snapshot, 'run-legacy-request', 'task-legacy');
    const clarificationText = strategyTaskTurnText({ taskExecutionId: task.taskExecutionId, inputStage: 'clarification', taskRunIndex: 1 });
    const supplementalText = '<open_design_intent_resolution_turn schema="open-design.od-next-intent-resolution-turn/v1" purpose="intent_resolution">\n  <payload>\n    <![CDATA[Resolve the intent.]]>\n  </payload>\n</open_design_intent_resolution_turn>';
    const insertRun = db.prepare(`INSERT INTO strategy_task_runs(task_execution_id,run_id,input_stage,task_run_index,source_run_id,final_text_kind,final_text_schema,final_text,final_text_utf8_bytes,final_text_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insertRun.run(task.taskExecutionId, 'run-legacy-clarification', 'clarification', 1, 'run-legacy-request', 'turn', OD_NEXT_REQUEST_TURN_SCHEMA_V1, clarificationText, Buffer.byteLength(clarificationText, 'utf8'), createHash('sha256').update(clarificationText, 'utf8').digest('hex'), 150);
    insertRun.run(task.taskExecutionId, 'run-legacy-intent', 'clarification', 2, 'run-legacy-clarification', 'turn', 'open-design.od-next-intent-resolution-turn/v1', supplementalText, Buffer.byteLength(supplementalText, 'utf8'), createHash('sha256').update(supplementalText, 'utf8').digest('hex'), 160);
    db.prepare(`UPDATE strategy_task_executions SET route = 'full_plan', input_stage = 'clarification', outcome = 'blocked', execution_mode = NULL,
      execution_intent = 'plan_only', clarification_count = 1, latest_run_id = 'run-legacy-intent', updated_at = 170,
      blocked_reason_codes_json = ?, blocked_visible_text = NULL, plan_contract_hash = ? WHERE task_execution_id = ?`)
      .run(JSON.stringify(['od_next_protocol_execution_intent_mismatch']), 'f'.repeat(64), task.taskExecutionId);

    const legacy = getStrategyTaskExecution(db, task.taskExecutionId);
    expect(legacy).toMatchObject({
      route: 'full_plan',
      inputStage: 'clarification',
      outcome: 'blocked',
      executionMode: null,
      clarificationCount: 1,
      planContractHash: 'f'.repeat(64),
      settlementReason: null,
      autoRoundCount: 0,
      deliverableWritten: false,
      terminalRunId: 'run-legacy-intent',
      blockedContext: { reasonCodes: ['od_next_protocol_execution_intent_mismatch'], visibleText: null },
    });
    expect(legacy?.runs.map((run) => [run.inputStage, run.finalText.schema])).toEqual([
      ['request', OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2],
      ['clarification', OD_NEXT_REQUEST_TURN_SCHEMA_V1],
      ['clarification', 'open-design.od-next-intent-resolution-turn/v1'],
    ]);
    expect(getStrategyTaskExecutionByRunId(db, 'run-legacy-intent')).toEqual(legacy);
    // Terminal rows stay sticky whatever vocabulary they carry.
    expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: legacy!.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple' },
      nextRun: { runId: 'run-resurrected', sourceRunId: 'run-legacy-intent', finalText: strategyTaskTurnText({ taskExecutionId: task.taskExecutionId, inputStage: 'production', taskRunIndex: 3 }) },
    })).toThrow(/terminal/i);
  });

  it('no longer writes the stages and outcomes of the removed rounds', () => {
    const task = createTask(db, snapshot);
    for (const [inputStage, outcome] of [
      ['clarification', 'running'],
      ['contract_repair', 'running'],
    ] as const) {
      expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
        taskExecutionId: task.taskExecutionId,
        expectedRevision: task.revision,
        to: { route: 'full_plan', inputStage, outcome, executionMode: 'simple' },
        nextRun: { runId: `run-${inputStage}`, sourceRunId: 'run-request', finalText: strategyTaskTurnText({ taskExecutionId: task.taskExecutionId, inputStage, taskRunIndex: 1 }) },
      })).toThrow(/no longer written/i);
    }
    for (const outcome of ['clarification_required', 'plan_ready'] as const) {
      expect(() => compareAndTransitionStrategyTaskExecutionRaw(db, {
        taskExecutionId: task.taskExecutionId,
        expectedRevision: task.revision,
        to: { route: 'full_plan', inputStage: 'request', outcome, executionMode: 'simple' },
      })).toThrow(/no longer written/i);
    }
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({ revision: 0, outcome: 'running' });
  });

  it('reopens the exact Bundle and build-round Turn without cold reseeding', () => {
    const initial = createTask(db, snapshot);
    const buildText = strategyTaskTurnText({
      taskExecutionId: initial.taskExecutionId,
      inputStage: 'production',
      taskRunIndex: 1,
      payload: 'Frozen build instruction.',
    });
    const continued = compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: initial.taskExecutionId,
      expectedRevision: initial.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple' },
      nextRun: { runId: 'run-restart-build', sourceRunId: initial.latestRunId, finalText: buildText },
      autoRound: { reason: 'note_only' },
    });
    const expectedBundle = continued.promptBundle;
    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });

    const reopened = getStrategyTaskExecution(db, initial.taskExecutionId);
    expect(reopened?.promptBundle).toEqual(expectedBundle);
    expect(reopened?.runs[0]?.finalText).toEqual(expectedBundle);
    expect(reopened?.runs[1]?.finalText.text).toBe(buildText);
  });

  it('fails closed on persisted Bundle text, byte count, digest, or frozen owner tampering', () => {
    const tamperCases = [
      `UPDATE strategy_task_runs SET final_text = final_text || 'x' WHERE task_execution_id = 'task-1'`,
      `UPDATE strategy_task_runs SET final_text_utf8_bytes = final_text_utf8_bytes + 1 WHERE task_execution_id = 'task-1'`,
      `UPDATE strategy_task_executions SET prompt_bundle_sha256 = ? WHERE task_execution_id = 'task-1'`,
      `UPDATE strategy_task_executions SET frozen_input_identity_json = '{}' WHERE task_execution_id = 'task-1'`,
    ] as const;
    for (const [index, sql] of tamperCases.entries()) {
      const taskId = `task-tamper-${index}`;
      createStrategyTaskExecution(db, {
        taskExecutionId: taskId,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId,
        selectedAgentId: AGENT_ID,
        initialRunId: `run-tamper-${index}`,
        ...strategyTaskCreateIdentityFixture(),
      });
      const statement = sql.replaceAll("'task-1'", `'${taskId}'`);
      if (statement.includes('prompt_bundle_sha256 = ?')) {
        db.prepare(statement).run('0'.repeat(64));
      } else {
        db.exec(statement);
      }
      expect(() => getStrategyTaskExecution(db, taskId)).toThrow(
        /persisted|identity|Bundle|final text/i,
      );
    }
  });

  it('keeps a v1 persisted Prompt Bundle row readable at its own stored version', () => {
    const task = createTask(db, snapshot);
    persistBundleAs(
      db,
      task.taskExecutionId,
      OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
      LEGACY_PROMPT_BUNDLE,
    );

    const reopened = getStrategyTaskExecution(db, task.taskExecutionId);
    expect(reopened?.promptBundle).toEqual({
      kind: 'bundle',
      schema: OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
      ...finalTextColumns(LEGACY_PROMPT_BUNDLE),
    });
    expect(reopened?.promptBundle.text).toContain('遗留的用户请求。');
    // The read path replays the stored version instead of minting the current
    // one, so the legacy row is not silently relabelled on the way out.
    expect(reopened?.runs[0]?.finalText).toEqual(reopened?.promptBundle);
    expect(getStrategyTaskExecutionByRunId(db, task.initialRunId)).toEqual(reopened);

    // A build round into a continued session still works on top of a legacy
    // Bundle, and its Turn keeps its own single version.
    const continued = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple' },
      nextRun: { runId: 'run-legacy-build', sourceRunId: task.initialRunId },
      autoRound: { reason: 'note_only' },
    });
    expect(continued.promptBundle.schema).toBe(OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1);
    expect(continued.runs[1]?.finalText.schema).toBe(OD_NEXT_REQUEST_TURN_SCHEMA_V1);
    expect(getStrategyTaskExecutionByRunId(db, 'run-legacy-build')?.promptBundle)
      .toEqual(reopened?.promptBundle);
  });

  it('fails closed when a stored Bundle schema label disagrees with its text version', () => {
    const mislabeledV1 = createTask(db, snapshot, 'run-mislabeled-v1', 'task-mislabeled-v1');
    persistBundleAs(db, mislabeledV1.taskExecutionId, OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1, TEST_PROMPT_BUNDLE);
    expect(() => getStrategyTaskExecution(db, mislabeledV1.taskExecutionId)).toThrow(/canonical|Prompt Bundle/i);
    expect(() => getStrategyTaskExecutionByRunId(db, 'run-mislabeled-v1')).toThrow(/canonical|Prompt Bundle/i);

    const mislabeledV2 = createTask(db, snapshot, 'run-mislabeled-v2', 'task-mislabeled-v2');
    persistBundleAs(db, mislabeledV2.taskExecutionId, OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2, LEGACY_PROMPT_BUNDLE);
    expect(() => getStrategyTaskExecution(db, mislabeledV2.taskExecutionId)).toThrow(/canonical|Prompt Bundle/i);
    expect(() => getStrategyTaskExecutionByRunId(db, 'run-mislabeled-v2')).toThrow(/canonical|Prompt Bundle/i);

    // A Turn schema on a Bundle row is a corrupt kind/schema pairing, not a
    // version this store may tolerate.
    const crossKind = createTask(db, snapshot, 'run-cross-kind', 'task-cross-kind');
    persistBundleAs(db, crossKind.taskExecutionId, OD_NEXT_REQUEST_TURN_SCHEMA_V1, TEST_PROMPT_BUNDLE);
    expect(() => getStrategyTaskExecution(db, crossKind.taskExecutionId)).toThrow(/versioned final text/i);
  });

  it('rejects a legacy v1 Bundle offered as freshly composed task text', () => {
    expect(() => createStrategyTaskExecution(db, {
      taskExecutionId: 'task-legacy-compose',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-legacy-compose',
      ...strategyTaskCreateIdentityFixture(),
      promptBundleText: LEGACY_PROMPT_BUNDLE,
    })).toThrow(/Prompt Bundle/i);
    expect(getStrategyTaskExecution(db, 'task-legacy-compose')).toBeNull();
  });

  it('fails closed when a mapped task loses its required frozen Skill row', () => {
    const task = createTask(db, snapshot);
    db.prepare(
      'DELETE FROM strategy_task_frozen_skill_packages WHERE task_execution_id = ?',
    ).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId))
      .toThrow(/missing its frozen Skill package/i);
    expect(() => getStrategyTaskExecutionByRunId(db, task.initialRunId))
      .toThrow(/missing its frozen Skill package/i);
  });

  it('pins the task Snapshot while pruning an ordinary expired Snapshot in the same sweep', () => {
    const ordinarySnapshot = createStrategySnapshot(db);
    const sweepAt = Date.now() + 1_000;
    db.prepare(`
      UPDATE applied_plugin_snapshots SET expires_at = ? WHERE id IN (?, ?)
    `).run(sweepAt - 1, snapshot.snapshotId, ordinarySnapshot.snapshotId);

    createTask(db, snapshot);

    const pinned = db.prepare(`
      SELECT run_id AS runId, expires_at AS expiresAt
        FROM applied_plugin_snapshots WHERE id = ?
    `).get(snapshot.snapshotId) as { runId: string | null; expiresAt: number | null };
    expect(pinned).toEqual({ runId: null, expiresAt: null });

    const result = pruneExpiredSnapshots(db, { now: sweepAt, before: sweepAt });
    expect(result).toEqual({ removed: 1, ids: [ordinarySnapshot.snapshotId] });
    expect(getSnapshot(db, snapshot.snapshotId)).not.toBeNull();
    expect(getSnapshot(db, ordinarySnapshot.snapshotId)).toBeNull();
  });

  it('uses a transactional revision CAS so concurrent next-Run claims produce one mapping', () => {
    const task = createTask(db, snapshot);
    const first = startBuildRound(task, { runId: 'run-build-a' });
    expect(first.latestRunId).toBe('run-build-a');
    expect(() => startBuildRound(task, { runId: 'run-build-b' })).toThrow(StrategyTaskTransitionConflictError);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)?.runs).toHaveLength(2);
    expect(getStrategyTaskExecutionByRunId(db, 'run-build-b')).toBeNull();
  });

  it('rolls back the task CAS when a next-Run uniqueness or validation failure follows it', () => {
    const task = createTask(db, snapshot);
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-2',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'already-claimed-run',
      ...strategyTaskCreateIdentityFixture(),
    });

    expect(() => startBuildRound(task, { runId: 'already-claimed-run' })).toThrow(StrategyTaskTransitionConflictError);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({
      revision: 0,
      inputStage: 'request',
      autoRoundCount: 0,
      latestRunId: 'run-request',
      runs: [{ runId: 'run-request' }],
    });

    expect(() => startBuildRound(task, { runId: '   ' })).toThrow(/nextRun.runId/i);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({ revision: 0, latestRunId: 'run-request' });
  });

  it('replays the complete persisted Run chain and rejects source, stage, route, or time tampering', () => {
    let task = createTask(db, snapshot);
    task = startBuildRound(task, { updatedAt: 200 });
    const replayed = getStrategyTaskExecution(db, task.taskExecutionId);
    expect(replayed).toEqual(task);
    expect(replayed?.runs.map(({ runId, sourceRunId, inputStage }) => [runId, sourceRunId, inputStage])).toEqual([
      ['run-request', undefined, 'request'],
      ['run-build', 'run-request', 'production'],
    ]);

    const tamperCases = [
      [`UPDATE strategy_task_runs SET source_run_id = 'elsewhere' WHERE run_id = 'run-build'`, /immediately preceding/i],
      [`UPDATE strategy_task_runs SET input_stage = 'request' WHERE run_id = 'run-build'`, /Only the initial|request stage|backward/i],
      [`UPDATE strategy_task_executions SET route = 'direct_edit' WHERE task_execution_id = 'task-1'`, /Direct Edit|Run/i],
      [`UPDATE strategy_task_runs SET created_at = 50 WHERE run_id = 'run-build'`, /monotonic/i],
      [`UPDATE strategy_task_executions SET latest_run_id = 'run-request' WHERE task_execution_id = 'task-1'`, /initial\/latest/i],
    ] as const;
    for (const [sql, message] of tamperCases) {
      db.exec('SAVEPOINT tamper');
      db.exec(sql);
      expect(() => getStrategyTaskExecution(db, 'task-1'), sql).toThrow(message);
      db.exec('ROLLBACK TO tamper');
      db.exec('RELEASE tamper');
    }
    expect(getStrategyTaskExecution(db, 'task-1')).toEqual(task);
  });

  it('keeps terminal outcomes sticky and cancellation distinct from blocked', () => {
    let task = createTask(db, snapshot);
    task = cancelStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      updatedAt: 200,
    });
    expect(task).toMatchObject({ outcome: 'canceled', terminalRunId: 'run-request', settlementReason: null });
    expect(() => startBuildRound(task, { runId: 'resurrected-run' })).toThrow(/terminal/i);

    const failed = createTask(db, snapshot, 'run-failed', 'task-failed');
    expect(reconcileStrategyTaskRunTerminal(db, { runId: 'run-failed', status: 'failed', updatedAt: 200 })).toBe(true);
    expect(getStrategyTaskExecution(db, failed.taskExecutionId)).toMatchObject({
      outcome: 'blocked',
      blockedContext: { reasonCodes: ['od_next_physical_run_interrupted'], visibleText: null },
    });
  });

  it('leaves an unmapped ordinary physical Run untouched during startup reconciliation', async () => {
    const task = createTask(db, snapshot);
    const runDir = path.join(tempDir, 'runs', 'ordinary-run');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'ordinary-run',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentId: AGENT_ID,
      status: 'canceled',
      createdAt: 100,
      updatedAt: 200,
      langfuseCompletedAt: 200,
    }));

    const result = await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: '0.18.2',
      db,
      reportLangfuse: vi.fn(),
      runsLogDir: path.join(tempDir, 'runs'),
    });

    expect(result.strategyTasksReconciled).toBe(0);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({
      outcome: 'running',
      activeRunId: 'run-request',
      revision: 0,
    });
  });

  it('keeps one unreadable Prompt Bundle from cancelling every sibling Run terminal', async () => {
    const poisoned = createTask(db, snapshot, 'run-poisoned', 'task-poisoned');
    const healthy = createTask(db, snapshot, 'run-healthy', 'task-healthy');
    db.prepare(
      `UPDATE strategy_task_runs
       SET final_text_kind = 'bundle', final_text_schema = ?, final_text = ?
       WHERE run_id = 'run-poisoned'`,
    ).run(OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2, STALE_V2_PROMPT_BUNDLE);
    closeDatabase();

    for (const runId of ['run-poisoned', 'run-healthy']) {
      const runDir = path.join(tempDir, 'runs', runId);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
        schemaVersion: 1,
        id: runId,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        agentId: AGENT_ID,
        status: 'canceled',
        createdAt: 100,
        updatedAt: 200,
        langfuseCompletedAt: 200,
      }));
    }

    db = openDatabase(tempDir, { dataDir: tempDir });
    await expect(reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: '0.19.2',
      db,
      reportLangfuse: vi.fn(),
      runsLogDir: path.join(tempDir, 'runs'),
    })).resolves.toMatchObject({ strategyTasksReconciled: 1 });

    expect(getStrategyTaskExecution(db, healthy.taskExecutionId)).toMatchObject({
      outcome: 'canceled',
      terminalRunId: 'run-healthy',
    });
    expect(() => getStrategyTaskExecution(db, poisoned.taskExecutionId)).toThrow();
  });

  it.each([
    ['running', 'blocked'],
    ['canceled', 'canceled'],
  ] as const)(
    'reconciles a persisted %s physical Run after a real SQLite restart to %s',
    async (physicalStatus, expectedOutcome) => {
      const task = createTask(db, snapshot, `run-${physicalStatus}`);
      closeDatabase();

      const runDir = path.join(tempDir, 'runs', `run-${physicalStatus}`);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
        schemaVersion: 1,
        id: `run-${physicalStatus}`,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        agentId: AGENT_ID,
        status: physicalStatus,
        createdAt: 100,
        updatedAt: 200,
        langfuseCompletedAt: 200,
      }));

      db = openDatabase(tempDir, { dataDir: tempDir });
      const result = await reconcileDurableRunTerminals({
        analytics: { capture: vi.fn() },
        appVersion: '0.18.2',
        db,
        reportLangfuse: vi.fn(),
        runsLogDir: path.join(tempDir, 'runs'),
      });

      expect(result.strategyTasksReconciled).toBe(1);
      expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({
        outcome: expectedOutcome,
        activeRunId: null,
        terminalRunId: `run-${physicalStatus}`,
      });

      const repeated = await reconcileDurableRunTerminals({
        analytics: { capture: vi.fn() },
        appVersion: '0.18.2',
        db,
        reportLangfuse: vi.fn(),
        runsLogDir: path.join(tempDir, 'runs'),
      });
      expect(repeated).toMatchObject({ interrupted: 0, strategyTasksReconciled: 0 });
      expect(fs.readdirSync(path.join(tempDir, 'runs'))).toEqual([`run-${physicalStatus}`]);
    },
  );

  it('persists blocked attribution when startup reconciliation interrupts a running Run', async () => {
    const task = createTask(db, snapshot, 'run-interrupted');
    closeDatabase();

    const runDir = path.join(tempDir, 'runs', 'run-interrupted');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-interrupted',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentId: AGENT_ID,
      status: 'running',
      createdAt: 100,
      updatedAt: 200,
      langfuseCompletedAt: 200,
    }));

    db = openDatabase(tempDir, { dataDir: tempDir });
    await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: '0.18.2',
      db,
      reportLangfuse: vi.fn(),
      runsLogDir: path.join(tempDir, 'runs'),
    });

    const persisted = getStrategyTaskExecution(db, task.taskExecutionId);
    expect(persisted?.outcome).toBe('blocked');
    expect(persisted?.blockedContext).toEqual({
      reasonCodes: ['od_next_physical_run_interrupted'],
      visibleText: null,
    });
  });
});
