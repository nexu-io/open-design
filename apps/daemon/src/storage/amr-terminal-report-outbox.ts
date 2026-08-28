import type Database from 'better-sqlite3';

import {
  runVelaCommand,
  velaCommandStdout,
  type VelaCommandOptions,
} from '../integrations/vela-command.js';
import { classifyAmrAccountFailure } from '../integrations/vela-errors.js';
import { redactSecrets } from '../redact.js';

export type AmrTerminalReportOutcome = 'failed' | 'canceled';
export type AmrTerminalReportState = 'pending' | 'delivered' | 'terminal_failed';

export interface PendingAmrTerminalReport {
  runId: string;
  outcome: AmrTerminalReportOutcome;
  terminalAt: number;
}

export interface ClaimedAmrTerminalReport extends PendingAmrTerminalReport {
  terminalAtIso: string;
  attemptCount: number;
  version: number;
}

export interface AmrTerminalReportDiagnostic {
  runId: string;
  outcome: AmrTerminalReportOutcome;
  state: AmrTerminalReportState;
  attemptCount: number;
  terminalAt: string;
  errorCode: string | null;
}

export interface AmrTerminalReportDiagnostics {
  pending: number;
  delivered: number;
  unsupported: number;
  terminalFailed: number;
  oldestPendingAgeMs: number | null;
  reports: AmrTerminalReportDiagnostic[];
}

export interface AmrTerminalReportOutboxStore {
  enqueue(report: PendingAmrTerminalReport): void;
  listPending(): PendingAmrTerminalReport[];
  claimDue(now: number, leaseMs: number, limit?: number): ClaimedAmrTerminalReport[];
  deliver(record: ClaimedAmrTerminalReport, receipt: string): boolean;
  defer(record: ClaimedAmrTerminalReport, nextAttemptAt: number, code: string, message: string): boolean;
  fail(record: ClaimedAmrTerminalReport, code: string, message: string): boolean;
  diagnostics(now?: number): AmrTerminalReportDiagnostics;
}

export interface AmrTerminalReportRun {
  id: string;
  agentId?: string | null;
  errorCode?: string | null;
  failureAction?: string | null;
  status?: string | null;
}

export function isBillingTerminalAmrRun(
  run: AmrTerminalReportRun,
  status = run.status,
): status is AmrTerminalReportOutcome {
  if (run.agentId !== 'amr') return false;
  if (status !== 'failed' && status !== 'canceled') return false;
  if (status === 'canceled') return true;
  return run.failureAction !== 'recharge'
    && run.errorCode !== 'AMR_INSUFFICIENT_BALANCE';
}

function hasColumn(db: Database.Database, name: string): boolean {
  return (db.prepare('PRAGMA table_info(amr_terminal_report_outbox)').all() as Array<{ name: string }>)
    .some((column) => column.name === name);
}

/** Upgrade both fresh databases and the three-column table shipped by #7392. */
export function migrateAmrTerminalReportOutbox(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS amr_terminal_report_outbox (
      run_id TEXT PRIMARY KEY,
      outcome TEXT NOT NULL CHECK (outcome IN ('failed', 'canceled')),
      terminal_at INTEGER NOT NULL
    );
  `);
  const additions: Array<[string, string]> = [
    ['terminal_at_iso', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN terminal_at_iso TEXT'],
    ['state', "ALTER TABLE amr_terminal_report_outbox ADD COLUMN state TEXT NOT NULL DEFAULT 'pending'"],
    ['attempt_count', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0'],
    ['next_attempt_at', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0'],
    ['version', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN version INTEGER NOT NULL DEFAULT 0'],
    ['lease_until', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN lease_until INTEGER'],
    ['last_error_code', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN last_error_code TEXT'],
    ['last_error', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN last_error TEXT'],
    ['receipt', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN receipt TEXT'],
    ['created_at', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0'],
    ['updated_at', 'ALTER TABLE amr_terminal_report_outbox ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [name, statement] of additions) {
    if (!hasColumn(db, name)) db.exec(statement);
  }
  const missingIso = db.prepare(`
    SELECT run_id AS runId, terminal_at AS terminalAt
      FROM amr_terminal_report_outbox
     WHERE terminal_at_iso IS NULL OR terminal_at_iso = ''
  `).all() as Array<{ runId: string; terminalAt: number }>;
  const backfill = db.prepare(`
    UPDATE amr_terminal_report_outbox
       SET terminal_at_iso = ?,
           next_attempt_at = CASE WHEN next_attempt_at = 0 THEN terminal_at ELSE next_attempt_at END,
           created_at = CASE WHEN created_at = 0 THEN terminal_at ELSE created_at END,
           updated_at = CASE WHEN updated_at = 0 THEN terminal_at ELSE updated_at END
     WHERE run_id = ?
  `);
  const transaction = db.transaction(() => {
    for (const row of missingIso) backfill.run(new Date(row.terminalAt).toISOString(), row.runId);
  });
  transaction();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_amr_terminal_report_outbox_due
      ON amr_terminal_report_outbox(state, next_attempt_at, lease_until, run_id);
    CREATE INDEX IF NOT EXISTS idx_amr_terminal_report_outbox_terminal_at
      ON amr_terminal_report_outbox(terminal_at, run_id);
  `);
}

const bounded = (value: string, limit: number): string => value.replace(/[\r\n\t]+/gu, ' ').slice(0, limit);

const STORED_ERROR_CODES = new Set([
  'auth_required',
  'forbidden',
  'http_error',
  'invalid_input',
  'invalid_receipt',
  'non_retryable',
  'rate_limited',
  'retryable',
  'server_error',
  'timeout',
  'transport',
  'unsupported',
  'user_banned',
]);

function safeErrorCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/u.test(normalized) && STORED_ERROR_CODES.has(normalized)
    ? normalized
    : 'transport';
}

function safeEvidence(value: string, limit: number): string {
  return bounded(redactSecrets(value), limit);
}

export function createAmrTerminalReportOutboxStore(
  db: Database.Database,
  now: () => number = Date.now,
): AmrTerminalReportOutboxStore {
  const enqueueRow = db.prepare(`
    INSERT INTO amr_terminal_report_outbox
      (run_id, outcome, terminal_at, terminal_at_iso, state, attempt_count,
       next_attempt_at, version, lease_until, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 0, ?, 0, NULL, ?, ?)
    ON CONFLICT(run_id) DO NOTHING
  `);
  const listRows = db.prepare(`
    SELECT run_id AS runId, outcome, terminal_at AS terminalAt
      FROM amr_terminal_report_outbox
     WHERE state = 'pending'
     ORDER BY terminal_at ASC, run_id ASC
  `);
  const dueRows = db.prepare(`
    SELECT run_id AS runId, outcome, terminal_at AS terminalAt,
           terminal_at_iso AS terminalAtIso, attempt_count AS attemptCount, version
      FROM amr_terminal_report_outbox
     WHERE state = 'pending' AND next_attempt_at <= ?
       AND (lease_until IS NULL OR lease_until <= ?)
     ORDER BY next_attempt_at ASC, created_at ASC, run_id ASC
     LIMIT ?
  `);
  const claimRow = db.prepare(`
    UPDATE amr_terminal_report_outbox
       SET attempt_count = attempt_count + 1, version = version + 1,
           lease_until = ?, updated_at = ?
     WHERE run_id = ? AND state = 'pending' AND version = ?
       AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
  `);
  const deliverRow = db.prepare(`
    UPDATE amr_terminal_report_outbox
       SET state = 'delivered', receipt = ?, lease_until = NULL,
           last_error_code = NULL, last_error = NULL, updated_at = ?
     WHERE run_id = ? AND state = 'pending' AND version = ?
  `);
  const deferRow = db.prepare(`
    UPDATE amr_terminal_report_outbox
       SET next_attempt_at = ?, lease_until = NULL, last_error_code = ?,
           last_error = ?, updated_at = ?
     WHERE run_id = ? AND state = 'pending' AND version = ?
  `);
  const failRow = db.prepare(`
    UPDATE amr_terminal_report_outbox
       SET state = 'terminal_failed', lease_until = NULL, last_error_code = ?,
           last_error = ?, updated_at = ?
     WHERE run_id = ? AND state = 'pending' AND version = ?
  `);
  const diagnosticRows = db.prepare(`
    SELECT run_id AS runId, outcome, state, attempt_count AS attemptCount,
           terminal_at_iso AS terminalAt, last_error_code AS errorCode
      FROM amr_terminal_report_outbox
     ORDER BY updated_at DESC, run_id ASC
     LIMIT 50
  `);
  const claimTransaction = db.transaction((timestamp: number, leaseMs: number, limit: number) => {
    const rows = dueRows.all(timestamp, timestamp, limit) as ClaimedAmrTerminalReport[];
    const claimed: ClaimedAmrTerminalReport[] = [];
    for (const row of rows) {
      if (claimRow.run(timestamp + leaseMs, timestamp, row.runId, row.version, timestamp, timestamp).changes > 0) {
        claimed.push({ ...row, attemptCount: row.attemptCount + 1, version: row.version + 1 });
      }
    }
    return claimed;
  });

  return {
    enqueue(report) {
      const timestamp = now();
      const terminalAtIso = new Date(report.terminalAt).toISOString();
      enqueueRow.run(report.runId, report.outcome, report.terminalAt, terminalAtIso, timestamp, timestamp, timestamp);
    },
    listPending: () => listRows.all() as PendingAmrTerminalReport[],
    claimDue(timestamp, leaseMs, limit = 32) {
      return claimTransaction(timestamp, Math.max(1, leaseMs), Math.max(1, Math.floor(limit)));
    },
    deliver(record, receipt) {
      return deliverRow.run(safeEvidence(receipt, 2048), now(), record.runId, record.version).changes > 0;
    },
    defer(record, nextAttemptAt, code, message) {
      return deferRow.run(nextAttemptAt, safeErrorCode(code), safeEvidence(message, 512), now(), record.runId, record.version).changes > 0;
    },
    fail(record, code, message) {
      return failRow.run(safeErrorCode(code), safeEvidence(message, 512), now(), record.runId, record.version).changes > 0;
    },
    diagnostics(timestamp = now()) {
      const counts = db.prepare(`
        SELECT
          SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN state = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN state = 'terminal_failed' AND last_error_code = 'unsupported' THEN 1 ELSE 0 END) AS unsupported,
          SUM(CASE WHEN state = 'terminal_failed' AND last_error_code != 'unsupported' THEN 1 ELSE 0 END) AS terminalFailed,
          MIN(CASE WHEN state = 'pending' THEN created_at END) AS oldestPendingAt
        FROM amr_terminal_report_outbox
      `).get() as { pending: number | null; delivered: number | null; unsupported: number | null; terminalFailed: number | null; oldestPendingAt: number | null };
      return {
        pending: Number(counts.pending ?? 0),
        delivered: Number(counts.delivered ?? 0),
        unsupported: Number(counts.unsupported ?? 0),
        terminalFailed: Number(counts.terminalFailed ?? 0),
        oldestPendingAgeMs: counts.oldestPendingAt == null ? null : Math.max(0, timestamp - Number(counts.oldestPendingAt)),
        reports: diagnosticRows.all() as AmrTerminalReportDiagnostic[],
      };
    },
  };
}

export interface AmrTerminalReportDeliveryService {
  start(): void;
  stop(): void;
  processDue(): Promise<void>;
}

interface DeliveryFailure {
  terminal: boolean;
  code: string;
  message: string;
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch { return null; }
}

function stableEnvelopeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(normalized)) return null;
  if (normalized === 'unknown_command') return 'unsupported';
  if (normalized === 'unauthenticated') return 'auth_required';
  return STORED_ERROR_CODES.has(normalized) ? normalized : null;
}

function classifiedCode(code: unknown, message: string): string | null {
  const stable = stableEnvelopeCode(code);
  if (stable) return stable;
  if (classifyAmrAccountFailure(message)?.code === 'AMR_AUTH_REQUIRED') return 'auth_required';
  const normalized = message.toLowerCase();
  if (normalized.includes('unknown command') || normalized.includes('unsupported')) return 'unsupported';
  if (normalized.includes('user_banned') || normalized.includes('user banned')) return 'user_banned';
  if (normalized.includes('invalid_input') || normalized.includes('invalid input')) return 'invalid_input';
  if (normalized === 'forbidden' || normalized.includes('access denied')) return 'forbidden';
  return null;
}

function failureFrom(error: unknown): DeliveryFailure {
  const output = velaCommandStdout(error).trim();
  const envelope = jsonObject(output);
  const detail = envelope?.error;
  const detailObject = detail !== null && typeof detail === 'object' && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : null;
  const message = String(
    detailObject?.message
      ?? (typeof detail === 'string' ? detail : envelope?.message)
      ?? (error instanceof Error ? error.message : 'Vela terminal delivery failed'),
  );
  const retryable = typeof detailObject?.retryable === 'boolean'
    ? detailObject.retryable
    : typeof envelope?.retryable === 'boolean'
      ? envelope.retryable
      : null;
  const code = classifiedCode(detailObject?.code ?? envelope?.code ?? detail, message);
  if (retryable !== null) {
    return {
      terminal: !retryable,
      code: code ?? (retryable ? 'retryable' : 'non_retryable'),
      message,
    };
  }
  const deterministic = code === 'unsupported'
    || code === 'auth_required'
    || code === 'forbidden'
    || code === 'user_banned'
    || code === 'invalid_input';
  return { terminal: deterministic, code: code ?? 'transport', message };
}

function canonicalReceipt(
  record: ClaimedAmrTerminalReport,
  stdout: string,
): string | null {
  const receipt = jsonObject(stdout.trim());
  const receiptTerminalAt = typeof receipt?.terminalAt === 'string'
    ? Date.parse(receipt.terminalAt)
    : Number.NaN;
  if (
    receipt?.runId !== record.runId
    || receipt.outcome !== record.outcome
    || !Number.isFinite(receiptTerminalAt)
    || receiptTerminalAt !== record.terminalAt
    || typeof receipt.recorded !== 'boolean'
  ) return null;
  return JSON.stringify({
    runId: record.runId,
    outcome: record.outcome,
    terminalAt: record.terminalAtIso,
    recorded: receipt.recorded,
  });
}

export function createAmrTerminalReportDeliveryService(input: {
  store: AmrTerminalReportOutboxStore;
  run?: (args: string[], options?: VelaCommandOptions) => Promise<string>;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  pollIntervalMs?: number;
  leaseMs?: number;
  timeoutMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}): AmrTerminalReportDeliveryService {
  const run = input.run ?? ((args, options) =>
    runVelaCommand(args, { ...options, env: input.env ?? process.env }));
  const now = input.now ?? Date.now;
  const pollIntervalMs = input.pollIntervalMs ?? 5_000;
  const leaseMs = input.leaseMs ?? 60_000;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const baseBackoffMs = input.baseBackoffMs ?? 1_000;
  const maxBackoffMs = input.maxBackoffMs ?? 60 * 60_000;
  let stopped = true;
  let active: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let controller = new AbortController();

  const logStorageFailure = (
    stage: 'claim' | 'persist_result',
    record?: ClaimedAmrTerminalReport,
  ): void => {
    console.warn(
      `[od] amr_terminal_delivery_storage stage=${stage} runId=${record?.runId ?? 'none'} code=local_storage`,
    );
  };
  const schedule = (): void => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void processDue()
        .catch(() => console.warn('[od] amr_terminal_delivery_background code=unexpected'))
        .finally(schedule);
    }, Math.max(1, pollIntervalMs));
    timer.unref();
  };
  const processDue = async (): Promise<void> => {
    if (active) return active;
    active = (async () => {
      // Claim one row at a time so a later row never waits behind enough
      // commands for its lease to expire before delivery begins. Continue the
      // startup sweep until no due row remains.
      while (true) {
        if (stopped && controller.signal.aborted) break;
        let record: ClaimedAmrTerminalReport | undefined;
        try {
          [record] = input.store.claimDue(now(), leaseMs, 1);
        } catch {
          logStorageFailure('claim');
          break;
        }
        if (!record) break;
        const args = ['run', 'terminal', '--run-id', record.runId, '--outcome', record.outcome, '--terminal-at', record.terminalAtIso, '--json'];
        let storedReceipt: string | null = null;
        let commandFailure: ReturnType<typeof failureFrom> | null = null;
        try {
          const receipt = await run(args, {
            configuredEnv: { VELA_INVOCATION_SOURCE: 'open-design' },
            timeoutMs,
            maxBuffer: 64 * 1024,
            signal: controller.signal,
          });
          storedReceipt = canonicalReceipt(record, receipt);
        } catch (error) {
          commandFailure = failureFrom(error);
          console.warn(`[od] amr_terminal_delivery runId=${record.runId} outcome=${record.outcome} attempt=${record.attemptCount} code=${safeErrorCode(commandFailure.code)}`);
        }

        try {
          if (commandFailure?.terminal) {
            input.store.fail(record, commandFailure.code, commandFailure.message);
          } else if (commandFailure) {
            const exponent = Math.max(0, Math.min(30, record.attemptCount - 1));
            const delay = Math.min(maxBackoffMs, baseBackoffMs * (2 ** exponent));
            input.store.defer(record, now() + delay, commandFailure.code, commandFailure.message);
          } else if (storedReceipt) {
            input.store.deliver(record, storedReceipt);
          } else {
            input.store.fail(record, 'invalid_receipt', 'Vela returned a malformed or mismatched terminal receipt');
          }
        } catch {
          // The claim lease keeps the original tuple durable. Once it expires,
          // a later sweep safely replays the idempotent Vela terminal command.
          logStorageFailure('persist_result', record);
          break;
        }
      }
    })().finally(() => { active = null; });
    return active;
  };
  return {
    start() {
      if (!stopped) return;
      stopped = false;
      if (controller.signal.aborted) controller = new AbortController();
      void processDue()
        .catch(() => console.warn('[od] amr_terminal_delivery_background code=unexpected'))
        .finally(schedule);
    },
    stop() {
      stopped = true;
      controller.abort(new Error('AMR terminal delivery stopped'));
      if (timer) clearTimeout(timer);
      timer = null;
    },
    processDue,
  };
}

/** Run finalization persists only; remote delivery remains background work. */
export function createAmrTerminalReportFinalizer(
  outbox: AmrTerminalReportOutboxStore,
  options: { baseRetryMs?: number; maxRetryMs?: number } = {},
): (run: AmrTerminalReportRun, status: string, terminalAt: number) => void {
  const baseRetryMs = Math.max(1, options.baseRetryMs ?? 1_000);
  const maxRetryMs = Math.max(baseRetryMs, options.maxRetryMs ?? 60_000);
  const pending = new Map<string, {
    report: PendingAmrTerminalReport;
    attemptCount: number;
    timer: NodeJS.Timeout | null;
  }>();

  const scheduleRetry = (runId: string): void => {
    const entry = pending.get(runId);
    if (!entry || entry.timer) return;
    const exponent = Math.max(0, Math.min(30, entry.attemptCount - 1));
    const delay = Math.min(maxRetryMs, baseRetryMs * (2 ** exponent));
    entry.timer = setTimeout(() => {
      entry.timer = null;
      try {
        outbox.enqueue(entry.report);
        pending.delete(runId);
      } catch {
        entry.attemptCount += 1;
        console.warn(
          `[od] amr_terminal_enqueue_retry runId=${runId} attempt=${entry.attemptCount} code=local_storage`,
        );
        scheduleRetry(runId);
      }
    }, delay);
    entry.timer.unref();
  };

  return (run, status, terminalAt) => {
    if (!isBillingTerminalAmrRun(run, status)) return;
    if (pending.has(run.id)) return;
    const report: PendingAmrTerminalReport = {
      runId: run.id,
      outcome: status,
      terminalAt,
    };
    try {
      outbox.enqueue(report);
    } catch (error) {
      pending.set(run.id, { report, attemptCount: 1, timer: null });
      scheduleRetry(run.id);
      throw error;
    }
  };
}
