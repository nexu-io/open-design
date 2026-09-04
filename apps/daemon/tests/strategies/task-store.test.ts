import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import {
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
  OD_NEXT_REQUEST_TURN_SCHEMA_V1,
  serializeCanonicalXml,
  serializeOdNextPromptBundleV1,
  type AppliedPluginSnapshot,
  type OpenDesignPlanContractV2,
} from '@open-design/contracts';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase } from '../../src/db.js';
import { createSnapshot, getSnapshot, pruneExpiredSnapshots } from '../../src/plugins/snapshots.js';
import { reconcileDurableRunTerminals } from '../../src/runtimes/run-terminal-reconciliation.js';
import {
  StrategyTaskTransitionConflictError,
  type CompareAndTransitionStrategyTaskInput,
  cancelStrategyTaskExecution,
  compareAndTransitionStrategyTaskExecution as compareAndTransitionStrategyTaskExecutionRaw,
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  migrateStrategyTaskStore,
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
      contextAndAudience: 'Product team',
      inputsAndReferences: [],
      constraints: [],
      canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
      requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
      designSpec: {
        source: 'resolved-baseline',
        version: '1',
        decisions: { palette: 'neutral' },
      },
      buildRequirements: [{ id: 'build-1', text: 'Build the required prototype.' }],
      assumptions: [],
      risks: [],
      taskSpecific: {},
    },
    fullPlan: {
      executionMode: 'simple',
      steps: [{ id: 'step-1', objective: 'Build', outputs: ['prototype'] }],
      readinessArtifacts: [],
      buildPackages: [],
    },
    runManifest: {
      selectedAgentId: AGENT_ID,
      capabilitySnapshotHash: 'c'.repeat(64),
      inputRefs: [],
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

  it('adds nullable/versioned tables without changing ordinary Run queries', () => {
    const columns = db.prepare('PRAGMA table_info(strategy_task_executions)').all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'schema_version', notnull: 1 }),
      expect.objectContaining({ name: 'route', notnull: 0 }),
      expect.objectContaining({ name: 'execution_mode', notnull: 0 }),
      expect.objectContaining({ name: 'plan_contract_json', notnull: 0 }),
      expect.objectContaining({ name: 'plan_contract_hash', notnull: 0 }),
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

  it('reopens the exact Bundle and continuation Turn without cold reseeding', () => {
    const initial = createTask(db, snapshot);
    const clarificationText = strategyTaskTurnText({
      taskExecutionId: initial.taskExecutionId,
      inputStage: 'clarification',
      taskRunIndex: 1,
      payload: 'Frozen clarification answer.',
    });
    const continued = compareAndTransitionStrategyTaskExecutionRaw(db, {
      taskExecutionId: initial.taskExecutionId,
      expectedRevision: initial.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: {
        runId: 'run-restart-clarification',
        sourceRunId: initial.latestRunId,
        finalText: clarificationText,
      },
    });
    const expectedBundle = continued.promptBundle;
    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });

    const reopened = getStrategyTaskExecution(db, initial.taskExecutionId);
    expect(reopened?.promptBundle).toEqual(expectedBundle);
    expect(reopened?.runs[0]?.finalText).toEqual(expectedBundle);
    expect(reopened?.runs[1]?.finalText.text).toBe(clarificationText);
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

    // The run-mapping write path still works on top of a legacy Bundle, and a
    // continuation Turn keeps its own single version.
    const continued = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-legacy-clarification', sourceRunId: task.initialRunId },
    });
    expect(continued.promptBundle.schema).toBe(OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1);
    expect(continued.runs[1]?.finalText.schema).toBe(OD_NEXT_REQUEST_TURN_SCHEMA_V1);
    expect(getStrategyTaskExecutionByRunId(db, 'run-legacy-clarification')?.promptBundle)
      .toEqual(reopened?.promptBundle);
  });

  it('fails closed when a stored Bundle schema label disagrees with its text version', () => {
    const mislabeledV1 = createTask(db, snapshot, 'run-mislabeled-v1', 'task-mislabeled-v1');
    persistBundleAs(
      db,
      mislabeledV1.taskExecutionId,
      OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
      TEST_PROMPT_BUNDLE,
    );
    expect(() => getStrategyTaskExecution(db, mislabeledV1.taskExecutionId))
      .toThrow(/canonical|Prompt Bundle/i);
    expect(() => getStrategyTaskExecutionByRunId(db, 'run-mislabeled-v1'))
      .toThrow(/canonical|Prompt Bundle/i);

    const mislabeledV2 = createTask(db, snapshot, 'run-mislabeled-v2', 'task-mislabeled-v2');
    persistBundleAs(
      db,
      mislabeledV2.taskExecutionId,
      OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
      LEGACY_PROMPT_BUNDLE,
    );
    expect(() => getStrategyTaskExecution(db, mislabeledV2.taskExecutionId))
      .toThrow(/canonical|Prompt Bundle/i);
    expect(() => getStrategyTaskExecutionByRunId(db, 'run-mislabeled-v2'))
      .toThrow(/canonical|Prompt Bundle/i);

    // A Turn schema on a Bundle row is a corrupt kind/schema pairing, not a
    // version this store may tolerate.
    const crossKind = createTask(db, snapshot, 'run-cross-kind', 'task-cross-kind');
    persistBundleAs(
      db,
      crossKind.taskExecutionId,
      OD_NEXT_REQUEST_TURN_SCHEMA_V1,
      TEST_PROMPT_BUNDLE,
    );
    expect(() => getStrategyTaskExecution(db, crossKind.taskExecutionId))
      .toThrow(/versioned final text/i);
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

  it('creates an immutable snapshot/agent identity and supports task and Run lookup', () => {
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
      route: null,
      inputStage: 'request',
      outcome: 'running',
      executionMode: null,
      clarificationCount: 0,
      planContractRepairAttempts: 0,
      initialRunId: 'run-request',
      latestRunId: 'run-request',
      activeRunId: 'run-request',
      terminalRunId: null,
      runs: [{ runId: 'run-request', inputStage: 'request', taskRunIndex: 0 }],
    });
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

    const result = pruneExpiredSnapshots(db, {
      now: sweepAt,
      before: sweepAt,
    });
    expect(result).toEqual({
      removed: 1,
      ids: [ordinarySnapshot.snapshotId],
    });
    expect(getSnapshot(db, snapshot.snapshotId)).not.toBeNull();
    expect(getSnapshot(db, ordinarySnapshot.snapshotId)).toBeNull();
  });

  it('completes Direct Edit in its request Run and rejects every next Run', () => {
    let task = createTask(db, snapshot);
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'direct_edit',
        inputStage: 'request',
        outcome: 'completed',
        executionMode: 'simple',
      },
    });
    expect(task).toMatchObject({
      route: 'direct_edit',
      inputStage: 'request',
      outcome: 'completed',
      executionMode: 'simple',
      latestRunId: 'run-request',
      terminalRunId: 'run-request',
    });
    expect(task.runs).toHaveLength(1);

    const second = createStrategyTaskExecution(db, {
      taskExecutionId: 'task-direct-next',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-direct-next',
      ...strategyTaskCreateIdentityFixture(),
    });
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: second.taskExecutionId,
      expectedRevision: second.revision,
      to: {
        route: 'direct_edit',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-direct-production', sourceRunId: 'run-direct-next' },
    })).toThrow(/Direct Edit/i);
  });

  it('supports the normal Full Plan request-to-production path without optional stages', () => {
    let task = createTask(db, snapshot);
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-production', sourceRunId: 'run-request' },
      planContract: planContract(snapshot),
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'completed',
        executionMode: 'simple',
      },
    });
    expect(task).toMatchObject({
      route: 'full_plan',
      outcome: 'completed',
      clarificationCount: 0,
      planContractRepairAttempts: 0,
      initialRunId: 'run-request',
      latestRunId: 'run-production',
    });
    expect(task.runs.map((run) => run.inputStage)).toEqual(['request', 'production']);
  });

  it('maps all four physical stages and persists a versioned/hash-bound Plan Contract', () => {
    let task = createTask(db, snapshot);
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-clarification', sourceRunId: 'run-request' },
      updatedAt: 200,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: 'simple',
      },
      updatedAt: 250,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-contract-repair', sourceRunId: 'run-clarification' },
      updatedAt: 300,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-production', sourceRunId: 'run-contract-repair' },
      planContract: planContract(snapshot),
      updatedAt: 400,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'completed',
        executionMode: 'simple',
      },
      updatedAt: 500,
    });

    expect(task).toMatchObject({
      outcome: 'completed',
      clarificationCount: 1,
      planContractRepairAttempts: 1,
      initialRunId: 'run-request',
      latestRunId: 'run-production',
      activeRunId: null,
      terminalRunId: 'run-production',
      planContract: expect.objectContaining({ schema: 'open-design.plan-contract/v2' }),
      planContractHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(task.runs.map(({ finalText: _finalText, ...run }) => run)).toEqual([
      { runId: 'run-request', inputStage: 'request', taskRunIndex: 0 },
      {
        runId: 'run-clarification',
        inputStage: 'clarification',
        taskRunIndex: 1,
        sourceRunId: 'run-request',
      },
      {
        runId: 'run-contract-repair',
        inputStage: 'contract_repair',
        taskRunIndex: 2,
        sourceRunId: 'run-clarification',
      },
      {
        runId: 'run-production',
        inputStage: 'production',
        taskRunIndex: 3,
        sourceRunId: 'run-contract-repair',
      },
    ]);
  });

  it('fails closed on duplicate/illegal stages and immutable route, mode, or Plan identity drift', () => {
    let task = createTask(db, snapshot);
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-clarification', sourceRunId: 'run-request' },
    });
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-clarification-2', sourceRunId: 'run-clarification' },
    })).toThrow(/different physical stage|clarification/i);
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'direct_edit',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-production', sourceRunId: 'run-clarification' },
    })).toThrow(/route/i);

    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: 'simple',
      },
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-contract-repair', sourceRunId: 'run-clarification' },
    });
    expect(task.planContract).toBeUndefined();
    expect(task.planContractRepairAttempts).toBe(1);
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-contract-repair-2', sourceRunId: 'run-contract-repair' },
    })).toThrow(/different physical stage|repair/i);
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'complex',
      },
      nextRun: { runId: 'run-mode-drift', sourceRunId: 'run-contract-repair' },
      planContract: planContract(snapshot),
    })).toThrow(/execution mode/i);

    const mismatched = planContract(snapshot);
    mismatched.runManifest.selectedAgentId = 'claude';
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-production', sourceRunId: 'run-contract-repair' },
      planContract: mismatched,
    })).toThrow(/selected agent/i);

    let ordered = createStrategyTaskExecution(db, {
      taskExecutionId: 'task-order',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-order-request',
      ...strategyTaskCreateIdentityFixture(),
    });
    ordered = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: ordered.taskExecutionId,
      expectedRevision: ordered.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-order-production', sourceRunId: 'run-order-request' },
      planContract: planContract(snapshot),
    });
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: ordered.taskExecutionId,
      expectedRevision: ordered.revision,
      to: {
        route: 'full_plan',
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-order-repair', sourceRunId: 'run-order-production' },
    })).toThrow(/Illegal|transition/i);
  });

  it('uses a transactional revision CAS so concurrent next-Run claims produce one mapping', () => {
    const task = createTask(db, snapshot);
    const first = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-clarification-a', sourceRunId: 'run-request' },
    });
    expect(first.latestRunId).toBe('run-clarification-a');
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-clarification-b', sourceRunId: 'run-request' },
    })).toThrow(StrategyTaskTransitionConflictError);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)?.runs).toHaveLength(2);
    expect(getStrategyTaskExecutionByRunId(db, 'run-clarification-b')).toBeNull();
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

    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'already-claimed-run', sourceRunId: 'run-request' },
    })).toThrow(StrategyTaskTransitionConflictError);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({
      revision: 0,
      route: null,
      inputStage: 'request',
      latestRunId: 'run-request',
      runs: [{ runId: 'run-request' }],
    });

    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: '   ', sourceRunId: 'run-request' },
    })).toThrow(/nextRun.runId/i);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({
      revision: 0,
      latestRunId: 'run-request',
    });
  });

  it('replays the complete persisted Run chain and rejects source, stage, count, route, or time tampering', () => {
    let task = createTask(db, snapshot);
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'run-clarification', sourceRunId: 'run-request' },
      updatedAt: 200,
    });

    db.prepare(`
      UPDATE strategy_task_runs SET source_run_id = 'unexpected'
       WHERE task_execution_id = ? AND task_run_index = 0
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/initial.*source Run/i);
    db.prepare(`
      UPDATE strategy_task_runs SET source_run_id = NULL
       WHERE task_execution_id = ? AND task_run_index = 0
    `).run(task.taskExecutionId);

    db.prepare(`
      UPDATE strategy_task_runs SET source_run_id = 'unexpected'
       WHERE task_execution_id = ? AND task_run_index = 1
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/immediately preceding/i);
    db.prepare(`
      UPDATE strategy_task_runs SET source_run_id = 'run-request'
       WHERE task_execution_id = ? AND task_run_index = 1
    `).run(task.taskExecutionId);

    db.prepare(`
      UPDATE strategy_task_runs SET input_stage = 'request'
       WHERE task_execution_id = ? AND task_run_index = 1
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(
      /mapping|ordered|request Turn/i,
    );
    db.prepare(`
      UPDATE strategy_task_runs SET input_stage = 'clarification'
       WHERE task_execution_id = ? AND task_run_index = 1
    `).run(task.taskExecutionId);

    db.prepare(`
      UPDATE strategy_task_executions SET clarification_count = 0
       WHERE task_execution_id = ?
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/counts/i);
    db.prepare(`
      UPDATE strategy_task_executions SET clarification_count = 1,
        route = 'direct_edit', execution_mode = 'simple'
       WHERE task_execution_id = ?
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(
      /Direct Edit|request stage/i,
    );
    db.prepare(`
      UPDATE strategy_task_executions SET route = 'full_plan', execution_mode = NULL,
        updated_at = created_at - 1
       WHERE task_execution_id = ?
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/cannot precede/i);
  });

  it('fails closed on Plan JSON/schema/hash and Snapshot identity tampering', () => {
    let task = createTask(db, snapshot);
    const originalPlan = planContract(snapshot);
    originalPlan.taskProfile.designSpec.decisions = {
      中性色: 'slate',
      Zeta: 1,
      alpha: 2,
      Alpha: 3,
    };
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: { runId: 'run-production', sourceRunId: 'run-request' },
      planContract: originalPlan,
    });
    const canonicalHash = task.planContractHash;

    const reordered = {
      decisionSummary: originalPlan.decisionSummary,
      runManifest: originalPlan.runManifest,
      fullPlan: originalPlan.fullPlan,
      taskProfile: {
        ...originalPlan.taskProfile,
        designSpec: {
          ...originalPlan.taskProfile.designSpec,
          decisions: {
            Alpha: 3,
            alpha: 2,
            Zeta: 1,
            中性色: 'slate',
          },
        },
      },
      strategy: originalPlan.strategy,
      schema: originalPlan.schema,
    } as OpenDesignPlanContractV2;
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      planContract: reordered,
    });
    expect(task.planContractHash).toBe(canonicalHash);

    const row = db.prepare(`
      SELECT plan_contract_json AS json, plan_contract_hash AS hash
        FROM strategy_task_executions WHERE task_execution_id = ?
    `).get(task.taskExecutionId) as { json: string; hash: string };
    db.prepare(`
      UPDATE strategy_task_executions SET plan_contract_json = '{invalid'
       WHERE task_execution_id = ?
    `).run(task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/invalid JSON/i);

    db.prepare(`
      UPDATE strategy_task_executions SET plan_contract_json = ?, plan_contract_hash = ?
       WHERE task_execution_id = ?
    `).run(row.json, 'f'.repeat(64), task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/hash validation/i);

    db.prepare(`
      UPDATE strategy_task_executions SET plan_contract_json = '{}', plan_contract_hash = ?
       WHERE task_execution_id = ?
    `).run(row.hash, task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/schema or hash/i);

    db.prepare(`
      UPDATE strategy_task_executions SET plan_contract_hash = ?, strategy_package_hash = ?
       WHERE task_execution_id = ?
    `).run(row.hash, 'e'.repeat(64), task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/Snapshot binding/i);

    const snapshotRow = db.prepare(`
      SELECT strategy_json AS strategyJson FROM applied_plugin_snapshots WHERE id = ?
    `).get(snapshot.snapshotId) as { strategyJson: string };
    db.prepare(`
      UPDATE strategy_task_executions
         SET strategy_package_hash = ?, plan_contract_json = ?, plan_contract_hash = ?
       WHERE task_execution_id = ?
    `).run(snapshot.strategy!.packageHash, row.json, row.hash, task.taskExecutionId);
    db.prepare(`
      UPDATE applied_plugin_snapshots SET strategy_json = ? WHERE id = ?
    `).run(JSON.stringify({ ...snapshot.strategy, packageHash: 'd'.repeat(64) }), snapshot.snapshotId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/package hash/i);
    db.prepare(`
      UPDATE applied_plugin_snapshots SET strategy_json = ? WHERE id = ?
    `).run(snapshotRow.strategyJson, snapshot.snapshotId);

    db.prepare(`
      UPDATE applied_plugin_snapshots SET plugin_id = 'ordinary-plugin' WHERE id = ?
    `).run(snapshot.snapshotId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/plugin identity/i);
    db.prepare(`
      UPDATE applied_plugin_snapshots SET plugin_id = 'od-next-strategy' WHERE id = ?
    `).run(snapshot.snapshotId);

    db.prepare(`
      UPDATE strategy_task_executions
         SET strategy_package_hash = ?, plan_contract_json = NULL, plan_contract_hash = NULL
       WHERE task_execution_id = ?
    `).run(snapshot.strategy!.packageHash, task.taskExecutionId);
    expect(() => getStrategyTaskExecution(db, task.taskExecutionId)).toThrow(/hash-bound Plan Contract/i);
  });

  it('keeps terminal outcomes sticky and cancellation distinct from blocked', () => {
    let task = createTask(db, snapshot);
    task = cancelStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      updatedAt: 200,
    });
    expect(task).toMatchObject({ outcome: 'canceled', terminalRunId: 'run-request' });
    expect(() => compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: { runId: 'resurrected-run', sourceRunId: 'run-request' },
    })).toThrow(/terminal/i);
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
    // Reshaping the v2 bundle's child tags kept the schema id
    // `open-design.od-next-prompt-bundle/v2`, so rows written by the previous
    // v2 composer still carry today's label over a layout its parser cannot
    // read. That is one Run's corrupt record, but the startup loop called
    // `reconcileStrategyTaskRunTerminal` unguarded, so the TypeError escaped
    // `reconcileDurableRunTerminals` outright and every OTHER Run on that boot
    // silently lost its analytics replay and Langfuse delivery.
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
    // The corrupt record stays unreadable and unreconciled — that is its own
    // Run's problem, and it no longer costs its siblings theirs.
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
      expect(getStrategyTaskExecution(db, task.taskExecutionId)).toMatchObject({
        outcome: expectedOutcome,
        activeRunId: null,
        terminalRunId: `run-${physicalStatus}`,
      });
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
