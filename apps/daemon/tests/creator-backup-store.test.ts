import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCreatorBackup,
  listCreatorBackups,
  resolveCreatorBackupNamespace,
  resolveCreatorBackupRoot,
  sanitizeBackupId,
  validateCreatorBackup,
} from '../src/creator-backup/store.js';

let dataDir: string;
let scratch: string;

const ALLOWED = ['creator-workbench', 'creator-media', 'creator-content', 'creator-release', 'creator-performance'];

function writeSource(subdir: string, projectId: string, content: unknown): void {
  const dir = path.join(dataDir, subdir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${projectId}.json`), JSON.stringify(content));
}

function backupRoot(): string {
  return resolveCreatorBackupRoot(dataDir);
}

function tempLeftovers(): number {
  const root = backupRoot();
  if (!existsSync(root)) return 0;
  return readdirSync(root).filter((name) => name.endsWith('.tmp')).length;
}

function snapshotDirs(): string[] {
  const root = backupRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => !name.endsWith('.tmp'));
}

beforeEach(() => {
  // Nest dataDir under a unique scratch dir so the derived backup root
  // (<scratch>/backups/creator) is isolated per test instead of collapsing
  // onto the shared os.tmpdir()/backups/creator.
  scratch = mkdtempSync(path.join(os.tmpdir(), 'od-creator-backup-store-'));
  dataDir = path.join(scratch, 'data');
  mkdirSync(dataDir, { recursive: true });
});
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('creator backup store — path derivation', () => {
  it('places the backup root outside the data dir, under <namespace>/backups/creator', () => {
    const root = backupRoot();
    expect(root).toBe(path.join(path.dirname(dataDir), 'backups', 'creator'));
    expect(root.startsWith(dataDir)).toBe(false);
    expect(resolveCreatorBackupNamespace(dataDir)).toBe(path.basename(path.dirname(dataDir)));
  });

  it('sanitizes backup ids into filesystem-safe directory names', () => {
    expect(sanitizeBackupId('creator-backup:abc-123')).toBe('creator-backup_abc-123');
  });
});

describe('creator backup store — create', () => {
  it('creates a valid, empty snapshot when the project has no Creator data', async () => {
    const manifest = await createCreatorBackup(dataDir, 'project-1');
    expect(manifest.projectIds).toEqual(['project-1']);
    expect(manifest.fileCount).toBe(0);
    expect(manifest.totalSize).toBe(0);
    expect(manifest.status).toBe('ready');
    const result = await validateCreatorBackup(dataDir, manifest.id);
    expect(result.valid).toBe(true);
    expect(result.fileCount).toBe(0);
  });

  it('backs up only the allowlisted Creator JSON files and verifies their hashes', async () => {
    writeSource('creator-workbench', 'project-1', { tasks: [{ id: 't1' }] });
    writeSource('creator-media', 'project-1', { assets: [{ id: 'a1' }] });
    writeSource('creator-content', 'project-1', { contentProjects: [] });
    // leave creator-release and creator-performance absent

    const manifest = await createCreatorBackup(dataDir, 'project-1', { note: 'mid-sprint' });
    expect(manifest.fileCount).toBe(3);
    expect(manifest.note).toBe('mid-sprint');
    const relPaths = manifest.files.map((f) => f.relativePath).sort();
    expect(relPaths).toEqual([
      'creator-content/project-1.json',
      'creator-media/project-1.json',
      'creator-workbench/project-1.json',
    ]);
    // every declared hash matches the committed file
    const result = await validateCreatorBackup(dataDir, manifest.id);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('excludes raw user assets under projects/<id>/ (only allowlist is read)', async () => {
    writeSource('creator-workbench', 'project-1', { tasks: [] });
    // simulated original media asset living in the project working dir
    const assetDir = path.join(dataDir, 'projects', 'project-1');
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(path.join(assetDir, 'raw-footage.mp4'), 'BINARY-ISH-PAYLOAD');

    const manifest = await createCreatorBackup(dataDir, 'project-1');
    expect(manifest.files.every((f) => ALLOWED.some((sub) => f.relativePath.startsWith(`${sub}/`)))).toBe(true);
    expect(manifest.files.some((f) => f.relativePath.includes('projects/'))).toBe(false);
    // the committed snapshot payload must not contain the raw asset dir
    const payload = path.join(backupRoot(), snapshotDirs()[0]!);
    expect(existsSync(path.join(payload, 'projects'))).toBe(false);
  });

  it('rejects a path-traversal project id', async () => {
    await expect(createCreatorBackup(dataDir, '../escape')).rejects.toThrow(/invalid project id/);
    expect(tempLeftovers()).toBe(0);
  });

  it('rejects a symlinked source directory and cleans up the temp dir', async () => {
    const outside = path.join(dataDir, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'project-1.json'), '{"leak":true}');
    symlinkSync(outside, path.join(dataDir, 'creator-workbench'), 'junction');

    await expect(createCreatorBackup(dataDir, 'project-1')).rejects.toThrow(/symlinked source/);
    expect(tempLeftovers()).toBe(0);
    // no snapshot was committed
    expect(snapshotDirs()).toEqual([]);
  });

  it('cleans up the temp snapshot when a source read fails', async () => {
    const dir = path.join(dataDir, 'creator-workbench');
    mkdirSync(dir, { recursive: true });
    // a directory where the source file is expected -> readFile throws
    mkdirSync(path.join(dir, 'project-1.json'));

    await expect(createCreatorBackup(dataDir, 'project-1')).rejects.toBeTruthy();
    expect(tempLeftovers()).toBe(0);
  });

  it('creates distinct snapshots on repeated backups', async () => {
    writeSource('creator-workbench', 'project-1', { tasks: [] });
    const first = await createCreatorBackup(dataDir, 'project-1');
    writeSource('creator-media', 'project-1', { assets: [] });
    const second = await createCreatorBackup(dataDir, 'project-1');
    expect(first.id).not.toBe(second.id);
    expect(snapshotDirs().length).toBe(2);
    const listed = await listCreatorBackups(dataDir);
    expect(listed.map((b) => b.id).sort()).toEqual([first.id, second.id].sort());
  });
});

describe('creator backup store — validate / list', () => {
  it('returns invalid for a missing backup', async () => {
    const result = await validateCreatorBackup(dataDir, 'creator-backup:does-not-exist');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('backup not found');
  });

  it('reports invalid when the manifest is corrupt', async () => {
    writeSource('creator-workbench', 'project-1', { tasks: [] });
    const manifest = await createCreatorBackup(dataDir, 'project-1');
    writeFileSync(path.join(backupRoot(), snapshotDirs()[0]!, 'manifest.json'), '{not json');
    const result = await validateCreatorBackup(dataDir, manifest.id);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/manifest/);
    // a corrupt snapshot is skipped from listing rather than crashing it
    expect(await listCreatorBackups(dataDir)).toEqual([]);
  });

  it('reports invalid when a file hash was tampered', async () => {
    writeSource('creator-workbench', 'project-1', { tasks: [] });
    const manifest = await createCreatorBackup(dataDir, 'project-1');
    const tampered = path.join(backupRoot(), snapshotDirs()[0]!, 'creator-workbench', 'project-1.json');
    writeFileSync(tampered, '{"tasks":[{"id":"injected"}]}'); // changes size + hash
    const result = await validateCreatorBackup(dataDir, manifest.id);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/hash mismatch/);
  });

  it('rejects a path-traversal backup id on validate', async () => {
    await expect(validateCreatorBackup(dataDir, '../escape')).rejects.toThrow(/path safe/);
  });

  it('lists a committed snapshot with summary metadata', async () => {
    writeSource('creator-workbench', 'project-1', { tasks: [] });
    const manifest = await createCreatorBackup(dataDir, 'project-1');
    const [summary] = await listCreatorBackups(dataDir);
    expect(summary).toBeDefined();
    expect(summary!.id).toBe(manifest.id);
    expect(summary!.fileCount).toBe(1);
    expect(summary!.validated).toBe(true);
    // sanity: the committed manifest on disk is readable and matches
    const onDisk = JSON.parse(readFileSync(path.join(backupRoot(), snapshotDirs()[0]!, 'manifest.json'), 'utf8'));
    expect(onDisk.id).toBe(manifest.id);
    expect(lstatSync(path.join(backupRoot(), snapshotDirs()[0]!, 'manifest.json')).isSymbolicLink()).toBe(false);
  });
});
