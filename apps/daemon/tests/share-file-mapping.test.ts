import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildDeployFilePlan } from '../src/deploy.js';
import { createShareFileMapping, publishedPathForSource, sourcePathForPublished } from '../src/collab/share-file-mapping.js';
it('derives nested entry and dependency paths from the actual planner, with no mapping for absent resources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-share-mapping-'));
  try {
    await mkdir(join(root, 'p/pages'), { recursive: true });
    await writeFile(join(root, 'p/pages/entry.html'), '<link rel="stylesheet" href="style.css"><img src="missing.png">');
    await writeFile(join(root, 'p/pages/style.css'), 'body{color:red}');
    const plan = await buildDeployFilePlan(root, 'p', 'pages/entry.html', { hookScriptUrl: '', assetUrlPolicy: 'share-relative' });
    const mapping = createShareFileMapping(plan.files);
    expect(publishedPathForSource(mapping, plan.entryPath)).toBe('index.html');
    expect(sourcePathForPublished(mapping, 'index.html')).toBe('pages/entry.html');
    expect(publishedPathForSource(mapping, 'pages/style.css')).toBe('pages/style.css');
    expect(publishedPathForSource(mapping, 'pages/missing.png')).toBeNull();
    expect(sourcePathForPublished(mapping, 'unrelated.html')).toBeNull();
    expect(Object.isFrozen(mapping)).toBe(true); expect(Object.isFrozen(mapping[0])).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('does not invent the root entry rule and rejects ambiguous or unsafe pairs', () => {
  expect(publishedPathForSource(createShareFileMapping([{ sourcePath: 'a.html', file: 'custom.html' }]), 'a.html')).toBe('custom.html');
  for (const files of [
    [{ file: 'index.html' }],
    [{ sourcePath: '../a', file: 'index.html' }],
    [{ sourcePath: 'a', file: '/index.html' }],
    [{ sourcePath: 'a', file: 'index.html' }, { sourcePath: 'b', file: 'index.html' }],
    [{ sourcePath: 'a', file: 'one' }, { sourcePath: 'a', file: 'two' }],
  ]) expect(() => createShareFileMapping(files)).toThrow('SHARE_FILE_MAPPING_INVALID');
  const ambiguous = [{ sourcePath: 'a', publishedPath: 'one' }, { sourcePath: 'a', publishedPath: 'two' }];
  expect(publishedPathForSource(ambiguous, 'a')).toBeNull();
});
