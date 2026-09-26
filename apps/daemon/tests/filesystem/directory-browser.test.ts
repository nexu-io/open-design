import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalBrowseRoots, listBrowseDirectories } from '../../src/filesystem/directory-browser.js';

describe('directory browser boundary', () => {
  let temp: string | undefined;
  afterEach(async () => { if (temp) await rm(temp, { recursive: true, force: true }); temp = undefined; });
  it('lists only directory names, sorted naturally, and permits upward navigation within root', async () => {
    temp = await mkdtemp(join(tmpdir(), 'od-browser-'));
    await mkdir(join(temp, 'folder10')); await mkdir(join(temp, 'folder2')); await writeFile(join(temp, 'secret.txt'), 'hidden');
    const root = await realpath(temp);
    const listing = await listBrowseDirectories(root, [root]);
    expect(listing.directories.map((entry) => entry.name)).toEqual(['folder2', 'folder10']);
    expect(listing).not.toHaveProperty('files');
    expect((await listBrowseDirectories(join(root, 'folder2'), [root])).parent).toBe(root);
    expect((await listBrowseDirectories(root, [root])).parent).toBeNull();
  });
  it('rejects traversal and outside paths', async () => {
    temp = await mkdtemp(join(tmpdir(), 'od-browser-'));
    const root = join(temp, 'allowed'); const outside = join(temp, 'outside');
    await mkdir(root); await mkdir(outside);
    await expect(listBrowseDirectories(join(root, '..', 'outside'), [await realpath(root)])).rejects.toMatchObject({ status: 403 });
    await expect(listBrowseDirectories(await realpath(outside), [await realpath(root)])).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a symlink escape and missing or non-directory paths', async () => {
    temp = await mkdtemp(join(tmpdir(), 'od-browser-'));
    const root = join(temp, 'allowed'); const outside = join(temp, 'outside');
    await mkdir(root); await mkdir(outside); await mkdir(join(outside, 'private'));
    await symlink(outside, join(root, 'escape'));
    const canonicalRoot = await realpath(root);
    await expect(listBrowseDirectories(join(root, 'escape'), [canonicalRoot])).rejects.toMatchObject({ status: 403 });
    await expect(listBrowseDirectories(join(canonicalRoot, 'missing'), [canonicalRoot])).rejects.toMatchObject({ status: 404 });
    await writeFile(join(root, 'file'), 'x');
    await expect(listBrowseDirectories(join(canonicalRoot, 'file'), [canonicalRoot])).rejects.toMatchObject({ status: 400 });
  });
  it('canonicalizes configured roots and drops missing roots', async () => {
    temp = await mkdtemp(join(tmpdir(), 'od-browser-'));
    const root = await realpath(temp);
    expect(await canonicalBrowseRoots([root, join(temp, 'missing')].join(delimiter))).toEqual([root]);
  });
});
