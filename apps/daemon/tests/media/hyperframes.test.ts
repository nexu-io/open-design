import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  generateMedia,
  hyperFramesCompositionMetrics,
  injectHyperFramesFrameBridge,
} from '../../src/media/index.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (
    html: string,
    options: { pretendToBeVisual: boolean; runScripts: 'dangerously' },
  ) => { window: any };
};

describe('hyperframes-html media renderer preflight', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const originalAllowStubs = process.env.OD_MEDIA_ALLOW_STUBS;
  const originalHyperFramesBin = process.env.OD_HYPERFRAMES_BIN;
  const originalBrowserPath = process.env.HYPERFRAMES_BROWSER_PATH;
  const originalNodeBin = process.env.OD_NODE_BIN;
  const originalPath = process.env.PATH;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(path.join(projectsRoot, 'project-1'), { recursive: true });
    process.env.OD_MEDIA_ALLOW_STUBS = '1';
    delete process.env.HYPERFRAMES_BROWSER_PATH;
  });

  afterEach(async () => {
    if (originalAllowStubs == null) {
      delete process.env.OD_MEDIA_ALLOW_STUBS;
    } else {
      process.env.OD_MEDIA_ALLOW_STUBS = originalAllowStubs;
    }
    if (originalHyperFramesBin == null) {
      delete process.env.OD_HYPERFRAMES_BIN;
    } else {
      process.env.OD_HYPERFRAMES_BIN = originalHyperFramesBin;
    }
    if (originalNodeBin == null) {
      delete process.env.OD_NODE_BIN;
    } else {
      process.env.OD_NODE_BIN = originalNodeBin;
    }
    if (originalBrowserPath == null) {
      delete process.env.HYPERFRAMES_BROWSER_PATH;
    } else {
      process.env.HYPERFRAMES_BROWSER_PATH = originalBrowserPath;
    }
    if (originalPath == null) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('rejects incomplete composition dirs instead of falling back to a stub', async () => {
    const compRel = '.hyperframes-cache/incomplete';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'test.mp4',
      compositionDir: compRel,
    })).rejects.toThrow(/compositionDir is missing hyperframes\.json/);
  });

  it('requires meta.json before spawning the local renderer', async () => {
    const compRel = '.hyperframes-cache/no-meta';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'test.mp4',
      compositionDir: compRel,
    })).rejects.toThrow(/compositionDir is missing meta\.json/);
  });

  it('renders through the daemon-owned HyperFrames CLI without npx on PATH', async () => {
    const compRel = '.hyperframes-cache/managed-runtime';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    const fakeCli = path.join(root, 'fake-hyperframes.mjs');
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'meta.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');
    await writeFile(
      fakeCli,
      [
        "import { writeFile } from 'node:fs/promises';",
        "const outputIndex = process.argv.indexOf('--output');",
        "if (process.argv[2] !== 'render' || outputIndex < 0) process.exit(64);",
        "await writeFile(process.argv[outputIndex + 1], 'managed-hyperframes-render');",
        "process.stderr.write('Capturing frame 1/1\\n');",
      ].join('\n'),
      'utf8',
    );
    process.env.OD_HYPERFRAMES_BIN = fakeCli;
    process.env.OD_NODE_BIN = process.execPath;
    process.env.HYPERFRAMES_BROWSER_PATH = '/explicit/headless-browser';
    process.env.PATH = path.join(root, 'empty-path');

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'managed.mp4',
      compositionDir: compRel,
    });

    expect(result.name).toBe('managed.mp4');
    expect(result.providerNote).toContain('hyperframes/local-html');
    await expect(readFile(path.join(projectsRoot, 'project-1', 'managed.mp4'), 'utf8'))
      .resolves.toBe('managed-hyperframes-render');
  });

  it('renders frames through the bundled desktop Chromium and encodes a real MP4', async () => {
    const compRel = '.hyperframes-cache/electron-runtime';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'meta.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'index.html'), `<!doctype html>
<main data-composition-id="main" data-duration="0.1" data-width="320" data-height="180" data-fps="30"></main>
<script>window.__timelines={main:{duration(){return .1},seek(){}}};</script>`, 'utf8');

    const sourceFrame = path.join(root, 'source-frame.png');
    await execFileAsync(ffmpegInstaller.path, [
      '-y', '-f', 'lavfi', '-i', 'color=c=#10253f:s=320x180', '-frames:v', '1', sourceFrame,
    ]);
    const png = await readFile(sourceFrame);
    let receivedHtml = '';
    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'electron.mp4',
      compositionDir: compRel,
      desktopFrameRenderer: async (input) => {
        receivedHtml = input.html;
        await mkdir(input.outputDir, { recursive: true });
        for (let frame = 0; frame < 3; frame += 1) {
          await writeFile(
            path.join(input.outputDir, `frame-${String(frame).padStart(8, '0')}.png`),
            png,
          );
        }
        return {
          fps: 30,
          frameCount: 3,
          framePattern: path.join(input.outputDir, 'frame-%08d.png'),
          ok: true,
        };
      },
    });

    expect(result.providerNote).toContain('hyperframes/electron-html');
    expect(receivedHtml).toContain('window.__odFrameRenderer');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'electron.mp4'));
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
  });

  it('requires the desktop renderer instead of auto-downloading Chrome', async () => {
    const compRel = '.hyperframes-cache/no-desktop';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'meta.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'index.html'), '<main data-composition-id="main" data-width="320" data-height="180"></main>', 'utf8');
    delete process.env.HYPERFRAMES_BROWSER_PATH;

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'unavailable.mp4',
      compositionDir: compRel,
    })).rejects.toThrow(/desktop frame renderer is unavailable/i);
  });

  it('reads composition metrics and injects after the real body boundary', () => {
    expect(hyperFramesCompositionMetrics(
      '<main data-composition-id="main" data-width="1280" data-height="720" data-fps="60"></main>',
    )).toEqual({ fps: 60, height: 720, width: 1280 });

    const source = '<body><script>const fake = "</body>";</script><main></main></body>';
    const injected = injectHyperFramesFrameBridge(source, 'window.__hfRuntimeLoaded = true;');
    expect(injected.indexOf('window.__odFrameRenderer')).toBeGreaterThan(source.indexOf('</script>'));
    expect(injected).toContain('const fake = "</body>";');
    expect(injected).toContain('setTimeout(finish, 100)');
  });

  it('honors the declared duration when the internal timeline runs longer', async () => {
    const ready = async (durationAttribute: string) => {
      const source = `<!doctype html><body>
<main data-composition-id="main" ${durationAttribute} data-fps="30"></main>
<script>
window.__renderReady = true;
window.__player = { getDuration: () => 22.4, renderSeek: () => {} };
</script>
</body>`;
      const dom = new JSDOM(injectHyperFramesFrameBridge(source, ''), {
        pretendToBeVisual: true,
        runScripts: 'dangerously',
      });
      try {
        return await dom.window.__odFrameRenderer.ready();
      } finally {
        dom.window.close();
      }
    };

    const declared = await ready('data-duration="15"');
    expect(declared).toEqual({ duration: 15, fps: 30 });
    expect(Math.ceil(declared.duration * declared.fps)).toBe(450);
    await expect(ready('data-duration="invalid"')).resolves.toEqual({ duration: 22.4, fps: 30 });
    await expect(ready('')).resolves.toEqual({ duration: 22.4, fps: 30 });
  });
});
