import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
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
}

interface StubResponse {
  status: number;
  body: unknown;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  setResponder: (fn: (req: CapturedRequest) => StubResponse) => void;
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let responder: (req: CapturedRequest) => StubResponse = () => ({
    status: 404,
    body: { error: 'unexpected request' },
  });
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const captured = {
        method: req.method ?? '',
        url: req.url ?? '',
      };
      requests.push(captured);
      const response = responder(captured);
      res.statusCode = response.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response.body));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub server has no address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
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

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
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

describe('od amr login CLI', () => {
  let stub: StubServer;

  beforeAll(async () => {
    stub = await startStubServer();
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    stub.requests.length = 0;
    stub.setResponder(() => ({ status: 404, body: { error: 'unexpected request' } }));
  });

  it('documents login in `od amr help`', async () => {
    const result = await runCli(['amr', 'help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('od amr login');
    expect(result.stdout).toContain('od amr logout');
  });

  it('logs out through the daemon and emits machine-readable JSON', async () => {
    stub.setResponder((req) => req.method === 'POST'
      && req.url === '/api/integrations/vela/logout'
      ? { status: 200, body: { ok: true } }
      : { status: 404, body: { error: 'unexpected request' } });

    const result = await runCli(['amr', 'logout', '--json', '--daemon-url', stub.baseUrl]);

    expect(result.code).toBe(0);
    expect(stub.requests).toEqual([
      { method: 'POST', url: '/api/integrations/vela/logout' },
    ]);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true });
  });

  it('starts browser login through the daemon and returns the activation state as JSON', async () => {
    stub.setResponder((req) => {
      if (req.method === 'POST' && req.url === '/api/integrations/vela/login') {
        return {
          status: 202,
          body: { pid: 42, startedAt: '2026-07-24T00:00:00.000Z', profile: 'default' },
        };
      }
      if (req.method === 'GET' && req.url === '/api/integrations/vela/status') {
        return {
          status: 200,
          body: {
            loggedIn: false,
            loginInFlight: true,
            profile: 'default',
            user: null,
            configPath: '/local/private/vela.json',
            activationUrl: 'https://amr-link.open-design.ai/activate',
            userCode: 'ABCD-EFGH',
          },
        };
      }
      return { status: 404, body: { error: 'unexpected request' } };
    });

    const result = await runCli(['amr', 'login', '--json', '--daemon-url', stub.baseUrl]);

    expect(result.code).toBe(0);
    expect(stub.requests).toEqual([
      { method: 'POST', url: '/api/integrations/vela/login' },
      { method: 'GET', url: '/api/integrations/vela/status' },
    ]);
    expect(JSON.parse(result.stdout)).toEqual({
      started: { pid: 42, startedAt: '2026-07-24T00:00:00.000Z', profile: 'default' },
      status: {
        loggedIn: false,
        loginInFlight: true,
        profile: 'default',
        user: null,
        configPath: '/local/private/vela.json',
        activationUrl: 'https://amr-link.open-design.ai/activate',
        userCode: 'ABCD-EFGH',
      },
    });
  });

  it('prints a manual activation link and user code when browser login needs help', async () => {
    stub.setResponder((req) => {
      if (req.method === 'POST' && req.url === '/api/integrations/vela/login') {
        return {
          status: 202,
          body: { pid: 42, startedAt: '2026-07-24T00:00:00.000Z', profile: 'default' },
        };
      }
      return {
        status: 200,
        body: {
          loggedIn: false,
          loginInFlight: true,
          profile: 'default',
          user: null,
          configPath: '/local/private/vela.json',
          activationUrl: 'https://amr-link.open-design.ai/activate',
          userCode: 'ABCD-EFGH',
          browserOpenFailed: true,
        },
      };
    });

    const result = await runCli(['amr', 'login', '--daemon-url', stub.baseUrl]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('https://amr-link.open-design.ai/activate');
    expect(result.stdout).toContain('ABCD-EFGH');
    expect(result.stdout).toContain('browser could not be opened automatically');
  });
});
