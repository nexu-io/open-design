// Plan §8 Definition of Done — daemon-side e2e suite.
//
// Anchors the four §8 e2e cases that don't require Playwright UI flow
// or the Phase 1.5 headless flag (e2e-3 stays out of scope until then).
// Each case runs against the real resolver / installer / snapshot
// modules so the public contract surface (HTTP body shape, SQLite
// columns) is what the test sees.
//
//   e2e-2 pure apply across runs   — two consecutive applies share digest
//                                    and produce no FS mutation.
//   e2e-4 replay invariance        — replay reproduces the prompt block
//                                    byte-for-byte after a plugin upgrade.
//   e2e-6 connector trust gate     — restricted plugin without
//                                    connector:<id> fails apply with 409
//                                    capabilities-required, the matching
//                                    /api/tools/connectors/execute call
//                                    is also rejected with 403.
//   e2e-8 apply purity regression  — 100 applies grow the snapshot count
//                                    by 100, leave the project cwd byte
//                                    size unchanged, and emit no
//                                    .mcp.json.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { applyPlugin } from '../src/plugins/apply.js';
import { installFromLocalFolder } from '../src/plugins/installer.js';
import { getInstalledPlugin } from '../src/plugins/registry.js';
import { createSnapshot, getSnapshot } from '../src/plugins/snapshots.js';
import { resolvePluginSnapshot, capabilitiesRequiredError } from '../src/plugins/resolve-snapshot.js';
import { renderPluginBlock } from '@open-design/contracts';
import { checkConnectorAccess, ToolTokenRegistry } from '../src/tool-tokens.js';
import { FIRST_PARTY_ATOMS, type AtomCatalogEntry } from '../src/plugins/atoms.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');

let db: Database.Database;
let tmpRoot: string;
let pluginsRoot: string;
let projectCwd: string;

async function freshFixture(targetPath: string, version = '1.0.0') {
  await mkdir(targetPath, { recursive: true });
  const manifest = {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: 'sample-plugin',
    title: 'Sample Plugin',
    version,
    description: 'Phase 1 fixture',
    license: 'MIT',
    od: {
      kind: 'skill',
      taskKind: 'new-generation',
      useCase: { query: 'Make a {{topic}} brief.' },
      inputs: [{ name: 'topic', type: 'string', required: true, label: 'Topic' }],
      capabilities: ['prompt:inject'],
    },
  };
  await writeFile(path.join(targetPath, 'open-design.json'), JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(targetPath, 'SKILL.md'),
    '---\nname: sample-plugin\ndescription: fixture\n---\n# Sample\n',
  );
}

const REGISTRY_VIEW = {
  skills: [],
  designSystems: [],
  craft: [],
  atoms: FIRST_PARTY_ATOMS.map((a: AtomCatalogEntry) => ({ id: a.id, label: a.label })),
};

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-dod-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  projectCwd = path.join(tmpRoot, 'project-cwd');
  await mkdir(projectCwd, { recursive: true });
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

async function installLocal(source: string) {
  let installed = false;
  let error: string | undefined;
  for await (const ev of installFromLocalFolder(db, {
    source,
    roots: { userPluginsRoot: pluginsRoot },
  })) {
    if (ev.kind === 'success') installed = true;
    if (ev.kind === 'error') error = ev.message;
  }
  if (!installed) throw new Error(`install failed: ${error}`);
}

async function totalSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir)) {
    const stats = await stat(path.join(dir, entry));
    if (stats.isFile()) total += stats.size;
  }
  return total;
}

describe('Plan §8 e2e — daemon-side anchors', () => {
  it('e2e-2 pure apply across runs: two applies share digest, no FS mutation', async () => {
    await installLocal(FIXTURE_DIR);
    const plugin = getInstalledPlugin(db, 'sample-plugin')!;
    const beforeSize = await totalSize(projectCwd);
    const a = applyPlugin({
      plugin,
      inputs: { topic: 'design' },
      registry: REGISTRY_VIEW,
    });
    const b = applyPlugin({
      plugin,
      inputs: { topic: 'design' },
      registry: REGISTRY_VIEW,
    });
    expect(a.manifestSourceDigest).toBe(b.manifestSourceDigest);
    expect(a.manifestSourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(await totalSize(projectCwd)).toBe(beforeSize);
    // Snapshot rows are not written by applyPlugin itself (purity
    // invariant I2): the resolver / route is the only writer.
    const snapshotCount = (db.prepare(`SELECT COUNT(*) AS n FROM applied_plugin_snapshots`).get() as { n: number }).n;
    expect(snapshotCount).toBe(0);
  });

  it('e2e-4 replay invariance: snapshot prompt block survives plugin upgrade', async () => {
    // Install v1.0.0, persist a snapshot via the resolver.
    await installLocal(FIXTURE_DIR);
    const plugin = getInstalledPlugin(db, 'sample-plugin')!;
    const a = applyPlugin({ plugin, inputs: { topic: 'design' }, registry: REGISTRY_VIEW });
    const original = createSnapshot(db, {
      projectId: 'project-1',
      conversationId: null,
      runId: null,
      pluginId: a.result.appliedPlugin.pluginId,
      pluginVersion: a.result.appliedPlugin.pluginVersion,
      pluginTitle: a.result.appliedPlugin.pluginTitle,
      pluginDescription: a.result.appliedPlugin.pluginDescription,
      manifestSourceDigest: a.manifestSourceDigest,
      taskKind: a.result.appliedPlugin.taskKind,
      inputs: a.result.appliedPlugin.inputs,
      resolvedContext: a.result.appliedPlugin.resolvedContext,
      pipeline: a.result.appliedPlugin.pipeline,
      genuiSurfaces: a.result.appliedPlugin.genuiSurfaces ?? [],
      capabilitiesGranted: a.result.appliedPlugin.capabilitiesGranted,
      capabilitiesRequired: a.result.appliedPlugin.capabilitiesRequired,
      assetsStaged: a.result.appliedPlugin.assetsStaged,
      connectorsRequired: a.result.appliedPlugin.connectorsRequired,
      connectorsResolved: a.result.appliedPlugin.connectorsResolved,
      mcpServers: a.result.appliedPlugin.mcpServers,
      query: a.result.query,
    });
    const promptBlock1 = renderPluginBlock(original);

    // Simulate a plugin upgrade by re-installing v2.0.0 with a different
    // body. The plugin row gets the new version, but the persisted
    // snapshot is immutable per spec §8.2.1.
    const upgradedFolder = path.join(tmpRoot, 'sample-plugin-v2');
    await freshFixture(upgradedFolder, '2.0.0');
    // Replace SKILL.md with new copy so the digest would differ.
    await writeFile(
      path.join(upgradedFolder, 'SKILL.md'),
      '---\nname: sample-plugin\ndescription: upgraded\n---\n# Sample v2\nnew body\n',
    );
    await installLocal(upgradedFolder);
    const upgraded = getInstalledPlugin(db, 'sample-plugin')!;
    expect(upgraded.version).toBe('2.0.0');
    const b = applyPlugin({ plugin: upgraded, inputs: { topic: 'design' }, registry: REGISTRY_VIEW });
    // Live digest changed under the upgrade.
    expect(b.manifestSourceDigest).not.toBe(a.manifestSourceDigest);

    // Replay reads the original snapshot and the prompt block is identical.
    const replayed = getSnapshot(db, original.snapshotId)!;
    const promptBlock2 = renderPluginBlock(replayed);
    expect(promptBlock2).toBe(promptBlock1);
    expect(replayed.manifestSourceDigest).toBe(a.manifestSourceDigest);
  });

  it('e2e-6 connector trust gate: restricted plugin without connector:<id> blocks apply + tool token', async () => {
    // Build a fixture plugin that requires a slack connector but does
    // not declare the matching capability.
    const folder = path.join(tmpRoot, 'connector-plugin');
    await mkdir(folder, { recursive: true });
    const manifest = {
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: 'connector-plugin',
      title: 'Connector Plugin',
      version: '1.0.0',
      description: 'requires slack',
      license: 'MIT',
      od: {
        kind: 'skill',
        taskKind: 'new-generation',
        useCase: { query: 'List slack channels.' },
        connectors: { required: [{ id: 'slack', tools: ['channels.list'] }] },
        capabilities: ['prompt:inject'],
      },
    };
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify(manifest));
    await writeFile(
      path.join(folder, 'SKILL.md'),
      '---\nname: connector-plugin\ndescription: requires slack\n---\n# Connector\n',
    );
    // Install as restricted (the GitHub-style default for non-local
    // sources). We simulate that by overriding sourceKind via the
    // already-installed registry record.
    await installLocal(folder);
    db.prepare('UPDATE installed_plugins SET trust = ? WHERE id = ?')
      .run('restricted', 'connector-plugin');
    const plugin = getInstalledPlugin(db, 'connector-plugin')!;

    // Apply via the resolver — restricted + missing capability →
    // capabilities-required envelope.
    const result = resolvePluginSnapshot({
      db,
      body: { pluginId: 'connector-plugin' },
      projectId: 'project-1',
      registry: REGISTRY_VIEW,
    });
    expect(result).toBeDefined();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.status).toBe(409);
      expect(result.exitCode).toBe(66);
      expect(result.body.error.code).toBe('capabilities-required');
      const required = result.body.error.data?.required as string[];
      expect(required).toContain('connector:slack');
    }

    // The token-issuance gate refuses the same call independently.
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({
      runId: 'run-1',
      projectId: 'project-1',
      pluginSnapshotId: 'fake-snap',
      pluginTrust: 'restricted',
      pluginCapabilitiesGranted: ['prompt:inject'],
    });
    const gateResult = checkConnectorAccess(grant, 'slack');
    expect(gateResult.ok).toBe(false);
    expect(plugin.trust).toBe('restricted');
  });

  it('e2e-8 apply purity regression: 100 applies → 0 FS mutation, snapshot count grows by 100', async () => {
    await installLocal(FIXTURE_DIR);
    const plugin = getInstalledPlugin(db, 'sample-plugin')!;
    const beforeSize = await totalSize(projectCwd);
    const before = (db.prepare(`SELECT COUNT(*) AS n FROM applied_plugin_snapshots`).get() as { n: number }).n;
    for (let i = 0; i < 100; i++) {
      const a = applyPlugin({
        plugin,
        inputs: { topic: `topic-${i}` },
        registry: REGISTRY_VIEW,
      });
      // Persist via resolver.finalizeOk path (linkSnapshotToProject etc.)
      // not exercised here — we just call createSnapshot to assert the
      // count grows. apply itself is pure.
      createSnapshot(db, {
        projectId: 'project-1',
        conversationId: null,
        runId: null,
        pluginId: a.result.appliedPlugin.pluginId,
        pluginVersion: a.result.appliedPlugin.pluginVersion,
        manifestSourceDigest: a.manifestSourceDigest,
        taskKind: a.result.appliedPlugin.taskKind,
        inputs: a.result.appliedPlugin.inputs,
        resolvedContext: a.result.appliedPlugin.resolvedContext,
        capabilitiesGranted: a.result.appliedPlugin.capabilitiesGranted,
        capabilitiesRequired: a.result.appliedPlugin.capabilitiesRequired,
        assetsStaged: a.result.appliedPlugin.assetsStaged,
        connectorsRequired: a.result.appliedPlugin.connectorsRequired,
        connectorsResolved: a.result.appliedPlugin.connectorsResolved,
        mcpServers: a.result.appliedPlugin.mcpServers,
        query: a.result.query,
        genuiSurfaces: [],
      });
    }
    const after = (db.prepare(`SELECT COUNT(*) AS n FROM applied_plugin_snapshots`).get() as { n: number }).n;
    expect(after - before).toBe(100);
    expect(await totalSize(projectCwd)).toBe(beforeSize);
    // No .mcp.json was written into the cwd — apply is pure.
    const cwdEntries = await readdir(projectCwd);
    expect(cwdEntries.some((e) => e === '.mcp.json')).toBe(false);
  });

  it('reuses the project-pinned snapshot when /api/runs body has no pluginId or snapshotId', async () => {
    // Setup: install sample-plugin, create a project row, run the
    // resolver with a body that names pluginId+inputs (project-create
    // path). The resolver pins the snapshot via linkSnapshotToProject.
    await installLocal(FIXTURE_DIR);
    db.prepare(`INSERT INTO projects (id, name) VALUES (?, ?)`).run(
      'project-pinned',
      'pinned project',
    );

    const created = resolvePluginSnapshot({
      db,
      body: { pluginId: 'sample-plugin', pluginInputs: { topic: 'demo' } },
      projectId: 'project-pinned',
      registry: REGISTRY_VIEW,
    });
    expect(created?.ok).toBe(true);
    const pinnedSnapshotId = created!.ok ? created!.snapshotId : '';
    expect(pinnedSnapshotId.length).toBeGreaterThan(0);

    // The project row now carries the snapshot id.
    const projectRow = db
      .prepare(`SELECT applied_plugin_snapshot_id AS id FROM projects WHERE id = ?`)
      .get('project-pinned') as { id: string };
    expect(projectRow.id).toBe(pinnedSnapshotId);

    // Now simulate the run-create call: body has only `projectId`. The
    // resolver should fall back to the project-pinned snapshot id and
    // return ok with the same snapshotId — no missing-input gate fires.
    const reused = resolvePluginSnapshot({
      db,
      body: { projectId: 'project-pinned' },
      projectId: 'project-pinned',
      registry: REGISTRY_VIEW,
    });
    expect(reused?.ok).toBe(true);
    if (reused?.ok) {
      expect(reused.snapshotId).toBe(pinnedSnapshotId);
      expect(reused.created).toBe(false);
    }
  });

  it('accepts legacy inputs alias when resolving plugin snapshots', async () => {
    await installLocal(FIXTURE_DIR);

    const result = resolvePluginSnapshot({
      db,
      body: { pluginId: 'sample-plugin', inputs: { topic: 'demo' } },
      projectId: 'project-1',
      registry: REGISTRY_VIEW,
    });

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.snapshot.inputs).toMatchObject({ topic: 'demo' });
    }
  });

  it('capabilitiesRequiredError envelope shape stays stable for code agents', () => {
    const err = capabilitiesRequiredError({
      pluginId: 'sample',
      pluginVersion: '1.0.0',
      required: ['prompt:inject', 'connector:slack'],
      granted: ['prompt:inject'],
      missing: ['connector:slack'],
    });
    expect(err.status).toBe(409);
    expect(err.exitCode).toBe(66);
    expect(err.body.error.code).toBe('capabilities-required');
    const remediation = err.body.error.data?.remediation as string[];
    expect(remediation.join('\n')).toMatch(/connector:slack/);
    void readFile; // silence import-not-used in some toolings
  });
});
