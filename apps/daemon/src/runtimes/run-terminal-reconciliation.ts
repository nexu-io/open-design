import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import {
  buildRunFinishedV4Aliases,
  type TrackingRunCancelOrigin,
  type TrackingRunTerminalTrigger,
  type RunTaskLineageProps,
} from '@open-design/contracts/analytics';

import { appendMessageStatusEvent } from '../db.js';
import { reconcileStrategyTaskRunTerminal } from '../strategies/task-store.js';
import { classifyRunFailure } from '../run-failure-classification.js';
import { summarizeRunDiagnosticsForAnalytics } from '../run-diagnostics.js';
import { deriveRunErrorCode, runResultFromStatus } from '../run-result.js';
import { runAskedUserQuestion } from './run-artifacts.js';
import {
  interruptDurableRunAfterDaemonRestart,
  RESTART_ERROR_CODE,
  RESTART_ERROR_MESSAGE,
  type RestartRecoverableDurableRunState,
} from './run-restart-recovery.js';
import {
  beginRunTelemetryDelivery,
  finalizeRunTelemetryDelivery,
  isRunTelemetryDeliveryCrashWindow,
  recordRunTelemetryDeliveryAttempt,
  type RunTelemetryDeliveryResult,
  type RunTelemetryDeliveryStateV1,
} from '../observability/delivery-state.js';
import {
  normalizeTelemetryAppVersion,
  normalizeTelemetryAppVersionInfo,
  UNKNOWN_APP_VERSION,
  type AppVersionInfo,
} from '../app-version.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const RECONCILED_STATUS_MESSAGE = 'Run terminal state reconciled after daemon restart.';
const STRONGER_TERMINAL_INTEGRITY = new Set([
  'late',
  'overwritten',
  'permanently_missing',
  'post_terminal_activity',
]);

function reconciledTerminalIntegrity(value: unknown): string {
  return typeof value === 'string' && STRONGER_TERMINAL_INTEGRITY.has(value)
    ? value
    : 'reconciled';
}

interface AnalyticsRecovery {
  context: Record<string, unknown>;
  properties: Record<string, unknown>;
  insertId: string;
  completedAt?: number;
}

interface DurableRunState extends RestartRecoverableDurableRunState {
  schemaVersion: 1;
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  appVersionInfo?: AppVersionInfo;
  cancelOrigin?: TrackingRunCancelOrigin | null;
  terminalTrigger?: TrackingRunTerminalTrigger | null;
  createdAt: number;
  artifactCount?: number;
  endedWithUnfinishedWork?: boolean;
  userPrompt?: string;
  model?: string;
  resolvedModelId?: string;
  preflightAgentCliVersion?: string;
  reasoning?: string;
  skillId?: string;
  designSystemId?: string;
  designSystemDigest?: string;
  designSystemSelectionSource?: string;
  clientType?: 'desktop' | 'web' | 'unknown';
  analyticsTelemetry?: Record<string, unknown>;
  promptTelemetry?: Record<string, unknown>;
  promptCache?: Record<string, unknown>;
  analyticsRecovery?: AnalyticsRecovery;
  langfuseCompletedAt?: number;
  telemetryDelivery?: RunTelemetryDeliveryStateV1;
}

interface AnalyticsLike {
  capture(args: {
    eventName: string;
    context: Record<string, unknown>;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): void | Promise<void>;
}

interface ReconciliationOptions {
  analytics: AnalyticsLike;
  appVersion?: string;
  appVersionInfo?: unknown;
  db: Database.Database;
  reportLangfuse(args: Record<string, unknown>): unknown | Promise<unknown>;
  taskObservationModeForRun?: (runId: string) => 'off' | 'observe' | 'send';
  taskObservationRepresentationForRun?: (runId: string) =>
    | 'single_run'
    | 'task_pending'
    | 'task_accepted'
    | 'task_not_expected';
  taskObservationNotExpectedReasonForRun?: (runId: string) => string | null;
  seedTaskObservationRunFact?: (
    runId: string,
    fact: Pick<DurableRunState, 'langfuseCompletedAt' | 'telemetryDelivery'>,
  ) => void | Promise<void>;
  beginTaskObservationForRun?: (runId: string) => {
    suppressSingleRun: boolean;
    completion: Promise<unknown>;
  };
  runsLogDir: string;
  finalizeTerminalLocally?: (run: DurableRunState, status: string, terminalAt: number) => void;
}

function appVersionForRun(state: DurableRunState, options: ReconciliationOptions): string {
  return normalizeTelemetryAppVersionInfo(state.appVersionInfo)?.version
    ?? normalizeTelemetryAppVersionInfo(options.appVersionInfo)?.version
    ?? normalizeTelemetryAppVersion(options.appVersion)
    ?? UNKNOWN_APP_VERSION;
}

function appVersionInfoForRun(
  state: DurableRunState,
  options: ReconciliationOptions,
): AppVersionInfo | null {
  return normalizeTelemetryAppVersionInfo(state.appVersionInfo)
    ?? normalizeTelemetryAppVersionInfo(options.appVersionInfo);
}

export interface RunTerminalReconciliationResult {
  scanned: number;
  interrupted: number;
  messagesReconciled: number;
  strategyTasksReconciled: number;
  analyticsReplayed: number;
  langfuseReplayed: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readState(filePath: string): DurableRunState | null {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!isObject(value) || value.schemaVersion !== 1) return null;
    if (typeof value.id !== 'string' || typeof value.status !== 'string') return null;
    if (typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number') return null;
    return value as unknown as DurableRunState;
  } catch {
    return null;
  }
}

function writeState(filePath: string, state: DurableRunState): void {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } catch {
    try { fs.unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
  }
}

function readEvents(runsLogDir: string, runId: string): Array<{
  id: number;
  event: string;
  data: unknown;
  timestamp?: number;
}> {
  try {
    return fs.readFileSync(path.join(runsLogDir, runId, 'events.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown)
      .filter((value): value is { id: number; event: string; data: unknown; timestamp?: number } =>
        isObject(value) && typeof value.id === 'number' && typeof value.event === 'string');
  } catch {
    return [];
  }
}

function hydrateRun(state: DurableRunState, events: ReturnType<typeof readEvents>) {
  return {
    id: state.id,
    projectId: state.projectId ?? null,
    conversationId: state.conversationId ?? null,
    assistantMessageId: state.assistantMessageId ?? null,
    agentId: state.agentId ?? null,
    status: state.status,
    exitCode: state.exitCode ?? null,
    signal: state.signal ?? null,
    error: state.error ?? null,
    errorCode: state.errorCode ?? null,
    analyticsTelemetry: state.analyticsTelemetry ?? null,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    events,
    ...(state.userPrompt !== undefined ? { userPrompt: state.userPrompt } : {}),
    ...(state.model !== undefined ? { model: state.model } : {}),
    ...(state.resolvedModelId !== undefined
      ? { resolvedModelId: state.resolvedModelId }
      : {}),
    ...(state.preflightAgentCliVersion !== undefined
      ? { preflightAgentCliVersion: state.preflightAgentCliVersion }
      : {}),
    ...(state.reasoning !== undefined ? { reasoning: state.reasoning } : {}),
    ...(state.skillId !== undefined ? { skillId: state.skillId } : {}),
    ...(state.designSystemId !== undefined ? { designSystemId: state.designSystemId } : {}),
    ...(state.designSystemDigest !== undefined ? { designSystemDigest: state.designSystemDigest } : {}),
    ...(state.designSystemSelectionSource !== undefined
      ? { designSystemSelectionSource: state.designSystemSelectionSource }
      : {}),
    ...(state.clientType !== undefined ? { clientType: state.clientType } : {}),
    ...(state.promptTelemetry !== undefined ? { promptTelemetry: state.promptTelemetry } : {}),
    ...(state.promptCache !== undefined ? { promptCache: state.promptCache } : {}),
  };
}

function reconcileMessages(
  db: Database.Database,
  statesByRunId: Map<string, DurableRunState>,
  now: number,
): number {
  let rows: Array<{ id: string; runId: string | null }> = [];
  try {
    rows = db.prepare(
      `SELECT id, run_id AS runId
         FROM messages
        WHERE run_status IN ('queued', 'running')`,
    ).all() as Array<{ id: string; runId: string | null }>;
  } catch {
    return 0;
  }
  for (const row of rows) {
    const state = row.runId ? statesByRunId.get(row.runId) : undefined;
    const status = state && TERMINAL_STATUSES.has(state.status) ? state.status : 'failed';
    db.prepare(
      `UPDATE messages
          SET run_status = ?, ended_at = COALESCE(ended_at, ?)
        WHERE id = ? AND run_status IN ('queued', 'running')`,
    ).run(status, state?.updatedAt ?? now, row.id);
    const isDaemonRestart = state?.terminalRecoveryReason === 'daemon_restart'
      || state?.errorCode === RESTART_ERROR_CODE;
    appendMessageStatusEvent(db, row.id, status === 'failed'
      ? {
          label: 'error',
          detail: isDaemonRestart
            ? RESTART_ERROR_MESSAGE
            : state?.error ?? RECONCILED_STATUS_MESSAGE,
        }
      : { label: status, detail: RECONCILED_STATUS_MESSAGE });
  }
  return rows.length;
}

/**
 * Reconcile one Run's strategy-task terminal, absorbing any failure to read
 * that single record.
 *
 * Startup reconciliation owes EVERY Run its terminal obligation: message
 * repair, analytics replay, and Langfuse delivery. A task row whose persisted
 * Prompt Bundle can no longer be parsed is one Run's problem, and must never
 * cancel the obligation owed to its siblings — `strategyTaskTurnsForRunIds`
 * already holds this invariant for the message list. Returns whether the
 * record was reconciled; an unreadable record counts as not reconciled rather
 * than as a batch-ending error.
 */
function reconcileStrategyTaskRunTerminalIsolated(
  db: Parameters<typeof reconcileStrategyTaskRunTerminal>[0],
  input: Parameters<typeof reconcileStrategyTaskRunTerminal>[1],
): boolean {
  try {
    return reconcileStrategyTaskRunTerminal(db, input);
  } catch (error) {
    console.warn('[runs] strategy task terminal reconciliation skipped', input.runId, error);
    return false;
  }
}

export async function reconcileDurableRunTerminals(
  options: ReconciliationOptions,
): Promise<RunTerminalReconciliationResult> {
  const result: RunTerminalReconciliationResult = {
    scanned: 0,
    interrupted: 0,
    messagesReconciled: 0,
    strategyTasksReconciled: 0,
    analyticsReplayed: 0,
    langfuseReplayed: 0,
  };
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(options.runsLogDir, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const states = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      filePath: path.join(options.runsLogDir, entry.name, 'state.json'),
      state: readState(path.join(options.runsLogDir, entry.name, 'state.json')),
    }))
    .filter((entry): entry is { filePath: string; state: DurableRunState } => entry.state !== null);
  result.scanned = states.length;
  const now = Date.now();
  const interruptedRunIds = new Set<string>();

  // PR/beta v1 incorrectly checkpointed ordinary transport failures as
  // terminal. Repair that derived telemetry state in place while preserving
  // the stable delivery identity, attempt count, and user-owned Run facts.
  for (const entry of states) {
    if (entry.state.telemetryDelivery?.status !== 'failed') continue;
    delete entry.state.telemetryDelivery.finalizedAt;
    entry.state.telemetryDelivery.crashWindow = false;
    delete entry.state.langfuseCompletedAt;
    writeState(entry.filePath, entry.state);
  }

  for (const entry of states) {
    if (!interruptDurableRunAfterDaemonRestart(entry.state, now)) continue;
    writeState(entry.filePath, entry.state);
    interruptedRunIds.add(entry.state.id);
    result.interrupted += 1;
  }

  // Repair both newly interrupted Runs and terminal state snapshots that may
  // have survived a crash before their local terminal outbox write.
  for (const { state } of states) {
    if (state.status !== 'failed' && state.status !== 'canceled') continue;
    try {
      options.finalizeTerminalLocally?.(
        state,
        state.status,
        state.terminalAt ?? state.updatedAt,
      );
    } catch (error) {
      console.warn(
        '[runs] terminal local finalizer failed during restart reconciliation',
        error,
      );
    }
  }

  const statesByRunId = new Map(states.map((entry) => [entry.state.id, entry.state]));
  result.messagesReconciled = reconcileMessages(options.db, statesByRunId, now);
  for (const { state } of states) {
    if (state.status !== 'failed' && state.status !== 'canceled') continue;
    if (reconcileStrategyTaskRunTerminalIsolated(options.db, {
      runId: state.id,
      status: state.status,
      updatedAt: state.updatedAt,
    })) {
      result.strategyTasksReconciled += 1;
    }
  }

  // Seed every mapped Run fact before asking the rollout service to choose a
  // representation for any Task. Directory order must not let an unmarked
  // sibling claim pending ownership before a later sibling proves that a
  // single-Run trace already crossed (or may have crossed) the network.
  for (const { state } of states) {
    try {
      await Promise.resolve(options.seedTaskObservationRunFact?.(state.id, {
        ...(state.langfuseCompletedAt !== undefined
          ? { langfuseCompletedAt: state.langfuseCompletedAt }
          : {}),
        ...(state.telemetryDelivery ? { telemetryDelivery: state.telemetryDelivery } : {}),
      }));
    } catch {
      console.warn('[telemetry] task fact seeding failed during startup recovery');
    }
  }

  for (const entry of states) {
    const { state } = entry;
    let taskRepresentation:
      | 'single_run'
      | 'task_pending'
      | 'task_accepted'
      | 'task_not_expected'
      | undefined;
    try {
      taskRepresentation = options.taskObservationRepresentationForRun?.(state.id);
    } catch {
      console.warn('[telemetry] task representation lookup failed during startup recovery');
    }
    if (
      state.telemetryDelivery?.status === 'not_expected'
      && state.telemetryDelivery.dropReason === 'task_hierarchy_rollout'
      && (taskRepresentation === 'task_pending' || taskRepresentation === 'single_run')
    ) {
      const preservedKey = state.telemetryDelivery.idempotencyKey;
      const preservedAttempts = state.telemetryDelivery.attemptCount;
      delete state.langfuseCompletedAt;
      state.telemetryDelivery = {
        version: 1,
        idempotencyKey: preservedKey,
        status: 'failed',
        attemptCount: preservedAttempts,
        crashWindow: false,
        startedAt: state.telemetryDelivery.startedAt,
        dropReason: 'v1_task_hierarchy_completion_repaired',
      };
      writeState(entry.filePath, state);
    }
    const needsAnalytics = Boolean(
      state.analyticsRecovery && !state.analyticsRecovery.completedAt,
    );
    const needsLangfuse = TERMINAL_STATUSES.has(state.status)
      && !state.langfuseCompletedAt
      && typeof state.telemetryDelivery?.finalizedAt !== 'number'
      && (
        state.telemetryDelivery === undefined
        || state.telemetryDelivery.status === 'failed'
        || isRunTelemetryDeliveryCrashWindow(state.telemetryDelivery)
        || interruptedRunIds.has(state.id)
      );
    if (!needsAnalytics && !needsLangfuse) continue;

    const recoveryReason = state.terminalRecoveryReason ?? 'analytics_incomplete';
    const events = readEvents(options.runsLogDir, state.id);
    if (needsAnalytics && state.analyticsRecovery) {
      const failed = state.status === 'failed';
      const runResult = runResultFromStatus(state.status);
      const errorCode = failed
        ? recoveryReason === 'daemon_restart'
          ? state.errorCode ?? RESTART_ERROR_CODE
          : deriveRunErrorCode(state)
        : undefined;
      const failure = failed
        ? classifyRunFailure({
            result: runResult,
            status: state,
            ...(errorCode ? { errorCode } : {}),
            agentId: state.agentId,
            cancelOrigin: state.cancelOrigin ?? null,
            terminalTrigger: state.terminalTrigger ?? null,
            events,
          })
        : undefined;
      const properties: Record<string, unknown> = {
        ...state.analyticsRecovery.properties,
        area: state.analyticsRecovery.properties.area === 'design_system_generation'
          ? 'design_system_generation'
          : 'chat_panel',
        result: runResult,
        artifact_count: state.artifactCount ?? 0,
        asked_user_question: runAskedUserQuestion(events),
        total_duration_ms: Math.max(0, state.updatedAt - state.createdAt),
        langfuse_trace_id: state.id,
        terminal_reconciled: true,
        terminal_integrity: reconciledTerminalIntegrity(
          state.analyticsRecovery.properties.terminal_integrity,
        ),
        terminal_recovery_reason: recoveryReason,
        ...(errorCode ? { error_code: errorCode } : {}),
        ...(failure ?? {}),
        ...summarizeRunDiagnosticsForAnalytics({
          events,
          exitCode: state.exitCode ?? null,
          signal: state.signal ?? null,
          cancelRequested: state.status === 'canceled',
        }),
      };
      const taskLineage: RunTaskLineageProps = {
        task_execution_id:
          typeof properties.task_execution_id === 'string'
            ? properties.task_execution_id
            : state.id,
        initial_run_id:
          typeof properties.initial_run_id === 'string'
            ? properties.initial_run_id
            : state.id,
        task_run_index:
          typeof properties.task_run_index === 'number'
            ? properties.task_run_index
            : 0,
        ...(typeof properties.source_run_id === 'string'
          ? { source_run_id: properties.source_run_id }
          : {}),
        ...(typeof properties.recovery_action_type === 'string'
          ? {
              recovery_action_type: properties.recovery_action_type as NonNullable<
                RunTaskLineageProps['recovery_action_type']
              >,
            }
          : {}),
        ...(typeof properties.recovery_action_instance_id === 'string'
          ? { recovery_action_instance_id: properties.recovery_action_instance_id }
          : {}),
      };
      Object.assign(properties, buildRunFinishedV4Aliases(properties, taskLineage));
      await Promise.resolve(options.analytics.capture({
        eventName: 'run_finished',
        context: state.analyticsRecovery.context,
        appVersion: appVersionForRun(state, options),
        properties,
        insertId: `${state.analyticsRecovery.insertId}-finish`,
      }));
      state.analyticsRecovery.completedAt = Date.now();
      writeState(entry.filePath, state);
      result.analyticsReplayed += 1;
    }

    if (needsLangfuse) {
      let taskObservationMode: 'off' | 'observe' | 'send' = 'off';
      try {
        taskObservationMode = options.taskObservationModeForRun?.(state.id) ?? 'off';
      } catch {
        console.warn('[telemetry] task mode lookup failed during startup recovery');
      }
      let suppressSingleRun = false;
      let resolvedTaskRepresentation = taskRepresentation;
      if (taskObservationMode === 'observe') {
        // Observe is best effort and must never own or block the compatibility
        // obligation. A local aggregation/storage fault still replays the
        // legacy single-Run delivery below.
        try {
          const handle = options.beginTaskObservationForRun?.(state.id);
          if (handle) await handle.completion;
        } catch {
          console.warn('[telemetry] task observation failed in startup observe mode');
        }
      } else if (taskObservationMode === 'send') {
        // Claim/finalize task delivery before deciding whether it owns this
        // Run. Persisted observed rows return suppressSingleRun=false because
        // their compatibility trace remains the permanent delivery contract.
        if (!options.beginTaskObservationForRun) {
          throw new Error('Task observation send mode requires a startup finalizer.');
        }
        const handle = options.beginTaskObservationForRun(state.id);
        const completion = await handle.completion as { action?: unknown } | undefined;
        suppressSingleRun = handle.suppressSingleRun;
        let completedRepresentation:
          | 'single_run'
          | 'task_pending'
          | 'task_accepted'
          | 'task_not_expected'
          | undefined;
        try {
          completedRepresentation = options.taskObservationRepresentationForRun?.(state.id);
        } catch {
          console.warn(
            '[telemetry] completed task representation lookup failed during startup recovery',
          );
          if (completion?.action === 'compatibility' || completion?.action === 'observed') {
            completedRepresentation = 'single_run';
          }
        }
        resolvedTaskRepresentation = completedRepresentation ?? 'task_pending';
        if (completedRepresentation) {
          suppressSingleRun = completedRepresentation !== 'single_run';
        }
      }
      if (suppressSingleRun && resolvedTaskRepresentation === 'task_pending') {
        // Task ownership is durable, but the hierarchy has not been accepted.
        // Keep this Run unfinished so a future boot can retry the Task with
        // the same identity; do not manufacture a single-Run delivery state.
        continue;
      }

      state.telemetryDelivery = beginRunTelemetryDelivery(
        state.telemetryDelivery,
        state.id,
      );
      // Persist before crossing the single-Run network boundary, or before
      // checkpointing an accepted Task replacement.
      writeState(entry.filePath, state);
      const taskNotExpectedReason = resolvedTaskRepresentation === 'task_not_expected'
        ? options.taskObservationNotExpectedReasonForRun?.(state.id) ?? null
        : null;
      const rawDelivery = suppressSingleRun
        ? {
            langfuse_expected: false,
            langfuse_delivery_status: 'not_expected',
            langfuse_drop_reason: resolvedTaskRepresentation === 'task_not_expected'
              ? taskNotExpectedReason ?? 'task_hierarchy_not_expected'
              : 'task_hierarchy_rollout',
            langfuse_attempt_count: 0,
          }
        : await Promise.resolve(options.reportLangfuse({
            db: options.db,
            dataDir: path.dirname(options.runsLogDir),
            run: hydrateRun(state, events),
            persistedRunStatus: state.status,
            persistedEndedAt: state.updatedAt,
            appVersion: appVersionInfoForRun(state, options),
            deliveryIdempotencyKey: state.telemetryDelivery.idempotencyKey,
            onDeliveryAttempt: () => {
              state.telemetryDelivery = recordRunTelemetryDeliveryAttempt(
                state.telemetryDelivery,
                state.id,
              );
              writeState(entry.filePath, state);
            },
          }));
      const delivery: RunTelemetryDeliveryResult = isObject(rawDelivery)
        && typeof rawDelivery.langfuse_expected === 'boolean'
        && typeof rawDelivery.langfuse_delivery_status === 'string'
        ? rawDelivery as unknown as RunTelemetryDeliveryResult
        : {
            langfuse_expected: true,
            langfuse_delivery_status: 'failed',
            langfuse_drop_reason: 'network_error',
          };
      state.telemetryDelivery = finalizeRunTelemetryDelivery(
        state.telemetryDelivery,
        state.id,
        delivery,
      );
      if (typeof state.telemetryDelivery.finalizedAt === 'number') {
        state.langfuseCompletedAt = state.telemetryDelivery.finalizedAt;
      } else {
        delete state.langfuseCompletedAt;
      }
      writeState(entry.filePath, state);
      result.langfuseReplayed += 1;
    }
  }

  return result;
}
