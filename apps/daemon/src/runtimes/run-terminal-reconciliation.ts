import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { appendMessageStatusEvent } from '../db.js';
import { classifyRunFailure } from '../run-failure-classification.js';
import { deriveRunErrorCode, runResultFromStatus } from '../run-result.js';
import { runAskedUserQuestion } from './run-artifacts.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const RESTART_ERROR_CODE = 'DAEMON_RESTARTED';
const RESTART_ERROR_MESSAGE = 'Run interrupted because the daemon restarted.';
const RECONCILED_STATUS_MESSAGE = 'Run terminal state reconciled after daemon restart.';

interface AnalyticsRecovery {
  context: Record<string, unknown>;
  properties: Record<string, unknown>;
  insertId: string;
  completedAt?: number;
}

interface DurableRunState {
  schemaVersion: 1;
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  artifactCount?: number;
  endedWithUnfinishedWork?: boolean;
  userPrompt?: string;
  model?: string;
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
  terminalRecoveryReason?: 'daemon_restart' | 'analytics_incomplete';
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
  appVersion: string;
  appVersionInfo?: unknown;
  db: Database.Database;
  reportLangfuse(args: Record<string, unknown>): unknown | Promise<unknown>;
  runsLogDir: string;
}

export interface RunTerminalReconciliationResult {
  scanned: number;
  interrupted: number;
  messagesReconciled: number;
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

export async function reconcileDurableRunTerminals(
  options: ReconciliationOptions,
): Promise<RunTerminalReconciliationResult> {
  const result: RunTerminalReconciliationResult = {
    scanned: 0,
    interrupted: 0,
    messagesReconciled: 0,
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

  for (const entry of states) {
    if (TERMINAL_STATUSES.has(entry.state.status)) continue;
    entry.state.status = 'failed';
    entry.state.updatedAt = now;
    entry.state.exitCode = 1;
    entry.state.signal = null;
    entry.state.error = RESTART_ERROR_MESSAGE;
    entry.state.errorCode = RESTART_ERROR_CODE;
    entry.state.terminalRecoveryReason = 'daemon_restart';
    writeState(entry.filePath, entry.state);
    result.interrupted += 1;
  }

  const statesByRunId = new Map(states.map((entry) => [entry.state.id, entry.state]));
  result.messagesReconciled = reconcileMessages(options.db, statesByRunId, now);

  for (const entry of states) {
    const { state } = entry;
    const needsAnalytics = Boolean(
      state.analyticsRecovery && !state.analyticsRecovery.completedAt,
    );
    const needsLangfuse = !state.langfuseCompletedAt;
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
        ? recoveryReason === 'daemon_restart'
          ? {
              failure_category: 'process_exit' as const,
              failure_detail: 'interrupted' as const,
              failure_stage: 'finalize' as const,
              retryable: true,
              user_action: 'retry' as const,
            }
          : classifyRunFailure({
              result: runResult,
              status: state,
              ...(errorCode ? { errorCode } : {}),
              agentId: state.agentId,
              events,
            })
        : undefined;
      await Promise.resolve(options.analytics.capture({
        eventName: 'run_finished',
        context: state.analyticsRecovery.context,
        appVersion: options.appVersion,
        properties: {
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
          terminal_recovery_reason: recoveryReason,
          ...(errorCode ? { error_code: errorCode } : {}),
          ...(failure ?? {}),
        },
        insertId: `${state.analyticsRecovery.insertId}-finish`,
      }));
      state.analyticsRecovery.completedAt = Date.now();
      writeState(entry.filePath, state);
      result.analyticsReplayed += 1;
    }

    if (needsLangfuse) {
      const delivery = await Promise.resolve(options.reportLangfuse({
        db: options.db,
        dataDir: path.dirname(options.runsLogDir),
        run: hydrateRun(state, events),
        persistedRunStatus: state.status,
        persistedEndedAt: state.updatedAt,
        appVersion: options.appVersionInfo ?? null,
      }));
      if (
        isObject(delivery)
        && (delivery.langfuse_expected === false
          || delivery.langfuse_delivery_status === 'accepted')
      ) {
        state.langfuseCompletedAt = Date.now();
        writeState(entry.filePath, state);
      }
      result.langfuseReplayed += 1;
    }
  }

  return result;
}
