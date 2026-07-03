import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { browseProjectLocationFolders } from '../src/project-location-browser.js';

describe('browseProjectLocationFolders', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'od-project-location-browser-'));
    tempDirs.push(root);
    return root;
  }

  it('lists child directories under the configured browsing root', async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, '.config'), { recursive: true });
    await mkdir(path.join(root, 'forge', 'design'), { recursive: true });
    await writeFile(path.join(root, 'readme.txt'), 'not a directory');

    const home = await browseProjectLocationFolders(null, { rootPath: root });
    expect(home.path).toBe(await realpath(root));
    expect(home.parentPath).toBeNull();
    expect(home.entries).toEqual([
      { name: 'forge', path: path.join(root, 'forge') },
      { name: '.config', path: path.join(root, '.config') },
    ]);

    const forge = await browseProjectLocationFolders(path.join(root, 'forge'), { rootPath: root });
    expect(forge.parentPath).toBe(await realpath(root));
    expect(forge.entries).toEqual([{ name: 'design', path: path.join(root, 'forge', 'design') }]);
  });

  it('rejects folders outside the configured browsing root', async () => {
    const root = await makeRoot();

    await expect(browseProjectLocationFolders(path.dirname(root), { rootPath: root }))
      .rejects.toThrow('outside the browsing root');
  });
});
