import { createHash } from 'node:crypto';

import {
  AppliedStrategyBindingV2Schema,
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
  OD_NEXT_REQUEST_TURN_SCHEMA_V1,
  OD_NEXT_STRATEGY_ID,
  OpenDesignPlanContractV2Schema,
  StrategyRuntimeStateV2Schema,
  StrategyRuntimeTransitionV2Schema,
  parseOdNextPromptBundleV1,
  parseOdNextPromptBundleV2,
  parseOdNextRequestTurnV1,
  type OpenDesignPlanContractV2,
  type StrategyExecutionModeV2,
  type StrategyInputStageV2,
  type StrategyOutcomeV2,
  type StrategyRouteV2,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';

import { getSnapshot } from '../plugins/snapshots.js';
import {
  getFrozenSkillPackage,
  insertFrozenSkillPackage,
  migrateFrozenSkillPackageStore,
  type FrozenSkillPackageV1,
} from './od-next/frozen-skill-package.js';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

const TASK_STORE_SCHEMA_VERSION = 1 as const;
const TERMINAL_OUTCOMES = new Set<StrategyTaskOutcome>([
  'completed',
  'blocked',
  'canceled',
]);

/**
 * The Prompt Bundle version the daemon composes for every NEW task. Bumping it
 * changes only what is written; already-persisted rows keep their own version.
 */
const COMPOSED_PROMPT_BUNDLE_SCHEMA = OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2;

/**
 * Every schema label a stored final text may legally carry, keyed by its kind.
 *
 * This table is the single place that decides version tolerance. A `bundle` row
 * is readable at either Prompt Bundle version because v1 rows predate the v2
 * composer and are never migrated; a `turn` row has exactly one version. A
 * label outside its kind's set is a corrupted row, not a version to tolerate,
 * so it fails closed rather than being coerced to the current version.
 */
const ACCEPTED_FINAL_TEXT_SCHEMAS = {
  bundle: [OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1, OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2],
  turn: [OD_NEXT_REQUEST_TURN_SCHEMA_V1],
} as const satisfies Record<
  StrategyTaskFinalTextKind,
  ReadonlyArray<StrategyTaskFinalTextSchema>
>;

export type StrategyTaskOutcome = 'running' | StrategyOutcomeV2;

export interface StrategyTaskRunMapping {
  runId: string;
  inputStage: StrategyInputStageV2;
  taskRunIndex: number;
  sourceRunId?: string;
  finalText: StrategyTaskFinalTextIdentity;
}

export type StrategyTaskFinalTextKind = 'bundle' | 'turn';

/**
 * A stored final text always carries the schema it was written with. Prompt
 * Bundles exist at two versions because v1 rows are already persisted and are
 * never rewritten; request Turns have exactly one.
 */
export type StrategyTaskFinalTextSchema =
  | typeof OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1
  | typeof OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2
  | typeof OD_NEXT_REQUEST_TURN_SCHEMA_V1;

export interface StrategyTaskFinalTextIdentity {
  kind: StrategyTaskFinalTextKind;
  schema: StrategyTaskFinalTextSchema;
  text: string;
  utf8Bytes: number;
  sha256: string;
}

export interface StrategyTaskFrozenInputIdentity {
  schema: 'open-design.od-next-frozen-input-identity/v1';
  snapshotId: string;
  strategyPackageHash: string;
  frozenSkillPackageIdentity: string;
  taskInputManifestSha256: string;
}

export interface StrategyTaskExecutionRecord {
  schemaVersion: typeof TASK_STORE_SCHEMA_VERSION;
  revision: number;
  taskExecutionId: string;
  projectId: string;
  conversationId: string;
  snapshotId: string;
  strategyId: typeof OD_NEXT_STRATEGY_ID;
  strategyVersion: string;
  strategyPackageHash: string;
  selectedAgentId: string;
  route: StrategyRouteV2 | null;
  inputStage: StrategyInputStageV2;
  outcome: StrategyTaskOutcome;
  executionMode: StrategyExecutionModeV2 | null;
  blockedContext?: StrategyTaskBlockedContext;
  planContract?: OpenDesignPlanContractV2;
  planContractHash?: string;
  clarificationCount: 0 | 1;
  planContractRepairAttempts: 0 | 1;
  initialRunId: string;
  latestRunId: string;
  activeRunId: string | null;
  terminalRunId: string | null;
  runs: StrategyTaskRunMapping[];
  frozenSkillPackage: FrozenSkillPackageV1;
  promptBundle: StrategyTaskFinalTextIdentity;
  frozenInputIdentity: StrategyTaskFrozenInputIdentity;
  createdAt: number;
  updatedAt: number;
}

export interface CreateStrategyTaskExecutionInput {
  taskExecutionId: string;
  projectId: string;
  conversationId: string;
  snapshotId: string;
  selectedAgentId: string;
  initialRunId: string;
  frozenSkillPackage: FrozenSkillPackageV1;
  promptBundleText: string;
  taskInputManifestSha256: string;
  createdAt?: number;
}

/**
 * Durable attribution for a blocked strategy task: the exact gate reason codes
 * plus the agent-visible text of the turn that was rejected. Every blocked
 * outcome must be diagnosable from the store alone, without live logs.
 */
export interface StrategyTaskBlockedContext {
  reasonCodes: string[];
  visibleText: string | null;
}

export interface StrategyTaskTransitionState {
  route: StrategyRouteV2;
  inputStage: StrategyInputStageV2;
  outcome: StrategyTaskOutcome;
  executionMode: StrategyExecutionModeV2 | null;
}

export interface CompareAndTransitionStrategyTaskInput {
  taskExecutionId: string;
  expectedRevision: number;
  to: StrategyTaskTransitionState;
  nextRun?: {
    runId: string;
    sourceRunId: string;
    finalText: string;
  };
  planContract?: OpenDesignPlanContractV2;
  blockedContext?: {
    reasonCodes: readonly string[];
    visibleText?: string | null;
  };
  updatedAt?: number;
}

export class InvalidStrategyTaskRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStrategyTaskRecordError';
  }
}

export class InvalidStrategyTaskTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStrategyTaskTransitionError';
  }
}

export class StrategyTaskTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyTaskTransitionConflictError';
  }
}

export function migrateStrategyTaskStore(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategy_task_executions (
      task_execution_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL DEFAULT 1,
      revision INTEGER NOT NULL DEFAULT 0,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      strategy_package_hash TEXT NOT NULL,
      selected_agent_id TEXT NOT NULL,
      route TEXT CHECK (route IN ('direct_edit', 'full_plan')),
      input_stage TEXT NOT NULL CHECK (
        input_stage IN ('request', 'clarification', 'contract_repair', 'production')
      ),
      outcome TEXT NOT NULL CHECK (
        outcome IN (
          'running', 'clarification_required', 'plan_ready',
          'completed', 'blocked', 'canceled'
        )
      ),
      execution_mode TEXT CHECK (execution_mode IN ('simple', 'complex')),
      plan_contract_json TEXT,
      plan_contract_hash TEXT,
      clarification_count INTEGER NOT NULL DEFAULT 0 CHECK (clarification_count BETWEEN 0 AND 1),
      plan_contract_repair_attempts INTEGER NOT NULL DEFAULT 0 CHECK (
        plan_contract_repair_attempts BETWEEN 0 AND 1
      ),
      initial_run_id TEXT NOT NULL,
      latest_run_id TEXT NOT NULL,
      prompt_bundle_schema TEXT,
      prompt_bundle_text TEXT,
      prompt_bundle_utf8_bytes INTEGER,
      prompt_bundle_sha256 TEXT,
      frozen_input_identity_json TEXT,
      blocked_reason_codes_json TEXT,
      blocked_visible_text TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(snapshot_id) REFERENCES applied_plugin_snapshots(id)
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_task_executions_project_conversation
      ON strategy_task_executions(project_id, conversation_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS strategy_task_runs (
      task_execution_id TEXT NOT NULL,
      run_id TEXT NOT NULL UNIQUE,
      input_stage TEXT NOT NULL CHECK (
        input_stage IN ('request', 'clarification', 'contract_repair', 'production')
      ),
      task_run_index INTEGER NOT NULL CHECK (task_run_index >= 0),
      source_run_id TEXT,
      final_text_kind TEXT,
      final_text_schema TEXT,
      final_text TEXT,
      final_text_utf8_bytes INTEGER,
      final_text_sha256 TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(task_execution_id, task_run_index),
      FOREIGN KEY(task_execution_id) REFERENCES strategy_task_executions(task_execution_id)
        ON DELETE CASCADE
    );
  `);
  addColumnIfMissing(db, 'strategy_task_executions', 'prompt_bundle_schema TEXT');
  addColumnIfMissing(db, 'strategy_task_executions', 'prompt_bundle_text TEXT');
  addColumnIfMissing(db, 'strategy_task_executions', 'prompt_bundle_utf8_bytes INTEGER');
  addColumnIfMissing(db, 'strategy_task_executions', 'prompt_bundle_sha256 TEXT');
  addColumnIfMissing(db, 'strategy_task_executions', 'frozen_input_identity_json TEXT');
  addColumnIfMissing(db, 'strategy_task_executions', 'blocked_reason_codes_json TEXT');
  addColumnIfMissing(db, 'strategy_task_executions', 'blocked_visible_text TEXT');
  addColumnIfMissing(db, 'strategy_task_runs', 'final_text_kind TEXT');
  addColumnIfMissing(db, 'strategy_task_runs', 'final_text_schema TEXT');
  addColumnIfMissing(db, 'strategy_task_runs', 'final_text TEXT');
  addColumnIfMissing(db, 'strategy_task_runs', 'final_text_utf8_bytes INTEGER');
  addColumnIfMissing(db, 'strategy_task_runs', 'final_text_sha256 TEXT');
  migrateFrozenSkillPackageStore(db);
}

export function createStrategyTaskExecution(
  db: SqliteDb,
  input: CreateStrategyTaskExecutionInput,
): StrategyTaskExecutionRecord {
  const taskExecutionId = requireNonEmpty(input.taskExecutionId, 'taskExecutionId');
  const projectId = requireNonEmpty(input.projectId, 'projectId');
  const conversationId = requireNonEmpty(input.conversationId, 'conversationId');
  const snapshotId = requireNonEmpty(input.snapshotId, 'snapshotId');
  const selectedAgentId = requireNonEmpty(input.selectedAgentId, 'selectedAgentId');
  const initialRunId = requireNonEmpty(input.initialRunId, 'initialRunId');
  const frozenSkillPackage = input.frozenSkillPackage;
  const promptBundle = composedPromptBundleIdentity(input.promptBundleText);
  const taskInputManifestSha256 = requireSha256(
    input.taskInputManifestSha256,
    'taskInputManifestSha256',
  );
  const now = normalizeTimestamp(input.createdAt ?? Date.now(), 'createdAt');

  const create = db.transaction(() => {
    const conversation = db.prepare(
      `SELECT id FROM conversations WHERE id = ? AND project_id = ?`,
    ).get(conversationId, projectId);
    if (!conversation) {
      throw new InvalidStrategyTaskRecordError(
        'Strategy task conversation must belong to the selected project.',
      );
    }
    assertSnapshotOwnership(db, snapshotId, projectId, conversationId);

    const snapshot = getSnapshot(db, snapshotId);
    const binding = AppliedStrategyBindingV2Schema.safeParse(snapshot?.strategy);
    if (!snapshot || !binding.success || snapshot.pluginId !== OD_NEXT_STRATEGY_ID) {
      throw new InvalidStrategyTaskRecordError(
        'Strategy task creation requires a verified OD Next strategy binding.',
      );
    }
    if (
      snapshot.pluginVersion !== binding.data.version
      || snapshot.snapshotId !== snapshotId
    ) {
      throw new InvalidStrategyTaskRecordError(
        'Strategy task Snapshot identity does not match its verified strategy binding.',
      );
    }
    const verifiedFrozenSkillPackage = insertableFrozenSkillPackage(frozenSkillPackage);
    const frozenInputIdentity: StrategyTaskFrozenInputIdentity = {
      schema: 'open-design.od-next-frozen-input-identity/v1',
      snapshotId,
      strategyPackageHash: binding.data.packageHash,
      frozenSkillPackageIdentity: verifiedFrozenSkillPackage.identity,
      taskInputManifestSha256,
    };

    try {
      db.prepare(`
        INSERT INTO strategy_task_executions (
          task_execution_id, schema_version, revision,
          project_id, conversation_id, snapshot_id,
          strategy_id, strategy_version, strategy_package_hash, selected_agent_id,
          route, input_stage, outcome, execution_mode,
          plan_contract_json, plan_contract_hash,
          clarification_count, plan_contract_repair_attempts,
          initial_run_id, latest_run_id,
          prompt_bundle_schema, prompt_bundle_text,
          prompt_bundle_utf8_bytes, prompt_bundle_sha256,
          frozen_input_identity_json, created_at, updated_at
        ) VALUES (?, 1, 0, ?, ?, ?, ?, ?, ?, ?, NULL, 'request', 'running', NULL,
                  NULL, NULL, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskExecutionId,
        projectId,
        conversationId,
        snapshotId,
        binding.data.id,
        binding.data.version,
        binding.data.packageHash,
        selectedAgentId,
        initialRunId,
        initialRunId,
        promptBundle.schema,
        promptBundle.text,
        promptBundle.utf8Bytes,
        promptBundle.sha256,
        JSON.stringify(canonicalJsonValue(frozenInputIdentity)),
        now,
        now,
      );
      db.prepare(`
        INSERT INTO strategy_task_runs (
          task_execution_id, run_id, input_stage, task_run_index, source_run_id,
          final_text_kind, final_text_schema, final_text,
          final_text_utf8_bytes, final_text_sha256, created_at
        ) VALUES (?, ?, 'request', 0, NULL, ?, ?, ?, ?, ?, ?)
      `).run(
        taskExecutionId,
        initialRunId,
        promptBundle.kind,
        promptBundle.schema,
        promptBundle.text,
        promptBundle.utf8Bytes,
        promptBundle.sha256,
        now,
      );
      insertFrozenSkillPackage(
        db,
        taskExecutionId,
        verifiedFrozenSkillPackage,
      );
      // A StrategyTaskExecution is itself a durable Snapshot reference. Keep
      // run_id untouched because one task owns a chain of physical Runs, but
      // clear the unreferenced-row TTL in the same transaction that installs
      // the foreign-key reference.
      db.prepare(`
        UPDATE applied_plugin_snapshots SET expires_at = NULL WHERE id = ?
      `).run(snapshotId);
    } catch (error) {
      throw new InvalidStrategyTaskRecordError(
        `Strategy task identity or initial Run is already bound: ${errorMessage(error)}`,
      );
    }
  });
  create.immediate();
  return requireTask(db, taskExecutionId);
}

export function getStrategyTaskExecution(
  db: SqliteDb,
  taskExecutionId: string,
): StrategyTaskExecutionRecord | null {
  const row = db.prepare(`
    SELECT * FROM strategy_task_executions WHERE task_execution_id = ?
  `).get(taskExecutionId) as DbRow | undefined;
  return row ? rowToTask(db, row) : null;
}

export function getStrategyTaskExecutionByRunId(
  db: SqliteDb,
  runId: string,
): StrategyTaskExecutionRecord | null {
  const row = db.prepare(`
    SELECT execution.*
      FROM strategy_task_runs AS mapping
      JOIN strategy_task_executions AS execution
        ON execution.task_execution_id = mapping.task_execution_id
     WHERE mapping.run_id = ?
  `).get(runId) as DbRow | undefined;
  return row ? rowToTask(db, row) : null;
}

/** One assistant message's place in its logical task, for rendering. */
export interface StrategyTaskTurnProjection {
  taskExecutionId: string;
  taskRunIndex: number;
  /** The task settled `completed` — deliverable verified. Carried because the
   *  messages table has no strategy column, so a reload has no other way to
   *  learn the verdict, and surfaces keyed off the agent's TodoWrite snapshot
   *  (the "continue remaining tasks" offer) would resurrect on every reload. */
  delivered: boolean;
}

/**
 * Map physical Run ids to the logical task turn they belong to.
 *
 * A read-side projection for rendering: an OD Next Full Plan spans several
 * physical Runs (request -> production) that are ONE conversation turn, and a
 * daemon-issued continuation has no user prompt of its own. Clients need to
 * know which assistant messages belong to the same turn so a continuation is
 * not drawn as an answer nobody asked for.
 *
 * Deliberately does NOT go through `rowToTask`: this is a projection for
 * display, so it must stay cheap over a whole conversation and must never let
 * one unverifiable task record fail the entire message list.
 */
export function strategyTaskTurnsForRunIds(
  db: SqliteDb,
  runIds: readonly string[],
): Map<string, StrategyTaskTurnProjection> {
  const turns = new Map<string, StrategyTaskTurnProjection>();
  const unique = [...new Set(runIds.filter((id) => typeof id === 'string' && id))];
  if (unique.length === 0) return turns;
  try {
    const CHUNK = 400;
    for (let index = 0; index < unique.length; index += CHUNK) {
      const chunk = unique.slice(index, index + CHUNK);
      const rows = db.prepare(`
        SELECT r.run_id AS runId,
               r.task_execution_id AS taskExecutionId,
               r.task_run_index AS taskRunIndex,
               t.outcome AS outcome
          FROM strategy_task_runs r
          -- LEFT so a mapping whose task row is gone still yields its turn
          -- position: losing that would un-fold an already-rendered Full Plan
          -- turn into orphan answers, a worse failure than a missing verdict.
          LEFT JOIN strategy_task_executions t
            ON t.task_execution_id = r.task_execution_id
         WHERE r.run_id IN (${chunk.map(() => '?').join(', ')})
      `).all(...chunk) as DbRow[];
      for (const row of rows) {
        if (
          typeof row['runId'] !== 'string'
          || typeof row['taskExecutionId'] !== 'string'
          || typeof row['taskRunIndex'] !== 'number'
        ) continue;
        turns.set(row['runId'], {
          taskExecutionId: row['taskExecutionId'],
          taskRunIndex: row['taskRunIndex'],
          delivered: row['outcome'] === 'completed',
        });
      }
    }
  } catch (error) {
    if (isMissingTaskStoreError(error)) return turns;
    throw error;
  }
  return turns;
}

export function getAwaitingClarificationStrategyTaskExecution(
  db: SqliteDb,
  input: { projectId: string; conversationId: string },
): StrategyTaskExecutionRecord | null {
  try {
    const rows = db.prepare(`
      SELECT * FROM strategy_task_executions
       WHERE project_id = ? AND conversation_id = ?
         AND route = 'full_plan'
         AND input_stage = 'request'
         AND outcome = 'clarification_required'
       ORDER BY updated_at DESC, task_execution_id ASC
       LIMIT 2
    `).all(input.projectId, input.conversationId) as DbRow[];
    // Ambiguous active ownership is fail-closed. A continuation must never be
    // guessed onto one of two logical tasks sharing a conversation.
    if (rows.length > 1) {
      throw new InvalidStrategyTaskRecordError(
        'Conversation has multiple strategy tasks awaiting clarification.',
      );
    }
    return rows.length === 1 ? rowToTask(db, rows[0]!) : null;
  } catch (error) {
    if (isMissingTaskStoreError(error)) return null;
    throw error;
  }
}

export function compareAndTransitionStrategyTaskExecution(
  db: SqliteDb,
  input: CompareAndTransitionStrategyTaskInput,
): StrategyTaskExecutionRecord {
  const updatedAt = normalizeTimestamp(input.updatedAt ?? Date.now(), 'updatedAt');
  const transition = db.transaction(() => {
    const current = requireTask(db, input.taskExecutionId);
    if (current.revision !== input.expectedRevision) {
      throw new StrategyTaskTransitionConflictError(
        `Strategy task revision changed from ${input.expectedRevision} to ${current.revision}.`,
      );
    }
    if (TERMINAL_OUTCOMES.has(current.outcome)) {
      throw new InvalidStrategyTaskTransitionError(
        `Strategy task terminal outcome ${current.outcome} is sticky.`,
      );
    }
    if (updatedAt < current.updatedAt) {
      throw new InvalidStrategyTaskTransitionError(
        'Strategy task updatedAt cannot move backward.',
      );
    }

    const next = validateTransition(current, input);
    const plan = resolvePlanContract(current, input.planContract, next);
    const nextRunId = input.nextRun?.runId ?? current.latestRunId;
    const nextRunIndex = current.runs.length;
    const nextRunFinalText = input.nextRun
      ? continuationFinalTextIdentity({
          text: input.nextRun.finalText,
          taskExecutionId: current.taskExecutionId,
          stage: next.inputStage,
          taskRunIndex: nextRunIndex,
        })
      : null;
    const clarificationCount = current.clarificationCount
      + (next.inputStage === 'clarification' && current.inputStage !== 'clarification' ? 1 : 0);
    const repairAttempts = current.planContractRepairAttempts
      + (next.inputStage === 'contract_repair' && current.inputStage !== 'contract_repair' ? 1 : 0);
    if (clarificationCount > 1) {
      throw new InvalidStrategyTaskTransitionError(
        'Strategy tasks allow exactly one clarification stage at most.',
      );
    }
    if (repairAttempts > 1) {
      throw new InvalidStrategyTaskTransitionError(
        'Strategy tasks allow exactly one Plan Contract repair stage at most.',
      );
    }

    if (input.blockedContext && next.outcome !== 'blocked') {
      throw new InvalidStrategyTaskTransitionError(
        'Blocked attribution is only valid when transitioning to blocked.',
      );
    }
    const blockedContext = next.outcome === 'blocked'
      ? normalizeBlockedContext(input.blockedContext)
      : null;

    const result = db.prepare(`
      UPDATE strategy_task_executions
         SET revision = revision + 1,
             route = ?, input_stage = ?, outcome = ?, execution_mode = ?,
             plan_contract_json = ?, plan_contract_hash = ?,
             blocked_reason_codes_json = ?, blocked_visible_text = ?,
             clarification_count = ?, plan_contract_repair_attempts = ?,
             latest_run_id = ?, updated_at = ?
       WHERE task_execution_id = ? AND revision = ?
    `).run(
      next.route,
      next.inputStage,
      next.outcome,
      next.executionMode,
      plan.json,
      plan.hash,
      blockedContext ? JSON.stringify(blockedContext.reasonCodes) : null,
      blockedContext ? blockedContext.visibleText : null,
      clarificationCount,
      repairAttempts,
      nextRunId,
      updatedAt,
      current.taskExecutionId,
      input.expectedRevision,
    );
    if (result.changes !== 1) {
      throw new StrategyTaskTransitionConflictError(
        'Strategy task revision changed while applying the transition.',
      );
    }

    if (input.nextRun) {
      try {
        db.prepare(`
          INSERT INTO strategy_task_runs (
            task_execution_id, run_id, input_stage, task_run_index, source_run_id,
            final_text_kind, final_text_schema, final_text,
            final_text_utf8_bytes, final_text_sha256, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          current.taskExecutionId,
          requireNonEmpty(input.nextRun.runId, 'nextRun.runId'),
          next.inputStage,
          nextRunIndex,
          requireNonEmpty(input.nextRun.sourceRunId, 'nextRun.sourceRunId'),
          nextRunFinalText!.kind,
          nextRunFinalText!.schema,
          nextRunFinalText!.text,
          nextRunFinalText!.utf8Bytes,
          nextRunFinalText!.sha256,
          updatedAt,
        );
      } catch (error) {
        throw new StrategyTaskTransitionConflictError(
          `Strategy next Run is already claimed: ${errorMessage(error)}`,
        );
      }
    }
  });
  transition.immediate();
  return requireTask(db, input.taskExecutionId);
}

export function cancelStrategyTaskExecution(
  db: SqliteDb,
  input: {
    taskExecutionId: string;
    expectedRevision: number;
    updatedAt?: number;
  },
): StrategyTaskExecutionRecord {
  const updatedAt = normalizeTimestamp(input.updatedAt ?? Date.now(), 'updatedAt');
  const cancel = db.transaction(() => {
    const current = requireTask(db, input.taskExecutionId);
    if (current.revision !== input.expectedRevision) {
      throw new StrategyTaskTransitionConflictError(
        `Strategy task revision changed from ${input.expectedRevision} to ${current.revision}.`,
      );
    }
    if (TERMINAL_OUTCOMES.has(current.outcome)) {
      throw new InvalidStrategyTaskTransitionError(
        `Strategy task terminal outcome ${current.outcome} is sticky.`,
      );
    }
    if (updatedAt < current.updatedAt) {
      throw new InvalidStrategyTaskTransitionError(
        'Strategy task updatedAt cannot move backward.',
      );
    }
    const result = db.prepare(`
      UPDATE strategy_task_executions
         SET revision = revision + 1, outcome = 'canceled', updated_at = ?
       WHERE task_execution_id = ? AND revision = ?
         AND outcome NOT IN ('completed', 'blocked', 'canceled')
    `).run(updatedAt, current.taskExecutionId, input.expectedRevision);
    if (result.changes !== 1) {
      throw new StrategyTaskTransitionConflictError(
        'Strategy task changed while applying cancellation.',
      );
    }
  });
  cancel.immediate();
  return requireTask(db, input.taskExecutionId);
}

/**
 * Converge a logical task after startup reconciles its latest physical Run.
 * Successful Runs still require Coordinator-owned protocol interpretation, so
 * this narrow bridge only maps process failure -> blocked and cancellation ->
 * canceled. Databases without Task06 tables are intentionally a no-op.
 */
export function reconcileStrategyTaskRunTerminal(
  db: SqliteDb,
  input: {
    runId: string;
    status: 'failed' | 'canceled';
    updatedAt?: number;
  },
): boolean {
  try {
    const reconcile = db.transaction(() => {
      const current = getStrategyTaskExecutionByRunId(db, input.runId);
      if (
        !current
        || current.latestRunId !== input.runId
        || current.outcome !== 'running'
      ) {
        return false;
      }
      const result = db.prepare(`
        UPDATE strategy_task_executions
           SET revision = revision + 1, outcome = ?, updated_at = ?,
               blocked_reason_codes_json = ?, blocked_visible_text = NULL
         WHERE task_execution_id = ? AND revision = ?
           AND latest_run_id = ? AND outcome = 'running'
      `).run(
        input.status === 'canceled' ? 'canceled' : 'blocked',
        Math.max(
          current.updatedAt,
          normalizeTimestamp(input.updatedAt ?? Date.now(), 'updatedAt'),
        ),
        input.status === 'canceled'
          ? null
          : JSON.stringify(['od_next_physical_run_interrupted']),
        current.taskExecutionId,
        current.revision,
        input.runId,
      );
      return result.changes === 1;
    });
    return reconcile.immediate();
  } catch (error) {
    if (isMissingTaskStoreError(error)) return false;
    throw error;
  }
}

function requireTask(db: SqliteDb, taskExecutionId: string): StrategyTaskExecutionRecord {
  const task = getStrategyTaskExecution(db, taskExecutionId);
  if (!task) {
    throw new InvalidStrategyTaskRecordError(
      `Unknown strategy task execution ${taskExecutionId}.`,
    );
  }
  return task;
}

function rowToTask(db: SqliteDb, row: DbRow): StrategyTaskExecutionRecord {
  if (row['schema_version'] !== TASK_STORE_SCHEMA_VERSION) {
    throw new InvalidStrategyTaskRecordError('Unsupported strategy task schema version.');
  }
  const taskExecutionId = requireStoredString(row['task_execution_id'], 'task_execution_id');
  const projectId = requireStoredString(row['project_id'], 'project_id');
  const conversationId = requireStoredString(row['conversation_id'], 'conversation_id');
  const snapshotId = requireStoredString(row['snapshot_id'], 'snapshot_id');
  const strategyId = requireStoredString(row['strategy_id'], 'strategy_id');
  const strategyVersion = requireStoredString(row['strategy_version'], 'strategy_version');
  const strategyPackageHash = requireStoredString(
    row['strategy_package_hash'],
    'strategy_package_hash',
  );
  const conversation = db.prepare(
    `SELECT id FROM conversations WHERE id = ? AND project_id = ?`,
  ).get(conversationId, projectId);
  if (!conversation) {
    throw new InvalidStrategyTaskRecordError(
      'Persisted strategy task conversation no longer belongs to its project.',
    );
  }
  assertSnapshotOwnership(db, snapshotId, projectId, conversationId);
  const snapshot = getSnapshot(db, snapshotId);
  const binding = AppliedStrategyBindingV2Schema.safeParse(snapshot?.strategy);
  if (
    !snapshot
    || !binding.success
    || snapshot.pluginId !== OD_NEXT_STRATEGY_ID
    || snapshot.pluginVersion !== binding.data.version
    || snapshot.snapshotId !== snapshotId
    || strategyId !== binding.data.id
    || strategyVersion !== binding.data.version
    || strategyPackageHash !== binding.data.packageHash
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Persisted strategy task identity no longer matches its verified Snapshot binding.',
    );
  }

  const route = parseNullableRoute(row['route']);
  const inputStage = parseStage(row['input_stage']);
  const outcome = parseOutcome(row['outcome']);
  const executionMode = parseNullableExecutionMode(row['execution_mode']);
  validateStoredState({ route, inputStage, outcome, executionMode });
  const blockedContext = parseStoredBlockedContext(
    row['blocked_reason_codes_json'],
    row['blocked_visible_text'],
    outcome,
  );
  const plan = parseStoredPlanContract(row['plan_contract_json'], row['plan_contract_hash']);
  if (
    (inputStage === 'production' || outcome === 'plan_ready')
    && (!plan.contract || !plan.hash)
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Production and plan-ready records require a versioned, hash-bound Plan Contract.',
    );
  }
  if (plan.contract) {
    validatePlanIdentity(
      plan.contract,
      {
        snapshotId,
        strategyVersion,
        strategyPackageHash,
        selectedAgentId: requireStoredString(row['selected_agent_id'], 'selected_agent_id'),
      },
      executionMode,
    );
  }

  const runs = db.prepare(`
    SELECT run_id AS runId, input_stage AS inputStage,
           task_run_index AS taskRunIndex, source_run_id AS sourceRunId,
           final_text_kind AS finalTextKind,
           final_text_schema AS finalTextSchema,
           final_text AS finalText,
           final_text_utf8_bytes AS finalTextUtf8Bytes,
           final_text_sha256 AS finalTextSha256,
           created_at AS createdAt
      FROM strategy_task_runs
     WHERE task_execution_id = ?
     ORDER BY task_run_index ASC
  `).all(taskExecutionId) as Array<{
    runId: unknown;
    inputStage: unknown;
    taskRunIndex: unknown;
    sourceRunId: unknown;
    finalTextKind: unknown;
    finalTextSchema: unknown;
    finalText: unknown;
    finalTextUtf8Bytes: unknown;
    finalTextSha256: unknown;
    createdAt: unknown;
  }>;
  const createdAt = requireNonNegativeInteger(row['created_at'], 'created_at');
  const updatedAt = requireNonNegativeInteger(row['updated_at'], 'updated_at');
  if (updatedAt < createdAt) {
    throw new InvalidStrategyTaskRecordError(
      'Strategy task updated_at cannot precede created_at.',
    );
  }
  let previousMappingCreatedAt = createdAt;
  const mappings = runs.map((mapping, index): StrategyTaskRunMapping => {
    const taskRunIndex = requireNonNegativeInteger(mapping.taskRunIndex, 'task_run_index');
    if (taskRunIndex !== index) {
      throw new InvalidStrategyTaskRecordError(
        'Strategy task Run indices must be contiguous from zero.',
      );
    }
    const mappingCreatedAt = requireNonNegativeInteger(mapping.createdAt, 'run.created_at');
    if (mappingCreatedAt < previousMappingCreatedAt || mappingCreatedAt > updatedAt) {
      throw new InvalidStrategyTaskRecordError(
        'Strategy task Run mapping timestamps must be monotonic within the task lifetime.',
      );
    }
    previousMappingCreatedAt = mappingCreatedAt;
    const finalText = parseStoredFinalText({
      kind: mapping.finalTextKind,
      schema: mapping.finalTextSchema,
      text: mapping.finalText,
      utf8Bytes: mapping.finalTextUtf8Bytes,
      sha256: mapping.finalTextSha256,
    });
    validateMappedFinalText(finalText, {
      taskExecutionId,
      inputStage: parseStage(mapping.inputStage),
      taskRunIndex,
    });
    return {
      runId: requireStoredString(mapping.runId, 'run_id'),
      inputStage: parseStage(mapping.inputStage),
      taskRunIndex,
      ...(mapping.sourceRunId == null
        ? {}
        : { sourceRunId: requireStoredString(mapping.sourceRunId, 'source_run_id') }),
      finalText,
    };
  });
  const initialRunId = requireStoredString(row['initial_run_id'], 'initial_run_id');
  const latestRunId = requireStoredString(row['latest_run_id'], 'latest_run_id');
  if (
    mappings.length === 0
    || mappings[0]?.runId !== initialRunId
    || mappings.at(-1)?.runId !== latestRunId
    || mappings.at(-1)?.inputStage !== inputStage
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Strategy task Run mapping does not match its initial/latest identity.',
    );
  }

  const clarificationCount = requireBoundedCount(
    row['clarification_count'],
    'clarification_count',
  );
  const planContractRepairAttempts = requireBoundedCount(
    row['plan_contract_repair_attempts'],
    'plan_contract_repair_attempts',
  );
  validateRunChain(
    mappings,
    route,
    inputStage,
    clarificationCount,
    planContractRepairAttempts,
  );
  const frozenSkillPackage = getFrozenSkillPackage(db, taskExecutionId);
  const promptBundle = parseStoredFinalText({
    kind: 'bundle',
    schema: row['prompt_bundle_schema'],
    text: row['prompt_bundle_text'],
    utf8Bytes: row['prompt_bundle_utf8_bytes'],
    sha256: row['prompt_bundle_sha256'],
  });
  parseStoredPromptBundle(promptBundle);
  if (!sameFinalTextIdentity(promptBundle, mappings[0]!.finalText)) {
    throw new InvalidStrategyTaskRecordError(
      'Initial strategy task Run text must exactly match the persisted Prompt Bundle.',
    );
  }
  const frozenInputIdentity = parseFrozenInputIdentity(
    row['frozen_input_identity_json'],
    {
      snapshotId,
      strategyPackageHash,
      frozenSkillPackageIdentity: frozenSkillPackage.identity,
    },
  );
  return {
    schemaVersion: TASK_STORE_SCHEMA_VERSION,
    revision: requireNonNegativeInteger(row['revision'], 'revision'),
    taskExecutionId,
    projectId,
    conversationId,
    snapshotId,
    strategyId: OD_NEXT_STRATEGY_ID,
    strategyVersion,
    strategyPackageHash,
    selectedAgentId: requireStoredString(row['selected_agent_id'], 'selected_agent_id'),
    route,
    inputStage,
    outcome,
    executionMode,
    ...(blockedContext ? { blockedContext } : {}),
    ...(plan.contract ? { planContract: plan.contract } : {}),
    ...(plan.hash ? { planContractHash: plan.hash } : {}),
    clarificationCount,
    planContractRepairAttempts,
    initialRunId,
    latestRunId,
    activeRunId: outcome === 'running' ? latestRunId : null,
    terminalRunId: TERMINAL_OUTCOMES.has(outcome) ? latestRunId : null,
    runs: mappings,
    frozenSkillPackage,
    promptBundle,
    frozenInputIdentity,
    createdAt,
    updatedAt,
  };
}

function normalizeBlockedContext(
  input: CompareAndTransitionStrategyTaskInput['blockedContext'],
): StrategyTaskBlockedContext | null {
  if (!input) return null;
  const reasonCodes = [...new Set(
    input.reasonCodes.filter((code) => typeof code === 'string' && code.length > 0),
  )];
  if (reasonCodes.length === 0) return null;
  const visibleText = typeof input.visibleText === 'string' && input.visibleText.trim().length > 0
    ? input.visibleText
    : null;
  return { reasonCodes, visibleText };
}

function parseStoredBlockedContext(
  reasonCodesJson: unknown,
  visibleText: unknown,
  outcome: StrategyTaskOutcome,
): StrategyTaskBlockedContext | null {
  if (reasonCodesJson == null) return null;
  if (outcome !== 'blocked') {
    throw new InvalidStrategyTaskRecordError(
      'Blocked attribution is only valid on blocked strategy tasks.',
    );
  }
  const raw = requireStoredString(reasonCodesJson, 'blocked_reason_codes_json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidStrategyTaskRecordError(
      'Persisted blocked reason codes must be valid JSON.',
    );
  }
  if (
    !Array.isArray(parsed)
    || parsed.length === 0
    || !parsed.every((code) => typeof code === 'string' && code.length > 0)
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Persisted blocked reason codes must be a non-empty string array.',
    );
  }
  return {
    reasonCodes: parsed,
    visibleText: visibleText == null
      ? null
      : requireStoredString(visibleText, 'blocked_visible_text'),
  };
}

function addColumnIfMissing(db: SqliteDb, table: string, definition: string): void {
  const column = definition.split(/\s+/u)[0];
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as DbRow[];
  if (!columns.some((entry) => entry['name'] === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function insertableFrozenSkillPackage(value: FrozenSkillPackageV1): FrozenSkillPackageV1 {
  if (!value || typeof value !== 'object') {
    throw new InvalidStrategyTaskRecordError(
      'Strategy task creation requires a frozen Skill package.',
    );
  }
  return value;
}

/**
 * Bind a final text to the schema it is written or read under.
 *
 * The schema is an argument, never derived from `kind`: the write path mints the
 * version it composes while the read path replays the version the row already
 * stores, and conflating the two would silently rewrite a legacy row's identity
 * into the current version. The pairing is still constrained -- a kind may only
 * carry a schema listed for it in `ACCEPTED_FINAL_TEXT_SCHEMAS`.
 */
function finalTextIdentity(input: {
  kind: StrategyTaskFinalTextKind;
  schema: StrategyTaskFinalTextSchema;
  text: string;
}): StrategyTaskFinalTextIdentity {
  if (typeof input.text !== 'string' || !input.text.length) {
    throw new InvalidStrategyTaskRecordError('Strategy task final text must not be empty.');
  }
  return {
    kind: input.kind,
    schema: acceptedFinalTextSchema(input.kind, input.schema),
    text: input.text,
    utf8Bytes: Buffer.byteLength(input.text, 'utf8'),
    sha256: createHash('sha256').update(input.text, 'utf8').digest('hex'),
  };
}

/**
 * Narrow an untrusted schema label to one its kind may legally carry.
 *
 * A label that is absent, unknown, or belongs to the other kind is a corrupt
 * record. Rejecting here is what keeps a v1 label paired with v2 text (and the
 * reverse) from ever reaching a parser that would happily read it.
 */
function acceptedFinalTextSchema(
  kind: StrategyTaskFinalTextKind,
  schema: unknown,
): StrategyTaskFinalTextSchema {
  const accepted: ReadonlyArray<StrategyTaskFinalTextSchema> = ACCEPTED_FINAL_TEXT_SCHEMAS[kind];
  const match = accepted.find((candidate): boolean => candidate === schema);
  if (!match) {
    throw new InvalidStrategyTaskRecordError(
      'Mapped OD Next task Run is missing its versioned final text.',
    );
  }
  return match;
}

/**
 * Parse a persisted Prompt Bundle with the parser that owns its stored version.
 *
 * Each version's parser also proves the text re-serializes byte-identically, so
 * dispatching on the row's own label is what makes canonicality a check against
 * the version the bytes were written at rather than against whatever version the
 * daemon composes today.
 */
function parseStoredPromptBundle(identity: StrategyTaskFinalTextIdentity): void {
  if (identity.schema === OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2) {
    parseOdNextPromptBundleV2(identity.text);
    return;
  }
  if (identity.schema === OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1) {
    parseOdNextPromptBundleV1(identity.text);
    return;
  }
  throw new InvalidStrategyTaskRecordError(
    'Persisted OD Next Prompt Bundle does not carry a Prompt Bundle schema.',
  );
}

/**
 * Mint the identity for freshly composed Prompt Bundle text.
 *
 * New tasks are current-version only. Accepting a legacy bundle here would
 * persist a row in a version the composer no longer produces, so v1 text is
 * rejected at write time even though v1 rows stay readable forever.
 */
function composedPromptBundleIdentity(text: string): StrategyTaskFinalTextIdentity {
  const identity = finalTextIdentity({
    kind: 'bundle',
    schema: COMPOSED_PROMPT_BUNDLE_SCHEMA,
    text,
  });
  parseOdNextPromptBundleV2(identity.text);
  return identity;
}

function continuationFinalTextIdentity(input: {
  text: string;
  taskExecutionId: string;
  stage: StrategyInputStageV2;
  taskRunIndex: number;
}): StrategyTaskFinalTextIdentity {
  if (input.stage === 'request') {
    throw new InvalidStrategyTaskTransitionError(
      'A continuation final text cannot use the request stage.',
    );
  }
  const identity = finalTextIdentity({
    kind: 'turn',
    schema: OD_NEXT_REQUEST_TURN_SCHEMA_V1,
    text: input.text,
  });
  const parsed = parseOdNextRequestTurnV1(identity.text);
  if (
    parsed.taskExecutionId !== input.taskExecutionId
    || parsed.stage !== input.stage
    || parsed.taskRunIndex !== input.taskRunIndex
  ) {
    throw new InvalidStrategyTaskTransitionError(
      'Continuation final text identity does not match its task Run mapping.',
    );
  }
  return identity;
}

function parseStoredFinalText(input: {
  kind: unknown;
  schema: unknown;
  text: unknown;
  utf8Bytes: unknown;
  sha256: unknown;
}): StrategyTaskFinalTextIdentity {
  if (input.kind !== 'bundle' && input.kind !== 'turn') {
    throw new InvalidStrategyTaskRecordError(
      'Mapped OD Next task Run is missing its final text kind.',
    );
  }
  const schema = acceptedFinalTextSchema(input.kind, input.schema);
  if (typeof input.text !== 'string' || !input.text.length) {
    throw new InvalidStrategyTaskRecordError(
      'Mapped OD Next task Run is missing its versioned final text.',
    );
  }
  const identity = finalTextIdentity({ kind: input.kind, schema, text: input.text });
  if (
    input.utf8Bytes !== identity.utf8Bytes
    || input.sha256 !== identity.sha256
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Mapped OD Next task Run final text failed UTF-8 bytes or SHA-256 validation.',
    );
  }
  return identity;
}

function validateMappedFinalText(
  identity: StrategyTaskFinalTextIdentity,
  mapping: {
    taskExecutionId: string;
    inputStage: StrategyInputStageV2;
    taskRunIndex: number;
  },
): void {
  if (mapping.taskRunIndex === 0) {
    if (mapping.inputStage !== 'request' || identity.kind !== 'bundle') {
      throw new InvalidStrategyTaskRecordError(
        'Initial strategy task Run must own the persisted Prompt Bundle.',
      );
    }
    parseStoredPromptBundle(identity);
    return;
  }
  if (identity.kind !== 'turn' || mapping.inputStage === 'request') {
    throw new InvalidStrategyTaskRecordError(
      'Continuation strategy task Run must own a persisted request Turn.',
    );
  }
  const parsed = parseOdNextRequestTurnV1(identity.text);
  if (
    parsed.taskExecutionId !== mapping.taskExecutionId
    || parsed.stage !== mapping.inputStage
    || parsed.taskRunIndex !== mapping.taskRunIndex
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Persisted request Turn does not match its task Run mapping.',
    );
  }
}

function sameFinalTextIdentity(
  left: StrategyTaskFinalTextIdentity,
  right: StrategyTaskFinalTextIdentity,
): boolean {
  return left.kind === right.kind
    && left.schema === right.schema
    && left.text === right.text
    && left.utf8Bytes === right.utf8Bytes
    && left.sha256 === right.sha256;
}

function parseFrozenInputIdentity(
  value: unknown,
  expected: Omit<StrategyTaskFrozenInputIdentity, 'schema' | 'taskInputManifestSha256'>,
): StrategyTaskFrozenInputIdentity {
  if (typeof value !== 'string') {
    throw new InvalidStrategyTaskRecordError(
      'Mapped OD Next task is missing its frozen input identity.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new InvalidStrategyTaskRecordError('Frozen input identity contains invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidStrategyTaskRecordError('Frozen input identity is invalid.');
  }
  const identity = parsed as Partial<StrategyTaskFrozenInputIdentity>;
  if (
    identity.schema !== 'open-design.od-next-frozen-input-identity/v1'
    || identity.snapshotId !== expected.snapshotId
    || identity.strategyPackageHash !== expected.strategyPackageHash
    || identity.frozenSkillPackageIdentity !== expected.frozenSkillPackageIdentity
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Frozen input identity no longer matches the task-owned inputs.',
    );
  }
  return {
    schema: identity.schema,
    snapshotId: identity.snapshotId,
    strategyPackageHash: identity.strategyPackageHash,
    frozenSkillPackageIdentity: identity.frozenSkillPackageIdentity,
    taskInputManifestSha256: requireSha256(
      identity.taskInputManifestSha256,
      'frozen_input_identity.taskInputManifestSha256',
    ),
  };
}

function requireSha256(value: unknown, field: string): string {
  if (typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)) return value;
  throw new InvalidStrategyTaskRecordError(`${field} must contain a SHA-256 digest.`);
}

function assertSnapshotOwnership(
  db: SqliteDb,
  snapshotId: string,
  projectId: string,
  conversationId: string,
): void {
  const owner = db.prepare(`
    SELECT project_id AS projectId, conversation_id AS conversationId
      FROM applied_plugin_snapshots WHERE id = ?
  `).get(snapshotId) as { projectId?: unknown; conversationId?: unknown } | undefined;
  if (
    owner?.projectId !== projectId
    || owner.conversationId !== conversationId
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Strategy task project/conversation must exactly match the locked Snapshot owner.',
    );
  }
}

function validateRunChain(
  mappings: StrategyTaskRunMapping[],
  route: StrategyRouteV2 | null,
  currentStage: StrategyInputStageV2,
  clarificationCount: 0 | 1,
  repairCount: 0 | 1,
): void {
  if (mappings.length === 0 || mappings[0]?.inputStage !== 'request') {
    throw new InvalidStrategyTaskRecordError(
      'A strategy task Run chain must start with the request stage.',
    );
  }
  if (mappings[0]?.sourceRunId !== undefined) {
    throw new InvalidStrategyTaskRecordError(
      'The initial strategy task Run cannot have a source Run.',
    );
  }
  const allowed = new Set([
    'request:clarification',
    'request:contract_repair',
    'request:production',
    'clarification:contract_repair',
    'clarification:production',
    'contract_repair:production',
  ]);
  for (let index = 1; index < mappings.length; index += 1) {
    const previous = mappings[index - 1];
    const current = mappings[index];
    if (!previous || !current) {
      throw new InvalidStrategyTaskRecordError('Strategy task Run mapping is incomplete.');
    }
    if (current.sourceRunId !== previous.runId) {
      throw new InvalidStrategyTaskRecordError(
        'Each strategy task Run must source the immediately preceding Run.',
      );
    }
    if (!allowed.has(`${previous.inputStage}:${current.inputStage}`)) {
      throw new InvalidStrategyTaskRecordError(
        'Strategy task Run stages must be ordered and cannot repeat or move backward.',
      );
    }
  }
  const clarificationMappings = mappings.filter(
    (mapping) => mapping.inputStage === 'clarification',
  ).length;
  const repairMappings = mappings.filter(
    (mapping) => mapping.inputStage === 'contract_repair',
  ).length;
  if (
    clarificationMappings !== clarificationCount
    || repairMappings !== repairCount
  ) {
    throw new InvalidStrategyTaskRecordError(
      'Strategy task clarification/repair counts must match the physical Run chain.',
    );
  }
  if (mappings.at(-1)?.inputStage !== currentStage) {
    throw new InvalidStrategyTaskRecordError(
      'Strategy task current stage must match its latest Run mapping.',
    );
  }
  if (route === 'direct_edit' && (
    mappings.length !== 1
    || mappings[0]?.inputStage !== 'request'
  )) {
    throw new InvalidStrategyTaskRecordError(
      'Direct Edit can only own its single request Run.',
    );
  }
  if (route === null && mappings.length !== 1) {
    throw new InvalidStrategyTaskRecordError(
      'An unrouted strategy task cannot own a next Run.',
    );
  }
}

function validateTransition(
  current: StrategyTaskExecutionRecord,
  input: CompareAndTransitionStrategyTaskInput,
): StrategyTaskTransitionState {
  const next = input.to;
  if (current.route && current.route !== next.route) {
    throw new InvalidStrategyTaskTransitionError('Strategy route is locked for the task chain.');
  }
  if (
    current.executionMode
    && current.executionMode !== next.executionMode
  ) {
    throw new InvalidStrategyTaskTransitionError(
      'Strategy execution mode is locked once selected.',
    );
  }
  if (next.route === 'direct_edit') {
    if (
      next.inputStage !== 'request'
      || next.executionMode !== 'simple'
      || input.nextRun
    ) {
      throw new InvalidStrategyTaskTransitionError(
        'Direct Edit is request-only, simple, and cannot create a next Run.',
      );
    }
  }
  if (
    next.inputStage === 'clarification'
    && current.inputStage !== 'clarification'
    && next.executionMode !== null
  ) {
    throw new InvalidStrategyTaskTransitionError(
      'Clarification must be entered before execution mode is locked.',
    );
  }
  if (
    (next.inputStage === 'contract_repair' || next.inputStage === 'production')
    && next.executionMode === null
  ) {
    throw new InvalidStrategyTaskTransitionError(
      `${next.inputStage} requires a locked execution mode.`,
    );
  }

  const changesStage = next.inputStage !== current.inputStage;
  if (changesStage) {
    if (!input.nextRun || next.outcome !== 'running') {
      throw new InvalidStrategyTaskTransitionError(
        'A physical-stage change must atomically claim one running next Run.',
      );
    }
    if (input.nextRun.sourceRunId !== current.latestRunId) {
      throw new InvalidStrategyTaskTransitionError(
        'The next Run source must be the task chain latest Run.',
      );
    }
    const transition = StrategyRuntimeTransitionV2Schema.safeParse({
      from: {
        route: current.route ?? next.route,
        inputStage: current.inputStage,
        executionMode: current.executionMode,
      },
      to: {
        route: next.route,
        inputStage: next.inputStage,
        executionMode: next.executionMode,
      },
    });
    if (!transition.success) {
      throw new InvalidStrategyTaskTransitionError(
        transition.error.issues[0]?.message ?? 'Illegal strategy physical-stage transition.',
      );
    }
  } else if (input.nextRun) {
    throw new InvalidStrategyTaskTransitionError(
      'A next Run must advance to a different physical stage.',
    );
  }

  if (next.outcome !== 'running') {
    const state = StrategyRuntimeStateV2Schema.safeParse({
      schema: 'open-design.strategy-state/v2',
      route: next.route,
      inputStage: next.inputStage,
      outcome: next.outcome,
      executionMode: next.executionMode,
      reasonCodes: [],
    });
    if (!state.success) {
      throw new InvalidStrategyTaskTransitionError(
        state.error.issues[0]?.message ?? 'Illegal strategy task outcome.',
      );
    }
  }
  return next;
}

function resolvePlanContract(
  current: StrategyTaskExecutionRecord,
  candidate: OpenDesignPlanContractV2 | undefined,
  next: StrategyTaskTransitionState,
): { json: string | null; hash: string | null } {
  let contract = current.planContract;
  let hash = current.planContractHash;
  if (candidate) {
    const parsed = OpenDesignPlanContractV2Schema.safeParse(candidate);
    if (!parsed.success) {
      throw new InvalidStrategyTaskTransitionError(
        parsed.error.issues[0]?.message ?? 'Plan Contract is invalid.',
      );
    }
    validatePlanIdentity(parsed.data, current, next.executionMode);
    const candidateHash = strategyPlanContractHash(parsed.data);
    if (hash && hash !== candidateHash) {
      throw new InvalidStrategyTaskTransitionError(
        'The locked Plan Contract hash cannot change.',
      );
    }
    contract = parsed.data;
    hash = candidateHash;
  }
  if (next.inputStage === 'production' && (!contract || !hash)) {
    throw new InvalidStrategyTaskTransitionError(
      'Production requires a versioned, hash-bound Plan Contract.',
    );
  }
  if (next.outcome === 'plan_ready' && (!contract || !hash)) {
    throw new InvalidStrategyTaskTransitionError(
      'A plan-ready task requires a versioned, hash-bound Plan Contract.',
    );
  }
  return {
    json: contract ? JSON.stringify(contract) : null,
    hash: hash ?? null,
  };
}

function validatePlanIdentity(
  plan: OpenDesignPlanContractV2,
  identity: {
    snapshotId: string;
    strategyVersion: string;
    strategyPackageHash: string;
    selectedAgentId: string;
  },
  executionMode: StrategyExecutionModeV2 | null,
): void {
  if (
    plan.strategy.snapshotId !== identity.snapshotId
    || plan.strategy.version !== identity.strategyVersion
    || plan.strategy.packageHash !== identity.strategyPackageHash
  ) {
    throw new InvalidStrategyTaskTransitionError(
      'Plan Contract strategy identity must match the locked Snapshot.',
    );
  }
  if (plan.runManifest.selectedAgentId !== identity.selectedAgentId) {
    throw new InvalidStrategyTaskTransitionError(
      'Plan Contract selected agent must match the locked task agent.',
    );
  }
  if (executionMode === null || plan.fullPlan.executionMode !== executionMode) {
    throw new InvalidStrategyTaskTransitionError(
      'Plan Contract execution mode must match the locked task mode.',
    );
  }
}

function parseStoredPlanContract(
  json: unknown,
  hash: unknown,
): { contract?: OpenDesignPlanContractV2; hash?: string } {
  if (json == null && hash == null) return {};
  if (typeof json !== 'string' || typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) {
    throw new InvalidStrategyTaskRecordError(
      'Stored Plan Contract JSON and hash must be present together.',
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new InvalidStrategyTaskRecordError('Stored Plan Contract contains invalid JSON.');
  }
  const parsed = OpenDesignPlanContractV2Schema.safeParse(value);
  if (!parsed.success || strategyPlanContractHash(parsed.data) !== hash) {
    throw new InvalidStrategyTaskRecordError(
      'Stored Plan Contract failed schema or hash validation.',
    );
  }
  return { contract: parsed.data, hash };
}

export function strategyPlanContractHash(plan: OpenDesignPlanContractV2): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(plan)), 'utf8')
    .digest('hex');
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, canonicalJsonValue(child)]),
    );
  }
  return value;
}

function validateStoredState(state: {
  route: StrategyRouteV2 | null;
  inputStage: StrategyInputStageV2;
  outcome: StrategyTaskOutcome;
  executionMode: StrategyExecutionModeV2 | null;
}): void {
  if (state.route === null) {
    if (
      state.inputStage !== 'request'
      || state.executionMode !== null
      || !['running', 'canceled', 'blocked'].includes(state.outcome)
    ) {
      throw new InvalidStrategyTaskRecordError(
        'An unlocked route is valid only for an initial request before routing.',
      );
    }
    return;
  }
  if (state.outcome === 'running') {
    if (state.route === 'direct_edit') {
      if (state.inputStage !== 'request' || state.executionMode !== 'simple') {
        throw new InvalidStrategyTaskRecordError(
          'A running Direct Edit must remain request/simple.',
        );
      }
    } else if (
      (state.inputStage === 'contract_repair' || state.inputStage === 'production')
      && state.executionMode === null
    ) {
      throw new InvalidStrategyTaskRecordError(
        'A running repair/production stage requires a locked execution mode.',
      );
    }
    return;
  }
  const parsed = StrategyRuntimeStateV2Schema.safeParse({
    schema: 'open-design.strategy-state/v2',
    route: state.route,
    inputStage: state.inputStage,
    outcome: state.outcome,
    executionMode: state.executionMode,
    reasonCodes: [],
  });
  if (!parsed.success) {
    throw new InvalidStrategyTaskRecordError(
      parsed.error.issues[0]?.message ?? 'Persisted strategy task state is invalid.',
    );
  }
}

function parseNullableRoute(value: unknown): StrategyRouteV2 | null {
  if (value == null) return null;
  if (value === 'direct_edit' || value === 'full_plan') return value;
  throw new InvalidStrategyTaskRecordError('Stored strategy route is invalid.');
}

function parseStage(value: unknown): StrategyInputStageV2 {
  if (
    value === 'request'
    || value === 'clarification'
    || value === 'contract_repair'
    || value === 'production'
  ) return value;
  throw new InvalidStrategyTaskRecordError('Stored strategy input stage is invalid.');
}

function parseOutcome(value: unknown): StrategyTaskOutcome {
  if (
    value === 'running'
    || value === 'clarification_required'
    || value === 'plan_ready'
    || value === 'completed'
    || value === 'blocked'
    || value === 'canceled'
  ) return value;
  throw new InvalidStrategyTaskRecordError('Stored strategy outcome is invalid.');
}

function parseNullableExecutionMode(value: unknown): StrategyExecutionModeV2 | null {
  if (value == null) return null;
  if (value === 'simple' || value === 'complex') return value;
  throw new InvalidStrategyTaskRecordError('Stored strategy execution mode is invalid.');
}

function requireBoundedCount(value: unknown, field: string): 0 | 1 {
  if (value === 0 || value === 1) return value;
  throw new InvalidStrategyTaskRecordError(`${field} must be zero or one.`);
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new InvalidStrategyTaskRecordError(`${field} must be a non-negative integer.`);
}

function normalizeTimestamp(value: number, field: string): number {
  if (Number.isInteger(value) && value >= 0) return value;
  throw new InvalidStrategyTaskRecordError(`${field} must be a non-negative integer.`);
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new InvalidStrategyTaskRecordError(`${field} must not be empty.`);
  return normalized;
}

function requireStoredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidStrategyTaskRecordError(`${field} must contain a non-empty string.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingTaskStoreError(error: unknown): boolean {
  return error instanceof Error
    && /no such table: strategy_task_(?:executions|runs)/iu.test(error.message);
}
