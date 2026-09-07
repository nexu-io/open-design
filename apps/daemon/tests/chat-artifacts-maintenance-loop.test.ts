// ---------------------------------------------------------------------------
// The periodic maintenance loop: reentrancy, shutdown, and the missing period.
//
// The loop exists because reconcile and GC were boot-only, which made both
// depend on how often the daemon restarts. Everything below is about the two
// ways a background loop hurts more than it helps:
//
//   * it overlaps itself on a slow disk and races its own grace-window
//     decisions;
//   * it outlives the thing it operates on, and writes to a closed database or
//     keeps a process alive that wanted to exit.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  createChatArtifactBlobStore,
  resetChatArtifactBlobStoreCache,
  type ChatArtifactBlobStore,
} from '../src/chat-artifacts/blob-store.js';
import {
  resolveChatArtifactMaintenanceIntervalMs,
  runChatArtifactMaintenancePass,
  startChatArtifactMaintenance,
  type ChatArtifactMaintenanceDeps,
} from '../src/chat-artifacts/maintenance.js';
import { insertSnapshotIntent } from '../src/chat-artifacts/store.js';

const settle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The real store with one slow step. `Object.create` rather than a spread: the
 * store is a class instance, so a spread copies `root` and drops every method.
 */
function withSlowObjectScan(
  base: ChatArtifactBlobStore,
  onScan: () => Promise<void>,
): ChatArtifactBlobStore {
  const slow = Object.create(base) as ChatArtifactBlobStore;
  (slow as { listObjectKeys: () => Promise<string[]> }).listObjectKeys = async () => {
    await onScan();
    return base.listObjectKeys();
  };
  return slow;
}

describe('chat artifact maintenance loop', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-chatart-maint-'));
    resetChatArtifactBlobStoreCache();
  });

  afterEach(() => {
    closeDatabase();
    resetChatArtifactBlobStoreCache();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function deps(): ChatArtifactMaintenanceDeps {
    const db = openDatabase(dataDir, { dataDir });
    const now = Date.now();
    db.prepare(`INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('proj-1', 'proj-1', now, now);
    return { db, blobs: createChatArtifactBlobStore({ dataDir }) };
  }

  describe('period', () => {
    // The design document asks for a periodic pass in §5.3 and §7.2 and names
    // no period in either. Until one is ruled on, the default must be the
    // daemon's current boot-only behaviour rather than an invented cadence.
    it('is off unless an operator sets one', () => {
      expect(resolveChatArtifactMaintenanceIntervalMs({})).toBe(0);
      expect(resolveChatArtifactMaintenanceIntervalMs({
        OD_CHAT_ARTIFACT_MAINTENANCE_INTERVAL_MS: '',
      })).toBe(0);
      expect(resolveChatArtifactMaintenanceIntervalMs({
        OD_CHAT_ARTIFACT_MAINTENANCE_INTERVAL_MS: 'six hours',
      })).toBe(0);
      expect(resolveChatArtifactMaintenanceIntervalMs({
        OD_CHAT_ARTIFACT_MAINTENANCE_INTERVAL_MS: '-1',
      })).toBe(0);
      expect(resolveChatArtifactMaintenanceIntervalMs({
        OD_CHAT_ARTIFACT_MAINTENANCE_INTERVAL_MS: '900000',
      })).toBe(900_000);
    });

    it('still runs the boot pass when the loop is off', async () => {
      const base = deps();
      let passes = 0;
      const handle = startChatArtifactMaintenance({
        ...base,
        intervalMs: 0,
        onPass: () => { passes += 1; },
      });
      expect(handle.enabled).toBe(false);
      await handle.stop();
      expect(passes).toBe(1);
    });

    it('keeps running after the boot pass when a period is set', async () => {
      const base = deps();
      let passes = 0;
      const handle = startChatArtifactMaintenance({
        ...base,
        intervalMs: 20,
        onPass: () => { passes += 1; },
      });
      expect(handle.enabled).toBe(true);
      await settle(120);
      await handle.stop();
      // Boot pass plus at least one tick. A boot-only wiring scores exactly 1.
      expect(passes).toBeGreaterThan(1);
    });
  });

  describe('reentrancy', () => {
    it('drops a tick that arrives while the previous pass is still running', async () => {
      const base = deps();
      let inside = 0;
      let maxConcurrent = 0;
      let passes = 0;
      const handle = startChatArtifactMaintenance({
        ...base,
        intervalMs: 5,
        // A pass slow enough that ticks land on top of it, which is what a
        // large blob directory on a busy disk actually looks like.
        blobs: withSlowObjectScan(base.blobs, async () => {
          inside += 1;
          maxConcurrent = Math.max(maxConcurrent, inside);
          await settle(60);
          inside -= 1;
        }),
        onPass: () => { passes += 1; },
      });

      await settle(200);
      await handle.stop();

      // The invariant: never two passes at once, whatever the tick rate.
      expect(maxConcurrent).toBe(1);
      // And the skipped ticks are counted, not silently swallowed.
      expect(handle.overlappedTicks).toBeGreaterThan(0);
      // Skipping is not the same as stalling: passes still complete.
      expect(passes).toBeGreaterThan(1);
    });
  });

  describe('shutdown', () => {
    it('starts no further pass once stopped', async () => {
      const base = deps();
      let passes = 0;
      const handle = startChatArtifactMaintenance({
        ...base,
        intervalMs: 10,
        onPass: () => { passes += 1; },
      });
      await settle(60);
      await handle.stop();
      const afterStop = passes;
      expect(handle.enabled).toBe(false);
      await settle(120);
      // Exact comparison: a stopped loop makes zero further progress, not
      // "less" progress.
      expect(passes).toBe(afterStop);
    });

    it('drains the in-flight pass so a caller can close the database next', async () => {
      const base = deps();
      let finished = false;
      const handle = startChatArtifactMaintenance({
        ...base,
        intervalMs: 0,
        blobs: withSlowObjectScan(base.blobs, () => settle(80)),
        onPass: () => { finished = true; },
      });
      // stop() is called while the boot pass is provably still in flight.
      expect(finished).toBe(false);
      await handle.stop();
      expect(finished, 'stop() waited for the running pass').toBe(true);
      // The reason it has to wait: this is what the daemon does next.
      expect(() => closeDatabase()).not.toThrow();
    });
  });

  describe('one definition of a pass', () => {
    // A `pending` row is invisible to the snapshot sweep on purpose — its bytes
    // may be mid-install, and only the reconciler may decide an in-flight
    // capture's fate. That is exactly why the order is not cosmetic: sweeping
    // first means a long-dead interrupted capture is protected by the very
    // state that should have condemned it, and it survives to the NEXT pass.
    // Reconciling first turns it into a `failed` row the same pass can collect.
    it('reconciles before it sweeps, so one pass finishes an interrupted capture', async () => {
      const base = deps();
      const longAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      // Interrupted, unrecoverable (no temp, no installed blob), and long past
      // every grace window. Nothing references it.
      base.db.prepare(
        `INSERT INTO chat_artifact_snapshots
           (id, project_id, source_path_at_capture, kind, mime, expected_digest,
            expected_size, temp_key, capture_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
      ).run(
        'snap-order', 'proj-1', 'interrupted.png', 'image', 'image/png',
        `sha256:${'a'.repeat(64)}`, 11, longAgo,
      );

      const pass = await runChatArtifactMaintenancePass({ ...base, gcDryRun: false });

      expect(pass.reconcile.failed).toBe(1);
      // The whole point: reclaimed in ONE pass, not deferred to the next.
      expect(pass.gc.snapshotsSwept).toBe(1);
      const remaining = base.db
        .prepare(`SELECT id FROM chat_artifact_snapshots WHERE id = ?`)
        .get('snap-order');
      expect(remaining).toBeUndefined();
    });
  });
});
