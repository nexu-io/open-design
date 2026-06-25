// Daemon data-root contract (AGENTS.md "Daemon data directory contract"):
// in DAEMON context, plugin install/registry operations must derive their
// userPluginsRoot from the resolved daemon data root (RUNTIME_DATA_DIR ->
// PLUGIN_REGISTRY_ROOTS), never from the cwd `.max` fallback baked into
// `defaultRegistryRoots()`. This test locks that invariant:
//
//   1. Trap demonstration — the bare `installFromLocalFolder` default
//      (no `roots`, MAX_DATA_DIR unset) DOES escape into `<cwd>/.max`.
//      That is precisely the footgun the daemon must never hit, and it
//      is the reason every daemon caller threads explicit roots.
//   2. Daemon invariant — installing with explicit
//      `registryRootsForDataDir(<resolvedDataDir>)` (the exact shape
//      server.ts uses via PLUGIN_REGISTRY_ROOTS) writes bytes ONLY under
//      the resolved data root and never creates `<cwd>/.max`.
//
// If a future daemon caller drops the explicit `roots` argument, the
// plugin bytes would leak into the daemon's process cwd — case (2) is the
// guard that keeps that from silently regressing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { installFromLocalFolder, uninstallPlugin } from '../src/plugins/installer.js';
import { listInstalledPlugins, registryRootsForDataDir } from '../src/plugins/registry.js';

let tmpRoot: string;
let cwdSandbox: string;
let sourceFolder: string;
let resolvedDataDir: string;
let db: Database.Database;

let originalCwd: string;
let originalMaxDataDir: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-roots-escape-'));
  // A pristine cwd with no `.max` so we can detect a cwd-escape write.
  cwdSandbox = path.join(tmpRoot, 'cwd');
  // The "resolved daemon data root" stand-in (what RUNTIME_DATA_DIR would be).
  resolvedDataDir = path.join(tmpRoot, 'data-root');
  sourceFolder = path.join(tmpRoot, 'source-plugin');
  await mkdir(cwdSandbox, { recursive: true });
  await mkdir(resolvedDataDir, { recursive: true });
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

  // Isolate process state: the bare default reads MAX_DATA_DIR / cwd.
  originalCwd = process.cwd();
  originalMaxDataDir = process.env.MAX_DATA_DIR;
  process.chdir(cwdSandbox);
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalMaxDataDir === undefined) delete process.env.MAX_DATA_DIR;
  else process.env.MAX_DATA_DIR = originalMaxDataDir;
  db.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('plugin registry roots — daemon data-root invariant', () => {
  it('the bare default (no roots, MAX_DATA_DIR unset) escapes into <cwd>/.max — the trap daemons must avoid', async () => {
    delete process.env.MAX_DATA_DIR;
    for await (const ev of installFromLocalFolder(db, { source: sourceFolder })) {
      if (ev.kind === 'error') throw new Error(ev.message);
    }
    // Documents WHY the daemon must pass explicit roots: omitting them
    // lands plugin bytes in the process cwd, not the daemon data root.
    const cwdEscape = path.join(cwdSandbox, '.max', 'plugins', 'sample-plugin');
    expect(fs.existsSync(cwdEscape)).toBe(true);
  });

  it('daemon-shaped install (explicit resolved roots) stays under the data root and never touches <cwd>/.max', async () => {
    // Force a divergent MAX_DATA_DIR to prove the explicit roots win over
    // env/cwd: the bytes must follow the passed data root, not the env.
    process.env.MAX_DATA_DIR = path.join(tmpRoot, 'env-decoy');

    const roots = registryRootsForDataDir(resolvedDataDir);
    let installedFsPath: string | undefined;
    for await (const ev of installFromLocalFolder(db, { source: sourceFolder, roots })) {
      if (ev.kind === 'error') throw new Error(ev.message);
      if (ev.kind === 'success') installedFsPath = ev.plugin.fsPath;
    }

    const expected = path.join(resolvedDataDir, 'plugins', 'sample-plugin');
    expect(installedFsPath).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    expect(listInstalledPlugins(db)[0]?.fsPath).toBe(expected);

    // No cwd escape and no env-decoy escape: explicit roots are authoritative.
    expect(fs.existsSync(path.join(cwdSandbox, '.max'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'env-decoy', 'plugins', 'sample-plugin'))).toBe(false);

    // Uninstall must also honor the explicit roots, not the cwd default.
    const result = await uninstallPlugin(db, 'sample-plugin', roots);
    expect(result.ok).toBe(true);
    expect(result.removedFolder).toBe(expected);
    expect(fs.existsSync(expected)).toBe(false);
    expect(fs.existsSync(path.join(cwdSandbox, '.max'))).toBe(false);
  });
});
