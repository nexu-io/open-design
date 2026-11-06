import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { __forTestReadProjectPluginManifest } from '../src/plugins/share-helpers.js';

describe('readProjectPluginManifest', () => {
  async function withManifest(name: string, fn: (folder: string) => Promise<void>) {
    const folder = await mkdtemp(path.join(tmpdir(), 'od-plugin-manifest-'));
    try {
      await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name }), 'utf8');
      await fn(folder);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  it.each(['../evil', '..\\\\evil', '.', '..'])('rejects unsafe manifest name %s', async (name) => {
    await withManifest(name, async (folder) => {
      await expect(__forTestReadProjectPluginManifest(folder)).rejects.toThrow(
        /must not contain path separators or consist only of dots/,
      );
    });
  });

  it('allows ordinary plugin names with dots', async () => {
    await withManifest('my-plugin.v2', async (folder) => {
      await expect(__forTestReadProjectPluginManifest(folder)).resolves.toMatchObject({
        name: 'my-plugin.v2',
      });
    });
  });
});
