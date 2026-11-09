import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const DESIGN_JURY_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

const AGENT_BROWSER = '/opt/homebrew/bin/agent-browser';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export interface VisualCaptureResult {
  captures: Array<{
    width: number;
    height: number;
    png: Buffer;
    geometry: Record<string, unknown>;
  }>;
}

function runIdSegment(runId: string): string {
  return `odj-${createHash('sha256').update(runId).digest('hex').slice(0, 12)}`;
}

function geometryScript(): string {
  return `(() => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      const s = getComputedStyle(element);
      return { tag: element.tagName.toLowerCase(), id: element.id || null,
        label: (element.getAttribute('aria-label') || element.innerText || '').slice(0, 120),
        x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
        gap: s.gap, padding: s.padding, display: s.display };
    };
    const landmarks = Array.from(document.querySelectorAll('nav, aside, [role="navigation"]')).slice(0, 40).map(rect);
    const controls = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]')).slice(0, 120).map(rect);
    return JSON.stringify({ viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth }, landmarks, controls });
  })()`;
}

function baseArgs(runId: string): string[] {
  const session = `od-visual-jury-${runIdSegment(runId)}`;
  return [
    '--session', session,
    '--namespace', 'odj',
    '--executable-path', CHROME,
    '--allowed-domains', '127.0.0.1,localhost',
    '--idle-timeout', '30s',
  ];
}

function runBrowserCommand(
  args: string[],
  input: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('visual capture canceled'));
    const child: ChildProcess = spawn(AGENT_BROWSER, args, {
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const kill = () => {
      if (child.pid && process.platform !== 'win32') {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* exited */ }
      } else child.kill('SIGTERM');
    };
    const abort = () => kill();
    const timeout = setTimeout(() => { timedOut = true; kill(); }, COMMAND_TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > MAX_COMMAND_OUTPUT_BYTES) kill();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      if (Buffer.byteLength(stderr) > MAX_COMMAND_OUTPUT_BYTES) kill();
    });
    child.once('error', (error) => reject(error));
    child.once('close', (code, childSignal) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new Error('visual capture canceled'));
      if (timedOut) return reject(new Error(`agent-browser command timed out after ${COMMAND_TIMEOUT_MS}ms`));
      if (code !== 0) {
        const diagnostics = [stderr.trim() && `stderr: ${stderr.trim().slice(-2000)}`, stdout.trim() && `stdout: ${stdout.trim().slice(-2000)}`]
          .filter(Boolean).join('\n') || 'no diagnostic output';
        return reject(new Error(`agent-browser failed (${code ?? childSignal ?? 'unknown'}): ${diagnostics}`));
      }
      if (Buffer.byteLength(stdout) > MAX_COMMAND_OUTPUT_BYTES) return reject(new Error('agent-browser output exceeded its bounded size'));
      resolve(stdout);
    });
    if (input !== undefined) child.stdin?.end(input);
    else child.stdin?.end();
  });
}

function findJsonObject(value: unknown, predicate: (record: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonObject(item, predicate);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (predicate(record)) return record;
    for (const item of Object.values(record)) {
      const found = findJsonObject(item, predicate);
      if (found) return found;
    }
  } else if (typeof value === 'string' && value.length <= MAX_COMMAND_OUTPUT_BYTES) {
    try { return findJsonObject(JSON.parse(value), predicate); } catch { /* not JSON */ }
  }
  return null;
}

function parseGeometry(stdout: string, width: number, height: number): Record<string, unknown> {
  let output: unknown;
  try { output = JSON.parse(stdout); } catch { throw new Error('agent-browser returned invalid JSON for geometry inspection'); }
  const geometry = findJsonObject(output, (record) =>
    record.viewport != null && typeof record.document === 'object' && Array.isArray(record.landmarks),
  );
  const viewport = geometry?.viewport as Record<string, unknown> | undefined;
  if (!geometry || viewport?.width !== width || viewport?.height !== height) {
    throw new Error(`agent-browser did not return DOM geometry for ${width}x${height}`);
  }
  return geometry;
}

function assertPngSize(data: Buffer, width: number, height: number): void {
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('agent-browser screenshot is not a PNG image');
  }
  if (data.readUInt32BE(16) !== width || data.readUInt32BE(20) !== height) {
    throw new Error(`agent-browser screenshot size did not match ${width}x${height}`);
  }
  if (data.length > MAX_IMAGE_BYTES) throw new Error(`agent-browser screenshot exceeds ${MAX_IMAGE_BYTES} bytes`);
}

export async function captureDesignJuryViewports(input: {
  runId: string;
  url: string;
  signal?: AbortSignal;
}): Promise<VisualCaptureResult> {
  const target = new URL(input.url);
  if (
    target.protocol !== 'http:'
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !target.port
    || target.username
    || target.password
  ) throw new Error('visual capture accepts only an explicit loopback daemon preview URL');

  const scratch = await mkdtemp(path.join(tmpdir(), 'od-jury-visual-'));
  const captures: VisualCaptureResult['captures'] = [];
  const base = baseArgs(input.runId);
  const common = [...base, '--json', 'batch', '--bail'];
  let openAttempted = false;
  try {
    openAttempted = true;
    await runBrowserCommand(common, JSON.stringify([['open', input.url]]), input.signal);
    await runBrowserCommand(common, JSON.stringify([
      ['wait', '--load', 'load'],
      ['wait', '--fn', "document.readyState === 'complete' && document.body && document.body.innerText.trim().length > 0 && !document.querySelector('[aria-busy=true], [role=progressbar]')"],
    ]), input.signal);
    for (const viewport of DESIGN_JURY_VIEWPORTS) {
      const screenshotPath = path.join(scratch, `${viewport.width}x${viewport.height}.png`);
      const stdout = await runBrowserCommand(
        common,
        JSON.stringify([
          ['set', 'viewport', String(viewport.width), String(viewport.height), '1'],
          ['eval', geometryScript()],
          ['screenshot', screenshotPath],
        ]),
        input.signal,
      );
      const geometry = parseGeometry(stdout, viewport.width, viewport.height);
      const png = await readFile(screenshotPath);
      assertPngSize(png, viewport.width, viewport.height);
      captures.push({ ...viewport, png, geometry });
    }
    return { captures };
  } finally {
    if (openAttempted) {
      try { await runBrowserCommand([...base, '--json', 'close'], undefined); }
      catch (error) { console.warn('[design-jury] browser session close failed', error); }
    }
    await rm(scratch, { recursive: true, force: true });
  }
}
