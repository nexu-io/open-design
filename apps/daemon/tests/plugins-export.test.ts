// Phase 4 / spec §14 — `od plugin export` unit test.
//
// Exercises the three export targets directly through `exportPlugin()`
// against an in-memory daemon DB. The HTTP route mounted in
// server.ts is a thin pass-through, so the public contract is the
// returned `folder` / `files` / `snapshotId` shape.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { createSnapshot } from '../src/plugins/snapshots.js';
import { ExportError, exportPlugin } from '../src/plugins/export.js';

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-export-'));
  db = new Database(':memory:');
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

function persistSampleSnapshot() {
  return createSnapshot(db, {
    projectId:            'project-1',
    conversationId:       null,
    runId:                null,
    pluginId:             'sample-plugin',
    pluginVersion:        '1.0.0',
    pluginTitle:          'Sample Plugin',
    pluginDescription:    'fixture',
    manifestSourceDigest: 'a'.repeat(64),
    taskKind:             'new-generation' as const,
    inputs:               { topic: 'design' },
    resolvedContext:      {
      items: [
        { kind: 'atom', id: 'todo-write', label: 'Todo Write' },
      ],
    },
    pipeline:             undefined,
    genuiSurfaces:        [],
    capabilitiesGranted:  ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged:         [],
    connectorsRequired:   [],
    connectorsResolved:   [],
    mcpServers:           [],
    query:                'Make a deck.',
  });
}

describe('exportPlugin', () => {
  it('target=od writes SKILL.md + open-design.json + README.md', async () => {
    const snap = persistSampleSnapshot();
    const result = await exportPlugin({ db, snapshotId: snap.snapshotId, target: 'od', outDir: tmpDir });
    expect(result.snapshotId).toBe(snap.snapshotId);
    expect(result.files.map((f) => path.basename(f)).sort()).toEqual([
      'README.md',
      'SKILL.md',
      'open-design.json',
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(result.folder, 'open-design.json'), 'utf8'),
    );
    expect(manifest.provenance.snapshotId).toBe(snap.snapshotId);
    expect(manifest.provenance.manifestSourceDigest).toBe('a'.repeat(64));
  });

  it('target=claude-plugin writes SKILL.md + .claude-plugin/plugin.json', async () => {
    const snap = persistSampleSnapshot();
    const result = await exportPlugin({ db, snapshotId: snap.snapshotId, target: 'claude-plugin', outDir: tmpDir });
    expect(result.files.some((f) => f.endsWith('.claude-plugin/plugin.json'))).toBe(true);
    const cpRaw = await readFile(path.join(result.folder, '.claude-plugin', 'plugin.json'), 'utf8');
    const cp = JSON.parse(cpRaw);
    expect(cp.name).toBe('sample-plugin');
    expect(cp.version).toBe('1.0.0');
  });

  it('target=agent-skill ships SKILL.md only (plus the audit README)', async () => {
    const snap = persistSampleSnapshot();
    const result = await exportPlugin({ db, snapshotId: snap.snapshotId, target: 'agent-skill', outDir: tmpDir });
    expect(result.files.map((f) => path.basename(f)).sort()).toEqual([
      'README.md',
      'SKILL.md',
    ]);
  });

  it('falls back to the most recent snapshot for a given projectId', async () => {
    persistSampleSnapshot();
    // applied_at is a unix-ms integer; bump the second insert by hand so
    // the ORDER BY DESC tie-break is deterministic regardless of clock
    // resolution (createSnapshot stamps Date.now()).
    await new Promise((r) => setTimeout(r, 5));
    const b = persistSampleSnapshot();
    db.prepare('UPDATE applied_plugin_snapshots SET applied_at = applied_at + 100 WHERE id = ?')
      .run(b.snapshotId);
    const result = await exportPlugin({ db, projectId: 'project-1', target: 'od', outDir: tmpDir });
    expect(result.snapshotId).toBe(b.snapshotId);
  });

  it('throws ExportError when neither snapshot nor project resolves', async () => {
    await expect(
      exportPlugin({ db, snapshotId: 'missing', target: 'od', outDir: tmpDir }),
    ).rejects.toBeInstanceOf(ExportError);
    await expect(
      exportPlugin({ db, projectId: 'no-such-project', target: 'od', outDir: tmpDir }),
    ).rejects.toBeInstanceOf(ExportError);
  });
});
