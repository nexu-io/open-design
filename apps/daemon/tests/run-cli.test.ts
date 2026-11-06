import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
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
let tempDir: string | null = null;

afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

async function startRunStubServer(
  resumable: boolean,
  createResponse?: { status: number; body: unknown },
  eventStream?: string,
): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let taskFollowEnabled = false;
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
        res.end(JSON.stringify({
          ok: true,
          run: {
            id: taskFollowEnabled ? 'run-2' : 'run-1',
            ...(taskFollowEnabled
              ? {
                  strategyTask: {
                    taskExecutionId: 'task-1',
                    activeRunId: 'run-2',
                    outcome: 'canceled',
                    terminal: true,
                  },
                }
              : {}),
          },
        }));
        return;
      }

      if (captured.method === 'POST' && captured.url === '/api/runs') {
        const body = JSON.parse(captured.body || '{}') as { taskExecutionId?: string };
        taskFollowEnabled = body.taskExecutionId === 'task-1';
        res.statusCode = createResponse?.status ?? 200;
        res.end(JSON.stringify(createResponse?.body ?? {
          runId: taskFollowEnabled ? 'run-1' : 'run-2',
          ...(taskFollowEnabled ? { taskExecutionId: 'task-1' } : {}),
        }));
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
        if (eventStream !== undefined) {
          res.end(eventStream);
        } else if (taskFollowEnabled && captured.url === '/api/runs/run-1/events') {
          res.end('event: end\ndata: {"status":"succeeded","strategyTask":{"taskExecutionId":"task-1","activeRunId":"run-2","nextRunId":"run-2","outcome":"running","terminal":false}}\n\n');
        } else if (taskFollowEnabled && captured.url === '/api/runs/run-2/events') {
          res.end('event: end\ndata: {"status":"succeeded","strategyTask":{"taskExecutionId":"task-1","activeRunId":"run-2","outcome":"completed","terminal":true}}\n\n');
        } else {
          res.end('event: end\ndata: {"status":"completed"}\n\n');
        }
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

async function runCli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
  stdin?: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...envOverrides };
  delete env.NODE_OPTIONS;
  try {
    const execution = execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (stdin !== undefined) execution.child.stdin?.end(stdin);
    const { stdout, stderr } = await execution;
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
  it('submits BYOK connection options and an env key through the existing Run API', async () => {
    stub = await startRunStubServer(true);
    tempDir = await mkdtemp(join(tmpdir(), 'od-run-byok-'));
    const promptFile = join(tempDir, 'prompt.txt');
    await writeFile(promptFile, 'Create a responsive portfolio\nwith a contact section.', 'utf8');
    const apiKey = 'dummy-cli-byok-api-key';

    const result = await runCli([
      'run', 'start', '--project', 'project-1',
      '--byok-protocol', 'openai', '--byok-base-url', 'https://models.example/v1',
      '--byok-api-version', '2026-01-01', '--byok-key-env', 'OD_TEST_BYOK_KEY',
      '--model', 'custom-model', '--prompt-file', promptFile,
      '--workspace', 'team-workspace', '--workspace-member', 'creator-member',
      '--json', '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: apiKey });

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ runId: 'run-2' });
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain(apiKey);
    expect(stub.requests).toHaveLength(1);
    const request = stub.requests[0]!;
    expect(`${request.method} ${request.url}`).toBe('POST /api/runs');
    expect(request.headers['x-od-workspace-id']).toBe('team-workspace');
    expect(request.headers['x-od-workspace-member-id']).toBe('creator-member');
    expect(JSON.parse(request.body)).toEqual({
      projectId: 'project-1',
      agentId: 'byok-opencode',
      model: 'custom-model',
      message: 'Create a responsive portfolio\nwith a contact section.',
      byokProvider: {
        protocol: 'openai',
        apiKey,
        baseUrl: 'https://models.example/v1',
        apiVersion: '2026-01-01',
      },
    });
  });

  it.each([
    { protocol: 'ollama', baseUrl: 'http://127.0.0.1:11434', keyless: false },
    { protocol: 'openai', baseUrl: 'http://127.0.0.1:8000/v1', keyless: true },
  ])('submits $protocol keyless settings while preserving prompt stdin and follow', async ({ protocol, baseUrl, keyless }) => {
    stub = await startRunStubServer(true);
    const result = await runCli([
      'run', 'start', '--project', 'project-1', '--agent', 'byok-opencode',
      '--byok-protocol', protocol, '--byok-base-url', baseUrl,
      ...(keyless ? ['--byok-keyless'] : []),
      '--model', 'local-model', '--prompt-file', '-', '--follow',
      '--daemon-url', stub.baseUrl,
    ], {}, 'Create a landing page\nfor a local bakery.');

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/runs', 'GET /api/runs/run-2/events',
    ]);
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({
      projectId: 'project-1',
      agentId: 'byok-opencode',
      model: 'local-model',
      message: 'Create a landing page\nfor a local bakery.',
      byokProvider: {
        protocol,
        apiKey: '',
        baseUrl,
        ...(keyless ? { requiresApiKey: false } : {}),
      },
    });
    expect(result.stdout).toContain('"event":"end"');
  });

  it('preserves an explicit agent and leaves native OpenCode requests provider-free', async () => {
    stub = await startRunStubServer(true);
    const native = await runCli([
      'run', 'start', '--project', 'project-1', '--agent', 'opencode',
      '--model', 'native-provider/model', '--json', '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: 'dummy-unselected-key' });
    expect(native.code, native.stderr).toBe(0);
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({
      projectId: 'project-1', agentId: 'opencode', model: 'native-provider/model',
    });

    const explicit = await runCli([
      'run', 'start', '--project', 'project-1', '--agent', 'opencode',
      '--byok-protocol', 'anthropic', '--byok-key-env', 'OD_TEST_BYOK_KEY',
      '--model', 'custom-model', '--json', '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: 'dummy-selected-key' });
    expect(explicit.code, explicit.stderr).toBe(0);
    expect(JSON.parse(stub.requests[1]!.body)).toEqual({
      projectId: 'project-1', agentId: 'opencode', model: 'custom-model',
      byokProvider: { protocol: 'anthropic', apiKey: 'dummy-selected-key' },
    });
  });

  it.each([
    { args: ['--byok-base-url', 'http://127.0.0.1:8000/v1'], error: '--byok-protocol must be' },
    { args: ['--byok-protocol', 'bedrock'], error: '--byok-protocol must be' },
    { args: ['--byok-protocol', 'openai', '--byok-key-env', 'OD_TEST_BYOK_KEY'], error: '--byok-key-env must name' },
  ])('reports invalid BYOK input without submitting a Run: $args', async ({ args, error }) => {
    stub = await startRunStubServer(true);
    const result = await runCli([
      'run', 'start', '--project', 'project-1', '--model', 'custom-model',
      ...args, '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: undefined });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(error);
    expect(stub.requests).toHaveLength(0);
  });

  it.each([
    { status: 400, code: 'VALIDATION_FAILED', exitCode: 1 },
    { status: 409, code: 'capabilities-required', exitCode: 66 },
    { status: 422, code: 'missing-input', exitCode: 67 },
  ])('preserves API failure $status and redacts a BYOK key if the response echoes it', async ({ status, code, exitCode }) => {
    const apiKey = 'dummy-key-with-"quote"-and-\\slash';
    stub = await startRunStubServer(true, {
      status,
      body: { error: { code, message: `Provider rejected ${apiKey}`, data: { detail: apiKey } } },
    });
    const result = await runCli([
      'run', 'start', '--project', 'project-1', '--byok-protocol', 'azure',
      '--byok-key-env', 'OD_TEST_BYOK_KEY', '--model', 'deployment-model',
      '--json', '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: apiKey });

    expect(result.code).toBe(exitCode);
    expect(result.stdout).toBe('');
    if (status === 400) expect(result.stderr).toContain('POST /api/runs failed: 400');
    expect(result.stderr).toContain(code);
    expect(result.stderr).toContain('Provider rejected [REDACTED]');
    expect(result.stderr).not.toContain(apiKey);
    expect(JSON.parse(stub.requests[0]!.body).byokProvider.apiKey).toBe(apiKey);
  });

  it.each(['dummy-follow-key', 'run-2', 'dummy-key-with-"quote"-and-\\slash'])('redacts BYOK keys in followed events without changing the Run used for streaming: %s', async (apiKey) => {
    const error = {
      message: `Provider rejected ${apiKey}`,
      details: { raw: JSON.stringify({ error: `Invalid API key: ${apiKey}` }) },
    };
    stub = await startRunStubServer(true, undefined,
      `event: error\ndata: ${JSON.stringify(error)}\n\nevent: end\ndata: {"status":"failed"}\n\n`);
    const result = await runCli([
      'run', 'start', '--project', 'project-1', '--byok-protocol', 'openai',
      '--byok-key-env', 'OD_TEST_BYOK_KEY', '--model', 'custom-model',
      '--follow', '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: apiKey });

    expect(result.code, result.stderr).toBe(0);
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/runs', 'GET /api/runs/run-2/events',
    ]);
    expect(result.stdout).not.toContain(apiKey);
    expect(result.stderr).not.toContain(apiKey);
    const events = result.stdout.trim().split('\n').slice(1).map((line) => JSON.parse(line));
    expect(events[0]).toEqual({
      event: 'error',
      data: {
        message: 'Provider rejected [REDACTED]',
        details: { raw: '{"error":"Invalid API key: [REDACTED]"}' },
      },
    });
    expect(events[1]).toEqual({ event: 'end', data: { status: 'failed' } });
  });

  it('keeps BYOK task continuation handles raw while redacting followed output', async () => {
    stub = await startRunStubServer(true);
    const result = await runCli([
      'run', 'start', '--project', 'project-1', '--task-execution', 'task-1',
      '--byok-protocol', 'openai', '--byok-key-env', 'OD_TEST_BYOK_KEY',
      '--model', 'custom-model', '--workspace', 'team-workspace',
      '--workspace-member', 'creator-member', '--follow', '--daemon-url', stub.baseUrl,
    ], { OD_TEST_BYOK_KEY: 'run-2' });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('run-2');
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/runs', 'GET /api/runs/run-1/events', 'GET /api/runs/run-2/events',
    ]);
    for (const request of stub.requests) {
      expect(request.headers['x-od-workspace-id']).toBe('team-workspace');
      expect(request.headers['x-od-workspace-member-id']).toBe('creator-member');
    }
    const events = result.stdout.trim().split('\n').slice(1).map((line) => JSON.parse(line));
    expect(events).toHaveLength(2);
    expect(events[1].data.strategyTask).toMatchObject({
      taskExecutionId: 'task-1', activeRunId: '[REDACTED]', outcome: 'completed', terminal: true,
    });
  });

  it('keeps one --skill backward compatible and sends multiple ids canonically', async () => {
    stub = await startRunStubServer(true);
    const single = await runCli([
      'run', 'start', '--project', 'project-1', '--skill', 'frontend-design',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(single.code, single.stderr).toBe(0);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      skillId: 'frontend-design',
    });
    expect(JSON.parse(stub.requests[0]!.body).skillIds).toBeUndefined();

    const multiple = await runCli([
      'run', 'start', '--project', 'project-1',
      '--skill', 'frontend-design, imagegen,frontend-design',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(multiple.code, multiple.stderr).toBe(0);
    expect(JSON.parse(stub.requests[1]!.body)).toMatchObject({
      skillId: 'frontend-design',
      skillIds: ['frontend-design', 'imagegen'],
    });
  });

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

  it('uses an explicit task continuation handle and follows every projected active Run', async () => {
    stub = await startRunStubServer(true);
    tempDir = await mkdtemp(join(tmpdir(), 'od-run-task-chain-'));
    const promptFile = join(tempDir, 'answer.txt');
    await writeFile(promptFile, 'Desktop first', 'utf8');

    const result = await runCli([
      'run',
      'start',
      '--project',
      'project-1',
      '--task-execution',
      'task-1',
      '--prompt-file',
      promptFile,
      '--follow',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code, result.stderr).toBe(0);
    expect(stub.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/runs',
      'GET /api/runs/run-1/events',
      'GET /api/runs/run-2/events',
    ]);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      projectId: 'project-1',
      taskExecutionId: 'task-1',
      message: 'Desktop first',
    });
    const events = result.stdout
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(2);
    expect(events[0].data.strategyTask).toMatchObject({
      activeRunId: 'run-2',
      terminal: false,
    });
    expect(events[1].data.strategyTask).toMatchObject({
      outcome: 'completed',
      terminal: true,
    });

    const canceled = await runCli([
      'run',
      'cancel',
      'run-1',
      '--daemon-url',
      stub.baseUrl,
    ]);
    expect(canceled.code, canceled.stderr).toBe(0);
    expect(canceled.stdout).toContain('[run] cancelled run-2');
    expect(canceled.stdout).toContain('task\ttask-1\tactive=run-2\toutcome=canceled');
  });
});
