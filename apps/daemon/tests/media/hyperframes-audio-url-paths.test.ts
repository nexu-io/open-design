import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';

import { prepareHyperFramesAudio } from '../../src/media/hyperframes-audio.js';

async function withComposition(check: (root: string, parent: string) => Promise<void>) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'hf-audio-url-'));
  try {
    const root = path.join(parent, 'composition #1 %');
    await mkdir(root);
    await check(root, parent);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

const audio = (src: string) => `<audio id="sound" src="${src}" data-start="2" data-duration="3" data-volume="0.5"></audio>`;

describe('HyperFrames local audio URLs', () => {
  for (const [name, filename, src] of [
    ['spaces', 'music track.wav', 'music%20track.wav'],
    ['Unicode', '背景音乐.wav', '%E8%83%8C%E6%99%AF%E9%9F%B3%E4%B9%90.wav'],
    ['encoded fragment and percent characters', 'mix#100%.wav', 'mix%23100%25.wav'],
    ['one level of percent decoding', 'literal%20name.wav', 'literal%2520name.wav'],
    ['ordinary relative paths', 'ordinary track.wav', './ordinary track.wav'],
  ] as const) {
    it(`resolves ${name} against the composition directory`, async () => {
      await withComposition(async (root) => {
        const file = path.join(root, filename);
        await writeFile(file, 'audio fixture');
        const result = await prepareHyperFramesAudio(audio(src), root);
        assert.deepEqual(result.tracks, [{ file: await realpath(file), format: 'wav', start: 2, duration: 3, volume: 0.5 }]);
        assert.ok(!result.html.includes('<audio'));
        assert.ok(result.html.includes('id="sound"'));
      });
    });
  }

  it('does not discard query or media-fragment semantics while resolving the file', async () => {
    await withComposition(async (root) => {
      await writeFile(path.join(root, 'track.wav'), 'audio fixture');
      for (const src of ['track.wav?v=1', 'track.wav#t=1,2', 'track.wav#track=audio', 'track.wav#%74=1,2']) {
        await assert.rejects(prepareHyperFramesAudio(audio(src), root));
      }
    });
  });

  it('rejects an encoded parent traversal that resolves to a real outside file', async () => {
    await withComposition(async (root, parent) => {
      await writeFile(path.join(parent, 'outside.wav'), 'outside audio fixture');
      await assert.rejects(prepareHyperFramesAudio(audio('%2e%2e/outside.wav'), root));
    });
  });

  (process.platform === 'win32' ? it.skip : it)('rejects an encoded symlink path that resolves outside the composition', async () => {
    await withComposition(async (root, parent) => {
      const outside = path.join(parent, 'outside.wav');
      await writeFile(outside, 'outside audio fixture');
      await symlink(outside, path.join(root, 'linked track.wav'));
      await assert.rejects(prepareHyperFramesAudio(audio('linked%20track.wav'), root));
    });
  });

  it('keeps remote and absolute sources outside the local audio contract', async () => {
    await withComposition(async (root) => {
      for (const src of ['https://example.test/track.wav', '//example.test/track.wav', '/track.wav', 'file:///track.wav']) {
        await assert.rejects(prepareHyperFramesAudio(audio(src), root), /local relative/);
      }
    });
  });

  it('rejects malformed escapes and encoded path separators', async () => {
    await withComposition(async (root) => {
      for (const src of ['bad%ZZ.wav', '%E0%A4.wav', 'nested%2Ftrack.wav']) {
        await assert.rejects(prepareHyperFramesAudio(audio(src), root));
      }
    });
  });
});
