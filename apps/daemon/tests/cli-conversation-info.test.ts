import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
    fn: (req: CapturedRequest) => { status: number; body: unknown } | null,
  ) => void;
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let responder:
    | ((req: CapturedRequest) => { status: number; body: unknown } | null)
    | null = null;

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
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
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
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
  };
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
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const failed = err as { stdout?: string; stderr?: string; code?: number | null };
    return {
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
      code: failed.code ?? 1,
    };
  }
}

describe('od conversation info', () => {
  let stub: StubServer;

  beforeAll(async () => {
    stub = await startStubServer();
  });

  afterEach(() => {
    stub.requests.length = 0;
    stub.setResponder(() => null);
  });

  afterAll(async () => {
    await stub.close();
  });

  it('fails with usage status 2 if --project is missing', async () => {
    const { stdout, stderr, code } = await runCli(['conversation', 'info', 'c1']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/Usage: od conversation info <conversationId> --project <projectId>/);
    expect(stub.requests.length).toBe(0);
  });

  it('reports not-found on 404 rather than daemon-not-running', async () => {
    stub.setResponder((req) => {
      if (req.url.includes('/api/projects/p1/conversations/c1')) {
        return { status: 404, body: { error: 'Not found' } };
      }
      return null;
    });

    const { stdout, stderr, code } = await runCli([
      'conversation',
      'info',
      'c1',
      '--project',
      'p1',
      '--json',
    ], {
      env: { OD_DAEMON_URL: stub.baseUrl },
    });

    // Debug
    console.log('404 stdout:', stdout);
    console.log('404 stderr:', stderr);

    expect(code).not.toBe(0);
    const err = JSON.parse(stdout || stderr);
    expect(err.error.code).toBe('not-found');
    expect(stub.requests.length).toBe(1);
    expect(stub.requests[0]?.url).toBe('/api/projects/p1/conversations/c1');
  });

  it('prints successful JSON when correct parameters are provided', async () => {
    const mockConvo = { id: 'c1', title: 'Hello', turns: [] };
    stub.setResponder((req) => {
      if (req.url === '/api/projects/p1/conversations/c1' && req.method === 'GET') {
        return { status: 200, body: { conversation: mockConvo } };
      }
      return null;
    });

    const { stdout, stderr, code } = await runCli([
      'conversation',
      'info',
      'c1',
      '--project',
      'p1',
      '--json',
    ], {
      env: { OD_DAEMON_URL: stub.baseUrl },
    });

    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.conversation.id).toBe('c1');
    expect(out.conversation.title).toBe('Hello');
    expect(stub.requests.length).toBe(1);
    expect(stub.requests[0]?.url).toBe('/api/projects/p1/conversations/c1');
  });

  it('reaches /api/projects/p1/conversations/c1 regardless of flag order', async () => {
    const mockConvo = { id: 'c1', title: 'Flag test', turns: [] };
    stub.setResponder((req) => {
      if (req.url === '/api/projects/p1/conversations/c1' && req.method === 'GET') {
        return { status: 200, body: { conversation: mockConvo } };
      }
      return null;
    });

    const { stdout, stderr, code } = await runCli([
      'conversation',
      'info',
      '--project',
      'p1',
      'c1',
      '--json',
    ], {
      env: { OD_DAEMON_URL: stub.baseUrl },
    });

    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.conversation.id).toBe('c1');
    expect(stub.requests.length).toBe(1);
    expect(stub.requests[0]?.url).toBe('/api/projects/p1/conversations/c1');
  });
});
