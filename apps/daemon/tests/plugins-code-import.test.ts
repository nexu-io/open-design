// Phase 7 entry slice / spec §10 / §21.3.2 — code-import runner.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCodeImport } from '../src/plugins/atoms/code-import.js';

let repo: string;
let cwd: string;

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-code-import-'));
  repo = path.join(tmp, 'repo');
  cwd = path.join(tmp, 'cwd');
  await mkdir(repo, { recursive: true });
  await mkdir(cwd, { recursive: true });
});

afterEach(async () => {
  await rm(path.dirname(repo), { recursive: true, force: true });
});

describe('runCodeImport', () => {
  it('walks a Next.js app-router repo + records framework / package-manager / style', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'fixture',
      dependencies: { next: '15', react: '18' },
      devDependencies: { tailwindcss: '4', typescript: '5' },
    }));
    await writeFile(path.join(repo, 'pnpm-lock.yaml'), '');
    await mkdir(path.join(repo, 'app'), { recursive: true });
    await writeFile(path.join(repo, 'app', 'page.tsx'),
      `import { useState } from 'react';\nimport { Button } from '@/components/Button';\nexport default function Page(){return null}\n`);
    await mkdir(path.join(repo, 'components'), { recursive: true });
    await writeFile(path.join(repo, 'components', 'Button.tsx'),
      `import clsx from 'clsx';\nexport const Button = ({children}: {children: any}) => <button>{children}</button>;\n`);

    const index = await runCodeImport({ repoPath: repo, cwd });
    expect(index.framework).toBe('next');
    expect(index.packageManager).toBe('pnpm');
    expect(index.styleSystem).toBe('tailwind');
    expect(index.routes).toEqual({ kind: 'next-app' });
    expect(index.files.map((f) => f.path).sort()).toEqual([
      'app/page.tsx',
      'components/Button.tsx',
      'package.json',
    ]);
    const page = index.files.find((f) => f.path === 'app/page.tsx');
    expect(page?.imports).toEqual(['react', '@/components/Button']);
  });

  it('skips node_modules / .git / dist via the skiplist + records reasons', async () => {
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'f' }));
    for (const skip of ['node_modules', '.git', 'dist']) {
      await mkdir(path.join(repo, skip), { recursive: true });
      await writeFile(path.join(repo, skip, 'noop.ts'), 'export const x = 1;\n');
    }
    await writeFile(path.join(repo, 'index.ts'), 'export {};\n');
    const index = await runCodeImport({ repoPath: repo, cwd });
    expect(index.files.map((f) => f.path).sort()).toEqual(['index.ts', 'package.json']);
    const skipped = index.skipped.filter((s) => s.reason === 'directory-skiplist').map((s) => s.path).sort();
    expect(skipped).toEqual(['.git', 'dist', 'node_modules']);
  });

  it('marks symlinks as skipped without following them', async () => {
    await writeFile(path.join(repo, 'real.ts'), 'export const x = 1;\n');
    await symlink('real.ts', path.join(repo, 'link.ts'));
    const index = await runCodeImport({ repoPath: repo, cwd });
    expect(index.files.map((f) => f.path)).toContain('real.ts');
    expect(index.skipped.some((s) => s.reason === 'symlink' && s.path === 'link.ts')).toBe(true);
  });

  it('records large files but skips their imports[]', async () => {
    const big = Buffer.alloc(5 * 1024, 0x20).toString('utf8') + "\nimport 'foo';\n";
    await writeFile(path.join(repo, 'huge.ts'), big);
    const index = await runCodeImport({ repoPath: repo, cwd, largeFileBytes: 1024 });
    const huge = index.files.find((f) => f.path === 'huge.ts');
    expect(huge).toBeDefined();
    expect(huge?.imports).toBeUndefined();
    expect(index.skipped.some((s) => s.reason === 'large-file' && s.path === 'huge.ts')).toBe(true);
  });

  it('persists code/index.json under the project cwd', async () => {
    await writeFile(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    await runCodeImport({ repoPath: repo, cwd });
    const indexPath = path.join(cwd, 'code', 'index.json');
    const json = JSON.parse(await readFile(indexPath, 'utf8'));
    expect(json.files.map((f: { path: string }) => f.path)).toEqual(['a.ts']);
  });

  it('throws when repoPath is not a directory', async () => {
    await expect(runCodeImport({ repoPath: path.join(repo, 'no-such-dir'), cwd }))
      .rejects.toThrow(/not a directory/);
  });
});
