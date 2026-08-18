import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, lstat, mkdtemp, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  commitGroundedPptxRevision,
  importGroundedPptxSource,
  readGroundedPptxManifest,
  readGroundedPptxRevision,
  withGroundedPptxWriteLock,
  GROUNDED_PPTX_STORAGE_LIMITS,
  groundedPptxStorageProjectRoot,
} from '../../src/pptx-grounded/storage.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'open-design-grounded-pptx-'));
  roots.push(root);
  return root;
}

describe('grounded PPTX project storage', () => {
  it('rejects a configured daemon root pathname that is itself a symlink', async () => {
    const parent = await projectDir();
    const target = await projectDir();
    const runtimeRoot = path.join(parent, 'configured-data');
    await symlink(target, runtimeRoot);

    await expect(importGroundedPptxSource(
      { runtimeRoot, dataRoot: path.join(runtimeRoot, 'grounded-pptx'), projectId: 'deck-1' },
      new Uint8Array([1]),
      'source.pptx',
    )).rejects.toThrow(/data root|safe directory|symlink/i);
    await expect(lstat(path.join(target, 'grounded-pptx'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not poison the in-process queue when data-root validation fails', async () => {
    const parent = await projectDir();
    const target = await projectDir();
    const dataRoot = path.join(parent, 'grounded-data');
    await symlink(target, dataRoot);
    const location = { dataRoot, projectId: 'deck-1' };

    await expect(importGroundedPptxSource(
      location, new Uint8Array([1]), 'source.pptx',
    )).rejects.toThrow(/data root|safe directory|symlink/i);
    await rm(dataRoot);
    await mkdir(dataRoot);

    await expect(Promise.race([
      importGroundedPptxSource(location, new Uint8Array([2]), 'source.pptx'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('next operation hung')), 500)),
    ])).resolves.toMatchObject({ currentRevisionId: 'r0001' });
  });

  it('fails closed when the grounded data directory is replaced after daemon lock acquisition', async () => {
    const parent = await projectDir();
    const runtimeRoot = path.join(parent, 'runtime');
    const dataRoot = path.join(runtimeRoot, 'grounded-pptx');
    const location = { runtimeRoot, dataRoot, projectId: 'deck-1' };
    const source = new Uint8Array(32 * 1024 * 1024);
    source[0] = 1;
    await importGroundedPptxSource(location, source, 'source.pptx');

    const replacement = path.join(parent, 'replacement-grounded-pptx');
    const displaced = path.join(parent, 'displaced-grounded-pptx');
    await cp(dataRoot, replacement, { recursive: true });
    await mkdir(path.join(replacement, '.quota-lock'));
    await writeFile(path.join(replacement, '.quota-lock/owner.json'), JSON.stringify({
      token: 'replacement-tree-owner', pid: process.pid,
    }));

    const commit = commitGroundedPptxRevision(location, new Uint8Array([2]), {
      expectedCurrentRevisionId: 'r0001',
    });
    const deadline = Date.now() + 5_000;
    while (true) {
      try {
        await lstat(path.join(dataRoot, '.quota-lock/owner.json'));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }
    await rename(dataRoot, displaced);
    await rename(replacement, dataRoot);

    await expect(commit).rejects.toThrow(/data root.*changed|identity/i);
    const replacementManifest = JSON.parse(await readFile(
      path.join(dataRoot, groundedPptxStorageProjectRoot(location).slice(dataRoot.length + 1), 'manifest.json'),
      'utf8',
    )) as { currentRevisionId: string };
    expect(replacementManifest.currentRevisionId).toBe('r0001');
    expect(JSON.parse(await readFile(path.join(dataRoot, '.quota-lock/owner.json'), 'utf8')))
      .toMatchObject({ token: 'replacement-tree-owner' });
    await expect(lstat(path.join(
      dataRoot,
      groundedPptxStorageProjectRoot(location).slice(dataRoot.length + 1),
      'revisions/r0002.pptx',
    ))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stores canonical bytes under daemon data, isolated from project workspace swaps', async () => {
    const daemonData = await projectDir();
    const workspace = await projectDir();
    const location = { dataRoot: daemonData, projectId: 'stable-project-id' };
    await importGroundedPptxSource(location, new Uint8Array([1]), 'source.pptx', 'nested/source.pptx');
    const outside = await projectDir();
    await mkdir(path.join(workspace, 'grounded-pptx'), { recursive: true });
    await rm(path.join(workspace, 'grounded-pptx'), { recursive: true });
    await symlink(outside, path.join(workspace, 'grounded-pptx'));

    await commitGroundedPptxRevision(location, new Uint8Array([2]), { expectedCurrentRevisionId: 'r0001' });

    expect(await readGroundedPptxRevision(location, 'r0002')).toEqual(new Uint8Array([2]));
    await expect(lstat(path.join(outside, 'revisions/r0002.pptx'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(groundedPptxStorageProjectRoot(location)).toContain(daemonData);
  });

  it('accounts for source, revision, and manifest bytes exactly at import publication', async () => {
    const reference = await projectDir();
    const bytes = new Uint8Array([1, 2, 3]);
    await importGroundedPptxSource(reference, bytes, 'source.pptx');
    const referenceRoot = path.join(reference, 'grounded-pptx');
    const exact = (await lstat(path.join(referenceRoot, 'source/original.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'revisions/r0001.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'manifest.json'))).size;

    const rejected = await projectDir();
    await expect(importGroundedPptxSource(rejected, bytes, 'source.pptx', undefined, {
      maxProjectBytes: exact - 1, maxDaemonBytes: exact - 1,
    })).rejects.toThrow(/storage limit/);
    const accepted = await projectDir();
    await expect(importGroundedPptxSource(accepted, bytes, 'source.pptx', undefined, {
      maxProjectBytes: exact, maxDaemonBytes: exact,
    })).resolves.toMatchObject({ currentRevisionId: 'r0001' });
  });

  it('enforces a daemon-wide persisted byte quota before writing across projects', async () => {
    const daemonData = await projectDir();
    const first = { dataRoot: daemonData, projectId: 'first' };
    const second = { dataRoot: daemonData, projectId: 'second' };
    await importGroundedPptxSource(first, new Uint8Array([1, 2, 3]), 'first.pptx', undefined, {
      maxDaemonBytes: 10_000,
    });
    await expect(importGroundedPptxSource(second, new Uint8Array([4]), 'second.pptx', undefined, {
      maxDaemonBytes: 1,
    })).rejects.toThrow('daemon storage limit');
    await expect(lstat(groundedPptxStorageProjectRoot(second))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serializes daemon quota measurement and publication across real processes', async () => {
    const reference = await projectDir();
    const bytes = new Uint8Array(8 * 1024 * 1024);
    await importGroundedPptxSource(reference, bytes, 'source.pptx');
    const referenceRoot = path.join(reference, 'grounded-pptx');
    const exact = (await lstat(path.join(referenceRoot, 'source/original.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'revisions/r0001.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'manifest.json'))).size;
    const daemonData = await projectDir();
    const gateRoot = await projectDir();
    const gate = path.join(gateRoot, 'go');
    const moduleUrl = pathToFileURL(path.resolve('src/pptx-grounded/storage.ts')).href;
    const run = (projectId: string) => {
      const script = `
        import { existsSync } from 'node:fs';
        import { importGroundedPptxSource } from ${JSON.stringify(moduleUrl)};
        while (!existsSync(${JSON.stringify(gate)})) await new Promise(r => setTimeout(r, 2));
        try {
          await importGroundedPptxSource(
            { dataRoot: ${JSON.stringify(daemonData)}, projectId: ${JSON.stringify(projectId)} },
            new Uint8Array(8 * 1024 * 1024), 'source.pptx', undefined,
            { maxDaemonBytes: ${exact} },
          );
          console.log('published');
        } catch (error) { console.log('rejected:' + error.message); }
      `;
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: path.resolve('.'), stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { child, output: child.stdout };
    };
    const children = [run('first'), run('second')];
    await writeFile(gate, 'go');
    const results = await Promise.all(children.map(async ({ child, output }) => {
      let stdout = '';
      output.on('data', (chunk) => { stdout += String(chunk); });
      const [code] = await once(child, 'exit');
      expect(code).toBe(0);
      return stdout.trim();
    }));
    expect(results.sort()).toEqual([
      'published',
      'rejected:grounded PPTX daemon storage limit exceeded',
    ].sort());
  }, 20_000);

  it('accounts for replacement manifest and revision bytes exactly on commit', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const reference = await projectDir();
    await importGroundedPptxSource(reference, bytes, 'source.pptx');
    await commitGroundedPptxRevision(reference, new Uint8Array([4, 5]), {
      expectedCurrentRevisionId: 'r0001',
    });
    const referenceRoot = path.join(reference, 'grounded-pptx');
    const nextExact = (await lstat(path.join(referenceRoot, 'source/original.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'revisions/r0001.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'revisions/r0002.pptx'))).size +
      (await lstat(path.join(referenceRoot, 'manifest.json'))).size;

    const rejected = await projectDir();
    await importGroundedPptxSource(rejected, bytes, 'source.pptx');
    await expect(commitGroundedPptxRevision(rejected, new Uint8Array([4, 5]), {
      expectedCurrentRevisionId: 'r0001', maxProjectBytes: nextExact - 1, maxDaemonBytes: nextExact - 1,
    })).rejects.toThrow(/storage limit/);
    const accepted = await projectDir();
    await importGroundedPptxSource(accepted, bytes, 'source.pptx');
    await expect(commitGroundedPptxRevision(accepted, new Uint8Array([4, 5]), {
      expectedCurrentRevisionId: 'r0001', maxProjectBytes: nextExact, maxDaemonBytes: nextExact,
    })).resolves.toMatchObject({ currentRevisionId: 'r0002' });
  });

  it('imports an immutable source and creates the first native revision', async () => {
    const dir = await projectDir();
    const source = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

    const manifest = await importGroundedPptxSource(dir, source, 'Enterprise Template.pptx');

    expect(manifest).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        mode: 'grounded-pptx',
        currentRevisionId: 'r0001',
        source: expect.objectContaining({ originalFilename: 'Enterprise Template.pptx' }),
      }),
    );
    expect(await readFile(path.join(dir, 'grounded-pptx/source/original.pptx'))).toEqual(
      Buffer.from(source),
    );
    expect(await readFile(path.join(dir, 'grounded-pptx/revisions/r0001.pptx'))).toEqual(
      Buffer.from(source),
    );

    await expect(importGroundedPptxSource(dir, source, 'replacement.pptx')).rejects.toThrow(
      'already has a grounded PPTX source',
    );
  });

  it('commits immutable numbered revisions and rejects stale writers', async () => {
    const dir = await projectDir();
    const source = new Uint8Array([1, 2, 3]);
    await importGroundedPptxSource(dir, source, 'source.pptx');

    const next = new Uint8Array([4, 5, 6]);
    const manifest = await commitGroundedPptxRevision(dir, next, {
      expectedCurrentRevisionId: 'r0001',
    });

    expect(manifest.currentRevisionId).toBe('r0002');
    expect(await readFile(path.join(dir, 'grounded-pptx/source/original.pptx'))).toEqual(
      Buffer.from(source),
    );
    expect(await readFile(path.join(dir, 'grounded-pptx/revisions/r0002.pptx'))).toEqual(
      Buffer.from(next),
    );
    await expect(
      commitGroundedPptxRevision(dir, new Uint8Array([7]), {
        expectedCurrentRevisionId: 'r0001',
      }),
    ).rejects.toThrow('stale grounded PPTX revision');
    expect((await readGroundedPptxManifest(dir)).currentRevisionId).toBe('r0002');
  });

  it('rejects malformed manifests, traversal paths, and changed revision bytes', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1, 2, 3]), 'source.pptx');
    const manifestPath = path.join(dir, 'grounded-pptx/manifest.json');
    const original = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      revisions: Array<{ path: string }>;
    } & Record<string, unknown>;
    await writeFile(manifestPath, JSON.stringify({ ...original, revisions: 'invalid' }));
    await expect(readGroundedPptxManifest(dir)).rejects.toThrow('invalid grounded PPTX manifest');

    original.revisions[0]!.path = '../../outside.pptx';
    await writeFile(manifestPath, JSON.stringify(original));
    await expect(readGroundedPptxRevision(dir, 'r0001')).rejects.toThrow('invalid grounded PPTX manifest');

    original.revisions[0]!.path = 'revisions/r0001.pptx';
    await writeFile(manifestPath, JSON.stringify(original));
    await writeFile(path.join(dir, 'grounded-pptx/revisions/r0001.pptx'), new Uint8Array([9]));
    await expect(readGroundedPptxRevision(dir, 'r0001')).rejects.toThrow('integrity check failed');
  });

  it('rejects accepted-shape manifests that reorder, hide, or rewind immutable revisions', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    await commitGroundedPptxRevision(dir, new Uint8Array([2]), { expectedCurrentRevisionId: 'r0001' });
    const manifestPath = path.join(dir, 'grounded-pptx/manifest.json');
    const valid = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      currentRevisionId: string; revisions: Array<Record<string, unknown>>;
    };

    await writeFile(manifestPath, JSON.stringify({ ...valid, revisions: [...valid.revisions].reverse() }));
    await expect(readGroundedPptxManifest(dir)).rejects.toThrow('invalid grounded PPTX manifest');
    await writeFile(manifestPath, JSON.stringify({ ...valid, currentRevisionId: 'r0001' }));
    await expect(readGroundedPptxManifest(dir)).rejects.toThrow('invalid grounded PPTX manifest');
    await writeFile(manifestPath, JSON.stringify({ ...valid, revisions: valid.revisions.slice(1) }));
    await expect(readGroundedPptxManifest(dir)).rejects.toThrow('invalid grounded PPTX manifest');
  });

  it('verifies every immutable revision before publishing a successor', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    await commitGroundedPptxRevision(dir, new Uint8Array([2]), { expectedCurrentRevisionId: 'r0001' });
    await writeFile(path.join(dir, 'grounded-pptx/revisions/r0001.pptx'), new Uint8Array([9]));

    await expect(commitGroundedPptxRevision(dir, new Uint8Array([3]), {
      expectedCurrentRevisionId: 'r0002',
    })).rejects.toThrow(/integrity|immutable/);
    await expect(lstat(path.join(dir, 'grounded-pptx/revisions/r0003.pptx')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('caps persisted manifests before reading their contents', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    await writeFile(path.join(dir, 'grounded-pptx/manifest.json'),
      Buffer.alloc(GROUNDED_PPTX_STORAGE_LIMITS.maxManifestBytes + 1, 0x20));
    await expect(readGroundedPptxManifest(dir)).rejects.toThrow('manifest size exceeds limit');
  });

  it('recovers a stale write lock before committing', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    const lock = path.join(dir, 'grounded-pptx/.write-lock');
    await mkdir(lock);
    const old = new Date(Date.now() - 10 * 60_000);
    await utimes(lock, old, old);

    const manifest = await commitGroundedPptxRevision(dir, new Uint8Array([2]), {
      expectedCurrentRevisionId: 'r0001',
    });
    expect(manifest.currentRevisionId).toBe('r0002');
  });

  it('recovers an unpublished orphan revision left by an interrupted manifest update', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    const orphan = path.join(dir, 'grounded-pptx/revisions/r0002.pptx');
    await writeFile(orphan, new Uint8Array([99]));

    const manifest = await commitGroundedPptxRevision(dir, new Uint8Array([2]), {
      expectedCurrentRevisionId: 'r0001',
    });
    expect(manifest.currentRevisionId).toBe('r0002');
    expect(await readFile(orphan)).toEqual(Buffer.from([2]));
  });

  it.each(['source', 'revisions', '.write-lock'])('rejects a symlinked %s storage component', async (component) => {
    const dir = await projectDir();
    const outside = await projectDir();
    await mkdir(path.join(dir, 'grounded-pptx'), { recursive: true });
    await symlink(outside, path.join(dir, 'grounded-pptx', component));

    if (component === '.write-lock') {
      await rm(path.join(dir, 'grounded-pptx'), { recursive: true, force: true });
      await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
      await symlink(outside, path.join(dir, 'grounded-pptx/.write-lock'));
      await expect(commitGroundedPptxRevision(dir, new Uint8Array([2]), {
        expectedCurrentRevisionId: 'r0001',
      })).rejects.toThrow(/symlink|safe directory/);
    } else {
      await expect(importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx'))
        .rejects.toThrow(/symlink|safe directory/);
    }
    await expect(lstat(path.join(outside, component === 'revisions' ? 'r0001.pptx' : 'original.pptx')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers an orphaned initial import without preserving partial bytes', async () => {
    const dir = await projectDir();
    await mkdir(path.join(dir, 'grounded-pptx/source'), { recursive: true });
    await mkdir(path.join(dir, 'grounded-pptx/revisions'), { recursive: true });
    await writeFile(path.join(dir, 'grounded-pptx/source/original.pptx'), new Uint8Array([99]));
    const manifest = await importGroundedPptxSource(dir, new Uint8Array([1, 2]), 'recovered.pptx');
    expect(manifest.currentRevisionId).toBe('r0001');
    expect(await readFile(path.join(dir, 'grounded-pptx/source/original.pptx'))).toEqual(Buffer.from([1, 2]));
  });

  it('does not steal a freshly created lock before its owner token is published', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    await mkdir(path.join(dir, 'grounded-pptx/.write-lock'));
    await expect(commitGroundedPptxRevision(dir, new Uint8Array([2]), {
      expectedCurrentRevisionId: 'r0001',
    })).rejects.toThrow('already in progress');
  });

  it('does not steal an old lock owned by a live process', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    const lock = path.join(dir, 'grounded-pptx/.write-lock');
    await mkdir(lock);
    await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ token: 'live-owner', pid: process.pid }));
    const old = new Date(Date.now() - 10 * 60_000);
    await utimes(lock, old, old);
    await expect(commitGroundedPptxRevision(dir, new Uint8Array([2]), {
      expectedCurrentRevisionId: 'r0001',
    })).rejects.toThrow('already in progress');
    expect(JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8'))).toMatchObject({ token: 'live-owner' });
  });

  it('allows only one simultaneous recoverer to take a stale lock', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    const lock = path.join(dir, 'grounded-pptx/.write-lock');
    await mkdir(lock);
    await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ token: 'dead-owner', pid: 2 ** 30 }));
    const old = new Date(Date.now() - 10 * 60_000);
    await utimes(lock, old, old);
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const contenders = [0, 1].map(() => withGroundedPptxWriteLock(dir, async () => {
      entered += 1;
      await gate;
    }).then(() => true, () => false));
    await expect.poll(() => entered).toBe(1);
    release();
    expect((await Promise.all(contenders)).sort()).toEqual([false, true]);
  });

  it('releases a write lock only while its owner token still matches', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    const lock = path.join(dir, 'grounded-pptx/.write-lock');
    await withGroundedPptxWriteLock(dir, async () => {
      await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ token: 'replacement', pid: process.pid }));
    });
    expect(JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8'))).toMatchObject({ token: 'replacement' });
  });

  it('rejects identical revisions and enforces revision and project-byte quotas before writing', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    await expect(commitGroundedPptxRevision(dir, new Uint8Array([1]), {
      expectedCurrentRevisionId: 'r0001',
    })).rejects.toThrow('no-op');
    await expect(commitGroundedPptxRevision(dir, new Uint8Array([2]), {
      expectedCurrentRevisionId: 'r0001', maxRevisions: 1,
    })).rejects.toThrow('revision limit');
    await expect(commitGroundedPptxRevision(dir, new Uint8Array([2, 3]), {
      expectedCurrentRevisionId: 'r0001', maxProjectBytes: 3,
    })).rejects.toThrow('storage limit');
    await expect(lstat(path.join(dir, 'grounded-pptx/revisions/r0002.pptx')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects oversized serialized revisions before publishing any file or manifest', async () => {
    const dir = await projectDir();
    await importGroundedPptxSource(dir, new Uint8Array([1]), 'source.pptx');
    const oversized = new Uint8Array(GROUNDED_PPTX_STORAGE_LIMITS.maxBlobBytes + 1);
    await expect(commitGroundedPptxRevision(dir, oversized, {
      expectedCurrentRevisionId: 'r0001',
    })).rejects.toThrow('revision size exceeds limit');
    expect((await readGroundedPptxManifest(dir)).currentRevisionId).toBe('r0001');
    await expect(lstat(path.join(dir, 'grounded-pptx/revisions/r0002.pptx')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});
