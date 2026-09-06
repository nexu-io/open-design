// Periodic maintenance for chat artifact snapshots: reconcile, then sweep.
//
// WHY A LOOP AND NOT JUST BOOT. Both passes were wired to daemon startup only,
// which quietly makes their correctness depend on how often the daemon
// restarts. A capture interrupted mid-turn stays `pending` — a card stuck in a
// state nothing will settle — until the next restart, and a store that only
// ever grows spends the quota that fails FUTURE captures on bytes nothing
// references. A daemon that runs for a week is exactly the daemon where both
// matter most, and it is the one that never ran either pass again.
//
// ONE DEFINITION OF "A PASS". The boot pass and the timer tick call the same
// function on purpose. Two copies would drift, and the drift would only ever
// show up on long-running daemons — the case with the least observation.

import type Database from 'better-sqlite3';

import type { ChatArtifactBlobStore } from './blob-store.js';
import { sweepChatArtifactStorage, type ChatArtifactGcReport } from './gc.js';
import {
  reconcileChatArtifactSnapshots,
  type ChatArtifactReconcileReport,
} from './reconcile.js';
import type { ChatArtifactQuota } from './quota.js';

export interface ChatArtifactMaintenanceDeps {
  db: Database.Database;
  blobs: ChatArtifactBlobStore;
  quota?: ChatArtifactQuota;
  /** See `ChatArtifactReconcileDeps.resolveSourcePath`. */
  resolveSourcePath?: (projectId: string, projectRelativePath: string) => string | null;
  /** Report the sweep without deleting. Mirrors the boot behaviour. */
  gcDryRun?: boolean;
}

export interface ChatArtifactMaintenancePass {
  reconcile: ChatArtifactReconcileReport;
  gc: ChatArtifactGcReport;
}

/**
 * Reconcile first, then sweep — never the other way round.
 *
 * The sweep treats a `pending` row as live, because its bytes may be
 * mid-install. Running it before the reconciler has classified those rows means
 * every crashed capture is protected by exactly the state that should have
 * condemned it, so its temp and its blob survive one more full cycle. Running
 * it after means the reconciler has already turned each one into a `ready` the
 * sweep must keep or a `failed` the sweep may collect, and one pass finishes
 * the job.
 */
export async function runChatArtifactMaintenancePass(
  deps: ChatArtifactMaintenanceDeps,
): Promise<ChatArtifactMaintenancePass> {
  const reconcile = await reconcileChatArtifactSnapshots({
    db: deps.db,
    blobs: deps.blobs,
    ...(deps.quota ? { quota: deps.quota } : {}),
    ...(deps.resolveSourcePath ? { resolveSourcePath: deps.resolveSourcePath } : {}),
  });
  const gc = await sweepChatArtifactStorage({
    db: deps.db,
    blobs: deps.blobs,
    dryRun: deps.gcDryRun === true,
  });
  return { reconcile, gc };
}

export interface ChatArtifactMaintenanceOptions extends ChatArtifactMaintenanceDeps {
  /**
   * Tick period. `0` or anything non-finite disables the loop entirely and the
   * daemon keeps today's boot-only behaviour.
   *
   * OPEN DECISION: `specs/current/chat-artifact-versioning-design.md` §5.3 and
   * §7.2 both ask for a periodic pass and neither names a period. Until that is
   * ruled on, the default is off and the only way to turn it on is explicit —
   * see `resolveChatArtifactMaintenanceIntervalMs`.
   */
  intervalMs: number;
  /** Run one pass immediately, as boot does today. Default true. */
  runImmediately?: boolean;
  logger?: (message: string) => void;
  /** Fired after every completed pass. Tests synchronize on this. */
  onPass?: (pass: ChatArtifactMaintenancePass) => void;
}

export interface ChatArtifactMaintenanceHandle {
  /** True while the loop is armed. */
  readonly enabled: boolean;
  /** Ticks dropped because the previous pass had not finished. */
  readonly overlappedTicks: number;
  /**
   * Disarm and drain. Resolves only once any in-flight pass has finished, so a
   * caller that closes the database next cannot pull it out from under a query.
   * The timer itself is cleared synchronously, before the returned promise.
   */
  stop(): Promise<void>;
}

/**
 * The env knob, and the reason there is no default period.
 *
 * A maintenance cadence is an operations decision with a real cost on both
 * sides — too slow leaves stuck cards and dead bytes around for hours, too fast
 * walks the whole blob directory on someone's laptop — and the design document
 * does not name one. Inventing a number here would look exactly like a decision
 * that had been made. `0` (the default) keeps the daemon on its current
 * boot-only behaviour.
 *
 * Nearest in-repo precedent, offered as a starting point and not as an answer:
 * `OD_SNAPSHOT_GC_INTERVAL_MS` in `app-config.ts` defaults to 6 hours for the
 * plugin snapshot GC, which is the same shape of job over the same shape of
 * store.
 */
export function resolveChatArtifactMaintenanceIntervalMs(
  env: NodeJS.ProcessEnv,
): number {
  const raw = env['OD_CHAT_ARTIFACT_MAINTENANCE_INTERVAL_MS'];
  if (typeof raw !== 'string' || raw.trim().length === 0) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function startChatArtifactMaintenance(
  options: ChatArtifactMaintenanceOptions,
): ChatArtifactMaintenanceHandle {
  const log = options.logger ?? ((message: string) => console.warn(message));
  const runImmediately = options.runImmediately !== false;
  const periodic = Number.isFinite(options.intervalMs) && options.intervalMs > 0;

  let inFlight: Promise<void> | null = null;
  let overlappedTicks = 0;
  let stopped = false;

  const runPass = (): Promise<void> => {
    // REENTRANCY: skip, never queue. A pass is idempotent and re-scans the same
    // rows from scratch, so a dropped tick loses nothing — the next one sees
    // exactly the same work. Queueing would let a slow disk build a backlog
    // that never drains, and two concurrent passes would race each other over
    // the same grace-window decisions: both can conclude the same orphan is
    // collectable, and the loser's delete then counts as a sweep failure.
    if (inFlight) {
      overlappedTicks += 1;
      return inFlight;
    }
    const pass = (async () => {
      try {
        const result = await runChatArtifactMaintenancePass(options);
        if (result.reconcile.completed > 0 || result.reconcile.failed > 0
          || result.reconcile.blobMissing > 0 || result.reconcile.tempsSwept > 0) {
          log(
            `[chat-artifacts] reconcile completed=${result.reconcile.completed} `
            + `failed=${result.reconcile.failed} blobMissing=${result.reconcile.blobMissing} `
            + `tempsSwept=${result.reconcile.tempsSwept}`,
          );
        }
        if (result.gc.blobsSwept > 0 || result.gc.snapshotsSwept > 0
          || result.gc.orphanFilesSwept > 0) {
          log(
            `[chat-artifacts] gc${result.gc.dryRun ? ' (dry-run)' : ''} `
            + `snapshots=${result.gc.snapshotsSwept} blobs=${result.gc.blobsSwept} `
            + `bytes=${result.gc.bytesReclaimed} orphans=${result.gc.orphanFilesSwept}`,
          );
        }
        options.onPass?.(result);
      } catch (error) {
        // A broken snapshot store degrades the cards. It must never take the
        // daemon, and it must never stop the NEXT pass from trying again.
        log(`[chat-artifacts] maintenance pass failed: ${String(error)}`);
      } finally {
        inFlight = null;
      }
    })();
    inFlight = pass;
    return pass;
  };

  if (runImmediately) void runPass();

  if (!periodic) {
    return {
      get enabled() { return false; },
      get overlappedTicks() { return overlappedTicks; },
      // Even with the loop off, the immediate pass is in flight and a caller
      // that is about to close the database still has to wait for it.
      stop: async () => { await inFlight; },
    };
  }

  const timer = setInterval(() => {
    if (stopped) return;
    void runPass();
  }, options.intervalMs);
  // SHUTDOWN, part 1: an armed timer must never be the reason a process stays
  // alive. Without this a daemon that finished serving, or a test file that
  // finished asserting, hangs until the next tick.
  timer.unref?.();

  return {
    get enabled() { return !stopped; },
    get overlappedTicks() { return overlappedTicks; },
    // SHUTDOWN, part 2: disarm synchronously so no new pass can start, then
    // drain. `closeDatabase()` during a live pass is a hard SQLite error, not a
    // degraded card, so the drain is the contract — not a courtesy.
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
