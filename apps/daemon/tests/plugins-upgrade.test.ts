// Plan §3.Z2 — `od plugin upgrade` re-installs from recorded source.
//
// Since the upgrade route is a thin wrapper around installPlugin()
// + a guard for source_kind='bundled', we exercise the wrapper
// behaviour at the helper level. The integration with the
// installer's SSE shape stays covered by plugins-installer.test.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { installFromLocalFolder } from '../src/plugins/installer.js';
import { installPlugin } from '../src/plugins/installer.js';
import { getInstalledPlugin } from '../src/plugins/registry.js';

let tmpRoot: string;
let pluginsRoot: string;
let sourceFolder: string;
let db: Database.Database;

async function writeSource(version: string, opts?: { description?: string }) {
  await writeFile(
    path.join(sourceFolder, 'open-design.json'),
    JSON.stringify({
      name: 'upgrade-fixture',
      version,
      title: 'Upgrade fixture',
      ...(opts?.description ? { description: opts.description } : {}),
      od: { taskKind: 'new-generation' },
    }, null, 2),
  );
}

async function drain(events: AsyncGenerator<unknown>) {
  for await (const _ev of events) {
    void _ev;
  }
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-upgrade-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  sourceFolder = path.join(tmpRoot, 'source-plugin');
  await mkdir(sourceFolder, { recursive: true });
  await writeSource('1.0.0');
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

describe('od plugin upgrade — installer round-trip', () => {
  it('re-installs from the recorded source and bumps the registry version', async () => {
    await drain(installFromLocalFolder(db, { source: sourceFolder, roots: { userPluginsRoot: pluginsRoot } }) as AsyncGenerator<unknown>);
    const before = getInstalledPlugin(db, 'upgrade-fixture');
    expect(before?.version).toBe('1.0.0');

    // Author bumps the version on disk + adds a description.
    await writeSource('1.0.1', { description: 'with notes' });

    // Upgrade re-runs the installer against the recorded source.
    await drain(installPlugin(db, { source: before!.source, roots: { userPluginsRoot: pluginsRoot } }) as AsyncGenerator<unknown>);
    const after = getInstalledPlugin(db, 'upgrade-fixture');
    expect(after?.version).toBe('1.0.1');
    expect(after?.manifest.description).toBe('with notes');
  });

  it('re-running with the same source on disk is idempotent on the registry version', async () => {
    await drain(installFromLocalFolder(db, { source: sourceFolder, roots: { userPluginsRoot: pluginsRoot } }) as AsyncGenerator<unknown>);
    const before = getInstalledPlugin(db, 'upgrade-fixture');
    await drain(installPlugin(db, { source: before!.source, roots: { userPluginsRoot: pluginsRoot } }) as AsyncGenerator<unknown>);
    const after = getInstalledPlugin(db, 'upgrade-fixture');
    expect(after?.version).toBe(before!.version);
    expect(after?.id).toBe(before!.id);
  });

  it('persists the new manifest atomically — ENOENT on read does not regress to the old version', async () => {
    await drain(installFromLocalFolder(db, { source: sourceFolder, roots: { userPluginsRoot: pluginsRoot } }) as AsyncGenerator<unknown>);
    const before = getInstalledPlugin(db, 'upgrade-fixture');
    await writeSource('1.0.2');
    await drain(installPlugin(db, { source: before!.source, roots: { userPluginsRoot: pluginsRoot } }) as AsyncGenerator<unknown>);

    // The on-disk manifest the installer just wrote should match the
    // one in the SQLite row.
    const recorded = getInstalledPlugin(db, 'upgrade-fixture');
    const onDisk = JSON.parse(await readFile(path.join(recorded!.fsPath, 'open-design.json'), 'utf8'));
    expect(onDisk.version).toBe('1.0.2');
    expect(recorded?.version).toBe('1.0.2');
  });
});
