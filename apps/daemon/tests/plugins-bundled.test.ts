// Phase 4 / spec §23.3.5 — bundled plugin boot walker.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { listInstalledPlugins, upsertInstalledPlugin } from '../src/plugins/registry.js';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { registerBundledPlugins } from '../src/plugins/bundled.js';

let db: Database.Database;
let tmpRoot: string;

const SAMPLE_MANIFEST = (id: string) =>
  JSON.stringify({
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: id,
    title: id,
    version: '0.1.0',
    description: `${id} bundled fixture`,
    license: 'MIT',
    od: { kind: 'atom', capabilities: ['prompt:inject'] },
  });

const SAMPLE_SKILL = (id: string) => `---\nname: ${id}\ndescription: bundled fixture\n---\n# ${id}\n`;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-bundled-'));
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('registerBundledPlugins', () => {
  it('registers every <bundledRoot>/<tier>/<id>/ folder under source_kind=bundled', async () => {
    // Build a layout with one atom + one scenario:
    //   <bundledRoot>/atoms/discovery-question-form/{open-design.json,SKILL.md}
    //   <bundledRoot>/scenarios/od-new-generation/{open-design.json,SKILL.md}
    const atomDir = path.join(tmpRoot, 'atoms', 'discovery-question-form');
    const sceneDir = path.join(tmpRoot, 'scenarios', 'od-new-generation');
    await mkdir(atomDir, { recursive: true });
    await mkdir(sceneDir, { recursive: true });
    await writeFile(path.join(atomDir, 'open-design.json'), SAMPLE_MANIFEST('discovery-question-form'));
    await writeFile(path.join(atomDir, 'SKILL.md'), SAMPLE_SKILL('discovery-question-form'));
    await writeFile(path.join(sceneDir, 'open-design.json'), SAMPLE_MANIFEST('od-new-generation'));
    await writeFile(path.join(sceneDir, 'SKILL.md'), SAMPLE_SKILL('od-new-generation'));

    const result = await registerBundledPlugins({ db, bundledRoot: tmpRoot });
    expect(result.registered.map((r) => r.id).sort()).toEqual(['discovery-question-form', 'od-new-generation']);
    const installed = listInstalledPlugins(db);
    expect(installed.length).toBe(2);
    for (const row of installed) {
      expect(row.sourceKind).toBe('bundled');
      expect(row.trust).toBe('bundled');
    }
  });

  it('can stamp official registry provenance on bundled preinstalls', async () => {
    const folder = path.join(tmpRoot, 'scenarios', 'starter');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'open-design.json'), SAMPLE_MANIFEST('starter'));
    await writeFile(path.join(folder, 'SKILL.md'), SAMPLE_SKILL('starter'));

    const result = await registerBundledPlugins({
      db,
      bundledRoot: tmpRoot,
      marketplaceProvenance: {
        sourceMarketplaceId: 'official',
        marketplaceTrust: 'official',
        entryNamePrefix: 'open-design',
      },
    });

    expect(result.registered[0]?.sourceKind).toBe('bundled');
    expect(result.registered[0]?.sourceMarketplaceId).toBe('official');
    expect(result.registered[0]?.sourceMarketplaceEntryName).toBe('open-design/starter');
    expect(result.registered[0]?.sourceMarketplaceEntryVersion).toBe('0.1.0');
    expect(result.registered[0]?.marketplaceTrust).toBe('official');
    expect(result.registered[0]?.resolvedSource).toBe(folder);

    const [row] = listInstalledPlugins(db);
    expect(row?.sourceMarketplaceId).toBe('official');
    expect(row?.sourceMarketplaceEntryName).toBe('open-design/starter');
  });

  it('also registers a direct <bundledRoot>/<plugin-id>/ folder', async () => {
    // Direct layout (no tier): <bundledRoot>/sample-plugin/...
    const folder = path.join(tmpRoot, 'sample-plugin');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'open-design.json'), SAMPLE_MANIFEST('sample-plugin'));
    await writeFile(path.join(folder, 'SKILL.md'), SAMPLE_SKILL('sample-plugin'));

    const result = await registerBundledPlugins({ db, bundledRoot: tmpRoot });
    expect(result.registered.map((r) => r.id)).toEqual(['sample-plugin']);
  });

  it('is idempotent — re-running upserts the same row', async () => {
    const folder = path.join(tmpRoot, 'atoms', 'sample');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'open-design.json'), SAMPLE_MANIFEST('sample'));
    await writeFile(path.join(folder, 'SKILL.md'), SAMPLE_SKILL('sample'));

    await registerBundledPlugins({ db, bundledRoot: tmpRoot });
    await registerBundledPlugins({ db, bundledRoot: tmpRoot });
    expect(listInstalledPlugins(db).length).toBe(1);
  });

  it('returns empty result when bundledRoot does not exist', async () => {
    const result = await registerBundledPlugins({
      db,
      bundledRoot: path.join(tmpRoot, 'does-not-exist'),
    });
    expect(result.registered).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('skips folders without open-design.json without warning', async () => {
    const folder = path.join(tmpRoot, 'atoms', 'no-manifest');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'README.md'), '# nothing\n');
    const result = await registerBundledPlugins({ db, bundledRoot: tmpRoot });
    expect(result.registered).toEqual([]);
  });

  it('prunes persisted bundled rows whose bundled folder was removed', async () => {
    // Upgrade path: a previous daemon image shipped `stale`, the user's DB
    // registered it, and this image no longer carries the folder. The row
    // must disappear too — otherwise /api/plugins keeps serving a record
    // whose backing files are gone.
    const keepDir = path.join(tmpRoot, 'atoms', 'keep');
    const staleDir = path.join(tmpRoot, 'atoms', 'stale');
    for (const [dir, id] of [[keepDir, 'keep'], [staleDir, 'stale']] as const) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'open-design.json'), SAMPLE_MANIFEST(id));
      await writeFile(path.join(dir, 'SKILL.md'), SAMPLE_SKILL(id));
    }
    await registerBundledPlugins({ db, bundledRoot: tmpRoot });
    expect(listInstalledPlugins(db).length).toBe(2);

    // A user-installed plugin must never be touched by bundled pruning.
    upsertInstalledPlugin(db, {
      id: 'user-plugin',
      title: 'User Plugin',
      version: '0.1.0',
      sourceKind: 'project',
      source: '/tmp/user-plugin',
      trust: 'trusted',
      capabilitiesGranted: ['prompt:inject'],
      manifest: JSON.parse(SAMPLE_MANIFEST('user-plugin')),
      fsPath: '/tmp/user-plugin',
      installedAt: 0,
      updatedAt: 0,
    } as InstalledPluginRecord);

    await rm(staleDir, { recursive: true, force: true });
    const result = await registerBundledPlugins({ db, bundledRoot: tmpRoot });

    expect(result.pruned).toEqual(['stale']);
    expect(listInstalledPlugins(db).map((r) => r.id).sort()).toEqual([
      'keep',
      'user-plugin',
    ]);
  });

  it('does not prune bundled rows when the bundled root itself is missing', async () => {
    // A missing bundledRoot means a mispackaged image, not "every bundled
    // plugin was deliberately removed" — wiping the registry would turn a
    // packaging bug into data loss.
    const folder = path.join(tmpRoot, 'atoms', 'sample');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'open-design.json'), SAMPLE_MANIFEST('sample'));
    await writeFile(path.join(folder, 'SKILL.md'), SAMPLE_SKILL('sample'));
    await registerBundledPlugins({ db, bundledRoot: tmpRoot });

    const result = await registerBundledPlugins({
      db,
      bundledRoot: path.join(tmpRoot, 'does-not-exist'),
    });
    expect(result.pruned).toEqual([]);
    expect(listInstalledPlugins(db).map((r) => r.id)).toEqual(['sample']);
  });
});
