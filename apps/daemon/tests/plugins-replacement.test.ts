import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  installFromLocalFolder,
  type InstallEvent,
  type InstallOptions,
} from '../src/plugins/installer.js';
import { migratePlugins } from '../src/plugins/persistence.js';
import { listInstalledPlugins } from '../src/plugins/registry.js';

let tmpRoot: string;
let pluginsRoot: string;
let sourceFolder: string;
let destFolder: string;
let lockfilePath: string;
let db: Database.Database;
let previousManifest: string;
let previousLockfile: string;
let previousRecords: ReturnType<typeof listInstalledPlugins>;

async function writeVersion(version: string): Promise<void> {
  await fs.writeFile(path.join(sourceFolder, 'open-design.json'), JSON.stringify({
    name: 'sample-plugin',
    version,
    title: 'Sample Plugin',
    od: {
      kind: 'skill',
      taskKind: 'new-generation',
      useCase: { query: 'Make a brief.' },
    },
  }));
  await fs.writeFile(path.join(sourceFolder, 'payload.txt'), version);
}

function install(options: Partial<InstallOptions> = {}) {
  return installFromLocalFolder(db, {
    source: sourceFolder,
    roots: { userPluginsRoot: pluginsRoot },
    lockfilePath,
    ...options,
  });
}

async function collect(options: Partial<InstallOptions> = {}): Promise<InstallEvent[]> {
  const events: InstallEvent[] = [];
  for await (const event of install(options)) events.push(event);
  return events;
}

async function expectPreviousInstallation(): Promise<void> {
  expect(await fs.readFile(path.join(destFolder, 'open-design.json'), 'utf8')).toBe(previousManifest);
  expect(await fs.readFile(path.join(destFolder, 'payload.txt'), 'utf8')).toBe('1.0.0');
  expect(listInstalledPlugins(db)).toEqual(previousRecords);
  expect(await fs.readFile(lockfilePath, 'utf8')).toBe(previousLockfile);
  expect(await fs.readdir(pluginsRoot)).toEqual(['sample-plugin']);
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-plugin-replacement-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  sourceFolder = path.join(tmpRoot, 'source');
  destFolder = path.join(pluginsRoot, 'sample-plugin');
  lockfilePath = path.join(tmpRoot, 'od-plugin-lock.json');
  await fs.mkdir(sourceFolder, { recursive: true });
  await writeVersion('1.0.0');
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  expect((await collect()).at(-1)?.kind).toBe('success');
  previousManifest = await fs.readFile(path.join(destFolder, 'open-design.json'), 'utf8');
  previousLockfile = await fs.readFile(lockfilePath, 'utf8');
  previousRecords = listInstalledPlugins(db);
  await writeVersion('2.0.0');
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('plugin replacement publication', () => {
  it.each(['symlink', 'size cap'] as const)('preserves the installed version when copying rejects a %s', async (failure) => {
    if (failure === 'symlink') {
      await fs.symlink(path.join(sourceFolder, 'payload.txt'), path.join(sourceFolder, 'link'));
    } else {
      await fs.writeFile(path.join(sourceFolder, 'too-large.txt'), Buffer.alloc(2048));
    }

    const events = await collect(failure === 'size cap' ? { maxBytes: 1024 } : {});
    expect(events.at(-1)).toMatchObject({ kind: 'error' });
    await expectPreviousInstallation();
  });

  it('preserves the installed version when the copied manifest no longer validates', async () => {
    const events: InstallEvent[] = [];
    for await (const event of install()) {
      events.push(event);
      // Change the source after the initial manifest probe, before the copy.
      if (event.kind === 'progress' && event.phase === 'copying') {
        await fs.writeFile(path.join(sourceFolder, 'open-design.json'), '{');
      }
    }

    expect(events.at(-1)).toMatchObject({ kind: 'error', code: 'INVALID_MANIFEST' });
    await expectPreviousInstallation();
  });

  it('restores the previous tree when publishing the replacement fails', async () => {
    const rename = fs.rename.bind(fs);
    let rejectPublication = true;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === destFolder && rejectPublication) {
        rejectPublication = false;
        throw Object.assign(new Error('publication denied'), { code: 'EACCES' });
      }
      return rename(from, to);
    });

    expect((await collect()).at(-1)).toMatchObject({ kind: 'error' });
    await expectPreviousInstallation();
  });

  it('retains the backup if the filesystem also refuses to restore it', async () => {
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === destFolder) {
        throw Object.assign(new Error('destination unavailable'), { code: 'EACCES' });
      }
      return rename(from, to);
    });

    expect((await collect()).at(-1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('preserved at'),
    });
    const remaining = await fs.readdir(pluginsRoot);
    expect(remaining).toHaveLength(1);
    const backup = path.join(pluginsRoot, remaining[0]!);
    expect(await fs.readFile(path.join(backup, 'open-design.json'), 'utf8')).toBe(previousManifest);
    expect(await fs.readFile(path.join(backup, 'payload.txt'), 'utf8')).toBe('1.0.0');
    expect(listInstalledPlugins(db)).toEqual(previousRecords);
    expect(await fs.readFile(lockfilePath, 'utf8')).toBe(previousLockfile);
  });

  it('keeps the installed version when the consumer cancels before validation', async () => {
    for await (const event of install()) {
      if (event.kind === 'progress' && event.phase === 'parsing'
        && event.message === 'Re-parsing destination') break;
    }
    await expectPreviousInstallation();
  });

  it('can reinstall directly from the installed folder', async () => {
    const events = await collect({ source: destFolder });
    expect(events.at(-1)).toMatchObject({
      kind: 'success',
      plugin: { version: '1.0.0', fsPath: destFolder },
    });
    expect(await fs.readFile(path.join(destFolder, 'payload.txt'), 'utf8')).toBe('1.0.0');
    expect(await fs.readdir(pluginsRoot)).toEqual(['sample-plugin']);
  });

  it('publishes a valid upgrade with its final path and removes stale files', async () => {
    await fs.writeFile(path.join(destFolder, 'obsolete.txt'), 'old version only');
    const events = await collect();
    expect(events.at(-1)).toMatchObject({
      kind: 'success',
      plugin: { version: '2.0.0', fsPath: destFolder },
    });
    expect(listInstalledPlugins(db)[0]).toMatchObject({ version: '2.0.0', fsPath: destFolder });
    expect(await fs.readFile(path.join(destFolder, 'payload.txt'), 'utf8')).toBe('2.0.0');
    await expect(fs.stat(path.join(destFolder, 'obsolete.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readdir(pluginsRoot)).toEqual(['sample-plugin']);
    expect(await fs.readFile(lockfilePath, 'utf8')).not.toBe(previousLockfile);
  });
});
