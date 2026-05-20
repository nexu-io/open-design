import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CLI_SRC = path.join(__dirname, '../src/cli.ts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const execFileP = promisify(execFile);

let server: http.Server;
let baseUrl: string;
let lastBody: Record<string, unknown> | null = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { lastBody = JSON.parse(raw); } catch { lastBody = null; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        kind: 'claude',
        agentName: 'Claude',
        diagnostics: { phase: 'binary', binaryPath: '/usr/local/bin/claude' },
      }));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('server did not bind');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const env = { ...process.env };
  delete env.OD_DAEMON_URL;
  delete env.OD_SIDECAR_IPC_PATH;
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, ...args],
      { env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? ''),
      code: typeof failure.code === 'number' ? failure.code : 1,
    };
  }
}

describe('od agent test positional parsing', () => {
  it('sends the positional agent id to /api/test/connection when --daemon-url precedes it', async () => {
    lastBody = null;
    const result = await runCli(['agent', 'test', '--daemon-url', baseUrl, 'codex', '--json']);
    expect(result.code).toBe(0);
    const captured = lastBody as Record<string, unknown> | null;
    expect(captured?.agentId).toBe('codex');
  });

  it('exits with usage when no positional agent id is provided', async () => {
    lastBody = null;
    const result = await runCli(['agent', 'test', '--daemon-url', baseUrl, '--model', 'gpt-4', '--json']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Usage: od agent test');
    expect(lastBody).toBeNull();
  });

  it('exits with usage when an unknown flag is passed', async () => {
    lastBody = null;
    const result = await runCli(['agent', 'test', '--bogus', 'codex']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('od agent test:');
    expect(result.stderr).toContain('unknown flag: --bogus');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('od agent test <agentId>');
    expect(lastBody).toBeNull();
  });

  it('exits with usage when a string flag is missing its value', async () => {
    lastBody = null;
    const result = await runCli(['agent', 'test', '--daemon-url']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('od agent test:');
    expect(result.stderr).toContain('flag --daemon-url requires a value');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('od agent test <agentId>');
    expect(lastBody).toBeNull();
  });
});
