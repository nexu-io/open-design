import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const counters = vi.hoisted(() => ({
  readdirCalls: 0,
  afterReaddir: null as null | ((filePath: string) => Promise<void>),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:fs/promises');
  return {
    ...actual,
    default: actual,
    readdir: async (filePath: any, ...rest: any[]) => {
      counters.readdirCalls += 1;
      const entries = await (actual.readdir as any)(filePath, ...rest);
      await counters.afterReaddir?.(String(filePath));
      return entries;
    },
  };
});

const {
  invalidateImportedProjectFileList,
  listFiles,
  writeProjectFile,
} = await import('../src/projects.js');

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('listFiles imported-folder sequential cache', () => {
  beforeEach(() => {
    counters.readdirCalls = 0;
    counters.afterReaddir = null;
  });

  it('reuses a completed imported-folder walk for an immediate sequential request', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-import-list-cache-'));
    tempRoots.push(projectsRoot);
    const importedRoot = path.join(projectsRoot, 'imported');
    await mkdir(path.join(importedRoot, 'nested'), { recursive: true });
    await writeFile(path.join(importedRoot, 'index.html'), '<!doctype html>');
    await writeFile(path.join(importedRoot, 'nested', 'app.js'), 'export {};');

    const metadata = { baseDir: importedRoot };
    const first = await listFiles(projectsRoot, 'imported-project', { metadata });
    const second = await listFiles(projectsRoot, 'imported-project', { metadata });

    expect(first.map((file: any) => file.path).sort()).toEqual(['index.html', 'nested/app.js']);
    expect(second).toEqual(first);
    expect(counters.readdirCalls).toBe(2);
  });

  it('does not serve the completed-list cache to incremental polling', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-import-list-cache-'));
    tempRoots.push(projectsRoot);
    const importedRoot = path.join(projectsRoot, 'imported');
    await mkdir(importedRoot, { recursive: true });
    await writeFile(path.join(importedRoot, 'index.html'), '<!doctype html>');

    const metadata = { baseDir: importedRoot };
    await listFiles(projectsRoot, 'imported-project', { metadata });
    const since = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(path.join(importedRoot, 'changed.js'), 'export {};');

    const changed = await listFiles(projectsRoot, 'imported-project', { metadata, since });

    expect(changed.map((file: any) => file.path)).toEqual(['changed.js']);
    expect(counters.readdirCalls).toBe(2);
  });

  it('invalidates an imported-folder snapshot after a daemon-managed write', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-import-list-cache-'));
    tempRoots.push(projectsRoot);
    const importedRoot = path.join(projectsRoot, 'imported');
    await mkdir(importedRoot, { recursive: true });
    await writeFile(path.join(importedRoot, 'index.html'), '<!doctype html>');

    const metadata = { baseDir: importedRoot };
    await listFiles(projectsRoot, 'imported-project', { metadata });
    await writeProjectFile(projectsRoot, 'imported-project', 'written.js', 'export {};', {}, metadata);

    const files = await listFiles(projectsRoot, 'imported-project', { metadata });

    expect(files.map((file: any) => file.path)).toContain('written.js');
    expect(counters.readdirCalls).toBe(2);
  });

  it('invalidates the snapshot for direct upload and copy-style writes', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-import-list-cache-'));
    tempRoots.push(projectsRoot);
    const importedRoot = path.join(projectsRoot, 'imported');
    await mkdir(importedRoot, { recursive: true });
    await writeFile(path.join(importedRoot, 'index.html'), '<!doctype html>');
    const metadata = { baseDir: importedRoot };
    await listFiles(projectsRoot, 'imported-project', { metadata });

    await writeFile(path.join(importedRoot, 'uploaded.png'), 'bytes');
    invalidateImportedProjectFileList(importedRoot);
    const files = await listFiles(projectsRoot, 'imported-project', { metadata });

    expect(files.map((file: any) => file.path)).toContain('uploaded.png');
    expect(counters.readdirCalls).toBe(2);
  });

  it('does not cache a walk that overlaps a direct mutation', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-import-list-cache-'));
    tempRoots.push(projectsRoot);
    const importedRoot = path.join(projectsRoot, 'imported');
    await mkdir(importedRoot, { recursive: true });
    await writeFile(path.join(importedRoot, 'index.html'), '<!doctype html>');
    const metadata = { baseDir: importedRoot };
    let releaseWalk!: () => void;
    const walkReleased = new Promise<void>((resolve) => { releaseWalk = resolve; });
    let markWalkStarted!: () => void;
    const walkStarted = new Promise<void>((resolve) => { markWalkStarted = resolve; });
    let blocked = false;
    counters.afterReaddir = async (filePath) => {
      if (filePath === importedRoot && !blocked) {
        blocked = true;
        markWalkStarted();
        await walkReleased;
      }
    };

    const overlappingList = listFiles(projectsRoot, 'imported-project', { metadata });
    await walkStarted;
    await writeFile(path.join(importedRoot, 'uploaded-during-walk.png'), 'bytes');
    invalidateImportedProjectFileList(importedRoot);
    releaseWalk();
    await overlappingList;
    counters.afterReaddir = null;

    const fresh = await listFiles(projectsRoot, 'imported-project', { metadata });
    expect(fresh.map((file: any) => file.path)).toContain('uploaded-during-walk.png');
    expect(counters.readdirCalls).toBe(2);
  });
});
