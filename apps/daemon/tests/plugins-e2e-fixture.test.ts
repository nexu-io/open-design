// e2e-1 closed-loop test (plan §10.1).
//
// Walks the Phase 1 happy path end-to-end using only the daemon Phase 1
// modules (no HTTP layer, no live agent). Specifically:
//
//   1. Install fixtures/plugin-fixtures/sample-plugin into a sandboxed
//      registry root.
//   2. Read it back via listInstalledPlugins.
//   3. Compute applyPlugin → AppliedPluginSnapshot, persist via
//      createSnapshot, then re-fetch it and confirm the manifest digest
//      survives the round-trip.
//   4. Doctor the plugin and assert `ok: true`.
//
// This is the closed-loop the spec calls out as the Phase 1 definition of
// done. We keep it daemon-only so the loop runs without spinning the
// HTTP server, leaving the HTTP wiring to a separate smoke test.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { applyPlugin } from '../src/plugins/apply.js';
import { doctorPlugin } from '../src/plugins/doctor.js';
import { installFromLocalFolder } from '../src/plugins/installer.js';
import { getInstalledPlugin, listInstalledPlugins } from '../src/plugins/registry.js';
import { createSnapshot, getSnapshot } from '../src/plugins/snapshots.js';
import { FIRST_PARTY_ATOMS, type AtomCatalogEntry } from '../src/plugins/atoms.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');

let tmpRoot: string;
let pluginsRoot: string;
let db: Database.Database;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-e2e-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
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
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('plugin-system Phase 1 closed loop (e2e-1)', () => {
  it('install → list → apply → snapshot → doctor', async () => {
    let installed = false;
    for await (const ev of installFromLocalFolder(db, {
      source: FIXTURE_DIR,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      if (ev.kind === 'success') installed = true;
      if (ev.kind === 'error') throw new Error(ev.message);
    }
    expect(installed).toBe(true);

    const list = listInstalledPlugins(db);
    expect(list).toHaveLength(1);
    const record = list[0]!;
    expect(record.id).toBe('sample-plugin');
    expect(record.title).toBe('Sample Plugin');

    const fetched = getInstalledPlugin(db, 'sample-plugin');
    expect(fetched).not.toBeNull();

    const computed = applyPlugin({
      plugin: fetched!,
      inputs: { topic: 'AI design tools' },
      registry: {
        skills: [],
        designSystems: [],
        craft: [],
        atoms: FIRST_PARTY_ATOMS.map((a: AtomCatalogEntry) => ({ id: a.id, label: a.label })),
      },
    });
    expect(computed.result.appliedPlugin.pluginId).toBe('sample-plugin');
    expect(computed.result.appliedPlugin.manifestSourceDigest).toMatch(/^[0-9a-f]{64}$/);

    const snap = createSnapshot(db, {
      projectId: 'project-1',
      pluginId: computed.result.appliedPlugin.pluginId,
      pluginVersion: computed.result.appliedPlugin.pluginVersion,
      pluginTitle: computed.result.appliedPlugin.pluginTitle,
      pluginDescription: computed.result.appliedPlugin.pluginDescription,
      manifestSourceDigest: computed.manifestSourceDigest,
      taskKind: computed.result.appliedPlugin.taskKind,
      inputs: computed.result.appliedPlugin.inputs,
      resolvedContext: computed.result.appliedPlugin.resolvedContext,
      pipeline: computed.result.appliedPlugin.pipeline,
      genuiSurfaces: computed.result.appliedPlugin.genuiSurfaces ?? [],
      capabilitiesGranted: computed.result.appliedPlugin.capabilitiesGranted,
      capabilitiesRequired: computed.result.appliedPlugin.capabilitiesRequired,
      assetsStaged: computed.result.appliedPlugin.assetsStaged,
      connectorsRequired: computed.result.appliedPlugin.connectorsRequired,
      connectorsResolved: computed.result.appliedPlugin.connectorsResolved,
      mcpServers: computed.result.appliedPlugin.mcpServers,
      query: computed.result.query,
    });
    expect(snap.snapshotId).toMatch(/^[0-9a-f-]{36}$/);

    const refetched = getSnapshot(db, snap.snapshotId);
    expect(refetched).not.toBeNull();
    expect(refetched!.manifestSourceDigest).toBe(computed.manifestSourceDigest);
    expect(refetched!.inputs.topic).toBe('AI design tools');

    const report = doctorPlugin(fetched!, {
      skills: [],
      designSystems: [],
      craft: [],
      atoms: FIRST_PARTY_ATOMS.map((a: AtomCatalogEntry) => ({ id: a.id, label: a.label })),
    });
    expect(report.ok).toBe(true);
  });
});
