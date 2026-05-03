import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProjectArchive } from '../src/projects.js';

describe('buildProjectArchive', () => {
  let projectsRoot = '';
  const projectId = 'proj-archive-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-archive-'));
    const dir = path.join(projectsRoot, projectId);
    await mkdir(path.join(dir, 'ui-design', 'src'), { recursive: true });
    await mkdir(path.join(dir, 'ui-design', 'frames'), { recursive: true });
    await writeFile(path.join(dir, 'ui-design', 'index.html'), '<!doctype html>hi');
    await writeFile(path.join(dir, 'ui-design', 'src', 'app.css'), 'body{}');
    await writeFile(path.join(dir, 'ui-design', 'frames', 'phone.html'), '<frame/>');
    await writeFile(path.join(dir, 'ui-design', 'index.html.artifact.json'), '{}');
    await writeFile(path.join(dir, 'ui-design', '.hidden'), 'secret');
    await writeFile(path.join(dir, 'README.md'), '# top-level readme');
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('zips the requested subdirectory tree', async () => {
    const { buffer, baseName } = await buildProjectArchive(projectsRoot, projectId, 'ui-design');
    expect(baseName).toBe('ui-design');
    const zip = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name)
      .sort();
    expect(fileEntries).toEqual(['frames/phone.html', 'index.html', 'src/app.css']);
  });

  it('zips the whole project when no root is given', async () => {
    const { buffer, baseName } = await buildProjectArchive(projectsRoot, projectId, '');
    expect(baseName).toBe('');
    const zip = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name);
    expect(fileEntries).toContain('README.md');
    expect(fileEntries).toContain('ui-design/index.html');
    expect(fileEntries).toContain('ui-design/src/app.css');
    // dotfiles and .artifact.json sidecars are filtered, matching listFiles
    expect(fileEntries.find((n) => n.includes('.hidden'))).toBeUndefined();
    expect(fileEntries.find((n) => n.endsWith('.artifact.json'))).toBeUndefined();
  });

  it('rejects path traversal in root', async () => {
    await expect(buildProjectArchive(projectsRoot, projectId, '../foo')).rejects.toThrow();
  });

  it('throws when the root directory has no archivable files', async () => {
    const dir = path.join(projectsRoot, projectId, 'empty');
    await mkdir(dir, { recursive: true });
    await expect(buildProjectArchive(projectsRoot, projectId, 'empty')).rejects.toThrow(/empty/);
  });
});
