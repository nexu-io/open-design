// Regression for #6257 at the loop/CLI-output seam. The Windows failure was
// the CLI's final stdout line being dropped at the named-pipe handoff: `media
// wait` exited 0 with nothing on stdout, and the generate+wait loop that
// MEDIA_GENERATION_CONTRACT ships treated that as completion. The HTTP-body
// tolerance covered by media-wait-empty-tolerance.test.ts never reaches this
// boundary, so these tests run the loop text itself against a stub CLI and a
// stub project task-list endpoint.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MEDIA_GENERATION_CONTRACT } from '../src/prompts/media-contract.js';

const BASH_FENCE = /```bash\n([\s\S]*?)```/g;

function generateWaitLoop(): string {
  const blocks = [...MEDIA_GENERATION_CONTRACT.matchAll(BASH_FENCE)].map((match) => match[1] ?? '');
  const loop = blocks.find(
    (block) => block.includes('media generate') && block.includes('media wait') && block.includes('while'),
  );
  if (!loop) throw new Error('generate+wait loop not found in MEDIA_GENERATION_CONTRACT');
  return loop;
}

// Stand-in for `od media ...`: `generate` hands off a task, and each `wait`
// replays the next line of $STUB_RESPONSES. `empty` reproduces the Windows
// handoff — exit 0 with no stdout line at all.
const STUB_CLI = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
if [ "$1" = "media" ] && [ "$2" = "generate" ]; then
  echo '{"taskId":"t1","status":"running","nextSince":0}'
  exit 0
fi
count=$(cat "$STUB_COUNT" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$STUB_COUNT"
line=$(sed -n "$count"p "$STUB_RESPONSES" 2>/dev/null)
kind=$(printf '%s' "$line" | cut -d: -f1)
value=$(printf '%s' "$line" | cut -d: -f2)
case "$kind" in
  empty) exit 0 ;;
  running) printf '{"taskId":"t1","status":"running","nextSince":%s}\\n' "$value"; exit 0 ;;
  done) printf '{"status":"done","file":{"name":"%s","size":10,"kind":"video"}}\\n' "$value"; exit 0 ;;
  failed) echo '{"status":"failed","error":{"message":"boom"}}'; exit 5 ;;
esac
exit 0
`;

let server: http.Server | undefined;
let baseUrl = '';
let taskListRequests = 0;
let taskListBody: unknown = { tasks: [] };
const tempDirs: string[] = [];

beforeEach(async () => {
  taskListRequests = 0;
  taskListBody = { tasks: [] };
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url ?? '').includes('/media/tasks')) {
      taskListRequests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(taskListBody));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runGenerateWaitLoop(responses: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  calls: string[];
}> {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-media-loop-'));
  tempDirs.push(dir);
  const stub = path.join(dir, 'stub.sh');
  writeFileSync(stub, STUB_CLI);
  const responsesPath = path.join(dir, 'responses');
  writeFileSync(responsesPath, responses.map((line) => `${line}\n`).join(''));
  const logPath = path.join(dir, 'calls.log');
  writeFileSync(logPath, '');
  const countPath = path.join(dir, 'count');

  const child = spawn('bash', ['-c', generateWaitLoop()], {
    cwd: dir,
    env: {
      ...process.env,
      OD_NODE_BIN: 'bash',
      OD_BIN: stub,
      OD_PROJECT_ID: 'p1',
      OD_DAEMON_URL: baseUrl,
      STUB_LOG: logPath,
      STUB_COUNT: countPath,
      STUB_RESPONSES: responsesPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr += chunk));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`loop never terminated; stdout=${stdout} stderr=${stderr}`));
    }, 15_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
        calls: readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean),
      });
    });
  });
}

function lastStdoutLine(stdout: string): string {
  return stdout.trim().split('\n').pop() ?? '';
}

describe('generate+wait loop recovers a lost final stdout line (#6257)', () => {
  it('recovers the file from the project task list when a wait exits 0 with empty stdout', async () => {
    taskListBody = {
      tasks: [{ taskId: 't1', status: 'done', file: { name: 'recovered.mp4', size: 321, kind: 'video' } }],
    };
    const result = await runGenerateWaitLoop(['empty', 'empty', 'empty']);
    expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    expect(JSON.parse(lastStdoutLine(result.stdout)).file.name).toBe('recovered.mp4');
    expect(taskListRequests).toBeGreaterThanOrEqual(1);
  });

  it('keeps the previous --since cursor when a wait line does not parse', async () => {
    const result = await runGenerateWaitLoop(['running:7', 'empty', 'done:final.mp4']);
    expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    const waits = result.calls.filter((call) => call.startsWith('media wait'));
    expect(waits.at(-1)).toContain('--since 7');
    expect(JSON.parse(lastStdoutLine(result.stdout)).file.name).toBe('final.mp4');
  });

  it('still terminates on an explicit failed status', async () => {
    const result = await runGenerateWaitLoop(['failed']);
    expect(result.code).toBe(5);
  });
});
