// Regression for #6257: Polling layer must tolerate empty/early poll results and recover.
// Before fix, POST /wait returning empty/whitespace/non-JSON or ambiguous status caused exit 4 (failure).
// After fix, those are treated as still-running (exit 2/0 eventually) and the task completes when daemon returns done.
// This test simulates poll responses without a Fal.ai key, as required by dispatch.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let server: http.Server | undefined;
let baseUrl = '';
let callCount = 0;
let sequence: Array<{ status: number; body: string | null }> = [];

beforeEach(async () => {
  callCount = 0;
  sequence = [];
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && (req.url ?? '').includes('/media/tasks/')) {
      const idx = callCount++;
      req.resume();
      const entry = sequence[idx] ?? sequence[sequence.length - 1];
      const status = entry?.status ?? 200;
      const body = entry?.body ?? '';
      if (body === null) {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end('');
        return;
      }
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});

function runMediaWait(taskId: string, timeoutMs = 15000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, 'media', 'wait', taskId, '--daemon-url', baseUrl], {
      cwd: daemonRoot,
      env: { ...process.env, OD_PROJECT_ID: 'p1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', reject);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for media wait; stdout=${stdout} stderr=${stderr} calls=${callCount}`));
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.stdin.end();
  });
}

describe('media wait tolerates empty/ambiguous poll results (#6257)', () => {
  it('empty body then done: retries and exits 0', async () => {
    const done = JSON.stringify({ status: 'done', file: { name: 'clip.mp4', size: 123, kind: 'video' }, nextSince: 1 });
    sequence = [
      { status: 200, body: '' },
      { status: 200, body: done },
    ];
    const { code, stdout, stderr } = await runMediaWait('task-empty-then-done');
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(code, `expected exit 0 after empty retry; stderr:\n${stderr}\nstdout:\n${stdout}`).toBe(0);
    const lastLine = stdout.trim().split('\n').pop() ?? '';
    const parsed = JSON.parse(lastLine);
    expect(parsed.file.name).toBe('clip.mp4');
  });

  it('whitespace + non-JSON then done: retries and exits 0', async () => {
    const done = JSON.stringify({ status: 'done', file: { name: 'out.mp4', size: 456, kind: 'video' } });
    sequence = [
      { status: 200, body: '   \n' },
      { status: 200, body: 'not-json{' },
      { status: 200, body: done },
    ];
    const { code, stdout, stderr } = await runMediaWait('task-whitespace-then-done');
    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(code, `stderr:\n${stderr}\nstdout:\n${stdout}`).toBe(0);
    const last = stdout.trim().split('\n').pop()!;
    expect(JSON.parse(last).file.name).toBe('out.mp4');
  });

  it('ambiguous status {} then running then done: does not fail, eventually done', async () => {
    const running = JSON.stringify({ status: 'running', progress: [], nextSince: 1 });
    const done = JSON.stringify({ status: 'done', file: { name: 'final.mp4', size: 789, kind: 'video' } });
    sequence = [
      { status: 200, body: JSON.stringify({ progress: [], nextSince: 0 }) },
      { status: 200, body: running },
      { status: 200, body: done },
    ];
    const { code, stdout } = await runMediaWait('task-ambiguous-then-done');
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(code).toBe(0);
    const last = stdout.trim().split('\n').pop()!;
    expect(JSON.parse(last).file.name).toBe('final.mp4');
  });

  it('still reports explicit failed status as failure (exit 5) not masked by tolerance', async () => {
    const failed = JSON.stringify({ status: 'failed', error: { message: 'provider boom', status: 5 } });
    sequence = [{ status: 200, body: failed }];
    const { code } = await runMediaWait('task-failed');
    expect(code).toBe(5);
  });
});
