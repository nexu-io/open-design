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

  it.each([false, true])('encodes a real desktop MP4 with audio=%s', async (withAudio) => {
    const compRel = '.hyperframes-cache/electron-runtime';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'meta.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'index.html'), `<!doctype html>
<meta name="od-motion-output" content="video"><meta name="od-motion-audio" content="${withAudio ? 'required' : 'silent'}"><link rel="alternate" type="video/mp4" href="../../electron.mp4">
<main data-composition-id="main" data-duration="0.1" data-width="320" data-height="180" data-fps="30"></main>
${withAudio ? '<audio src="tone.wav" data-start="0" data-duration="0.1"></audio>' : ''}
<script src="gsap.min.js"></script><script>window.__timelines={main:gsap.timeline({paused:true}).to({}, {duration:.1}, 0)};</script>`, 'utf8');
    await writeFile(path.join(compDir, 'gsap.min.js'), await readFile(require.resolve('gsap/dist/gsap.min.js')));

    const sourceFrame = path.join(root, 'source-frame.png');
    if (withAudio) await execFileAsync(ffmpegInstaller.path, [
      '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', path.join(compDir, 'tone.wav'),
    ]);
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
    expect(receivedHtml).not.toContain('<audio');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'electron.mp4'));
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    const editable = await readFile(path.join(compDir, 'index.html'), 'utf8');
    expect(editable).toContain('data-od-motion-source-player');
    expect(editable).toContain('href="../../electron.mp4"');
    expect(editable).toContain('gsap.timeline');
    if (withAudio) {
      const decoded = await execFileAsync(ffmpegInstaller.path, [
        '-i', path.join(projectsRoot, 'project-1', 'electron.mp4'), '-map', '0:a', '-f', 's16le', '-ac', '1', '-',
      ], { encoding: 'buffer' });
      expect(decoded.stdout.length).toBeGreaterThan(4000);
      expect(decoded.stdout.some((value) => value !== 0)).toBe(true);
    }
  });

  it.each([
    'data-start="0"',
    'data-start="0" data-duration="auto"',
    'data-start="intro + 2" data-duration="3"',
    'data-start="0" data-duration="3" data-media-start="1"',
  ])('leaves legacy audio syntax %s to the original desktop renderer', async (attributes) => {
    const compRel = '.hyperframes-cache/legacy-audio';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}');
    await writeFile(path.join(compDir, 'meta.json'), '{}');
    const source = `<!doctype html><main data-composition-id="main" data-duration="0.1" data-width="320" data-height="180"></main><audio src="legacy.mp3" ${attributes}></audio>`;
    await writeFile(path.join(compDir, 'index.html'), source);
    await writeFile(path.join(compDir, 'legacy.mp3'), 'legacy parser owns the audio');
    await expect(generateMedia({
      projectRoot, projectsRoot, projectId: 'project-1', surface: 'video', model: 'hyperframes-html', output: 'legacy.mp4', compositionDir: compRel,
      desktopFrameRenderer: async (input) => {
        expect(input.html).toContain(`<audio src="legacy.mp3" ${attributes}>`);
        expect(input.html).not.toContain('data-od-motion-source-player');
        // The unchanged Electron renderer owns its existing audio limitation;
        // this task must reach it rather than fail under motion's new parser.
        return { ok: false, error: 'the bundled Electron frame renderer does not yet support HyperFrames audio mixing' };
      },
    })).rejects.toThrow('does not yet support HyperFrames audio mixing');
    expect(await readFile(path.join(compDir, 'index.html'), 'utf8')).toBe(source);
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

  it.each([['video', false], ['interactive', true], ['', true]])('keeps procedural drawing callbacks only for declared motion video: %s', async (mode, expectedSuppression) => {
    const source = `<!doctype html><html><head><meta name="od-motion-output" content="${mode}"></head><body>
      <main data-composition-id="main" data-duration="20"></main><script>window.__timelines={main:{duration:()=>20,timeScale:()=>1}}; window.__renderReady=true; window.__player={getDuration:()=>20,renderSeek:(time,options)=>{window.capture={time,options,renderMode:window.__odMotionRender};}};</script>
      </body></html>`;
    const dom = new JSDOM(injectHyperFramesFrameBridge(source, ''), { pretendToBeVisual:true, runScripts:'dangerously' });
    try {
      await dom.window.__odFrameRenderer.seek(5);
      expect(dom.window.capture).toEqual({time:5,options:{suppressEvents:expectedSuppression},renderMode:true});
    } finally { dom.window.close(); }
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
