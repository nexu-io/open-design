import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolvePluginFolder } from '../../../src/plugins/registry.js';
import { createBundledStrategyBindingV2 } from '../../../src/plugins/strategy-package.js';
import {
  InvalidOdNextDeviceFrameRootError,
  OD_NEXT_DEVICE_FRAME_MANIFEST,
  loadOdNextTaskResourcesForSnapshot,
  materializeOdNextDeviceFrames,
  observeOdNextDeviceShell,
} from '../../../src/strategies/od-next/device-frames.js';

const BUNDLED_PLUGINS_DIR = path.resolve(import.meta.dirname, '../../../../../plugins/_official');

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

async function projectDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-device-frames-'));
  temporaryRoots.push(dir);
  return dir;
}

const SHELLS = [
  { path: './assets/task-profiles/prototype/device-frames/iphone.html', text: '<div data-phone-shell data-platform="iphone"><main class="phone-content">iphone</main></div>' },
  { path: './assets/task-profiles/prototype/device-frames/android.html', text: '<div data-phone-shell data-platform="android"><main class="phone-content">android</main></div>' },
  { path: './assets/task-profiles/prototype/device-frames/neutral.html', text: '<div data-phone-shell data-platform="neutral"><main class="phone-content">neutral</main></div>' },
  { path: './assets/task-profiles/prototype/notes.md', text: 'not a shell' },
];

describe('materializeOdNextDeviceFrames', () => {
  it('stages the shells under .od-frames, records ownership, and leaves unrelated files alone', async () => {
    const cwd = await projectDir();
    await mkdir(path.join(cwd, '.od-frames'), { recursive: true });
    await writeFile(path.join(cwd, '.od-frames', 'leftover.html'), 'user content that predates this feature');

    const result = await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });

    expect(result).toEqual({
      staged: ['.od-frames/android.html', '.od-frames/iphone.html', '.od-frames/neutral.html'],
      skipped: [],
    });
    expect((await readdir(path.join(cwd, '.od-frames'))).sort()).toEqual([
      OD_NEXT_DEVICE_FRAME_MANIFEST,
      'android.html',
      'iphone.html',
      'leftover.html',
      'neutral.html',
    ]);
    expect(await readFile(path.join(cwd, '.od-frames', 'leftover.html'), 'utf8'))
      .toBe('user content that predates this feature');
    const manifest = JSON.parse(await readFile(path.join(cwd, '.od-frames', OD_NEXT_DEVICE_FRAME_MANIFEST), 'utf8'));
    expect(Object.keys(manifest.files).sort()).toEqual(['android.html', 'iphone.html', 'neutral.html']);
  });

  it('replaces only files it staged before and retires a shell the package stopped shipping', async () => {
    const cwd = await projectDir();
    await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });

    const updated = SHELLS.map((shell) => (shell.path.endsWith('iphone.html')
      ? { ...shell, text: '<div data-phone-shell data-platform="iphone"><main class="phone-content">iphone v2</main></div>' }
      : shell)).filter((shell) => !shell.path.endsWith('neutral.html'));
    const result = await materializeOdNextDeviceFrames({ cwd, resources: updated });

    expect(result.staged).toEqual(['.od-frames/android.html', '.od-frames/iphone.html']);
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toContain('iphone v2');
    await expect(lstat(path.join(cwd, '.od-frames', 'neutral.html'))).rejects.toThrow();
  });

  it('never overwrites or deletes a file under a managed name that it did not create', async () => {
    const cwd = await projectDir();
    await mkdir(path.join(cwd, '.od-frames'), { recursive: true });
    await writeFile(path.join(cwd, '.od-frames', 'iphone.html'), 'the user\'s own iphone frame');

    const first = await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });
    expect(first).toEqual({
      staged: ['.od-frames/android.html', '.od-frames/neutral.html'],
      skipped: ['.od-frames/iphone.html'],
    });
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe('the user\'s own iphone frame');

    // A later staging that no longer ships the neutral shell still cannot touch
    // the user's file, and a staged file the user edited since is not retired.
    await writeFile(path.join(cwd, '.od-frames', 'neutral.html'), 'edited by the user after staging');
    const second = await materializeOdNextDeviceFrames({
      cwd,
      resources: SHELLS.filter((shell) => !shell.path.endsWith('neutral.html')),
    });
    expect(second.skipped).toEqual(['.od-frames/iphone.html']);
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe('the user\'s own iphone frame');
    expect(await readFile(path.join(cwd, '.od-frames', 'neutral.html'), 'utf8')).toBe('edited by the user after staging');
  });

  it('hands a staged shell back to the user once they edit it', async () => {
    const cwd = await projectDir();
    await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });

    const edited = '<div data-phone-shell data-platform="iphone"><main class="phone-content">my own bezel</main></div>';
    await writeFile(path.join(cwd, '.od-frames', 'iphone.html'), edited);

    // The package still ships iphone.html, so this is the replacement path —
    // not the retirement path the previous test covers.
    const second = await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });
    expect(second).toEqual({
      staged: ['.od-frames/android.html', '.od-frames/neutral.html'],
      skipped: ['.od-frames/iphone.html'],
    });
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe(edited);

    // The edit drops the name out of the manifest, so it stays the user's on
    // every later staging too.
    const manifest = JSON.parse(await readFile(path.join(cwd, '.od-frames', OD_NEXT_DEVICE_FRAME_MANIFEST), 'utf8'));
    expect(Object.keys(manifest.files).sort()).toEqual(['android.html', 'neutral.html']);
    const third = await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });
    expect(third.skipped).toEqual(['.od-frames/iphone.html']);
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe(edited);
  });

  it('leaves the whole directory alone when the control file name is already taken', async () => {
    const cwd = await projectDir();
    await mkdir(path.join(cwd, '.od-frames'), { recursive: true });
    const foreignManifest = '{"note":"an unrelated file that happens to share the name"}\n';
    await writeFile(path.join(cwd, '.od-frames', OD_NEXT_DEVICE_FRAME_MANIFEST), foreignManifest);
    await writeFile(path.join(cwd, '.od-frames', 'iphone.html'), 'the user\'s own iphone frame');

    const result = await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });

    expect(result).toEqual({
      staged: [],
      skipped: [
        `.od-frames/${OD_NEXT_DEVICE_FRAME_MANIFEST}`,
        '.od-frames/android.html',
        '.od-frames/iphone.html',
        '.od-frames/neutral.html',
      ].sort(),
    });
    expect(await readFile(path.join(cwd, '.od-frames', OD_NEXT_DEVICE_FRAME_MANIFEST), 'utf8'))
      .toBe(foreignManifest);
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe('the user\'s own iphone frame');
    expect((await readdir(path.join(cwd, '.od-frames'))).sort())
      .toEqual([OD_NEXT_DEVICE_FRAME_MANIFEST, 'iphone.html']);
  });

  it('refuses a same-schema manifest that claims a file it would never stage', async () => {
    const cwd = await projectDir();
    await mkdir(path.join(cwd, '.od-frames'), { recursive: true });
    const unrelated = 'a project file that has nothing to do with device shells';
    await writeFile(path.join(cwd, '.od-frames', 'leftover.html'), unrelated);
    // Well-formed on our own schema, and the digest really is this file's — the
    // only thing wrong with it is that `leftover.html` is not a name this
    // materializer can ever stage, so it must not become a deletion target.
    const forged = `${JSON.stringify({
      schema: 'open-design.od-next-device-frames/v1',
      files: { 'leftover.html': createHash('sha256').update(unrelated, 'utf8').digest('hex') },
    }, null, 2)}\n`;
    await writeFile(path.join(cwd, '.od-frames', OD_NEXT_DEVICE_FRAME_MANIFEST), forged);

    const result = await materializeOdNextDeviceFrames({ cwd, resources: SHELLS });

    expect(result).toEqual({
      staged: [],
      skipped: [
        `.od-frames/${OD_NEXT_DEVICE_FRAME_MANIFEST}`,
        '.od-frames/android.html',
        '.od-frames/iphone.html',
        '.od-frames/neutral.html',
      ].sort(),
    });
    expect(await readFile(path.join(cwd, '.od-frames', 'leftover.html'), 'utf8')).toBe(unrelated);
    expect(await readFile(path.join(cwd, '.od-frames', OD_NEXT_DEVICE_FRAME_MANIFEST), 'utf8')).toBe(forged);
    expect((await readdir(path.join(cwd, '.od-frames'))).sort())
      .toEqual([OD_NEXT_DEVICE_FRAME_MANIFEST, 'leftover.html']);
  });

  it('is a no-op without shells and refuses a symlinked staging root', async () => {
    const cwd = await projectDir();
    expect(await materializeOdNextDeviceFrames({ cwd, resources: [SHELLS[3]!] })).toEqual({ staged: [], skipped: [] });
    await expect(lstat(path.join(cwd, '.od-frames'))).rejects.toThrow();

    const outside = await projectDir();
    await symlink(outside, path.join(cwd, '.od-frames'));
    await expect(materializeOdNextDeviceFrames({ cwd, resources: SHELLS }))
      .rejects.toThrow(InvalidOdNextDeviceFrameRootError);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe('loadOdNextTaskResourcesForSnapshot', () => {
  it('re-reads the bundled prototype shells through the applied binding and stays empty elsewhere', async () => {
    const folder = path.join(BUNDLED_PLUGINS_DIR, 'scenarios', 'od-next-strategy');
    const resolved = await resolvePluginFolder({
      folder,
      folderId: 'od-next-strategy',
      sourceKind: 'bundled',
      source: folder,
      trust: 'bundled',
    });
    if (!resolved.ok) throw new Error(resolved.errors.join('; '));

    const prototype = await loadOdNextTaskResourcesForSnapshot({
      bundledPluginsDir: BUNDLED_PLUGINS_DIR,
      snapshot: {
        pluginId: 'od-next-strategy',
        strategy: createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'prototype' }),
      },
    });
    expect(prototype.map((resource) => path.posix.basename(resource.path))).toEqual([
      'iphone.html',
      'android.html',
      'neutral.html',
    ]);

    expect(await loadOdNextTaskResourcesForSnapshot({
      bundledPluginsDir: BUNDLED_PLUGINS_DIR,
      snapshot: {
        pluginId: 'od-next-strategy',
        strategy: createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'ppt' }),
      },
    })).toEqual([]);
    expect(await loadOdNextTaskResourcesForSnapshot({
      bundledPluginsDir: BUNDLED_PLUGINS_DIR,
      snapshot: { pluginId: 'example-mobile-app', strategy: undefined } as never,
    })).toEqual([]);
    expect(await loadOdNextTaskResourcesForSnapshot({ bundledPluginsDir: BUNDLED_PLUGINS_DIR, snapshot: null }))
      .toEqual([]);
  });
});

describe('observeOdNextDeviceShell', () => {
  it('reports whether the delivered entry kept the handset shell', async () => {
    const projectRoot = await projectDir();
    await writeFile(path.join(projectRoot, 'index.html'), SHELLS[0]!.text);
    await writeFile(path.join(projectRoot, 'bare.html'), '<div class="card" style="border-radius:24px"></div>');
    const resolution = { platform: 'ios' as const, resolvedFrom: 'request-text' as const };

    expect(await observeOdNextDeviceShell({ projectRoot, entryFile: 'index.html', resolution })).toEqual({
      platform: 'ios',
      resolvedFrom: 'request-text',
      entryFile: 'index.html',
      shellPresent: true,
    });
    expect(await observeOdNextDeviceShell({ projectRoot, entryFile: 'bare.html', resolution })).toEqual(
      expect.objectContaining({ shellPresent: false }),
    );
  });

  it('observes nothing without a resolution, without an entry, or for a path outside the project', async () => {
    const projectRoot = await projectDir();
    await writeFile(path.join(projectRoot, 'index.html'), SHELLS[0]!.text);
    const resolution = { platform: 'ios' as const, resolvedFrom: 'request-text' as const };
    expect(await observeOdNextDeviceShell({ projectRoot, entryFile: 'index.html', resolution: null })).toBeNull();
    expect(await observeOdNextDeviceShell({ projectRoot, entryFile: null, resolution })).toBeNull();
    expect(await observeOdNextDeviceShell({ projectRoot, entryFile: 'missing.html', resolution })).toBeNull();
    expect(await observeOdNextDeviceShell({ projectRoot, entryFile: '../outside.html', resolution })).toBeNull();
  });
});
