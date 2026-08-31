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

async function startCompactStubServer(response: {
  status: number;
  body: Record<string, unknown>;
}): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw,
        headers: req.headers,
      });
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

describe('od conversation compact CLI', () => {
  it('posts the compact request with runtime options and explicit Workspace identity', async () => {
    stub = await startCompactStubServer({
      status: 202,
      body: {
        runId: 'run-compact-1',
        conversationId: 'conversation/one',
        assistantMessageId: 'assistant-compact-1',
      },
    });

    const result = await runCli([
      'conversation',
      'compact',
      'project one',
      'conversation/one',
      '--agent',
      'claude',
      '--model',
      'claude-opus-4-1',
      '--workspace',
      'team-workspace',
      '--workspace-member',
      'creator-member',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      '[conversation] compacting conversation/one as run run-compact-1\n',
    );
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/projects/project%20one/conversations/conversation%2Fone/compact',
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'content-type': 'application/json',
      'x-od-workspace-id': 'team-workspace',
      'x-od-workspace-member-id': 'creator-member',
    });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({
      agentId: 'claude',
      model: 'claude-opus-4-1',
    });
  });

  it('accepts named ids and emits the daemon response as JSON', async () => {
    const responseBody = {
      runId: 'run-compact-2',
      conversationId: 'conversation-2',
      assistantMessageId: null,
    };
    stub = await startCompactStubServer({ status: 202, body: responseBody });

    const result = await runCli([
      'conversation',
      'compact',
      '--project',
      'project-2',
      '--conversation',
      'conversation-2',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(responseBody);
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({});
  });

  it('preserves the daemon compact error envelope for automation', async () => {
    stub = await startCompactStubServer({
      status: 409,
      body: {
        error: {
          code: 'COMPACT_NO_SESSION',
          message: 'no stored agent session for this conversation - send a message first',
        },
      },
    });

    const result = await runCli([
      'conversation',
      'compact',
      'project-3',
      'conversation-3',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'COMPACT_NO_SESSION',
        message: 'no stored agent session for this conversation - send a message first',
        data: {},
      },
    });
  });

  it.each([
    ['missing conversation id', ['project-4']],
    ['missing project id', ['--conversation', 'conversation-4']],
  ])('exits 2 without making a request for %s', async (_label, compactArgs) => {
    const result = await runCli([
      'conversation',
      'compact',
      ...compactArgs,
      '--daemon-url',
      'http://127.0.0.1:1',
    ]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'Usage: od conversation compact <projectId> <conversationId>',
    );
  });
});
