// Phase 4 / plan §3.X1 — packPlugin().

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { x as tarExtract, t as tarList } from 'tar';
import { packPlugin, PackPluginError } from '../src/plugins/pack.js';

let folder: string;
let parent: string;

beforeEach(async () => {
  parent = await mkdtemp(path.join(os.tmpdir(), 'od-pack-'));
  folder = path.join(parent, 'my-plugin');
  await mkdir(folder, { recursive: true });
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

async function listArchiveEntries(tgz: string): Promise<string[]> {
  const out: string[] = [];
  await tarList({
    file:   tgz,
    onentry: (entry) => { out.push(entry.path); },
  });
  return out.sort();
}

describe('packPlugin', () => {
  it('writes a .tgz containing every file in the folder', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({
      name: 'my-plugin',
      version: '0.1.2',
      title: 'Test plugin',
      od: { taskKind: 'new-generation' },
    }));
    await writeFile(path.join(folder, 'SKILL.md'), '---\nname: my-plugin\n---\n# T\n');
    await mkdir(path.join(folder, 'assets'), { recursive: true });
    await writeFile(path.join(folder, 'assets', 'logo.svg'), '<svg/>');

    const result = await packPlugin({ folder });
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.pluginId).toBe('my-plugin');
    expect(result.pluginVersion).toBe('0.1.2');
    // Default output path lands beside the folder, named with the version.
    expect(path.basename(result.outPath)).toBe('my-plugin-0.1.2.tgz');
    expect(path.dirname(result.outPath)).toBe(parent);
    expect(result.files.sort()).toEqual([
      'SKILL.md', 'assets/logo.svg', 'open-design.json',
    ]);

    const entries = await listArchiveEntries(result.outPath);
    expect(entries).toEqual([
      'SKILL.md', 'assets/logo.svg', 'open-design.json',
    ]);
  });

  it('skips node_modules / .git / dist + .DS_Store noise', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
    for (const dir of ['node_modules', '.git', 'dist', 'build']) {
      await mkdir(path.join(folder, dir), { recursive: true });
      await writeFile(path.join(folder, dir, 'noise.txt'), 'x');
    }
    await writeFile(path.join(folder, '.DS_Store'), 'noise');

    const result = await packPlugin({ folder });
    const entries = await listArchiveEntries(result.outPath);
    expect(entries).toEqual(['open-design.json']);
  });

  it('skips symlinks both at walk time and at filter time', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
    await writeFile(path.join(folder, 'real.txt'), 'real');
    await symlink('real.txt', path.join(folder, 'link.txt'));

    const result = await packPlugin({ folder });
    expect(result.files).toEqual(['open-design.json', 'real.txt']);
    const entries = await listArchiveEntries(result.outPath);
    expect(entries).toEqual(['open-design.json', 'real.txt']);
  });

  it('falls back to <basename>.tgz when the manifest has no version', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'plain' }));
    const result = await packPlugin({ folder });
    expect(path.basename(result.outPath)).toBe('my-plugin.tgz');
  });

  it('honours an explicit --out path', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
    const out = path.join(parent, 'somewhere', 'my-plugin.tgz');
    await mkdir(path.dirname(out), { recursive: true });
    const result = await packPlugin({ folder, out });
    expect(result.outPath).toBe(out);
  });

  it('round-trips through tar.extract: archive contents match the source tree', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'rt', version: '0.0.1' }));
    await writeFile(path.join(folder, 'SKILL.md'), '# RT\n');
    await mkdir(path.join(folder, 'assets'), { recursive: true });
    await writeFile(path.join(folder, 'assets', 'a.txt'), 'aaa');
    const result = await packPlugin({ folder });

    const dest = path.join(parent, 'extracted');
    await mkdir(dest, { recursive: true });
    await tarExtract({ file: result.outPath, cwd: dest });

    expect((await readFile(path.join(dest, 'open-design.json'), 'utf8')).includes('rt')).toBe(true);
    expect(await readFile(path.join(dest, 'SKILL.md'), 'utf8')).toBe('# RT\n');
    expect(await readFile(path.join(dest, 'assets', 'a.txt'), 'utf8')).toBe('aaa');
  });

  it('rejects a folder without open-design.json', async () => {
    await writeFile(path.join(folder, 'SKILL.md'), '---\nname: p\n---\n');
    await expect(packPlugin({ folder })).rejects.toBeInstanceOf(PackPluginError);
  });

  it('rejects a folder whose open-design.json is malformed JSON', async () => {
    await writeFile(path.join(folder, 'open-design.json'), '{ broken');
    await expect(packPlugin({ folder })).rejects.toBeInstanceOf(PackPluginError);
  });

  it('does not pack the output archive itself when --out lands inside the folder', async () => {
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'p', version: '0.0.1' }));
    await writeFile(path.join(folder, 'a.txt'), 'a');
    const out = path.join(folder, 'self.tgz');
    const result = await packPlugin({ folder, out });
    expect(result.files).toEqual(['a.txt', 'open-design.json']);
    const entries = await listArchiveEntries(result.outPath);
    expect(entries).toEqual(['a.txt', 'open-design.json']);
  });
});
