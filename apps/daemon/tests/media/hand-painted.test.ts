import { mkdtemp, readFile, rm, symlink, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMotionVideoComposition } from '@open-design/contracts/runtime/motion-source-player';
import { generateMedia } from '../../src/media/index.js';
import { scaffoldHyperFramesComposition } from '../../src/media/hyperframes-scaffold.js';
import { handPaintedCaptureDocument } from '../../src/media/hand-painted.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const runtimeDir = path.join(repoRoot, 'plugins/_official/examples/claude-animation/runtime');

describe('Hand-painted Motion source and render', () => {
  let root: string;
  let projectsRoot: string;
  let projectDir: string;
  const compositionDir = 'motion-source/bird';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-hand-painted-test-'));
    projectsRoot = path.join(root, 'projects');
    projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  const scaffold = () => scaffoldHyperFramesComposition({
    projectDir, compositionDir, template: 'hand-painted', handPaintedRuntimeDir: runtimeDir,
  });
  const request = () => ({
    projectRoot: repoRoot, projectsRoot, projectId: 'project-1',
    surface: 'video' as const, model: 'claude-animation-p5',
    output: 'film.mp4', compositionDir, length: 5, aspect: '16:9',
  });

  it('scaffolds a visible, replayable Motion source with local p5 scripts and their licenses', async () => {
    const result = await scaffold();
    expect(result.compositionDir).toBe(compositionDir);
    for (const file of ['index.html', 'p5.min.js', 'p5.brush.js', 'core.js', 'timeline.js', 'hand-painted-clock.js',
      'licenses/README.md', 'licenses/p5-LGPL-2.1.txt', 'licenses/p5.brush-MIT.txt', 'licenses/ClaudeAnimationBase-MIT.txt']) {
      expect(result.files).toContain(file);
      await expect(readFile(path.join(projectDir, compositionDir, file))).resolves.toBeTruthy();
    }
    const source = await readFile(path.join(projectDir, compositionDir, 'index.html'), 'utf8');
    expect(isMotionVideoComposition(source)).toBe(true);
    expect(source).toContain('data-od-motion-source-player');
    expect(source).toContain('<meta name="od-motion-audio" content="silent">');
    expect(source).toContain('href="../../film.mp4"');
    expect(source).toContain('data-duration="5"');
    expect(source).toContain('src="./p5.min.js"');
    expect(source).toContain('shots([[0, garden]])');
    expect(source).not.toMatch(/https?:\/\/|cdn\./);
    expect(await readFile(path.join(projectDir, compositionDir, 'licenses/p5-LGPL-2.1.txt'), 'utf8'))
      .toContain('Version 2.1, February 1999');
  });

  it('only offers the template for visible motion-source compositions', async () => {
    await expect(scaffoldHyperFramesComposition({
      projectDir, compositionDir: '.hyperframes-cache/bird', template: 'hand-painted', handPaintedRuntimeDir: runtimeDir,
    })).rejects.toThrow(/motion-source/);
    await expect(scaffoldHyperFramesComposition({ projectDir, compositionDir, template: 'oil-paint' }))
      .rejects.toThrow(/template must be one of: hand-painted/);
  });

  it('captures the author source unchanged and adds only the frame bridge', async () => {
    await scaffold();
    const source = await readFile(path.join(projectDir, compositionDir, 'index.html'), 'utf8');
    const capture = handPaintedCaptureDocument(source);
    expect(capture).toContain('window.__odMotionRender=true');
    expect(capture).toContain('window.__odFrameRenderer');
    expect(capture).toContain('src="./p5.min.js"');
  });

  it('requires the desktop renderer instead of returning a placeholder', async () => {
    await scaffold();
    vi.stubEnv('OD_MEDIA_ALLOW_STUBS', '1');
    await expect(generateMedia(request())).rejects.toThrow(/desktop frame renderer is unavailable/i);
  });

  it('rejects unsupported length and aspect before rendering', async () => {
    await scaffold();
    await expect(generateMedia({ ...request(), length: 10 })).rejects.toThrow(/5 seconds/);
    await expect(generateMedia({ ...request(), aspect: '9:16' })).rejects.toThrow(/16:9/);
  });

  it('refuses compositions outside motion-source or escaping through a symlink', async () => {
    await expect(generateMedia({ ...request(), compositionDir: '.claude-animation-cache/old' }))
      .rejects.toThrow(/motion-source/);
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await mkdir(path.join(projectDir, 'motion-source'), { recursive: true });
    await symlink(outside, path.join(projectDir, 'motion-source', 'escape'));
    await expect(generateMedia({ ...request(), compositionDir: 'motion-source/escape' }))
      .rejects.toThrow(/inside the project/);
  });

  it('rejects audio, remote scripts and an MP4 link that does not match the export', async () => {
    await scaffold();
    const file = path.join(projectDir, compositionDir, 'index.html');
    const source = await readFile(file, 'utf8');
    await writeFile(file, source.replace('</body>', '<audio src="voice.mp3"></audio></body>'));
    await expect(generateMedia(request())).rejects.toThrow(/silent/);
    await writeFile(file, source.replace('src="./p5.min.js"', 'src="https://cdn.example.com/p5.min.js"'));
    await expect(generateMedia(request())).rejects.toThrow(/local scripts/);
    await writeFile(file, source);
    await expect(generateMedia({ ...request(), output: 'other.mp4' })).rejects.toThrow(/MP4 link must match/);
  });

  it('keeps capture failures visible even when development stubs are enabled', async () => {
    await scaffold();
    vi.stubEnv('OD_MEDIA_ALLOW_STUBS', '1');
    await expect(generateMedia({
      ...request(),
      desktopFrameRenderer: async () => ({ ok: false, error: 'scene failed while drawing frame 12' }),
    })).rejects.toThrow('scene failed while drawing frame 12');
  });

  it('refuses incomplete frames instead of encoding a shorter deliverable', async () => {
    await scaffold();
    await expect(generateMedia({
      ...request(),
      desktopFrameRenderer: async () => ({
        ok: true, framePattern: 'frame-%08d.png', frameCount: 119,
        fps: 24, width: 1920, height: 1080,
      }),
    })).rejects.toThrow(/120 frames/);
  });
});
