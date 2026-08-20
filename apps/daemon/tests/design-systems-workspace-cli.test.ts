import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
}

let server: http.Server | null = null;
let tempRoot = '';
let baseUrl = '';
let requests: CapturedRequest[] = [];

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve, reject) => {
      toClose.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = '';
  baseUrl = '';
  requests = [];
});

async function startStub(): Promise<void> {
  tempRoot = mkdtempSync(join(tmpdir(), 'od-design-systems-cli-'));
  requests = [];
  server = http.createServer((req, res) => {
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
    });
    if (req.url?.endsWith('/archive')) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/zip');
      res.end(Buffer.from('zip'));
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/design-systems') {
      res.end(JSON.stringify({ designSystems: [] }));
      return;
    }
    if (req.url?.endsWith('/token-contract/rebuild-jobs')) {
      res.end(JSON.stringify({ job: { id: 'job-1' } }));
      return;
    }
    res.end(JSON.stringify({
      designSystem: { id: 'user:brand', title: 'Brand' },
    }));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function runCli(args: string[]) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, ...args],
      {
        cwd: DAEMON_ROOT,
        env,
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
    };
  }
}

describe('od design-systems exact workspace transport', () => {
  it.each([
    ['list', ['list', '--json']],
    ['show', ['show', 'user:brand', '--json']],
    ['download', ['download', 'user:brand', '--out', 'brand.zip', '--json']],
    ['import-local', ['import-local', '.', '--json']],
    ['import-github', ['import-github', 'https://github.com/acme/brand', '--json']],
    ['import-shadcn', ['import-shadcn', 'shadcn/ui/theme-zinc', '--json']],
    ['rebuild-token-contract', ['rebuild-token-contract', 'user:brand', '--json']],
    ['rename', ['rename', 'user:brand', '--title', 'Renamed Brand', '--json']],
  ])('sends exact workspace headers for %s', async (_label, subcommand) => {
    await startStub();
    const resolvedSubcommand =
      _label === 'download'
        ? subcommand.map((arg) => (arg === 'brand.zip' ? join(tempRoot, 'brand.zip') : arg))
        : subcommand;
    const result = await runCli([
      'design-systems',
      ...resolvedSubcommand,
      '--workspace',
      'workspace-a',
      '--workspace-member',
      'member-a',
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'workspace-a',
      'x-od-workspace-member-id': 'member-a',
    });
  });

  it('rejects an incomplete workspace pair before making a request', async () => {
    await startStub();
    const result = await runCli([
      'design-systems',
      'show',
      'user:brand',
      '--workspace',
      'workspace-a',
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--workspace-member');
    expect(requests).toHaveLength(0);
  });

  it('keeps headerless legacy calls available when both flags are absent', async () => {
    await startStub();
    const result = await runCli([
      'design-systems',
      'show',
      'user:brand',
      '--json',
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers['x-od-workspace-id']).toBeUndefined();
    expect(requests[0]!.headers['x-od-workspace-member-id']).toBeUndefined();
  });
});
