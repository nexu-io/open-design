// Contract test for `od run steer` — the CLI half of B11 「引导对话」.
//
// AGENTS.md "Capability exposure": every user-facing capability must be
// reachable from BOTH the web UI and `od`, and both must drive the same
// `/api/*` endpoint. Steering is the queue row's third button in the chat
// panel; this proves the CLI hits the identical `POST /api/runs/:id/steer`
// with the same body, supports `--json` for headless agents, and accepts a
// long instruction through `--prompt-file <path|->` so heredoc / jq pipelines
// stay clean.
//
// Stub HTTP server rather than a booted daemon: what needs proving here is
// routing, flag parsing, and the emitted request — the delivery semantics are
// covered against the real daemon in run-steer-route.test.ts.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  setResponder: (
    fn: (req: CapturedRequest) => { status: number; body: unknown },
  ) => void;
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let responder: ((req: CapturedRequest) => { status: number; body: unknown }) | null = null;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const captured: CapturedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw,
      };
      requests.push(captured);
      const response = responder?.(captured) ?? { status: 200, body: { ok: true } };
      res.statusCode = response.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response.body));
    });
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    requests,
    setResponder: (fn) => {
      responder = fn;
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

async function runCli(
  args: string[],
  options: { input?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const child = execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, ...args],
      { cwd: DAEMON_ROOT, env, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
    );
    if (options.input !== undefined) {
      child.child.stdin?.end(options.input);
    }
    const { stdout, stderr } = await child;
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const failed = err as { stdout?: string; stderr?: string; code?: number | null };
    return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? '', code: failed.code ?? 1 };
  }
}

describe('od run steer CLI', () => {
  let stub: StubServer;
  let tmpDir: string;

  beforeAll(async () => {
    stub = await startStubServer();
    tmpDir = await mkdtemp(join(os.tmpdir(), 'od-b11-cli-steer-'));
  });

  afterAll(async () => {
    await stub.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    stub.requests.length = 0;
    stub.setResponder(() => ({
      status: 200,
      body: {
        ok: true,
        delivered: true,
        messageId: 'msg-steer-1',
        run: { id: 'run-1', status: 'running' },
      },
    }));
  });

  it('POSTs the message to the same /api/runs/:id/steer the UI uses', async () => {
    const result = await runCli([
      'run', 'steer', 'run-1',
      '--message', 'shorten the hero copy',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    const request = stub.requests.find((entry) => entry.url.includes('/steer'));
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('/api/runs/run-1/steer');
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ text: 'shorten the hero copy' });
    // Clean, chainable stdout: runId, the persisted message id, run status.
    expect(result.stdout.trim().split('\t')).toEqual(['run-1', 'msg-steer-1', 'running']);
  }, 40_000);

  it('emits raw JSON under --json for headless agents', async () => {
    const result = await runCli([
      'run', 'steer', 'run-1',
      '--message', 'go on',
      '--json',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      delivered: true,
      messageId: 'msg-steer-1',
    });
  }, 40_000);

  it('reads a long instruction from --prompt-file, and from stdin via `-`', async () => {
    const promptPath = join(tmpDir, 'steer.txt');
    const body = 'line one\nline two\nline three';
    await writeFile(promptPath, body, 'utf8');

    const fromFile = await runCli([
      'run', 'steer', 'run-1',
      '--prompt-file', promptPath,
      '--daemon-url', stub.baseUrl,
    ]);
    expect(fromFile.code).toBe(0);
    expect(JSON.parse(stub.requests.at(-1)?.body ?? '{}')).toEqual({ text: body });

    stub.requests.length = 0;
    const fromStdin = await runCli([
      'run', 'steer', 'run-1',
      '--prompt-file', '-',
      '--daemon-url', stub.baseUrl,
    ], { input: `${body}\n` });
    expect(fromStdin.code).toBe(0);
    expect(JSON.parse(stub.requests.at(-1)?.body ?? '{}')).toEqual({ text: body });
  }, 60_000);

  it('surfaces the daemon refusal code instead of pretending it worked', async () => {
    stub.setResponder(() => ({
      status: 409,
      body: {
        error: {
          code: 'RUN_STEERING_UNSUPPORTED',
          message: 'agent codex cannot take a mid-turn message',
        },
      },
    }));
    const result = await runCli([
      'run', 'steer', 'run-1',
      '--message', 'steer me',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('RUN_STEERING_UNSUPPORTED');
  }, 40_000);

  it('refuses to send an empty instruction', async () => {
    const result = await runCli([
      'run', 'steer', 'run-1',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('od run steer <runId>');
    expect(stub.requests.some((entry) => entry.url.includes('/steer'))).toBe(false);
  }, 40_000);

  it('advertises itself in `od run` help so the capability is discoverable', async () => {
    const result = await runCli(['run', '--help']);
    expect(result.stdout).toContain('od run steer');
    expect(result.stdout).toContain('--prompt-file');
  }, 40_000);
});
