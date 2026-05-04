import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type VisualInspectInput = {
  projectId: string;
  projectRoot: string;
  filePath: string;
  url: string;
  outputRoot?: string;
  frames?: unknown;
  intervalMs?: unknown;
  width?: unknown;
  height?: unknown;
  fullPage?: boolean;
};

type FrameSpec = {
  index: number;
  timeMs: number;
  path: string;
};

type CapturedFrame = FrameSpec & {
  size: number;
  sha256: string;
};

type ConsoleEntry = {
  type: string;
  text: string;
};

export type VisualInspectReport = {
  ok: boolean;
  renderer: string;
  projectId: string;
  filePath: string;
  url: string;
  outputDir: string;
  viewport: {
    width: number;
    height: number;
  };
  frames: CapturedFrame[];
  animationChanged: boolean;
  uniqueFrameCount: number;
  console: ConsoleEntry[];
  warnings: string[];
  errors: string[];
};

const MAX_FRAMES = 12;
const MAX_CONSOLE_ENTRIES = 40;
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

export async function inspectProjectPreview(input: VisualInspectInput): Promise<VisualInspectReport> {
  const frameCount = clampNumber(input.frames, 5, 1, MAX_FRAMES);
  const intervalMs = clampNumber(input.intervalMs, 250, 50, 2_000);
  const width = clampNumber(input.width, 1440, 320, 3840);
  const height = clampNumber(input.height, 1000, 240, 2160);
  const outputRoot = input.outputRoot || input.projectRoot;
  const outputDir = path.join(outputRoot, '.od-visual', `${slugify(input.filePath)}-${Date.now()}`);
  const frameSpecs = Array.from({ length: frameCount }, (_, index) => ({
    index,
    timeMs: index * intervalMs,
    path: path.join(outputDir, `frame-${String(index).padStart(3, '0')}.png`),
  }));
  const warnings: string[] = [];
  const errors: string[] = [];

  await mkdir(outputDir, { recursive: true });

  try {
    const result = await captureWithPlaywright(input.url, frameSpecs, {
      width,
      height,
      fullPage: input.fullPage === true,
    });
    return buildReport(input, outputDir, width, height, 'playwright', result.frames, result.console, warnings, errors);
  } catch (error) {
    warnings.push(`Playwright unavailable; trying Chrome headless: ${errorMessage(error)}`);
  }

  try {
    const result = await captureWithChrome(input.url, frameSpecs, width, height);
    return buildReport(input, outputDir, width, height, 'chrome-headless', result.frames, [], warnings, errors);
  } catch (error) {
    errors.push(`Chrome headless unavailable: ${errorMessage(error)}`);
  }

  warnings.push('Visual inspection could not run. Install Google Chrome, set OD_CHROME_BIN, or add Playwright to the daemon runtime.');

  return {
    ok: false,
    renderer: 'unavailable',
    projectId: input.projectId,
    filePath: input.filePath,
    url: input.url,
    outputDir,
    viewport: { width, height },
    frames: [],
    animationChanged: false,
    uniqueFrameCount: 0,
    console: [],
    warnings,
    errors,
  };
}

async function captureWithPlaywright(
  url: string,
  frameSpecs: FrameSpec[],
  options: { width: number; height: number; fullPage: boolean },
): Promise<{ frames: CapturedFrame[]; console: ConsoleEntry[] }> {
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const consoleEntries: ConsoleEntry[] = [];

  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });

    page.on('console', (message: any) => {
      const type = typeof message.type === 'function' ? message.type() : 'console';
      if (!['error', 'warning'].includes(type)) return;
      const text = typeof message.text === 'function' ? message.text() : String(message);
      pushConsole(consoleEntries, { type, text });
    });

    page.on('pageerror', (error: Error) => {
      pushConsole(consoleEntries, { type: 'pageerror', text: error.message });
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });

    const frames: CapturedFrame[] = [];
    let elapsed = 0;

    for (const frame of frameSpecs) {
      const waitMs = frame.index === 0 ? 100 : Math.max(0, frame.timeMs - elapsed);
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      elapsed += waitMs;
      await page.screenshot({ path: frame.path, fullPage: options.fullPage });
      frames.push(await readFrame(frame));
    }

    return { frames, console: consoleEntries };
  } finally {
    await browser.close();
  }
}

async function captureWithChrome(
  url: string,
  frameSpecs: FrameSpec[],
  width: number,
  height: number,
): Promise<{ frames: CapturedFrame[] }> {
  const chrome = await findChrome();
  if (!chrome) throw new Error('no browser executable found');

  const frames: CapturedFrame[] = [];

  for (const frame of frameSpecs) {
    const waitMs = Math.max(100, frame.timeMs);
    const result = await runProcess(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--run-all-compositor-stages-before-draw',
      `--window-size=${width},${height}`,
      `--virtual-time-budget=${waitMs}`,
      `--screenshot=${frame.path}`,
      url,
    ], 20_000);

    if (result.code !== 0) {
      throw new Error(trimProcessOutput(result.stderr || result.stdout || `exit ${result.code}`));
    }

    frames.push(await readFrame(frame));
  }

  return { frames };
}

async function loadPlaywright(): Promise<any> {
  const importModule = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

  try {
    return await importModule('playwright');
  } catch {
    return await importModule('playwright-core');
  }
}

async function findChrome(): Promise<string | null> {
  const envChrome = process.env.OD_CHROME_BIN || process.env.CHROME_BIN;
  if (envChrome && existsSync(envChrome)) return envChrome;

  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  const commandNames = os.platform() === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'];

  for (const command of commandNames) {
    const found = await findOnPath(command);
    if (found) return found;
  }

  return null;
}

async function findOnPath(command: string): Promise<string | null> {
  const lookup = os.platform() === 'win32' ? 'where' : 'which';
  const result = await runProcess(lookup, [command], 2_000);
  if (result.code !== 0) return null;
  const firstLine = result.stdout.split(/\r?\n/).find(Boolean);
  return firstLine || null;
}

async function runProcess(
  command: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}\nprocess timed out after ${timeoutMs}ms` : stderr,
      });
    });
  });
}

async function readFrame(frame: FrameSpec): Promise<CapturedFrame> {
  const [stats, buffer] = await Promise.all([stat(frame.path), readFile(frame.path)]);
  return {
    ...frame,
    size: stats.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function buildReport(
  input: VisualInspectInput,
  outputDir: string,
  width: number,
  height: number,
  renderer: string,
  frames: CapturedFrame[],
  consoleEntries: ConsoleEntry[],
  warnings: string[],
  errors: string[],
): VisualInspectReport {
  const uniqueFrameCount = new Set(frames.map((frame) => frame.sha256)).size;
  const nextWarnings = [...warnings];

  if (frames.length > 1 && uniqueFrameCount <= 1) {
    nextWarnings.push('Captured frames are visually identical. If this artifact should animate, inspect the CSS or timing.');
  }

  if (frames.some((frame) => frame.size < 1_000)) {
    nextWarnings.push('At least one screenshot is extremely small. The preview may be blank or failed to render.');
  }

  return {
    ok: true,
    renderer,
    projectId: input.projectId,
    filePath: input.filePath,
    url: input.url,
    outputDir,
    viewport: { width, height },
    frames,
    animationChanged: uniqueFrameCount > 1,
    uniqueFrameCount,
    console: consoleEntries,
    warnings: nextWarnings,
    errors,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function pushConsole(entries: ConsoleEntry[], entry: ConsoleEntry): void {
  if (entries.length >= MAX_CONSOLE_ENTRIES) return;
  entries.push({ type: entry.type, text: entry.text.slice(0, 1_000) });
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'preview';
}

function trimProcessOutput(value: string): string {
  const normalized = value.trim();
  return normalized.length > 2_000 ? `${normalized.slice(0, 2_000)}...` : normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
