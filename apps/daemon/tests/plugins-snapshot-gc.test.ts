// Plan §3.A5 / spec §16 Phase 5 / PB2 — snapshot GC behavior test.
//
// Locks the contract that:
//   - Unreferenced snapshots stamp expires_at = appliedAt + TTL.
//   - Referenced snapshots (linkSnapshotToRun) clear expires_at to NULL.
//   - pruneExpiredSnapshots() removes only rows whose expires_at <= now.
//   - The CLI escape hatch `before` cutoff additionally targets older
//     unreferenced rows (no expires_at) when called explicitly.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import {
  createSnapshot,
  getSnapshot,
  linkSnapshotToRun,
  pruneExpiredSnapshots,
} from '../src/plugins/snapshots.js';

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-gc-'));
  db = new Database(path.join(tmpDir, 'test.sqlite'));
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project 1');
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

const baseInput = (extra = {}) => ({
  projectId: 'project-1',
  conversationId: null,
  runId: null,
  pluginId: 'sample-plugin',
  pluginVersion: '1.0.0',
  pluginTitle: 'Sample Plugin',
  pluginDescription: 'Fixture',
  manifestSourceDigest: 'digest-1',
  taskKind: 'new-generation' as const,
  inputs: { topic: 'design' },
  resolvedContext: { items: [] },
  pipeline: undefined,
  genuiSurfaces: [],
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  assetsStaged: [],
  connectorsRequired: [],
  connectorsResolved: [],
  mcpServers: [],
  query: 'Make a deck',
  ...extra,
});

describe('snapshot GC', () => {
  it('stamps expires_at on unreferenced snapshots and leaves referenced ones pinned', () => {
    const unrefs = createSnapshot(db, baseInput());
    const referenced = createSnapshot(db, baseInput());
    linkSnapshotToRun(db, referenced.snapshotId, 'run-42');
    const unrefRow = db
      .prepare('SELECT expires_at, run_id FROM applied_plugin_snapshots WHERE id = ?')
      .get(unrefs.snapshotId) as { expires_at: number | null; run_id: string | null };
    const refRow = db
      .prepare('SELECT expires_at, run_id FROM applied_plugin_snapshots WHERE id = ?')
      .get(referenced.snapshotId) as { expires_at: number | null; run_id: string | null };
    expect(unrefRow.expires_at).not.toBeNull();
    expect(unrefRow.run_id).toBeNull();
    expect(refRow.expires_at).toBeNull();
    expect(refRow.run_id).toBe('run-42');
  });

  it('prunes expired snapshots and preserves still-valid ones + referenced pins', () => {
    // Three snapshots, in three states:
    //   A) unreferenced + expires_at in the past → pruned.
    //   B) unreferenced + expires_at in the future → kept.
    //   C) referenced → kept (expires_at NULL, run_id set).
    const a = createSnapshot(db, baseInput());
    const b = createSnapshot(db, baseInput());
    const c = createSnapshot(db, baseInput());
    linkSnapshotToRun(db, c.snapshotId, 'run-c');
    // Manually rewrite expires_at on A so we don't have to wait the TTL.
    db.prepare('UPDATE applied_plugin_snapshots SET expires_at = ? WHERE id = ?')
      .run(Date.now() - 1, a.snapshotId);
    const result = pruneExpiredSnapshots(db);
    expect(result.removed).toBe(1);
    expect(result.ids).toEqual([a.snapshotId]);
    expect(getSnapshot(db, a.snapshotId)).toBeNull();
    expect(getSnapshot(db, b.snapshotId)).not.toBeNull();
    expect(getSnapshot(db, c.snapshotId)).not.toBeNull();
  });

  it('honors the operator before-cutoff to force-prune unreferenced older rows even if not yet expired', () => {
    const old = createSnapshot(db, baseInput());
    const fresh = createSnapshot(db, baseInput());
    // Backdate `old` so applied_at < cutoff. Don't touch `fresh`.
    const ancient = Date.now() - 365 * 24 * 60 * 60 * 1000; // a year ago
    db.prepare('UPDATE applied_plugin_snapshots SET applied_at = ?, expires_at = NULL WHERE id = ?')
      .run(ancient, old.snapshotId);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const result = pruneExpiredSnapshots(db, { before: cutoff });
    expect(result.ids).toEqual([old.snapshotId]);
    expect(getSnapshot(db, fresh.snapshotId)).not.toBeNull();
  });

  it('never prunes referenced rows even when before-cutoff is older than them', () => {
    const referenced = createSnapshot(db, baseInput());
    linkSnapshotToRun(db, referenced.snapshotId, 'run-r');
    const ancient = Date.now() - 365 * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE applied_plugin_snapshots SET applied_at = ? WHERE id = ?')
      .run(ancient, referenced.snapshotId);
    const result = pruneExpiredSnapshots(db, { before: Date.now() });
    expect(result.removed).toBe(0);
    expect(getSnapshot(db, referenced.snapshotId)).not.toBeNull();
  });

  // Plan §3.M1 / spec PB2 — referenced-row TTL.
  //
  // Operators who opt into OD_SNAPSHOT_RETENTION_DAYS expect referenced
  // snapshots whose project has been deleted to be reaped after the
  // configured window. Live projects keep their snapshots pinned
  // forever (reproducibility wins).
  describe('OD_SNAPSHOT_RETENTION_DAYS referenced-row TTL', () => {
    it('prunes referenced snapshots whose project no longer exists and applied_at is older than the window', () => {
      const referenced = createSnapshot(db, baseInput());
      linkSnapshotToRun(db, referenced.snapshotId, 'run-r');
      // Backdate to 90 days ago, then drop the project so the LEFT JOIN
      // matches the no-longer-exists condition. Disable foreign-key
      // enforcement around the DELETE so the FK cascade doesn't beat
      // the GC sweep to it (the daemon's real openDb path has
      // foreign_keys=ON; the in-memory test DB defaults to OFF, but
      // we set it explicitly to keep the test readable).
      const oldEnough = Date.now() - 90 * 24 * 60 * 60 * 1000;
      db.prepare('UPDATE applied_plugin_snapshots SET applied_at = ? WHERE id = ?')
        .run(oldEnough, referenced.snapshotId);
      db.pragma('foreign_keys = OFF');
      db.prepare('DELETE FROM projects WHERE id = ?').run('project-1');
      db.pragma('foreign_keys = ON');
      const result = pruneExpiredSnapshots(db, { retentionDays: 30 });
      expect(result.ids).toContain(referenced.snapshotId);
      expect(getSnapshot(db, referenced.snapshotId)).toBeNull();
    });

    it('keeps referenced snapshots whose project is still alive', () => {
      const referenced = createSnapshot(db, baseInput());
      linkSnapshotToRun(db, referenced.snapshotId, 'run-r');
      const oldEnough = Date.now() - 90 * 24 * 60 * 60 * 1000;
      db.prepare('UPDATE applied_plugin_snapshots SET applied_at = ? WHERE id = ?')
        .run(oldEnough, referenced.snapshotId);
      const result = pruneExpiredSnapshots(db, { retentionDays: 30 });
      expect(result.removed).toBe(0);
      expect(getSnapshot(db, referenced.snapshotId)).not.toBeNull();
    });

    it('respects the retentionDays window — recent rows survive even on a deleted project', () => {
      const referenced = createSnapshot(db, baseInput());
      linkSnapshotToRun(db, referenced.snapshotId, 'run-r');
      db.pragma('foreign_keys = OFF');
      db.prepare('DELETE FROM projects WHERE id = ?').run('project-1');
      db.pragma('foreign_keys = ON');
      // applied_at is now (well within retentionDays); the project
      // is gone but the row is still recent enough to keep.
      const result = pruneExpiredSnapshots(db, { retentionDays: 30 });
      expect(result.removed).toBe(0);
      expect(getSnapshot(db, referenced.snapshotId)).not.toBeNull();
    });
  });
});
