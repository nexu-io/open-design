import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it, vi } from 'vitest';
import {
  diffRunArtifacts,
  snapshotProjectArtifacts,
  snapshotProjectArtifactsAsync,
} from '../src/run-artifact-fs.js';

const MAX_DIRECTORY_READS = 10_000;
const root = path.resolve('virtual-artifact-project');

function directory(name: string): fs.Dirent {
  return {
    name,
    isDirectory: () => true,
    isFile: () => false,
  } as fs.Dirent;
}

for (const mode of ['sync', 'async'] as const) {
  describe(`${mode} artifact snapshot directory budget`, () => {
    afterEach(() => vi.restoreAllMocks());

    function fixture(children: number): () => number {
      let reads = 0;
      const entries = Array.from({ length: children }, (_, i) => directory(`empty-${i}`));
      const readDirectory = (dir: string): fs.Dirent[] => {
        reads += 1;
        return dir === root ? entries : [];
      };
      if (mode === 'sync') {
        vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
          readDirectory(String(dir)) as ReturnType<typeof fs.readdirSync>);
      } else {
        vi.spyOn(fs.promises, 'readdir').mockImplementation(async (dir) =>
          readDirectory(String(dir)) as Awaited<ReturnType<typeof fs.promises.readdir>>);
      }
      return () => reads;
    }

    async function snapshot() {
      return mode === 'sync'
        ? snapshotProjectArtifacts(root)
        : snapshotProjectArtifactsAsync(root);
    }

    it('bounds a directory-only tree and marks the incomplete snapshot', async () => {
      const reads = fixture(MAX_DIRECTORY_READS + 1);
      const result = await snapshot();

      assert.equal(result.size, 0);
      assert.ok(reads() <= MAX_DIRECTORY_READS, 'empty directories must consume the traversal budget');
      assert.equal(diffRunArtifacts(result, result).filesWrittenUnknown, true);
    });

    it('keeps a fully scanned empty project distinguishable from a truncated scan', async () => {
      const reads = fixture(2);
      const result = await snapshot();

      assert.equal(reads(), 3);
      assert.equal(result.size, 0);
      assert.equal(diffRunArtifacts(result, result).filesWrittenUnknown, undefined);
    });

    it('does not mark a scan incomplete when it exactly fits the directory budget', async () => {
      const reads = fixture(MAX_DIRECTORY_READS - 1);
      const result = await snapshot();

      assert.equal(reads(), MAX_DIRECTORY_READS);
      assert.equal(diffRunArtifacts(result, result).filesWrittenUnknown, undefined);
    });
  });
}
