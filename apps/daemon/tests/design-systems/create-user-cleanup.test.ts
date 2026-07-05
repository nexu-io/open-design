import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = vi.hoisted(() => ({
  concurrentWinnerDir: null as string | null,
  failMetadataWrite: false,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const mkdirMock = vi.fn(async (
    target: Parameters<typeof actual.mkdir>[0],
    options?: Parameters<typeof actual.mkdir>[1],
  ) => {
    const targetPath = String(target);
    if (fsState.concurrentWinnerDir === targetPath) {
      fsState.concurrentWinnerDir = null;
      await actual.mkdir(target, { recursive: true });
      await actual.writeFile(path.join(targetPath, 'winner.txt'), 'keep winner', 'utf8');
      if (options && typeof options === 'object' && 'recursive' in options && options.recursive === true) {
        await actual.mkdir(target, options);
        return;
      }
      const err = new Error('directory exists') as NodeJS.ErrnoException;
      err.code = 'EEXIST';
      throw err;
    }
    await actual.mkdir(target, options);
  });
  return {
    ...actual,
    mkdir: mkdirMock as unknown as typeof actual.mkdir,
    writeFile: vi.fn<typeof actual.writeFile>(async (...args) => {
      const [target] = args;
      if (fsState.failMetadataWrite && String(target).endsWith(`${path.sep}metadata.json`)) {
        throw new Error('metadata write failed');
      }
      return actual.writeFile(...args);
    }),
  };
});

const { createUserDesignSystem } = await import('../../src/design-systems/index.js');

describe('createUserDesignSystem cleanup', () => {
  let root: string;

  beforeEach(async () => {
    fsState.concurrentWinnerDir = null;
    fsState.failMetadataWrite = false;
    root = await mkdtemp(path.join(tmpdir(), 'od-design-system-cleanup-'));
  });

  afterEach(async () => {
    fsState.concurrentWinnerDir = null;
    fsState.failMetadataWrite = false;
    await rm(root, { recursive: true, force: true });
  });

  it('removes a partially created draft when metadata writing fails after DESIGN.md', async () => {
    fsState.failMetadataWrite = true;

    await expect(createUserDesignSystem(root, {
      title: 'Acme Product',
      category: 'Brands',
      status: 'draft',
      artifactMode: 'agent-managed',
    })).rejects.toThrow('metadata write failed');

    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('does not remove another request winner when a same-title directory appears during reservation', async () => {
    fsState.concurrentWinnerDir = path.join(root, 'acme-product');
    fsState.failMetadataWrite = true;

    await expect(createUserDesignSystem(root, {
      title: 'Acme Product',
      category: 'Brands',
      status: 'draft',
      artifactMode: 'agent-managed',
    })).rejects.toThrow('metadata write failed');

    await expect(readdir(root)).resolves.toEqual(['acme-product']);
    await expect(readFile(path.join(root, 'acme-product', 'winner.txt'), 'utf8')).resolves.toBe('keep winner');
  });
});
