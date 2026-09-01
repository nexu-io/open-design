// Red spec for issue #6540: `od media wait` (and `od media generate`'s poll)
// must not lose the final JSON line on process.exit().
//
// Root cause: in `pollUntilDoneOrBudget()` the done/failed/interrupted/handoff
// branches write the final JSON to stdout and then call `process.exit()` in the
// same synchronous block. `process.exit()` terminates the process without
// waiting for pending async I/O. When stdout is a pipe and a single write
// exceeds the kernel buffer (large `payload`/`error` fields), the write is
// still queued when the process dies → the caller sees exit 0/5 with empty or
// truncated stdout, and misjudges the task (re-submitting duplicate work or
// reporting a failure that never happened).
//
// Guard against a fake fix: a fixed-duration sleep before `process.exit()` is
// NOT an acceptable fix. With this spec's 6MB payload and the throttled
// reader (10ms pause per chunk, measured drain ≈6.4MB/s), a sleep-only change
// drains at most ~1s worth of data before dying; anything longer is treated as
// a real drain and must be rejected in review. The reader pauses after every
// chunk so the pipe stays near-full; a real drain — awaiting the write
// callback, as in the `flushStreamsAndExit` helper — blocks until every
// queued chunk has been read, so the full ~6MB payload arrives and these
// cases pass.
//
// Each case spawns the real src/cli.ts against a fake daemon whose
// `/api/media/tasks/<id>/wait` returns a terminal snapshot carrying a ~6MB
// payload. The asserted invariant is load completeness: the captured stdout
// must end with a full JSON line that deep-equals the daemon's object. A
// single write larger than the Linux pipe buffer (>64KiB) forces the
// unflushed-write race, so the spec goes red before the fix and green after.
//
// Covered branches: done (exit 0), failed (exit 5), interrupted (exit 5),
// non-2xx (exit 4).
//
// The non-2xx case is asserted on stderr instead of stdout: the fake daemon
// returns HTTP 500 with a 2MB JSON body, and the CLI writes
// `daemon 500: <body>` to stderr before exiting 4. The stderr reader is
// throttled exactly like stdout, so the full-body assertion proves the exit-4
// branch flushes stderr before exiting.
//
// Known gaps (deliberately not covered):
//   - handoff / still-running budget exhaustion (`od media wait` runs a real
//     120s budget, `od media generate` 25s). Waiting for the budget to elapse
//     is not viable in a test, so the still-running exit path (exit 2/0) is
//     not exercised here.
//   - 404 / fetch-error (exit 3) paths write only small lines to stderr, which
//     survive the unflushed-write race, so they carry no large-payload flush
//     invariant to assert and are out of scope for this regression spec.
//
// Note on fixtures: the failed/interrupted error objects carry `status: 5`.
// The CLI maps a failed snapshot to exit code `error.status || 5`; keeping the
// fixture status at 5 pins the assertion to a stable exit code 5 (an
// HTTP-style 500 would be mangled to 244 by process.exit's 8-bit exit code).

import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

const PAYLOAD = 'x'.repeat(6 * 1024 * 1024);
const ERROR_PAYLOAD = 'y'.repeat(2 * 1024 * 1024);

const sentFile = {
  name: 'out.png',
  size: PAYLOAD.length,
  mime: 'image/png',
  payload: PAYLOAD,
};

const failedError = { message: 'boom', status: 5, detail: PAYLOAD };
const interruptedError = { message: 'stopped', status: 5, detail: PAYLOAD };

let server: http.Server | undefined;
let baseUrl = '';
let waitCalls = 0;
let waitResponse: unknown;
let waitStatus = 200;
let waitErrorBody: string | undefined;

beforeEach(async () => {
  waitCalls = 0;
  waitResponse = { status: 'done', file: sentFile };
  waitStatus = 200;
  waitErrorBody = undefined;
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && (req.url ?? '').includes('/media/tasks/')) {
      waitCalls += 1;
      req.resume();
      res.writeHead(waitStatus, { 'content-type': 'application/json' });
      res.end(waitErrorBody ?? JSON.stringify(waitResponse));
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

async function runMediaWait(taskId: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // stdout must be piped so the write is queued async, and the data listener
    // must be attached immediately so no piped chunk is left unread.
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, 'media', 'wait', taskId, '--daemon-url', baseUrl], {
      cwd: daemonRoot,
      env: { ...process.env, OD_PROJECT_ID: 'p1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    // Throttled reader: pause 10ms after every chunk so the pipe stays near
    // full. A fixed-duration sleep-before-exit can then only drain ~1s worth
    // of data (≈6.4MB/s); a real drain (awaiting the write callback) blocks
    // until this reader has consumed every queued chunk.
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), 10);
    });
    child.stderr.setEncoding('utf8');
    // stderr gets the same throttled reader: the exit-4 non-2xx branch writes
    // a multi-MB `daemon 500: <body>` line there, and its flush must be proven
    // the same way stdout's is.
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      child.stderr.pause();
      setTimeout(() => child.stderr.resume(), 10);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ code: exitCode ?? -1, stdout, stderr }));
    child.stdin.end();
  });
}

function parseStdoutLine(stdout: string): unknown {
  const trimmed = stdout.replace(/\n$/, '');
  expect(trimmed, 'stdout ends with a single complete JSON line').not.toContain('\n');
  let parsed: unknown;
  expect(() => {
    parsed = JSON.parse(trimmed);
  }, `final stdout line parses as JSON (len=${trimmed.length})`).not.toThrow();
  return parsed;
}

describe('od media wait stdout flush before exit', () => {
  it('done branch: delivers the complete final JSON line when stdout is a pipe', async () => {
    waitResponse = { status: 'done', file: sentFile };
    const { code, stdout, stderr } = await runMediaWait('task-done');

    expect(waitCalls, 'fake daemon /media/tasks/.../wait was called').toBeGreaterThan(0);
    expect(code, `media wait exited ${code}; stderr:\n${stderr}`).toBe(0);

    const parsed = parseStdoutLine(stdout);
    const parsedFile = (parsed as { file?: unknown }).file;
    expect(parsedFile, 'stdout JSON carries a file object').toBeTruthy();
    expect(parsedFile).toEqual(sentFile);
  });

  it('failed branch: delivers the full error JSON and exits 5', async () => {
    waitResponse = { status: 'failed', error: failedError };
    const { code, stdout, stderr } = await runMediaWait('task-failed');

    expect(waitCalls, 'fake daemon /media/tasks/.../wait was called').toBeGreaterThan(0);
    expect(code, `media wait exited ${code}; stderr:\n${stderr}`).toBe(5);

    const parsed = parseStdoutLine(stdout);
    expect(parsed).toEqual({ taskId: 'task-failed', status: 'failed', error: failedError });
  });

  it('interrupted branch: delivers the full error JSON and exits 5', async () => {
    waitResponse = { status: 'interrupted', error: interruptedError };
    const { code, stdout, stderr } = await runMediaWait('task-interrupted');

    expect(waitCalls, 'fake daemon /media/tasks/.../wait was called').toBeGreaterThan(0);
    expect(code, `media wait exited ${code}; stderr:\n${stderr}`).toBe(5);

    const parsed = parseStdoutLine(stdout);
    expect(parsed).toEqual({ taskId: 'task-interrupted', status: 'interrupted', error: interruptedError });
  });

  it('non-2xx branch: flushes the full daemon error body to stderr and exits 4', async () => {
    waitStatus = 500;
    waitErrorBody = JSON.stringify({ error: ERROR_PAYLOAD });
    const { code, stdout, stderr } = await runMediaWait('task-500');

    expect(waitCalls, 'fake daemon /media/tasks/.../wait was called').toBeGreaterThan(0);
    expect(code, `media wait exited ${code}; stderr:\n${stderr}`).toBe(4);
    expect(stderr, 'stderr carries the full `daemon 500: <body>` line, proving it was not truncated').toContain(
      `daemon 500: ${waitErrorBody}`,
    );
    expect(stdout, 'non-2xx branch writes nothing to stdout').toBe('');
  });
});
