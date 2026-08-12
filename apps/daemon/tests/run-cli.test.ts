import { execFile } from 'node:child_process';
import http from 'node:http';
import { dirname, resolve as pathResolve } from 'node:path';
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
  body: string;
  headers: http.IncomingHttpHeaders;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

let stub: StubServer | null = null;

afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
});

async function startRunStubServer(resumable: boolean): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
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
        headers: req.headers,
      };
      requests.push(captured);
      res.setHeader('content-type', 'application/json');

      if (captured.method === 'GET' && captured.url === '/api/runs/run-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          id: 'run-1',
          projectId: 'project-1',
          conversationId: 'conversation-1',
          agentId: 'claude',
          status: 'failed',
          resumable,
        }));
        return;
      }

      if (
        captured.method === 'GET'
        && (captured.url === '/api/runs' || captured.url === '/api/runs?projectId=project-1')
      ) {
        res.statusCode = 200;
        res.end(JSON.stringify({ runs: [] }));
        return;
      }

      if (
        captured.method === 'GET'
        && captured.url === '/api/runs/run-1/result-package'
      ) {
        res.statusCode = 200;
        res.end(JSON.stringify({ run: { id: 'run-1', status: 'completed' } }));
        return;
      }

      if (
        captured.method === 'POST'
        && captured.url === '/api/runs/run-1/cancel'
      ) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (captured.method === 'POST' && captured.url === '/api/runs') {
        res.statusCode = 200;
        res.end(JSON.stringify({ runId: 'run-2' }));
        return;
      }

      if (captured.method === 'POST' && captured.url === '/api/import/folder') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          project: { id: 'imported-project' },
          conversationId: 'imported-conversation',
        }));
        return;
      }

      if (
        captured.method === 'GET'
        && (captured.url === '/api/runs/run-1/events' || captured.url === '/api/runs/run-2/events')
      ) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        });
        res.end('event: end\ndata: {"status":"completed"}\n\n');
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'unexpected-request', message: captured.url } }));
    });
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    requests,
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
    const { stdout, stderr } = await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
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

describe('od run CLI', () => {
  it('continues a resumable run through the normal run creation API', async () => {
    stub = await startRunStubServer(true);

    const result = await runCli([
      'run',
      'continue',
      'run-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('[run] continued run-1 as run-2\n');
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET /api/runs/run-1',
      'POST /api/runs',
    ]);
    expect(JSON.parse(stub.requests[1]!.body)).toMatchObject({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentId: 'claude',
      analyticsHints: { entryFrom: 'resume_continue' },
    });
    expect(JSON.parse(stub.requests[1]!.body).message).toContain(
      'The previous turn was interrupted by a transient failure.',
    );
    for (const request of stub.requests) {
      expect(request.headers['x-od-workspace-id']).toBeUndefined();
      expect(request.headers['x-od-workspace-member-id']).toBeUndefined();
    }
  });

  it('refuses to continue a run without a safe recoverable native session', async () => {
    stub = await startRunStubServer(false);

    const result = await runCli([
      'run',
      'continue',
      'run-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Run run-1 does not have a safe recoverable native session.');
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET /api/runs/run-1',
    ]);
  });

  it('forwards explicit Workspace scope through continue status and creation requests', async () => {
    stub = await startRunStubServer(true);

    const result = await runCli([
      'run',
      'continue',
      'run-1',
      '--workspace',
      'team-workspace',
      '--workspace-member',
      'creator-member',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(stub.requests).toHaveLength(2);
    for (const request of stub.requests) {
      expect(request.headers['x-od-workspace-id']).toBe('team-workspace');
      expect(request.headers['x-od-workspace-member-id']).toBe('creator-member');
    }
  });

  it.each([
    {
      label: 'list',
      args: ['run', 'list', '--json'],
      requests: ['GET /api/runs'],
    },
    {
      label: 'project list',
      args: ['run', 'list', '--project', 'project-1', '--json'],
      requests: ['GET /api/runs?projectId=project-1'],
    },
    {
      label: 'info',
      args: ['run', 'info', 'run-1'],
      requests: ['GET /api/runs/run-1'],
    },
    {
      label: 'result package',
      args: ['run', 'result-package', 'run-1', '--json'],
      requests: ['GET /api/runs/run-1/result-package'],
    },
    {
      label: 'cancel',
      args: ['run', 'cancel', 'run-1'],
      requests: ['POST /api/runs/run-1/cancel'],
    },
    {
      label: 'redesign',
      args: ['run', 'redesign', '--project', 'project-1', '--json'],
      requests: ['POST /api/runs'],
    },
    {
      label: 'redesign import and start',
      args: ['run', 'redesign', '--path', DAEMON_ROOT, '--json'],
      requests: ['POST /api/import/folder', 'POST /api/runs'],
    },
    {
      label: 'start and follow',
      args: ['run', 'start', '--project', 'project-1', '--follow'],
      requests: ['POST /api/runs', 'GET /api/runs/run-2/events'],
    },
    {
      label: 'watch',
      args: ['run', 'watch', 'run-1'],
      requests: ['GET /api/runs/run-1/events'],
    },
  ])('forwards explicit Workspace scope for $label requests', async ({ args, requests }) => {
    stub = await startRunStubServer(true);

    const result = await runCli([
      ...args,
      '--workspace',
      'team-workspace',
      '--workspace-member',
      'creator-member',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code, result.stderr).toBe(0);
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual(requests);
    for (const request of stub.requests) {
      expect(request.headers['x-od-workspace-id']).toBe('team-workspace');
      expect(request.headers['x-od-workspace-member-id']).toBe('creator-member');
    }
  });

  it('keeps no-scope run creation and streaming requests headerless', async () => {
    stub = await startRunStubServer(true);

    const result = await runCli([
      'run',
      'start',
      '--project',
      'project-1',
      '--follow',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code, result.stderr).toBe(0);
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/runs',
      'GET /api/runs/run-2/events',
    ]);
    for (const request of stub.requests) {
      expect(request.headers['x-od-workspace-id']).toBeUndefined();
      expect(request.headers['x-od-workspace-member-id']).toBeUndefined();
    }
  });
});
