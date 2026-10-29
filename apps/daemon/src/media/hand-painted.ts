import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'cheerio';
import type { DesktopRenderFramesInput, DesktopRenderFramesResult } from '@open-design/sidecar-proto';
import {
  injectMotionSourcePlayer,
  isMotionVideoComposition,
  markMotionFrameRender,
} from '@open-design/contracts/runtime/motion-source-player';
import { assertMotionExport, readMotionExportSpec } from '../artifacts/motion-delivery.js';
import { encodeFramesMp4 } from './frame-encoding.js';

const require = createRequire(import.meta.url);
type FrameRenderer = (input: DesktopRenderFramesInput) => Promise<DesktopRenderFramesResult>;

/** First-version contract of the hand-painted Motion template. */
export const HAND_PAINTED_DURATION_SECONDS = 5;
export const HAND_PAINTED_FPS = 24;
export const HAND_PAINTED_WIDTH = 1920;
export const HAND_PAINTED_HEIGHT = 1080;
const HAND_PAINTED_FRAME_COUNT = HAND_PAINTED_DURATION_SECONDS * HAND_PAINTED_FPS;

/** Engine files copied verbatim from the bundled example plugin's runtime/. */
const ENGINE_FILES = ['core.js', 'timeline.js'] as const;
const LICENSE_FILES = [
  ['LICENSE', 'licenses/ClaudeAnimationBase-MIT.txt'],
  ['licenses/p5-LGPL-2.1.txt', 'licenses/p5-LGPL-2.1.txt'],
  ['licenses/p5.brush-MIT.txt', 'licenses/p5.brush-MIT.txt'],
] as const;

/**
 * Seekable clock that presents the p5 engine to the shared Motion source
 * player as a GSAP-shaped master timeline (`window.__timelines.main`). It is
 * passive: the player (or nothing, during frame capture) drives it, and every
 * draw is `renderAt(t)`, so playback and export read the same pure function
 * of time.
 */
export const HAND_PAINTED_CLOCK_SCRIPT = `// Open Design hand-painted Motion clock. Do not edit; the scene lives in index.html.
(function () {
  var DURATION = PROJECT.duration;
  var time = 0, playing = false, startedAt = 0, startTime = 0, drawing = false, want = null;
  function draw(t) {
    want = t;
    if (drawing || window.ready !== true) return;
    drawing = true;
    (async function () {
      while (want !== null) {
        var next = want; want = null;
        try { await window.renderAt(next); } catch (error) { console.error(error); }
      }
      drawing = false;
    })();
  }
  function now() {
    return playing ? Math.min(DURATION, startTime + (performance.now() - startedAt) / 1000) : time;
  }
  function tick() {
    if (!playing) return;
    time = now(); draw(time);
    if (time >= DURATION) { playing = false; return; }
    requestAnimationFrame(tick);
  }
  var tl = {
    duration: function () { return DURATION; },
    timeScale: function () { return 1; },
    repeat: function () { return 0; },
    delay: function () { return 0; },
    time: function () { return now(); },
    paused: function () { return !playing; },
    seek: function (t) {
      time = Math.max(0, Math.min(DURATION, Number(t) || 0));
      if (playing) { startTime = time; startedAt = performance.now(); }
      draw(time); return tl;
    },
    play: function () {
      if (!playing) {
        playing = true; startTime = time >= DURATION ? 0 : time; startedAt = performance.now();
        requestAnimationFrame(tick);
      }
      return tl;
    },
    pause: function () { time = now(); playing = false; return tl; }
  };
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  (function firstPaint() {
    if (window.__odMotionRender) return;
    if (window.ready === true) draw(time); else setTimeout(firstPaint, 50);
  })();
})();
`;

function licenseReadme(): string {
  return `# Third-party notices for this hand-painted source

This folder travels with the copied runtime files so the source stays
redistributable on its own.

| File in this source | Component | License |
|---|---|---|
| p5.min.js | p5.js 2.3.3, Processing Foundation and contributors | LGPL-2.1, licenses/p5-LGPL-2.1.txt |
| p5.brush.js | p5.brush 2.2.3, Alejandro Campos Uribe | MIT, licenses/p5.brush-MIT.txt |
| core.js, timeline.js | Painting/timeline toolkit by John Heibel (ClaudeAnimationBase 0ac8bf2b31942376cb6b8c4074715595d512acd2) | MIT, licenses/ClaudeAnimationBase-MIT.txt |

p5.min.js is the unmodified upstream library. You may replace it with your own
build of p5.js; the corresponding source ships with Open Design
(plugins/_official/examples/claude-animation/runtime/licenses/p5-2.3.3-source.tar.xz)
and is available from https://github.com/processing/p5.js/tree/v2.3.3.
No license to Anthropic trademarks or mascot artwork is claimed.
`;
}

/** Turn the bundled starter into a Motion video source with local scripts. */
export function handPaintedStarterSource(templateHtml: string): string {
  const $ = load(templateHtml);
  if ($('script[src]').length > 0 || $('meta[name="od-motion-output"]').length > 0) {
    throw new Error('hand-painted starter must contain only its inline scene');
  }
  $('head').append(`
<meta name="od-motion-output" content="video">
<meta name="od-motion-audio" content="silent">
<link rel="alternate" type="video/mp4" href="../../film.mp4">
<style>html,body{margin:0;padding:0;background:#000}.p5Canvas{display:none!important}#out{display:block;width:${HAND_PAINTED_WIDTH}px;height:${HAND_PAINTED_HEIGHT}px}</style>
<script src="./p5.min.js"></script>
<script src="./p5.brush.js"></script>
<script>const PROJECT = { duration: ${HAND_PAINTED_DURATION_SECONDS}, bpm: 120, offset: 0 };</script>
<script src="./core.js"></script>
<script src="./timeline.js"></script>
<script>devUI = function () {};</script>
<script src="./hand-painted-clock.js"></script>
`);
  const canvas = $('canvas#out');
  if (canvas.length !== 1) throw new Error('hand-painted starter must contain one canvas#out');
  canvas.wrap(`<div id="main" data-composition-id="main" data-start="0" data-duration="${HAND_PAINTED_DURATION_SECONDS}" data-width="${HAND_PAINTED_WIDTH}" data-height="${HAND_PAINTED_HEIGHT}" data-fps="${HAND_PAINTED_FPS}" data-poster-time="2.5"></div>`);
  return injectMotionSourcePlayer($.html());
}

/**
 * Write the editable, replayable hand-painted source into a fresh visible
 * Motion directory: scene HTML, pinned local p5/p5.brush, the painting engine,
 * the player clock and the notices required to redistribute them.
 */
export async function writeHandPaintedSource(targetDir: string, runtimeDir: string): Promise<string[]> {
  const p5Min = path.join(path.dirname(path.dirname(require.resolve('p5'))), 'lib', 'p5.min.js');
  const brush = require.resolve('p5.brush');
  const source = handPaintedStarterSource(await readFile(path.join(runtimeDir, 'template.html'), 'utf8'));
  await mkdir(path.join(targetDir, 'licenses'));
  await Promise.all([
    writeFile(path.join(targetDir, 'index.html'), source, { encoding: 'utf8', flag: 'wx' }),
    writeFile(path.join(targetDir, 'hand-painted-clock.js'), HAND_PAINTED_CLOCK_SCRIPT, { encoding: 'utf8', flag: 'wx' }),
    writeFile(path.join(targetDir, 'licenses', 'README.md'), licenseReadme(), { encoding: 'utf8', flag: 'wx' }),
    copyFile(p5Min, path.join(targetDir, 'p5.min.js')),
    copyFile(brush, path.join(targetDir, 'p5.brush.js')),
    ...ENGINE_FILES.map((file) => copyFile(path.join(runtimeDir, file), path.join(targetDir, file))),
    ...LICENSE_FILES.map(([from, to]) => copyFile(path.join(runtimeDir, from), path.join(targetDir, to))),
  ]);
  return [
    'index.html', 'p5.min.js', 'p5.brush.js', ...ENGINE_FILES, 'hand-painted-clock.js',
    'licenses/README.md', ...LICENSE_FILES.map(([, to]) => to),
  ];
}

export function assertHandPaintedOptions(input: { length?: number | undefined; aspect?: string | undefined }): void {
  if (input.length !== undefined && input.length !== HAND_PAINTED_DURATION_SECONDS) {
    throw new Error('Hand-painted Motion currently supports exactly 5 seconds');
  }
  if (input.aspect && input.aspect !== '16:9') {
    throw new Error('Hand-painted Motion currently supports only 16:9');
  }
}

/** Capture document: the author's source unchanged, plus a frame bridge. */
export function handPaintedCaptureDocument(sourceHtml: string): string {
  const $ = load(sourceHtml);
  if (!isMotionVideoComposition(sourceHtml)) {
    throw new Error('Hand-painted source must declare <meta name="od-motion-output" content="video">. Scaffold it with `media scaffold --template hand-painted`.');
  }
  if ($('audio,video').length > 0) throw new Error('Hand-painted Motion currently supports silent video only');
  const remote = $('script[src]').toArray().map((el) => $(el).attr('src') ?? '')
    .find((src) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src));
  if (remote) throw new Error(`Hand-painted source must use its local scripts, not ${remote}`);
  if ($('canvas#out').length !== 1) throw new Error('Hand-painted source must contain one canvas with id="out"');
  const root = $('[data-composition-id]').first();
  if (Number(root.attr('data-duration')) !== HAND_PAINTED_DURATION_SECONDS
    || Number(root.attr('data-width')) !== HAND_PAINTED_WIDTH
    || Number(root.attr('data-height')) !== HAND_PAINTED_HEIGHT) {
    throw new Error('Hand-painted source root must stay 5 seconds at 1920×1080');
  }
  const captureHead = `<script>window.__odAnimationError = null; addEventListener('error', function (e) { window.__odAnimationError = e.message || 'Animation script failed'; });</script>
<style>html,body{margin:0!important;padding:0!important;overflow:hidden!important}</style>`;
  const bridge = `<script>
window.__odFrameRenderer = {
  async ready() {
    const deadline = Date.now() + 45000;
    while (window.ready !== true) {
      if (window.__odAnimationError) throw new Error(window.__odAnimationError);
      if (Date.now() > deadline) throw new Error('Hand-painted engine was not ready after 45 seconds; check the local p5 scripts');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (typeof PROJECT === 'undefined' || PROJECT.duration !== ${HAND_PAINTED_DURATION_SECONDS}) throw new Error('Hand-painted PROJECT.duration must be ${HAND_PAINTED_DURATION_SECONDS} seconds');
    if (PROJECT.audio) throw new Error('Hand-painted Motion supports silent video only');
    if (window.__odAnimationError) throw new Error(window.__odAnimationError);
    return { duration: ${HAND_PAINTED_DURATION_SECONDS}, fps: ${HAND_PAINTED_FPS} };
  },
  async seek(timeSeconds) {
    await window.renderAt(timeSeconds);
    if (window.__odAnimationError) throw new Error(window.__odAnimationError);
  }
};
</script>`;
  $('head').prepend(captureHead);
  $('body').append(bridge);
  return markMotionFrameRender($.html());
}

export async function renderHandPainted(input: {
  projectDir: string;
  compositionDir: string | null;
  outputPath: string;
  desktopFrameRenderer: FrameRenderer | null;
  onProgress?: ((message: string) => void) | undefined;
}): Promise<{ bytes: Buffer; providerNote: string }> {
  const rel = input.compositionDir?.trim() ?? '';
  const parts = path.normalize(rel).split(path.sep);
  if (!rel || path.isAbsolute(rel) || parts.length !== 2 || parts[0] !== 'motion-source') {
    throw new Error('Hand-painted Motion requires --composition-dir motion-source/<id> created by `media scaffold --template hand-painted`');
  }
  const projectDir = await realpath(input.projectDir);
  const inside = (file: string) => file.startsWith(projectDir + path.sep);
  const compositionDir = await realpath(path.resolve(projectDir, rel));
  if (!inside(compositionDir)) throw new Error('Hand-painted composition must stay inside the project');
  const entry = await realpath(path.join(compositionDir, 'index.html'));
  if (!inside(entry)) throw new Error('Hand-painted index.html must stay inside the project');
  const html = handPaintedCaptureDocument(await readFile(entry, 'utf8'));
  const exportSpec = await readMotionExportSpec({
    projectRoot: projectDir, sourcePath: path.join(rel, 'index.html'), outputPath: input.outputPath,
  });
  if (!exportSpec || exportSpec.audio !== 'silent') {
    throw new Error('Hand-painted Motion exports silent video only');
  }
  if (!input.desktopFrameRenderer) {
    throw new Error('Open Design desktop frame renderer is unavailable. Open the desktop client and try again.');
  }
  const scratch = await mkdtemp(path.join(compositionDir, '.render-'));
  try {
    input.onProgress?.(`Rendering ${HAND_PAINTED_FRAME_COUNT} hand-painted frames with the bundled Electron Chromium…`);
    const frames = await input.desktopFrameRenderer({
      html, baseHref: pathToFileURL(`${compositionDir}${path.sep}`).href,
      width: HAND_PAINTED_WIDTH, height: HAND_PAINTED_HEIGHT, fps: HAND_PAINTED_FPS,
      outputDir: path.join(scratch, 'frames'),
    });
    if (!frames.ok) throw new Error(frames.error || 'Hand-painted frame capture failed');
    if (!frames.framePattern || frames.frameCount !== HAND_PAINTED_FRAME_COUNT || frames.fps !== HAND_PAINTED_FPS
      || (frames.width !== undefined && frames.width !== HAND_PAINTED_WIDTH)
      || (frames.height !== undefined && frames.height !== HAND_PAINTED_HEIGHT)) {
      throw new Error(`Hand-painted renderer must produce ${HAND_PAINTED_FRAME_COUNT} frames at 1920×1080 and ${HAND_PAINTED_FPS} fps`);
    }
    input.onProgress?.('Encoding the 5-second silent MP4…');
    const output = path.join(scratch, 'film.mp4');
    await encodeFramesMp4(frames.framePattern, frames.fps, output);
    await assertMotionExport(output, exportSpec);
    return { bytes: await readFile(output), providerNote: 'motion/hand-painted · electron-p5 · 5s · 16:9 · silent' };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
