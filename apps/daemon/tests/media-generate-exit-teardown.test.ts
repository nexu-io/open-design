// Regression spec — `od media generate` must close its undici keep-alive
// connection to the daemon BEFORE the process exits.
//
// Background: on Node 24 + native Windows, a fetch-then-process.exit() on the
// same tick aborts the process with the libuv UV_HANDLE_CLOSING assertion
// (src/win/async.c:94, 0xC0000409; upstream nodejs/node#56645, fix #61999 not
// in a released Node). The undici global dispatcher's keep-alive socket is
// still live while the process tears down, so libuv hits a closed async handle.
//
// The abort itself is unobservable on Linux, so this spec proves the
// Linux-provable proxy: the child must close its connection to the daemon at
// least 1ms before the process exits. On base, process.exit() fires while the
// keep-alive socket is still live, so the server observes the close ~0-1ms
// before (or at) the child's exit. After the fix (global dispatcher destroyed
// first) the close is observed 2-3ms before the child exits. Three iterations
// are used because a single run can pass on base ~17% of the time; asserting on
// the minimum margin across 3 runs keeps the regression red.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

const PROMPT = 'teardown-regression prompt for socket-close ordering';

let server: http.Server | undefined;
let baseUrl = '';
let seenBodies: string[] = [];
let socketCloseTimes: number[] = [];

beforeEach(async () => {
  seenBodies = [];
  socketCloseTimes = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.method === 'POST' && (req.url ?? '').includes('/media/generate')) {
        seenBodies.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'task-x', status: 'queued' }));
        return;
      }
      if ((req.url ?? '').includes('/media/tasks/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'done', file: { name: 'out.png', size: 3 } }));
        return;
      }
      res.writeHead(404).end();
    });
  });
  server.on('connection', (sock) => {
    sock.on('close', () => socketCloseTimes.push(Date.now()));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

interface Iteration {
  marginMs: number;
  totalMs: number;
  code: number;
  stderr: string;
}

async function runOnce(): Promise<Iteration> {
  const args = [
    '--import',
    'tsx',
    cliEntry,
    'media',
    'generate',
    '--surface',
    'image',
    '--model',
    'test-model',
    '--prompt',
    PROMPT,
    '--daemon-url',
    baseUrl,
  ];
  const closeBaseline = socketCloseTimes.length;
  const spawnAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: daemonRoot,
      env: { ...process.env, OD_PROJECT_ID: 'project-1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const childExitAt = Date.now();
      // Yield one macrotask so a socket-close event that was queued just before
      // the child-exit event is not missed.
      setImmediate(() => {
        const newCloses = socketCloseTimes.slice(closeBaseline);
        const lastSocketCloseAt =
          newCloses.length > 0 ? newCloses[newCloses.length - 1]! : childExitAt;
        resolve({
          marginMs: childExitAt - lastSocketCloseAt,
          totalMs: childExitAt - spawnAt,
          code: code ?? -1,
          stderr,
        });
      });
    });
  });
}

describe('od media generate exit teardown', () => {
  it('closes its keep-alive connection to the daemon before exiting on every run', async () => {
    const ITERATIONS = 3;
    const runs: Iteration[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      runs.push(await runOnce());
    }

    // Contract before timing/exit assertions: one generate POST per spawn, and
    // every one of them carried our prompt.
    expect(seenBodies).toHaveLength(ITERATIONS);
    for (const body of seenBodies) {
      expect(JSON.parse(body).prompt).toBe(PROMPT);
    }

    // Ordering assertion (the Linux proxy for the Windows-only abort): the
    // child must close its connection to the daemon at least 1ms before the
    // process exits. Base measures 0-1ms (process.exit() short-circuits
    // teardown while the pooled keep-alive socket is still live); the fixed
    // version measures 2-3ms (dispatcher destroyed first). Use the minimum
    // margin across all 3 runs so one lucky run cannot mask a regression.
    const margins = runs.map((r) => r.marginMs);
    const minMargin = Math.min(...margins);
    expect(
      minMargin,
      `margins (ms): ${margins.join(', ')} (base ~0-1ms, fixed ~2-3ms)`,
    ).toBeGreaterThanOrEqual(1);

    // Pins against a natural-drain regression: the undici keep-alive pool holds
    // the loop ~4s (keepAliveTimeout default), which would push every run past
    // the 2s ceiling.
    for (const run of runs) {
      expect(run.totalMs, `total ms: ${run.totalMs}`).toBeLessThan(2000);
    }

    // Exit 0 — on native Windows the same code path aborts with 0xC0000409.
    for (const run of runs) {
      expect(run.code, `exit ${run.code}; stderr:\n${run.stderr}`).toBe(0);
    }
  });
});
