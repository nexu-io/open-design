import type Database from 'better-sqlite3';
import type { ChatRunStatusResponse } from '@open-design/contracts';
import { TERMINAL_RUN_STATUSES } from '../runtimes/runs.js';
import type { ChatRun } from '../runtimes/chat-run-records.js';

// GET /api/runs rebuilt the per-run strategy-task projection plus task
// telemetry on every read, even though those rows only move when a run in the
// task changes state. For terminal runs — the bulk of any long-lived
// installation's list — `run.updatedAt` is frozen (see runtimes/runs.ts), and
// the only inputs that can still drift afterwards are the strategy-task,
// task-run mapping, and observation-delivery tables. A cheap epoch over those
// tables therefore decides whether a cached projection still holds: one
// aggregate read per request replaces the per-run projection + telemetry reads
// the status feed used to pay on every client poll.

const EPOCH_TABLES: ReadonlyArray<readonly [string, string]> = [
  ['strategy_task_executions', 'COALESCE(MAX(updated_at), 0)'],
  ['strategy_task_runs', 'COALESCE(MAX(rowid), 0)'],
  ['strategy_task_observation_delivery', 'COALESCE(MAX(rowid), 0)'],
];

export function readRunProjectionEpoch(db: Database.Database): string {
  const names = EPOCH_TABLES.map(([table]) => `'${table}'`).join(', ');
  const existing = new Set(
    (
      db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names})`,
      ).all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
  return EPOCH_TABLES.map(([table, aggregate]) =>
    existing.has(table)
      ? String(
          (
            db.prepare(`SELECT ${aggregate} AS v FROM ${table}`).get() as {
              v: number;
            }
          ).v,
        )
      : 'absent',
  ).join(':');
}

export interface RunProjectionCacheEntry {
  runUpdatedAt: number;
  epoch: string;
  status: ChatRunStatusResponse;
  // statusWithStrategyTask also publishes the validated projection through
  // run.strategyTask; a hit must replay the same value onto the fresh run
  // object the lister handed us.
  strategyTask: ChatRun['strategyTask'];
}

export function createRunProjectionCache(maxEntries = 512) {
  const entries = new Map<string, RunProjectionCacheEntry>();

  const get = (
    run: ChatRun,
    epoch: string,
  ): RunProjectionCacheEntry | undefined => {
    if (!TERMINAL_RUN_STATUSES.has(run.status)) return undefined;
    const entry = entries.get(run.id);
    if (
      !entry
      || entry.runUpdatedAt !== run.updatedAt
      || entry.epoch !== epoch
    ) {
      return undefined;
    }
    entries.delete(run.id);
    entries.set(run.id, entry);
    return entry;
  };

  const set = (
    run: ChatRun,
    epoch: string,
    status: ChatRunStatusResponse,
  ): void => {
    if (!TERMINAL_RUN_STATUSES.has(run.status)) return;
    entries.delete(run.id);
    entries.set(run.id, {
      runUpdatedAt: run.updatedAt,
      epoch,
      status,
      strategyTask: run.strategyTask,
    });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  return { get, set };
}

export type RunProjectionCache = ReturnType<typeof createRunProjectionCache>;
