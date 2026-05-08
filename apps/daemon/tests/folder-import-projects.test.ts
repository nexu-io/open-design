import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectEntryFile, listFiles, resolveProjectDir } from '../src/projects.js';

describe('resolveProjectDir', () => {
  const projectsRoot = '/var/od/projects';
  const projectId = 'proj-abc';

  it('returns the standard path when no metadata is given', () => {
    expect(resolveProjectDir(projectsRoot, projectId)).toBe(
      path.join(projectsRoot, projectId),
    );
  });

  it('returns the standard path when metadata has no baseDir', () => {
    expect(resolveProjectDir(projectsRoot, projectId, { kind: 'prototype' })).toBe(
      path.join(projectsRoot, projectId),
    );
  });

  it('returns metadata.baseDir when set to an absolute path', () => {
    const baseDir = '/Users/me/projects/site';
    expect(
      resolveProjectDir(projectsRoot, projectId, { kind: 'prototype', baseDir }),
    ).toBe(path.normalize(baseDir));
  });

  it('falls back to the standard path when baseDir is relative', () => {
    expect(
      resolveProjectDir(projectsRoot, projectId, {
        kind: 'prototype',
        baseDir: 'relative/site',
      }),
    ).toBe(path.join(projectsRoot, projectId));
  });

  it('throws on an invalid project id only when no baseDir is set', () => {
    // No baseDir → relies on isSafeId
    expect(() => resolveProjectDir(projectsRoot, '../escape')).toThrowError();

    // baseDir present → project id is not consulted, so a bogus id is fine
    expect(() =>
      resolveProjectDir(projectsRoot, '../escape', {
        kind: 'prototype',
        baseDir: '/Users/me/site',
      }),
    ).not.toThrow();
  });
});

describe('detectEntryFile', () => {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'od-detect-entry-'));
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns index.html when present at the root', async () => {
    await writeFile(path.join(dir, 'index.html'), '<!doctype html>');
    await writeFile(path.join(dir, 'about.html'), '<!doctype html>');
    expect(await detectEntryFile(dir)).toBe('index.html');
  });

  it('returns the first .html file when no index.html is present', async () => {
    await writeFile(path.join(dir, 'about.html'), '<!doctype html>');
    const result = await detectEntryFile(dir);
    expect(result).toBe('about.html');
  });

  it('returns null when the folder has no html files', async () => {
    await writeFile(path.join(dir, 'README.md'), '# hi');
    expect(await detectEntryFile(dir)).toBeNull();
  });

  it('returns null when the folder does not exist', async () => {
    const missing = path.join(dir, 'no-such-subdir');
    expect(await detectEntryFile(missing)).toBeNull();
  });

  it('does not descend into subdirectories', async () => {
    await mkdir(path.join(dir, 'public'));
    await writeFile(path.join(dir, 'public', 'index.html'), '<!doctype html>');
    expect(await detectEntryFile(dir)).toBeNull();
  });
});

describe('listFiles with metadata.baseDir', () => {
  let baseDir = '';

  beforeEach(async () => {
    baseDir = mkdtempSync(path.join(tmpdir(), 'od-list-'));
    await writeFile(path.join(baseDir, 'index.html'), '<!doctype html>');
    await writeFile(path.join(baseDir, 'app.css'), 'body{}');
    await mkdir(path.join(baseDir, 'node_modules', 'react'), { recursive: true });
    await writeFile(path.join(baseDir, 'node_modules', 'react', 'index.js'), '');
    await mkdir(path.join(baseDir, '.git'));
    await writeFile(path.join(baseDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    await mkdir(path.join(baseDir, 'dist'));
    await writeFile(path.join(baseDir, 'dist', 'bundle.js'), '/*compiled*/');
    await mkdir(path.join(baseDir, 'src'));
    await writeFile(path.join(baseDir, 'src', 'app.ts'), 'export {}');
  });

  afterEach(() => {
    if (baseDir) rmSync(baseDir, { recursive: true, force: true });
  });

  it('walks the folder rooted at metadata.baseDir', async () => {
    const files = await listFiles('/unused/projects', 'unused-id', {
      metadata: { kind: 'prototype', baseDir },
    });
    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain('index.html');
    expect(paths).toContain('app.css');
    expect(paths).toContain('src/app.ts');
  });

  // Regression: callers that pass the metadata object directly as opts
  // (instead of wrapping it in `{ metadata }`) were silently scanning the
  // standard .od/projects/<id>/ instead of the imported folder. Codex
  // review of #624 caught one in chat-route. Lock the contract: when a
  // bare metadata object is passed at the top level, listFiles must
  // ignore it and fall back to the standard project dir — no false
  // positives on a folder the caller didn't ask for.
  it('ignores bare metadata at opts top-level (must be opts.metadata)', async () => {
    // Pass the metadata object directly as opts. With the documented
    // contract this means opts.metadata is undefined, so listFiles
    // resolves to projectsRoot/projectId — which here doesn't exist,
    // so the result must be an empty array, not the contents of baseDir.
    const files = await listFiles('/unused/projects', 'unused-id', {
      kind: 'prototype',
      baseDir,
    } as never);
    expect(files).toEqual([]);
  });

  it('skips conventional build / install dirs (node_modules, .git, dist)', async () => {
    const files = await listFiles('/unused/projects', 'unused-id', {
      metadata: { kind: 'prototype', baseDir },
    });
    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.git/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('dist/'))).toBe(false);
  });

  it('does not skip those dirs for non-baseDir projects (back-compat)', async () => {
    // Without metadata.baseDir, listFiles points at the standard project dir.
    // We don't have one set up for this test — just assert the call doesn't
    // *apply* the skip filter when the metadata is absent. We check this
    // indirectly: passing the same baseDir as a non-baseDir directory
    // (impossible here since listFiles uses standard path). So instead,
    // verify the default path behavior is unchanged: no metadata, no
    // skipDirs, no baseDir resolution.
    const standardDir = mkdtempSync(path.join(tmpdir(), 'od-list-std-'));
    try {
      await mkdir(path.join(standardDir, 'std-project'), { recursive: true });
      await mkdir(path.join(standardDir, 'std-project', 'node_modules'));
      await writeFile(path.join(standardDir, 'std-project', 'node_modules', 'a.js'), '');
      await writeFile(path.join(standardDir, 'std-project', 'main.html'), '');

      const files = await listFiles(standardDir, 'std-project');
      const paths = files.map((f) => f.path).sort();
      // node_modules contents *do* appear when no skip filter is applied
      expect(paths).toContain('main.html');
      expect(paths).toContain('node_modules/a.js');
    } finally {
      rmSync(standardDir, { recursive: true, force: true });
    }
  });
});
