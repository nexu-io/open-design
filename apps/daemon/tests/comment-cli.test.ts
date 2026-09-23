import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

let stub: StubServer | null = null;
let tempRoot = '';

const target = {
  filePath: 'index.html',
  elementId: 'headline',
  selector: '#headline',
  label: 'Headline',
  text: 'Hello',
  htmlHint: '<h1>Hello</h1>',
  position: { x: 1, y: 2, width: 3, height: 4 },
};

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const captured = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
      requests.push(captured);
      res.setHeader('content-type', 'application/json');
      if (captured.url.includes('/fail')) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'not permitted' }));
        return;
      }
      if (captured.method === 'GET') {
        res.end(JSON.stringify({ comments: [{ id: 'c1', status: 'open', note: 'existing' }] }));
        return;
      }
      if (captured.method === 'DELETE') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.end(JSON.stringify({ comment: { id: 'c1', ...JSON.parse(body) } }));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub server has no address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())),
  };
}

async function runCli(args: string[]) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; code?: number | null };
    return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? '', code: failed.code ?? 1 };
  }
}


function runCliWithStdin(args: string[], stdin: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolveRun) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ stdout, stderr, code }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

describe('od comment CLI', () => {
  it('registers discoverable comment help', async () => {
    const result = await runCli(['comment', 'help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('od comment create');
    expect(result.stdout).toContain('--prompt-file <path|->');
  });

  it('marks a project read through the frozen PUT endpoint', async () => {
    stub = await startStubServer();
    const result = await runCli([
      'comment', 'read', 'project-1', '--read-at', '123', '--daemon-url', stub.baseUrl, '--json',
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'PUT', url: '/api/projects/project-1/comments/read' });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({ readAt: 123 });
  });

  it('uses the existing comment HTTP API for list, create, update, status, and delete', async () => {
    stub = await startStubServer();
    const common = ['--workspace', 'ws-1', '--workspace-member', 'member-1', '--daemon-url', stub.baseUrl, '--json'];
    const targetJson = JSON.stringify(target);
    const calls = [
      ['list', 'project-1', 'conversation-1', ...common],
      ['create', 'project-1', 'conversation-1', '--target', targetJson, '--prompt', 'created', ...common],
      ['update', 'project-1', 'conversation-1', 'c1', '--target', targetJson, '--prompt', 'updated', ...common],
      ['status', 'project-1', 'conversation-1', 'c1', '--status', 'resolved', ...common],
      ['delete', 'project-1', 'conversation-1', 'c1', ...common],
    ];
    for (const call of calls) {
      const result = await runCli(['comment', ...call]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
    expect(stub.requests).toHaveLength(5);
    expect(stub.requests.map((request) => request.method)).toEqual(['GET', 'POST', 'POST', 'PATCH', 'DELETE']);
    expect(stub.requests.map((request) => request.url)).toEqual([
      '/api/projects/project-1/conversations/conversation-1/comments',
      '/api/projects/project-1/conversations/conversation-1/comments',
      '/api/projects/project-1/conversations/conversation-1/comments',
      '/api/projects/project-1/conversations/conversation-1/comments/c1',
      '/api/projects/project-1/conversations/conversation-1/comments/c1',
    ]);
    for (const request of stub.requests) {
      expect(request.headers).toMatchObject({
        'x-od-workspace-id': 'ws-1',
        'x-od-workspace-member-id': 'member-1',
      });
    }
    expect(JSON.parse(stub.requests[1]!.body)).toEqual({ target, note: 'created' });
    expect(JSON.parse(stub.requests[2]!.body)).toEqual({ id: 'c1', target, note: 'updated' });
    expect(JSON.parse(stub.requests[3]!.body)).toEqual({ status: 'resolved' });
  });

  it('passes a long multibyte prompt file unchanged to the daemon HTTP API', async () => {
    stub = await startStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-comment-cli-'));
    const note = '评论'.repeat(2_100);
    const promptPath = join(tempRoot, 'long-comment.txt');
    writeFileSync(promptPath, note, 'utf8');
    const result = await runCli([
      'comment', 'create', 'project-1', 'conversation-1', '--target', JSON.stringify(target),
      '--prompt-file', promptPath, '--daemon-url', stub.baseUrl, '--json',
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(JSON.parse(stub.requests[0]!.body).note).toBe(note);
  });


  it('reads stdin prompt-file verbatim, including whitespace and newlines', async () => {
    stub = await startStubServer();
    const note = '  first line\n第二行  \n\n';
    const result = await runCliWithStdin([
      'comment', 'create', 'project-1', 'conversation-1', '--target', JSON.stringify(target),
      '--prompt-file', '-', '--daemon-url', stub.baseUrl, '--json',
    ], note);
    expect(result.code).toBe(0);
    expect(JSON.parse(stub.requests[0]!.body).note).toBe(note);
  });

  it('does not client-reject a multibyte body above the 64KiB server-only limit', async () => {
    stub = await startStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-comment-cli-'));
    const note = '评论'.repeat(25_000);
    const promptPath = join(tempRoot, 'oversize-comment.txt');
    writeFileSync(promptPath, note, 'utf8');
    const result = await runCli([
      'comment', 'create', 'project-1', 'conversation-1', '--target', JSON.stringify(target),
      '--prompt-file', promptPath, '--daemon-url', stub.baseUrl, '--json',
    ]);
    expect(Buffer.byteLength(note, 'utf8')).toBeGreaterThan(64 * 1024);
    expect(result.code).toBe(0);
    expect(JSON.parse(stub.requests[0]!.body).note).toBe(note);
  });

  it('rejects simultaneous --prompt and --prompt-file before a mutation', async () => {
    stub = await startStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-comment-cli-'));
    const promptPath = join(tempRoot, 'comment.txt');
    writeFileSync(promptPath, 'from file', 'utf8');
    const result = await runCli([
      'comment', 'create', 'project-1', 'conversation-1', '--target', JSON.stringify(target),
      '--prompt', 'inline', '--prompt-file', promptPath, '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('pass either --prompt or --prompt-file');
    expect(stub.requests).toHaveLength(0);
  });

  it('rejects malformed inputs before any mutation request and returns nonzero for HTTP failures', async () => {
    stub = await startStubServer();
    const malformed = await runCli([
      'comment', 'create', 'project-1', 'conversation-1', '--target', '{not-json', '--prompt', 'nope', '--daemon-url', stub.baseUrl,
    ]);
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).toContain('--target must be valid');
    expect(stub.requests).toHaveLength(0);

    const rejected = await runCli([
      'comment', 'status', 'project-1', 'conversation-1', 'fail', '--status', 'resolved', '--daemon-url', stub.baseUrl,
    ]);
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain('not permitted');
  });
});
