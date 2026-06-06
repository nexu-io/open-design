// Installer integration: copies a local-folder plugin into a sandbox
// userPluginsRoot, persists the installed_plugins row, and surfaces SSE
// events. Phase 1 covers exactly the local-folder source path; tarball
// arrival lands in Phase 2A.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { installFromLocalFolder, installPlugin, uninstallPlugin } from '../src/plugins/installer.js';
import { listInstalledPlugins } from '../src/plugins/registry.js';
import { addMarketplace, resolvePluginInMarketplaces } from '../src/plugins/marketplaces.js';
import type { InstalledPluginRecord } from '@open-design/contracts';

let tmpRoot: string;
let pluginsRoot: string;
let sourceFolder: string;
let db: Database.Database;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-installer-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  sourceFolder = path.join(tmpRoot, 'source-plugin');
  await mkdir(sourceFolder, { recursive: true });
  await writeFile(
    path.join(sourceFolder, 'open-design.json'),
    JSON.stringify({
      name: 'sample-plugin',
      version: '1.0.0',
      title: 'Sample Plugin',
      od: {
        kind: 'skill',
        taskKind: 'new-generation',
        useCase: { query: 'Make a {{topic}} brief.' },
        inputs: [{ name: 'topic', type: 'string', required: true }],
      },
    }, null, 2),
  );
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

describe('installFromLocalFolder', () => {
  it('copies the folder and writes installed_plugins', async () => {
    const events: string[] = [];
    let installedRecord: InstalledPluginRecord | null = null;

    for await (const ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      events.push(ev.kind);
      if (ev.kind === 'success') installedRecord = ev.plugin;
      if (ev.kind === 'error') throw new Error(ev.message);
    }

    expect(events.at(-1)).toBe('success');
    expect(installedRecord?.id).toBe('sample-plugin');
    expect(installedRecord?.version).toBe('1.0.0');
    const list = listInstalledPlugins(db);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('sample-plugin');
    expect(list[0]?.sourceKind).toBe('local');
    expect(list[0]?.trust).toBe('restricted');
    expect(list[0]?.fsPath).toBe(path.join(pluginsRoot, 'sample-plugin'));
  });

  it('rejects symbolic links inside the source tree', async () => {
    // Create a benign symlink — the installer must refuse anything that
    // could escape the staged folder.
    const linkPath = path.join(sourceFolder, 'evil-link');
    await mkdir(path.dirname(linkPath), { recursive: true });
    const fs = await import('node:fs/promises');
    await fs.symlink('/etc/passwd', linkPath).catch(() => undefined);

    let errored = false;
    for await (const ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      if (ev.kind === 'error') errored = true;
    }
    expect(errored).toBe(true);
  });

  it('uninstall removes the row and on-disk staged folder', async () => {
    for await (const _ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      void _ev;
    }
    const result = await uninstallPlugin(db, 'sample-plugin', { userPluginsRoot: pluginsRoot });
    expect(result.ok).toBe(true);
    expect(listInstalledPlugins(db)).toHaveLength(0);
  });

  it('persists marketplace provenance and inherited trust for resolved installs', async () => {
    const lockfilePath = path.join(tmpRoot, '.od', 'od-plugin-lock.json');
    const manifest = JSON.stringify({
      specVersion: '1.0.0',
      name: 'fixture-registry',
      version: '1.0.0',
      plugins: [
        {
          name: 'vendor/sample-plugin',
          title: 'Sample Plugin',
          source: sourceFolder,
          version: '1.0.0',
          ref: 'abc123',
          integrity: 'sha512-fixture',
          manifestDigest: 'sha256-manifest',
        },
      ],
    });
    const added = await addMarketplace(db, {
      url: 'https://example.com/open-design-marketplace.json',
      trust: 'official',
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => manifest,
      }),
    });
    if (!added.ok) throw new Error('marketplace setup failed');

    const resolved = resolvePluginInMarketplaces(db, 'vendor/sample-plugin');
    expect(resolved).not.toBeNull();

    let installedRecord: InstalledPluginRecord | null = null;
    for await (const ev of installPlugin(db, {
      source: resolved!.source,
      roots: { userPluginsRoot: pluginsRoot },
      sourceMarketplaceId: resolved!.marketplaceId,
      sourceMarketplaceEntryName: resolved!.pluginName,
      sourceMarketplaceEntryVersion: resolved!.pluginVersion,
      marketplaceTrust: resolved!.marketplaceTrust,
      resolvedSource: resolved!.source,
      resolvedRef: resolved!.ref!,
      manifestDigest: resolved!.manifestDigest!,
      archiveIntegrity: resolved!.archiveIntegrity!,
      lockfilePath,
    })) {
      if (ev.kind === 'success') installedRecord = ev.plugin;
      if (ev.kind === 'error') throw new Error(ev.message);
    }

    expect(installedRecord?.id).toBe('sample-plugin');
    expect(installedRecord?.sourceKind).toBe('local');
    expect(installedRecord?.sourceMarketplaceId).toBe(added.row.id);
    expect(installedRecord?.sourceMarketplaceEntryName).toBe('vendor/sample-plugin');
    expect(installedRecord?.sourceMarketplaceEntryVersion).toBe('1.0.0');
    expect(installedRecord?.marketplaceTrust).toBe('official');
    expect(installedRecord?.trust).toBe('trusted');
    expect(installedRecord?.resolvedSource).toBe(sourceFolder);
    expect(installedRecord?.resolvedRef).toBe('abc123');
    expect(installedRecord?.manifestDigest).toBe('sha256-manifest');
    expect(installedRecord?.archiveIntegrity).toBe('sha512-fixture');

    const [row] = listInstalledPlugins(db);
    expect(row?.sourceMarketplaceId).toBe(added.row.id);
    expect(row?.marketplaceTrust).toBe('official');
    expect(row?.trust).toBe('trusted');
    const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'));
    expect(lockfile.plugins['vendor/sample-plugin']).toMatchObject({
      name: 'vendor/sample-plugin',
      version: '1.0.0',
      sourceMarketplaceId: added.row.id,
      sourceMarketplaceEntryName: 'vendor/sample-plugin',
      resolvedRef: 'abc123',
      manifestDigest: 'sha256-manifest',
      archiveIntegrity: 'sha512-fixture',
    });
  });

  it('keeps restricted marketplace installs restricted', async () => {
    const manifest = JSON.stringify({
      specVersion: '1.0.0',
      name: 'restricted-registry',
      version: '1.0.0',
      plugins: [
        {
          name: 'vendor/sample-plugin',
          title: 'Sample Plugin',
          source: sourceFolder,
          version: '1.0.0',
        },
      ],
    });
    const added = await addMarketplace(db, {
      url: 'https://example.com/restricted-marketplace.json',
      trust: 'restricted',
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => manifest,
      }),
    });
    if (!added.ok) throw new Error('marketplace setup failed');

    const resolved = resolvePluginInMarketplaces(db, 'vendor/sample-plugin');
    expect(resolved).not.toBeNull();

    let installedRecord: InstalledPluginRecord | null = null;
    for await (const ev of installPlugin(db, {
      source: resolved!.source,
      roots: { userPluginsRoot: pluginsRoot },
      sourceMarketplaceId: resolved!.marketplaceId,
      sourceMarketplaceEntryName: resolved!.pluginName,
      sourceMarketplaceEntryVersion: resolved!.pluginVersion,
      marketplaceTrust: resolved!.marketplaceTrust,
      resolvedSource: resolved!.source,
    })) {
      if (ev.kind === 'success') installedRecord = ev.plugin;
      if (ev.kind === 'error') throw new Error(ev.message);
    }

    expect(installedRecord?.sourceMarketplaceId).toBe(added.row.id);
    expect(installedRecord?.marketplaceTrust).toBe('restricted');
    expect(installedRecord?.trust).toBe('restricted');
    const [row] = listInstalledPlugins(db);
    expect(row?.marketplaceTrust).toBe('restricted');
    expect(row?.trust).toBe('restricted');
  });
});
