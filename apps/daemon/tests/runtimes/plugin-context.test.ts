import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyPluginFolderForProjectContext } from '../../src/runtimes/plugin-context.js';

describe('plugin context copier', () => {
  it('copies source files while excluding generated and platform metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-plugin-context-'));
    const source = path.join(root, 'source');
    const destination = path.join(root, 'destination');
    await fs.mkdir(path.join(source, 'src'), { recursive: true });
    await fs.mkdir(path.join(source, 'node_modules', 'ignored'), { recursive: true });
    await fs.mkdir(path.join(source, 'dist'), { recursive: true });
    await fs.writeFile(path.join(source, 'src', 'index.ts'), 'export const ok = true;');
    await fs.writeFile(path.join(source, 'node_modules', 'ignored', 'package.js'), 'ignored');
    await fs.writeFile(path.join(source, 'dist', 'index.js'), 'ignored');
    await fs.writeFile(path.join(source, '.DS_Store'), 'ignored');

    await copyPluginFolderForProjectContext(source, destination);

    await expect(fs.readFile(path.join(destination, 'src', 'index.ts'), 'utf8')).resolves.toBe('export const ok = true;');
    await expect(fs.access(path.join(destination, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(destination, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(destination, '.DS_Store'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a source path that is not a directory with the compatibility error code', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-plugin-context-'));
    const source = path.join(root, 'plugin.txt');
    await fs.writeFile(source, 'not a plugin directory');

    await expect(copyPluginFolderForProjectContext(source, path.join(root, 'destination')))
      .rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});
