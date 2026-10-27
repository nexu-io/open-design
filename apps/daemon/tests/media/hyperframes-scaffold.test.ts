import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldHyperFramesComposition } from '../../src/media/hyperframes-scaffold.js';
import { readMotionExportSpec } from '../../src/artifacts/motion-delivery.js';


describe('HyperFrames composition scaffold', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it.each(['.hyperframes-cache', 'motion-source'])('creates the daemon-owned minimal composition without running HyperFrames init in %s', async (rootName) => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-scaffold-'));
    roots.push(projectDir);

    const result = await scaffoldHyperFramesComposition({
      projectDir,
      compositionDir: `${rootName}/launch-video`,
      now: new Date('2026-08-18T00:00:00.000Z'),
    });

    expect(result).toEqual({
      compositionDir: `${rootName}/launch-video`,
      files: ['hyperframes.json', 'meta.json', 'index.html', ...(rootName === 'motion-source' ? ['gsap.min.js'] : [])],
    });
    await expect(readFile(path.join(projectDir, result.compositionDir, 'hyperframes.json'), 'utf8'))
      .resolves.toContain('https://hyperframes.heygen.com/schema/hyperframes.json');
    await expect(readFile(path.join(projectDir, result.compositionDir, 'meta.json'), 'utf8'))
      .resolves.toContain('"createdAt": "2026-08-18T00:00:00.000Z"');
    await expect(readFile(path.join(projectDir, result.compositionDir, 'index.html'), 'utf8'))
      .resolves.toContain('window.__timelines["main"] = tl');
    if (rootName === 'motion-source') {
      const source = await readFile(path.join(projectDir, result.compositionDir, 'index.html'), 'utf8');
      expect(source).toContain('src="./gsap.min.js"');
      expect(source).not.toContain('cdn.jsdelivr.net');
      expect(source).toContain('data-od-motion-source-player');
      expect(await readFile(path.join(projectDir, result.compositionDir, 'gsap.min.js'), 'utf8')).toContain('GSAP 3.14.2');
    }
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

  it('supports an editable source-only work without imposing an MP4 delivery', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-motion-source-only-'));
    roots.push(projectDir);
    await scaffoldHyperFramesComposition({ projectDir, compositionDir: 'motion-source/animation' });
    const sourcePath = 'motion-source/animation/index.html';
    const source = (await readFile(path.join(projectDir, sourcePath), 'utf8'))
      .replace('<meta name="od-motion-output" content="video">', '');
    await writeFile(path.join(projectDir, sourcePath), source);
    expect(source).toContain('data-od-motion-source-player');
    expect(source).toContain('src="./gsap.min.js"');
    expect(await readMotionExportSpec({ projectRoot: projectDir, sourcePath, outputPath: 'unused.mp4' })).toBeUndefined();
  });
});
