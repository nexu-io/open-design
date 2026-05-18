// Snapshot writer integration test (spec §8.2.1).
//
// The applied_plugin_snapshots table has exactly one writer: the
// `snapshots.ts` module. This test exercises createSnapshot →
// linkSnapshotToRun → markSnapshotStale and asserts:
//   - Inserted rows expose the AppliedPluginSnapshot shape.
//   - Linking to a run pins expires_at = NULL.
//   - Marking stale flips status to 'stale'.

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
  markSnapshotStale,
} from '../src/plugins/snapshots.js';

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-snapshot-'));
  db = new Database(path.join(tmpDir, 'test.sqlite'));
  // Minimal projects/conversations tables so the FK ON DELETE clauses
  // don't blow up the migration.
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

const baseInput = (extra: Partial<Parameters<typeof createSnapshot>[1]> = {}) => ({
  projectId: 'project-1',
  conversationId: null,
  runId: null,
  pluginId: 'sample-plugin',
  pluginVersion: '1.0.0',
  pluginTitle: 'Sample Plugin',
  pluginDescription: 'Fixture',
  manifestSourceDigest: 'digest-1',
  sourceMarketplaceId: null,
  pinnedRef: null,
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

describe('snapshots writer', () => {
  it('createSnapshot inserts a row and round-trips via getSnapshot', () => {
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project 1');
    const snap = createSnapshot(db, baseInput({
      sourceMarketplaceId: 'official',
      sourceMarketplaceEntryName: 'open-design/sample-plugin',
      sourceMarketplaceEntryVersion: '1.0.0',
      marketplaceTrust: 'official',
      resolvedSource: 'github:open-design/plugins@abc123/sample-plugin',
      resolvedRef: 'abc123',
      archiveIntegrity: 'sha512-fixture',
    }));
    expect(snap.snapshotId).toMatch(/^[0-9a-f-]{36}$/);
    const fetched = getSnapshot(db, snap.snapshotId);
    expect(fetched).not.toBeNull();
    expect(fetched!.pluginId).toBe('sample-plugin');
    expect(fetched!.manifestSourceDigest).toBe('digest-1');
    expect(fetched!.sourceMarketplaceId).toBe('official');
    expect(fetched!.sourceMarketplaceEntryName).toBe('open-design/sample-plugin');
    expect(fetched!.sourceMarketplaceEntryVersion).toBe('1.0.0');
    expect(fetched!.marketplaceTrust).toBe('official');
    expect(fetched!.resolvedSource).toBe('github:open-design/plugins@abc123/sample-plugin');
    expect(fetched!.resolvedRef).toBe('abc123');
    expect(fetched!.archiveIntegrity).toBe('sha512-fixture');
    expect(fetched!.status).toBe('fresh');
  });

  it('linkSnapshotToRun pins expires_at to NULL', () => {
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project 1');
    const snap = createSnapshot(db, baseInput());
    const beforeRow = db.prepare('SELECT expires_at FROM applied_plugin_snapshots WHERE id = ?').get(snap.snapshotId) as { expires_at: number | null };
    // Either null (TTL=0) or a numeric expiry — we care that linking nulls it.
    void beforeRow;

    linkSnapshotToRun(db, snap.snapshotId, 'run-1');
    const after = db.prepare('SELECT run_id, expires_at FROM applied_plugin_snapshots WHERE id = ?').get(snap.snapshotId) as { run_id: string; expires_at: number | null };
    expect(after.run_id).toBe('run-1');
    expect(after.expires_at).toBeNull();
  });

  it('markSnapshotStale flips status', () => {
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project 1');
    const snap = createSnapshot(db, baseInput());
    markSnapshotStale(db, snap.snapshotId);
    const fetched = getSnapshot(db, snap.snapshotId);
    expect(fetched!.status).toBe('stale');
  });
});
