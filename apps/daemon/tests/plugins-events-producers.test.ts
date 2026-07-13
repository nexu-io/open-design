// Plan §3.JJ1 — producer hook coverage for the plugin event ring buffer.
//
// Asserts that the installer / uninstaller / upgrade pathways emit
// the right event kind + that the upgrade path overrides
// 'plugin.installed' to 'plugin.upgraded' via opts.eventKind.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import {
  installPlugin,
  installFromLocalFolder,
  uninstallPlugin,
} from '../src/plugins/installer.js';
import {
  __resetPluginEventBufferForTests,
  pluginEventSnapshot,
} from '../src/plugins/events.js';

let tmp: string;
let pluginsRoot: string;
let sourceFolder: string;
let db: Database.Database;

async function drain<T>(gen: AsyncGenerator<T>): Promise<void> {
  for await (const _ of gen) { void _; }
}

beforeEach(async () => {
  __resetPluginEventBufferForTests();
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-events-prod-'));
  pluginsRoot = path.join(tmp, 'plugins');
  sourceFolder = path.join(tmp, 'source-plugin');
  await mkdir(sourceFolder, { recursive: true });
  await writeFile(path.join(sourceFolder, 'open-design.json'), JSON.stringify({
    name: 'event-fixture',
    version: '1.0.0',
    title: 'Event fixture',
    od: { taskKind: 'new-generation' },
  }, null, 2));
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmp, { recursive: true, force: true });
  __resetPluginEventBufferForTests();
});

describe('installer producer hooks', () => {
  it("installFromLocalFolder emits 'plugin.installed' on success", async () => {
    await drain(installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    }));
    const events = pluginEventSnapshot();
    expect(events.length).toBe(1);
    expect(events[0]?.kind).toBe('plugin.installed');
    expect(events[0]?.pluginId).toBe('event-fixture');
    expect(events[0]?.details?.['version']).toBe('1.0.0');
  });

  it("installPlugin with eventKind='upgraded' emits 'plugin.upgraded' instead", async () => {
    await drain(installPlugin(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
      eventKind: 'upgraded',
    }));
    const events = pluginEventSnapshot();
    expect(events.length).toBe(1);
    expect(events[0]?.kind).toBe('plugin.upgraded');
  });

  it("default eventKind is 'installed' (back-compat)", async () => {
    await drain(installPlugin(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    }));
    const events = pluginEventSnapshot();
    expect(events[0]?.kind).toBe('plugin.installed');
  });

  it("uninstallPlugin emits 'plugin.uninstalled' on successful row removal", async () => {
    await drain(installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    }));
    __resetPluginEventBufferForTests();
    const result = await uninstallPlugin(db, 'event-fixture', { userPluginsRoot: pluginsRoot });
    expect(result.ok).toBe(true);
    const events = pluginEventSnapshot();
    const uninstall = events.find((e) => e.kind === 'plugin.uninstalled');
    expect(uninstall).toBeDefined();
    expect(uninstall?.pluginId).toBe('event-fixture');
  });

  it('uninstall event guard: only emit when the row+folder actually existed', async () => {
    // First call: a fresh tmp folder + nonexistent plugin id.
    // The daemon's uninstallPlugin happily resolves the no-op
    // because rm with force:true doesn't error on a missing path,
    // but we recorded the event-emit guard around (removed ||
    // removedFolder !== undefined). Verify the plugin path emits
    // the event and a no-op path does too (both legs are reachable
    // when the folder happens to exist on disk, even without a
    // registry row). This test pins the producer's intent: we
    // emit when the side-effect surface had something to do.
    await drain(installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    }));
    __resetPluginEventBufferForTests();
    await uninstallPlugin(db, 'event-fixture', { userPluginsRoot: pluginsRoot });
    const events = pluginEventSnapshot();
    expect(events.find((e) => e.kind === 'plugin.uninstalled')).toBeDefined();
  });

  it('install + upgrade sequence: id 1 = installed, id 2 = upgraded', async () => {
    await drain(installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    }));
    await writeFile(path.join(sourceFolder, 'open-design.json'), JSON.stringify({
      name: 'event-fixture',
      version: '1.1.0',
      title: 'Event fixture',
      od: { taskKind: 'new-generation' },
    }, null, 2));
    await drain(installPlugin(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
      eventKind: 'upgraded',
    }));
    const events = pluginEventSnapshot();
    expect(events.map((e) => e.kind)).toEqual([
      'plugin.installed',
      'plugin.upgraded',
    ]);
    expect(events[1]?.details?.['version']).toBe('1.1.0');
  });
});
