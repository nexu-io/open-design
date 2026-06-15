import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertSandboxProjectRootAvailable,
  detectEntryFile,
  listFiles,
  resolveProjectDir,
  SandboxImportedProjectError,
} from '../src/projects.js';

function withSandboxMode<T>(run: () => T): T {
  const previous = process.env.OD_SANDBOX_MODE;
  process.env.OD_SANDBOX_MODE = '1';
  try {
    return run();
  } finally {
    if (previous == null) delete process.env.OD_SANDBOX_MODE;
    else process.env.OD_SANDBOX_MODE = previous;
  }
}

function withSandboxImportAllowedRoots<T>(roots: string[], run: () => T): T {
  const previous = process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS;
  process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS = roots.join(path.delimiter);
  try {
    return run();
  } finally {
    if (previous == null) delete process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS;
    else process.env.OD_SANDBOX_IMPORT_ALLOWED_ROOTS = previous;
  }
}

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

  it('rejects metadata.baseDir in sandbox mode before resolving a project file root', () => {
    withSandboxMode(() => {
      const baseDir = '/Users/me/projects/site';
      expect(
        () => resolveProjectDir(projectsRoot, projectId, { kind: 'prototype', baseDir }),
      ).toThrowError(SandboxImportedProjectError);
      expect(() =>
        assertSandboxProjectRootAvailable({ kind: 'prototype', baseDir }),
      ).toThrowError(SandboxImportedProjectError);
      expect(() => resolveProjectDir(projectsRoot, '../escape', {
        kind: 'prototype',
        baseDir,
      })).toThrowError();
    });
  });

  it('uses metadata.baseDir in sandbox mode when it is under an allowed import root', () => {
    withSandboxMode(() => {
      const baseDir = '/Users/me/scratch/od-clone/job-1';
      withSandboxImportAllowedRoots(['/Users/me/scratch/od-clone'], () => {
        expect(
          resolveProjectDir(projectsRoot, projectId, { kind: 'prototype', baseDir }),
        ).toBe(path.normalize(baseDir));
        expect(() =>
          assertSandboxProjectRootAvailable({ kind: 'prototype', baseDir }),
        ).not.toThrow();
      });
    });
  });

  it('rejects relative sandbox import allowed roots', () => {
    withSandboxMode(() => {
      const baseDir = path.join(path.parse(process.cwd()).root, 'tmp', 'od-clone', 'job-1');
      withSandboxImportAllowedRoots(['tmp'], () => {
        expect(() =>
          assertSandboxProjectRootAvailable({ kind: 'prototype', baseDir }),
        ).toThrowError(/OD_SANDBOX_IMPORT_ALLOWED_ROOTS.*absolute/i);
      });
    });
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
    await mkdir(path.join(baseDir, 'Build', 'DerivedData-KeeTests'), { recursive: true });
    await writeFile(path.join(baseDir, 'Build', 'DerivedData-KeeTests', 'index-store'), '');
    await mkdir(path.join(baseDir, 'vendor', 'package'), { recursive: true });
    await writeFile(path.join(baseDir, 'vendor', 'package', 'generated.js'), '');
    await mkdir(path.join(baseDir, 'Rust', 'KeePassCore', 'target', 'release'), { recursive: true });
    await writeFile(path.join(baseDir, 'Rust', 'KeePassCore', 'target', 'release', 'libkeepass.a'), '');
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
    expect(paths.some((p) => p.startsWith('Build/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('vendor/'))).toBe(false);
    expect(paths.some((p) => p.includes('/target/'))).toBe(false);
  });

  it('skips dependency dirs for non-baseDir projects too', async () => {
    const standardDir = mkdtempSync(path.join(tmpdir(), 'od-list-std-'));
    try {
      await mkdir(path.join(standardDir, 'std-project'), { recursive: true });
      await mkdir(path.join(standardDir, 'std-project', 'node_modules'));
      await writeFile(path.join(standardDir, 'std-project', 'node_modules', 'a.js'), '');
      await writeFile(path.join(standardDir, 'std-project', 'main.html'), '');

      const files = await listFiles(standardDir, 'std-project');
      const paths = files.map((f) => f.path).sort();
      expect(paths).toContain('main.html');
      expect(paths).not.toContain('node_modules/a.js');
    } finally {
      rmSync(standardDir, { recursive: true, force: true });
    }
  });
});
