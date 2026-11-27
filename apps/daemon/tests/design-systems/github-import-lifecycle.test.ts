import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'vitest';

import { importGitHubDesignSystemProject } from '../../src/design-systems/github-import.js';

const execFileAsync = promisify(execFile);
const repositoryUrl = 'https://github.com/acme/design-kit';
const importedAt = new Date('2026-05-18T10:00:00.000Z');
// The real Git transport is local; only the executable shim requires POSIX.
const posixIt = process.platform === 'win32' ? it.skip : it;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function git(args: string[]) {
  return execFileAsync('git', args, { timeout: 10_000, maxBuffer: 1024 * 1024 });
}

async function withRepository(check: (fixture: {
  source: string;
  tmpRoot: string;
  outputRoot: string;
  cloneRoot: string;
  gitBin: string;
}) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-github-import-life-'));
  try {
    const source = path.join(root, 'source');
    await mkdir(path.join(source, 'src', 'components'), { recursive: true });
    await mkdir(path.join(source, 'assets'));
    await mkdir(path.join(source, 'fonts'));
    await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'github-design-kit' }));
    await writeFile(path.join(source, 'tokens.css'), ':root { --primary: #22c55e; }');
    await writeFile(path.join(source, 'src', 'components', 'Card.tsx'), 'export function Card() {}');
    await writeFile(path.join(source, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(source, 'fonts', 'brand.woff2'), 'font fixture');
    await git(['init', '--quiet', '--initial-branch=main', source]);
    await git(['-C', source, 'add', '.']);
    await git(['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Import fixture']);

    const gitBin = path.join(root, 'local-git.sh');
    const rewrite = `url.${pathToFileURL(`${source}${path.sep}`).href}.insteadOf=${repositoryUrl}.git`;
    await writeFile(gitBin, `#!/bin/sh\nexec git -c ${shellQuote(rewrite)} "$@"\n`, { mode: 0o755 });
    const tmpRoot = path.join(root, 'scratch');
    await check({
      source,
      tmpRoot,
      outputRoot: path.join(root, 'design-systems'),
      cloneRoot: path.join(tmpRoot, 'github-design-system-imports'),
      gitBin,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('GitHub design-system import clone lifecycle', () => {
  posixIt('cleans the successful clone after copying every persistent output', async () => {
    await withRepository(async ({ tmpRoot, outputRoot, cloneRoot, gitBin }) => {
      const result = await importGitHubDesignSystemProject(repositoryUrl, tmpRoot, outputRoot, {
        gitBin, now: importedAt,
      });
      assert.deepEqual(await readdir(cloneRoot), []);
      for (const filename of result.files) assert.ok((await readFile(path.join(result.dir, filename))).length > 0);
      assert.match(await readFile(path.join(result.dir, 'tokens.css'), 'utf8'), /#22c55e/);
      assert.equal(await readFile(path.join(result.dir, 'assets/logo.svg'), 'utf8'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
      assert.equal(await readFile(path.join(result.dir, 'fonts/brand.woff2'), 'utf8'), 'font fixture');
      assert.equal(await readFile(path.join(result.dir, 'source/snippets/card.tsx'), 'utf8'), 'export function Card() {}');
      const manifest = JSON.parse(await readFile(path.join(result.dir, 'manifest.json'), 'utf8'));
      assert.deepEqual(manifest.source, {
        type: 'github', url: `${repositoryUrl}.git`, branch: 'main',
        commit: manifest.source.commit, importedAt: importedAt.toISOString(),
      });
      assert.match(manifest.source.commit, /^[a-f0-9]{40}$/);
    });
  });

  posixIt('never removes a pre-existing repository directory owned by another import', async () => {
    await withRepository(async ({ tmpRoot, outputRoot, cloneRoot, gitBin }) => {
      const occupied = path.join(cloneRoot, 'acme-design-kit-20260518T100000000Z');
      await mkdir(occupied, { recursive: true });
      const marker = path.join(occupied, 'active-owner.txt');
      await writeFile(marker, 'another import is using this directory');
      const outcome = await importGitHubDesignSystemProject(repositoryUrl, tmpRoot, outputRoot, {
        gitBin, now: importedAt,
      }).catch((error: unknown) => error);
      assert.equal(await readFile(marker, 'utf8').catch(() => null), 'another import is using this directory');
      assert.ok(!(outcome instanceof Error));
      assert.deepEqual(await readdir(cloneRoot), [path.basename(occupied)]);
    });
  });

  posixIt('isolates simultaneous imports with the same repository and timestamp', async () => {
    await withRepository(async ({ tmpRoot, outputRoot, cloneRoot, gitBin }) => {
      const results = await Promise.allSettled([0, 1].map(() =>
        importGitHubDesignSystemProject(repositoryUrl, tmpRoot, outputRoot, { gitBin, now: importedAt }),
      ));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
      const ids = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.id] : []);
      assert.equal(new Set(ids).size, 2);
      assert.deepEqual(await readdir(cloneRoot), []);
    });
  });

  posixIt('cleans its temporary directory when git clone fails', async () => {
    await withRepository(async ({ tmpRoot, outputRoot, cloneRoot, gitBin }) => {
      await assert.rejects(importGitHubDesignSystemProject(repositoryUrl, tmpRoot, outputRoot, {
        gitBin, now: importedAt, branch: 'missing-branch',
      }), /could not import public GitHub repository/);
      assert.deepEqual(await readdir(cloneRoot), []);
    });
  });

  posixIt('cleans its clone when the local importer cannot create its output', async () => {
    await withRepository(async ({ tmpRoot, outputRoot, cloneRoot, gitBin }) => {
      await writeFile(outputRoot, 'occupied output path');
      await assert.rejects(importGitHubDesignSystemProject(repositoryUrl, tmpRoot, outputRoot, {
        gitBin, now: importedAt,
      }), /could not import public GitHub repository/);
      assert.deepEqual(await readdir(cloneRoot), []);
      assert.equal(await readFile(outputRoot, 'utf8'), 'occupied output path');
    });
  });

  posixIt('retains symlink rejection and cleans the rejected clone', async () => {
    await withRepository(async ({ source, tmpRoot, outputRoot, cloneRoot, gitBin }) => {
      await symlink('tokens.css', path.join(source, 'linked.css'));
      await git(['-C', source, 'add', 'linked.css']);
      await git(['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Symlink fixture']);
      await assert.rejects(importGitHubDesignSystemProject(repositoryUrl, tmpRoot, outputRoot, {
        gitBin, now: importedAt,
      }), /symbolic links/);
      assert.deepEqual(await readdir(cloneRoot), []);
    });
  });
});
