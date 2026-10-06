import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserWindow: vi.fn(),
  loadArtifactDocument: vi.fn(async () => {}),
  waitForPrintableContent: vi.fn(async () => {}),
}));

vi.mock('electron', () => ({ BrowserWindow: mocks.browserWindow }));
vi.mock('../../src/main/deck-capture.js', () => ({
  loadArtifactDocument: mocks.loadArtifactDocument,
}));
vi.mock('../../src/main/pdf-export.js', () => ({
  waitForPrintableContent: mocks.waitForPrintableContent,
}));

import {
  FRAME_CAPTURE_STAGE_TIMEOUT_MS,
  frameFilePath,
  renderDeterministicFrames,
} from '../../src/main/frame-capture.js';

const desktopRoot = fileURLToPath(new URL('../../', import.meta.url));
const execFileAsync = promisify(execFile);

describe('deterministic Electron frame capture', () => {
  const scratch: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    await Promise.all(scratch.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  test('[P0] seeks every frame before taking a fresh CDP screenshot', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'od-frame-capture-'));
    scratch.push(outputDir);
    const events: string[] = [];
    const debuggerApi = {
      attach: vi.fn(() => events.push('attach')),
      detach: vi.fn(() => events.push('detach')),
      sendCommand: vi.fn(async (command: string) => {
        if (command === 'Page.captureScreenshot') {
          events.push('capture');
          return { data: Buffer.from('png-frame').toString('base64') };
        }
        events.push(command);
        return {};
      }),
    };
    const window = {
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => false),
      setContentSize: vi.fn(),
      setOpacity: vi.fn(),
      showInactive: vi.fn(),
      webContents: {
        debugger: debuggerApi,
        executeJavaScript: vi.fn(async (expression: string) => {
          if (expression.includes('bridge.ready')) return { duration: 0.1, fps: 30, hasAudio: false };
          if (expression.includes('__odFrameRenderer.seek')) {
            const match = /seek\([^,]+, (\d+)\)/.exec(expression);
            events.push(`seek:${match?.[1] ?? '?'}`);
          } else if (expression.includes('requestAnimationFrame')) {
            events.push('settle');
          }
          return undefined;
        }),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      },
    };
    mocks.browserWindow.mockImplementation(function BrowserWindowMock() {
      return window;
    });

    const result = await renderDeterministicFrames({
      fps: 30,
      height: 180,
      html: '<main></main>',
      outputDir,
      width: 320,
    });

    expect(result).toMatchObject({ frameCount: 3, fps: 30, ok: true });
    expect(mocks.browserWindow).toHaveBeenCalledWith(expect.objectContaining({
      webPreferences: expect.objectContaining({ backgroundThrottling: false }),
    }));
    expect(events.filter((event) => event.startsWith('seek:'))).toEqual(['seek:0', 'seek:1', 'seek:2']);
    expect(events.filter((event) => event === 'capture')).toHaveLength(3);
    const settleExpressions = window.webContents.executeJavaScript.mock.calls
      .map(([expression]) => expression)
      .filter((expression) => expression.includes('requestAnimationFrame'));
    expect(settleExpressions).toHaveLength(3);
    expect(settleExpressions.every((expression) => expression.includes('setTimeout(finish, 100)')))
      .toBe(true);
    for (let frame = 0; frame < 3; frame += 1) {
      const seek = events.indexOf(`seek:${frame}`);
      const capture = events.indexOf('capture', seek);
      expect(capture).toBeGreaterThan(seek);
      await expect(readFile(frameFilePath(outputDir, frame), 'utf8')).resolves.toBe('png-frame');
    }
    expect(debuggerApi.detach).toHaveBeenCalledOnce();
    expect(window.destroy).toHaveBeenCalledOnce();
  });

  test('uses zero-padded names that match the FFmpeg printf pattern', () => {
    expect(frameFilePath('/tmp/frames', 42)).toBe('/tmp/frames/frame-00000042.png');
  });

  test('rejects audio compositions instead of silently producing a muted video', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'od-frame-capture-audio-'));
    scratch.push(outputDir);
    const attach = vi.fn();
    const window = {
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => false),
      setContentSize: vi.fn(),
      setOpacity: vi.fn(),
      showInactive: vi.fn(),
      webContents: {
        debugger: {
          attach,
          detach: vi.fn(),
          sendCommand: vi.fn(),
        },
        executeJavaScript: vi.fn(async (expression: string) => {
          if (expression.includes('bridge.ready')) {
            return { duration: 1, fps: 30, hasAudio: true };
          }
          return undefined;
        }),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      },
    };
    mocks.browserWindow.mockImplementation(function BrowserWindowMock() {
      return window;
    });

    await expect(renderDeterministicFrames({
      height: 180,
      html: '<main><audio src="voice.wav"></audio></main>',
      outputDir,
      width: 320,
    })).resolves.toMatchObject({
      errorCode: 'AUDIO_UNSUPPORTED',
      ok: false,
    });
    expect(attach).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
  });

  test('stops capturing and destroys the render window when the desktop deadline expires', async () => {
    vi.useFakeTimers();
    const outputDir = await mkdtemp(join(tmpdir(), 'od-frame-capture-timeout-'));
    scratch.push(outputDir);
    let releaseStalledSeek: (() => void) | undefined;
    const stalledSeek = new Promise<void>((resolve) => {
      releaseStalledSeek = resolve;
    });
    let markSecondSeekStarted: (() => void) | undefined;
    const secondSeekStarted = new Promise<void>((resolve) => {
      markSecondSeekStarted = resolve;
    });
    let seekCount = 0;
    const debuggerApi = {
      attach: vi.fn(),
      detach: vi.fn(),
      sendCommand: vi.fn(async (command: string) => {
        if (command === 'Page.captureScreenshot') {
          return { data: Buffer.from('png-frame').toString('base64') };
        }
        return {};
      }),
    };
    const window = {
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => false),
      setContentSize: vi.fn(),
      setOpacity: vi.fn(),
      showInactive: vi.fn(),
      webContents: {
        debugger: debuggerApi,
        executeJavaScript: vi.fn(async (expression: string) => {
          if (expression.includes('bridge.ready')) {
            return { duration: 1, fps: 30, hasAudio: false };
          }
          if (expression.includes('__odFrameRenderer.seek')) {
            seekCount += 1;
            if (seekCount === 2) {
              markSecondSeekStarted?.();
              await stalledSeek;
            }
          }
          return undefined;
        }),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      },
    };
    mocks.browserWindow.mockImplementation(function BrowserWindowMock() {
      return window;
    });

    const renderPromise = renderDeterministicFrames({
      height: 180,
      html: '<main></main>',
      outputDir,
      width: 320,
    });
    await secondSeekStarted;
    expect(debuggerApi.sendCommand).toHaveBeenCalledWith(
      'Page.captureScreenshot',
      expect.any(Object),
    );

    await vi.advanceTimersByTimeAsync(FRAME_CAPTURE_STAGE_TIMEOUT_MS);
    await expect(renderPromise).resolves.toMatchObject({
      error: `Electron frame capture timed out during seek at frame 2/30 after ${FRAME_CAPTURE_STAGE_TIMEOUT_MS / 1_000} seconds (stage deadline)`,
      errorCode: 'RENDER_TIMEOUT',
      ok: false,
    });
    expect(debuggerApi.detach).toHaveBeenCalledOnce();
    expect(window.destroy).toHaveBeenCalledOnce();

    releaseStalledSeek?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(
      debuggerApi.sendCommand.mock.calls.filter(([command]) => command === 'Page.captureScreenshot'),
    ).toHaveLength(1);
    await expect(readFile(frameFilePath(outputDir, 1))).rejects.toThrow();
  });

  test('[P0] real Electron captures a multi-second WebGL timeline without background paint stalls', async () => {
    const result = await probeRealElectronWebGlCapture();
    expect(result.frameCount).toBe(210);
    expect(result.lastFrameBytes).toBeGreaterThan(0);
    expect(result.firstFrameSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.lastFrameSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.lastFrameSha256).not.toBe(result.firstFrameSha256);
  }, 120_000);
});

type ElectronCaptureProbeResult = {
  firstFrameSha256: string;
  frameCount: number;
  lastFrameBytes: number;
  lastFrameSha256: string;
};

async function probeRealElectronWebGlCapture(): Promise<ElectronCaptureProbeResult> {
  const probeDir = await mkdtemp(join(tmpdir(), 'od-frame-capture-electron-'));
  const outputDir = join(probeDir, 'frames');
  const htmlFile = join(probeDir, 'webgl-composition.html');
  const modulePath = join(desktopRoot, 'dist', 'main', 'frame-capture.js');
  await stat(modulePath);
  await writeFile(join(probeDir, 'package.json'), '{"main":"main.cjs"}\n');
  await writeFile(htmlFile, `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:320px;height:180px;overflow:hidden;background:#07111f}
canvas{width:320px;height:180px}
</style></head><body><canvas id="stage" width="320" height="180"></canvas><script>
const canvas=document.getElementById('stage');
const gl=canvas.getContext('webgl');
if(!gl) throw new Error('WebGL unavailable in Electron capture probe');
const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);return shader};
const program=gl.createProgram();
gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision mediump float;uniform float t;void main(){vec2 uv=gl_FragCoord.xy/vec2(320.,180.);gl_FragColor=vec4(uv.x,uv.y,0.35+0.3*sin(t*2.),1.);}'));
gl.linkProgram(program);gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const position=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
const time=gl.getUniformLocation(program,'t');
const paint=()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
globalThis.__odFrameRenderer={
  ready:async()=>({duration:7,fps:30}),
  seek:async(timeSeconds)=>{gl.uniform1f(time,timeSeconds);gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();await paint();},
};
</script></body></html>`, 'utf8');
  await writeFile(join(probeDir, 'main.cjs'), `
const { app } = require('electron');
const { readFile } = require('node:fs/promises');

app.whenReady().then(async () => {
  const { renderDeterministicFrames } = await import(process.env.OD_FRAME_CAPTURE_MODULE_URL);
  const capture = await renderDeterministicFrames({
    fps: 30,
    height: 180,
    html: await readFile(process.env.OD_FRAME_CAPTURE_HTML_FILE, 'utf8'),
    outputDir: process.env.OD_FRAME_CAPTURE_OUTPUT_DIR,
    width: 320,
  });
  if (!capture.ok) throw new Error(capture.error || 'Electron frame capture failed');
  app.quit();
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\\n');
  app.exit(1);
});
`);

  try {
    const electronRelativePath = (await readFile(
      join(desktopRoot, 'node_modules', 'electron', 'path.txt'),
      'utf8',
    )).trim();
    const electronPath = join(desktopRoot, 'node_modules', 'electron', 'dist', electronRelativePath);
    const electronArgs = [probeDir, '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'];
    const command = process.platform === 'linux' ? 'xvfb-run' : electronPath;
    const args = process.platform === 'linux' ? ['-a', electronPath, ...electronArgs] : electronArgs;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OD_FRAME_CAPTURE_HTML_FILE: htmlFile,
      OD_FRAME_CAPTURE_MODULE_URL: pathToFileURL(modulePath).href,
      OD_FRAME_CAPTURE_OUTPUT_DIR: outputDir,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    await execFileAsync(command, args, { env, timeout: 100_000 });
    const frameNames = (await readdir(outputDir))
      .filter((name) => /^frame-\d{8}\.png$/.test(name))
      .sort();
    const firstFrame = await readFile(join(outputDir, frameNames[0] ?? 'missing-first-frame'));
    const lastFramePath = join(outputDir, frameNames.at(-1) ?? 'missing-last-frame');
    const lastFrame = await readFile(lastFramePath);
    return {
      firstFrameSha256: createHash('sha256').update(firstFrame).digest('hex'),
      frameCount: frameNames.length,
      lastFrameBytes: (await stat(lastFramePath)).size,
      lastFrameSha256: createHash('sha256').update(lastFrame).digest('hex'),
    };
  } finally {
    await rm(probeDir, { force: true, recursive: true });
  }
}
