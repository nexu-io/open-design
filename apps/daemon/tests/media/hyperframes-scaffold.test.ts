import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldHyperFramesComposition } from '../../src/media/hyperframes-scaffold.js';

describe('HyperFrames composition scaffold', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('creates the daemon-owned minimal composition without running HyperFrames init', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-scaffold-'));
    roots.push(projectDir);

    const result = await scaffoldHyperFramesComposition({
      projectDir,
      compositionDir: '.hyperframes-cache/launch-video',
      now: new Date('2026-08-18T00:00:00.000Z'),
    });

    expect(result).toEqual({
      compositionDir: '.hyperframes-cache/launch-video',
      files: ['hyperframes.json', 'meta.json', 'index.html'],
    });
    await expect(readFile(path.join(projectDir, result.compositionDir, 'hyperframes.json'), 'utf8'))
      .resolves.toContain('https://hyperframes.heygen.com/schema/hyperframes.json');
    await expect(readFile(path.join(projectDir, result.compositionDir, 'meta.json'), 'utf8'))
      .resolves.toContain('"createdAt": "2026-08-18T00:00:00.000Z"');
    await expect(readFile(path.join(projectDir, result.compositionDir, 'index.html'), 'utf8'))
      .resolves.toContain('window.__timelines["main"] = tl');
  });

  it('rejects paths outside the dedicated cache and refuses to overwrite a composition', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-scaffold-'));
    roots.push(projectDir);

    await expect(scaffoldHyperFramesComposition({
      projectDir,
      compositionDir: '../outside',
    })).rejects.toThrow(/inside \.hyperframes-cache/);

    await scaffoldHyperFramesComposition({
      projectDir,
      compositionDir: '.hyperframes-cache/existing',
    });
    await expect(scaffoldHyperFramesComposition({
      projectDir,
      compositionDir: '.hyperframes-cache/existing',
    })).rejects.toThrow(/already exists/);
  });
});
