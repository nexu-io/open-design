import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { resolveProjectDeletePath, resolveProjectFilePath } from '../src/projects.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function root() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'od-delete-path-'));
  roots.push(directory);
  return fs.realpath(directory);
}

it('delete retry resolves a confined absent descendant while read resolution still requires bytes', async () => {
  const projects = await root();
  await fs.mkdir(path.join(projects, 'p'));
  expect(await resolveProjectDeletePath(projects, 'p', 'pages/missing.html')).toEqual({
    filePath: path.join(projects, 'p', 'pages/missing.html'), name: 'pages/missing.html',
  });
  await expect(resolveProjectFilePath(projects, 'p', 'pages/missing.html')).rejects.toMatchObject({ code: 'ENOENT' });
});

it('delete retry cannot traverse or follow a symlinked existing prefix out of its project', async () => {
  const projects = await root();
  const outside = await root();
  await fs.mkdir(path.join(projects, 'p'));
  await fs.symlink(outside, path.join(projects, 'p', 'escape'));
  await expect(resolveProjectDeletePath(projects, 'p', '../other/missing.html')).rejects.toThrow();
  await expect(resolveProjectDeletePath(projects, 'p', 'escape/missing.html')).rejects.toMatchObject({ code: 'EPATHESCAPE' });
});

it('imported-root delete retries keep the existing hidden-file policy', async () => {
  const projects = await root();
  const imported = await root();
  await expect(resolveProjectDeletePath(projects, 'p', '.private/missing.html', {
    baseDir: imported, importedFrom: 'folder',
  })).rejects.toThrow();
});
