// Snapshot GC worker (plan §3.A5 / spec §16 Phase 5 / PB2).
//
// The unreferenced-snapshot TTL is enforced by `pruneExpiredSnapshots()`
// (defined in `snapshots.ts`); this module owns the periodic schedule
// and the audit log. The worker is started from `server.ts` boot and
// disabled when `OD_SNAPSHOT_GC_INTERVAL_MS` is set to `0`.
//
// Operator escape hatch: `od plugin snapshots prune --before <ts>` calls
// `pruneExpiredSnapshots(db, { before: cutoff })` synchronously without
// touching the periodic timer.

import type Database from 'better-sqlite3';
import { pruneExpiredSnapshots, type PruneExpiredResult } from './snapshots.js';
import { readPluginEnvKnobs } from '../app-config.js';

type SqliteDb = Database.Database;

export interface SnapshotGcOptions {
  db: SqliteDb;
  // Override the timer interval. When undefined we read
  // `readPluginEnvKnobs().snapshotGcIntervalMs`. Setting `0` disables.
  intervalMs?: number;
  // Sink for audit messages. Defaults to console.log so packaged
  // deployments capture it on stdout.
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
  // Optional hook invoked after each tick so tests can synchronize on
  // sweep completion.
  onTick?: (result: PruneExpiredResult) => void;
}

export interface SnapshotGcHandle {
  stop(): void;
  // Force-runs a sweep synchronously. Useful for the CLI escape hatch
  // and for tests that don't want to sleep through the timer.
  sweep(now?: number): PruneExpiredResult;
}

const NOOP_HANDLE: SnapshotGcHandle = {
  stop: () => undefined,
  sweep: () => ({ removed: 0, ids: [] }),
};

export function startSnapshotGc(opts: SnapshotGcOptions): SnapshotGcHandle {
  const knobs = readPluginEnvKnobs();
  const intervalMs = opts.intervalMs ?? knobs.snapshotGcIntervalMs;
  const log = opts.logger ?? defaultLogger;

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    log('[plugins] snapshot GC disabled (interval ms <= 0)');
    return NOOP_HANDLE;
  }

  const tick = () => {
    try {
      // Plan §3.M1 / spec PB2 — feed OD_SNAPSHOT_RETENTION_DAYS into
      // pruneExpiredSnapshots so referenced rows whose project has
      // been deleted are eligible for deletion after the configured
      // window. The unreferenced-TTL sweep stays the v1 default
      // path; retention only kicks in when the operator opted in.
      const knobs = readPluginEnvKnobs();
      const result = pruneExpiredSnapshots(opts.db, {
        ...(typeof knobs.snapshotRetentionDays === 'number' && knobs.snapshotRetentionDays > 0
          ? { retentionDays: knobs.snapshotRetentionDays }
          : {}),
      });
      if (result.removed > 0) {
        log(`[plugins] snapshot GC removed ${result.removed} expired snapshot(s)`, {
          ids: result.ids,
        });
      }
      opts.onTick?.(result);
    } catch (err) {
      log(`[plugins] snapshot GC tick failed: ${(err as Error).message ?? String(err)}`);
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return {
    stop: () => {
      clearInterval(timer);
    },
    sweep: (now?: number) => {
      const knobs = readPluginEnvKnobs();
      return pruneExpiredSnapshots(opts.db, {
        ...(now ? { now } : {}),
        ...(typeof knobs.snapshotRetentionDays === 'number' && knobs.snapshotRetentionDays > 0
          ? { retentionDays: knobs.snapshotRetentionDays }
          : {}),
      });
    },
  };
}

function defaultLogger(msg: string, meta?: Record<string, unknown>): void {
  if (meta) {
    // eslint-disable-next-line no-console
    console.log(msg, meta);
  } else {
    // eslint-disable-next-line no-console
    console.log(msg);
  }
}
