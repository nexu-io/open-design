import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import { stageAmrImagePaths } from '../../src/media/amr-image-staging.js';

const temporaryRoots: string[] = [];
const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'od-amr-staging-containment-')));
  temporaryRoots.push(root);
  const project = path.join(root, 'project');
  const uploads = path.join(root, 'uploads');
  const outside = path.join(root, 'outside');
  await Promise.all([mkdir(project), mkdir(uploads), mkdir(outside)]);
  const input = path.join(uploads, 'image.png');
  await writeFile(input, 'uploaded image bytes');
  return { root, project, uploads, outside, input };
}

async function oldFile(directory: string, name: string) {
  const file = path.join(directory, name);
  await writeFile(file, 'existing file bytes');
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(file, old, old);
  return file;
}

for (const targetLocation of ['outside', 'inside'] as const) {
  test(`rejects a staging directory link ${targetLocation} the workspace before pruning or copying`, async () => {
    const { project, uploads, outside, input } = await fixture();
    const target = targetLocation === 'outside' ? outside : path.join(project, 'authored-assets');
    if (targetLocation === 'inside') await mkdir(target);
    const existing = await oldFile(target, 'keep.txt');
    const staging = path.join(project, '.amr-attachments');
    await symlink(target, staging, directoryLinkType);

    const result = await stageAmrImagePaths(project, [input], uploads).catch((error: unknown) => error);

    expect(await readFile(existing, 'utf8')).toBe('existing file bytes');
    expect(await readdir(target)).toEqual(['keep.txt']);
    expect((await lstat(staging)).isSymbolicLink()).toBe(true);
    expect(result).toBeInstanceOf(Error);
  });
}

test('retains normal staging and removes only expired files from the real staging directory', async () => {
  const { project, uploads, outside, input } = await fixture();
  const staging = path.join(project, '.amr-attachments');
  await mkdir(staging);
  await oldFile(staging, 'expired.png');
  await writeFile(path.join(staging, 'recent.png'), 'recent image');
  const unrelated = await oldFile(outside, 'keep.txt');

  const staged = await stageAmrImagePaths(project, [input], uploads);

  expect(staged).toHaveLength(1);
  expect(path.dirname(staged[0]!)).toBe(await realpath(staging));
  expect(await readFile(staged[0]!, 'utf8')).toBe('uploaded image bytes');
  expect((await readdir(staging)).sort()).toEqual([path.basename(staged[0]!), 'recent.png'].sort());
  expect(await readFile(unrelated, 'utf8')).toBe('existing file bytes');
});

test('allows concurrent calls to create and use the same real staging directory', async () => {
  const { project, uploads, input } = await fixture();
  const second = path.join(uploads, 'second.png');
  await writeFile(second, 'second image bytes');

  const [firstPaths, secondPaths] = await Promise.all([
    stageAmrImagePaths(project, [input], uploads),
    stageAmrImagePaths(project, [second], uploads),
  ]);

  expect(firstPaths).toHaveLength(1);
  expect(secondPaths).toHaveLength(1);
  expect(await readFile(firstPaths[0]!, 'utf8')).toBe('uploaded image bytes');
  expect(await readFile(secondPaths[0]!, 'utf8')).toBe('second image bytes');
  expect(await readdir(path.join(project, '.amr-attachments'))).toHaveLength(2);
});

test('supports a symlinked project root while keeping its staging directory real', async () => {
  const { root, project, uploads, input } = await fixture();
  const alias = path.join(root, 'project-alias');
  await symlink(project, alias, directoryLinkType);

  const staged = await stageAmrImagePaths(alias, [input], uploads);

  expect(staged).toHaveLength(1);
  expect(await realpath(path.dirname(staged[0]!))).toBe(path.join(await realpath(project), '.amr-attachments'));
  expect((await lstat(path.join(project, '.amr-attachments'))).isDirectory()).toBe(true);
  expect(await readFile(staged[0]!, 'utf8')).toBe('uploaded image bytes');
});

test('keeps a file occupying the staging path intact', async () => {
  const { project, uploads, input } = await fixture();
  const staging = path.join(project, '.amr-attachments');
  await writeFile(staging, 'existing file bytes');

  await expect(stageAmrImagePaths(project, [input], uploads)).rejects.toThrow();

  expect(await readFile(staging, 'utf8')).toBe('existing file bytes');
});

test('rejects a dangling staging directory link without creating its target', async () => {
  const { project, uploads, outside, input } = await fixture();
  const target = path.join(outside, 'missing');
  const staging = path.join(project, '.amr-attachments');
  await symlink(target, staging, directoryLinkType);

  await expect(stageAmrImagePaths(project, [input], uploads)).rejects.toThrow();

  expect((await lstat(staging)).isSymbolicLink()).toBe(true);
  expect(await readdir(outside)).toEqual([]);
});

test('keeps existing in-project image paths unchanged', async () => {
  const { project } = await fixture();
  const image = path.join(project, 'existing.png');
  await writeFile(image, 'existing image');

  expect(await stageAmrImagePaths(project, [image])).toEqual([await realpath(image)]);
  expect(await readdir(path.join(project, '.amr-attachments'))).toEqual([]);
});

test('does not prune linked files inside a legitimate staging directory', async () => {
  const { project, uploads, outside, input } = await fixture();
  const staging = path.join(project, '.amr-attachments');
  await mkdir(staging);
  const existing = await oldFile(outside, 'keep.txt');
  const link = path.join(staging, 'linked.png');
  await symlink(existing, link);

  expect(await stageAmrImagePaths(project, [input], uploads)).toHaveLength(1);

  expect(await readFile(existing, 'utf8')).toBe('existing file bytes');
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
});
