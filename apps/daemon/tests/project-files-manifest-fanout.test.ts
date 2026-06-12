// Red-spec for the imported-folder file-listing deadlock.
//
// Symptom (observed live): sending a prompt / opening a project whose working
// directory is a large imported folder hung the daemon at "Preparing…". All
// four libuv filesystem worker threads were stuck in uv__fs_work at 0% CPU and
// every fs-backed API (/api/health, /api/projects, the run itself) hung, while
// SQLite-only /api/runs stayed instant.
//
// Root cause: listFiles() -> collectFiles() walks the folder and, per file,
// calls readManifestForPath(), which UNCONDITIONALLY readFile()s
// `<file>.artifact.json`. Imported folders have thousands of files and zero
// sidecars, so this is one failing ENOENT read per file. GET
// /api/projects/:id/files is polled by the UI, so overlapping walks piled
// thousands of failing threadpool reads onto the 4-thread libuv pool and
// exhausted it.
//
// These specs pin the two invariants of the fix:
//  1. No `<file>.artifact.json` read is issued for files that have no sidecar.
//  2. Concurrent listFiles() walks of the same project coalesce (single-flight)
//     instead of multiplying the filesystem work.
// A real sidecar is still read (behaviour preserved).

import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const counters = vi.hoisted(() => ({
  artifactReads: [] as string[],
  readdirCalls: 0,
  readdirDelayMs: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:fs/promises');
  return {
    ...actual,
    default: actual,
    readFile: (p: any, ...rest: any[]) => {
      if (typeof p === 'string' && p.endsWith('.artifact.json')) {
        counters.artifactReads.push(p);
      }
      return (actual.readFile as any)(p, ...rest);
    },
    readdir: async (p: any, ...rest: any[]) => {
      counters.readdirCalls += 1;
      if (counters.readdirDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, counters.readdirDelayMs));
      }
      return (actual.readdir as any)(p, ...rest);
    },
  };
});

const { listFiles } = await import('../src/projects.js');

describe('listFiles imported-folder fan-out', () => {
  let projectsRoot: string;

  beforeEach(() => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-files-fanout-'));
    counters.artifactReads.length = 0;
    counters.readdirCalls = 0;
    counters.readdirDelayMs = 0;
  });

  afterEach(() => {
    rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('issues no .artifact.json reads for a tree whose files have no sidecars', async () => {
    const root = path.join(projectsRoot, 'p1');
    await mkdir(path.join(root, 'sub'), { recursive: true });
    for (let i = 0; i < 30; i += 1) {
      await writeFile(path.join(root, `page-${i}.html`), '<html></html>');
    }
    await writeFile(path.join(root, 'sub', 'logo.svg'), '<svg/>');

    counters.artifactReads.length = 0;
    const files = await listFiles(projectsRoot, 'p1');

    expect(files.length).toBe(31);
    // The bug: one failing ENOENT readFile per file (31). The fix: zero, because
    // collectFiles already knows from the directory listing that no sidecar exists.
    expect(counters.artifactReads).toEqual([]);
  });

  it('still reads a real .artifact.json sidecar when one is present', async () => {
    const root = path.join(projectsRoot, 'p2');
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'card.html'), '<html></html>');
    const sidecar = path.join(root, 'card.html.artifact.json');
    await writeFile(sidecar, JSON.stringify({ kind: 'prototype' }));

    counters.artifactReads.length = 0;
    const files = await listFiles(projectsRoot, 'p2');

    expect(files.some((f: any) => f.path === 'card.html')).toBe(true);
    // Behaviour preserved: the sidecar that actually exists is still read.
    expect(counters.artifactReads).toContain(sidecar);
  });

  it('coalesces concurrent walks of the same project (single-flight)', async () => {
    const root = path.join(projectsRoot, 'p3');
    await mkdir(path.join(root, 'a'), { recursive: true });
    await writeFile(path.join(root, 'a', 'x.txt'), 'x');

    counters.readdirCalls = 0;
    counters.readdirDelayMs = 25; // hold the first walk open so the second overlaps it
    const [r1, r2] = await Promise.all([
      listFiles(projectsRoot, 'p3'),
      listFiles(projectsRoot, 'p3'),
    ]);
    counters.readdirDelayMs = 0;

    expect(r1.length).toBe(1);
    expect(r2.length).toBe(1);
    // Two directories (root + a). Without single-flight each of the two callers
    // runs its own walk -> 4 readdir calls. With single-flight -> 2.
    expect(counters.readdirCalls).toBe(2);
  });
});
