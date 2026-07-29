import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  body: string;
}

// Not a real zip — `od project download` writes the response bytes verbatim,
// so any distinctive payload proves the passthrough.
const ARCHIVE_BYTES = Buffer.from('PKfake-archive-payload', 'binary');

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

let stub: StubServer | null = null;
let tempRoot = '';

afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

async function startProjectStubServer(): Promise<StubServer> {
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
      };
      requests.push(captured);

      if (captured.method === 'GET' && captured.url === '/api/projects/dl-project/archive') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/zip');
        res.setHeader(
          'content-disposition',
          `attachment; filename="Landing_page.zip"; filename*=UTF-8''${encodeURIComponent('Landing päge.zip')}`,
        );
        res.end(ARCHIVE_BYTES);
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/projects/empty-project/archive') {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: { code: 'FILE_NOT_FOUND', message: 'archive root does not exist' } }));
        return;
      }

      res.setHeader('content-type', 'application/json');
      if (captured.method === 'POST' && captured.url === '/api/projects/source-project/design-system-copy') {
        res.statusCode = 201;
        res.end(JSON.stringify({
          project: { id: 'design-copy-1', name: 'Design Copy' },
          designSystemId: 'user:design-copy-1',
          conversationId: 'conversation-design-copy',
        }));
        return;
      }
      if (captured.method === 'POST' && captured.url === '/api/projects/source-project/duplicate') {
        res.statusCode = 201;
        res.end(JSON.stringify({
          project: { id: 'duplicate-1', name: 'Duplicate Copy' },
          conversationId: 'conversation-duplicate',
        }));
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
  cwd: string = DAEMON_ROOT,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd,
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

describe('od project CLI', () => {
  it('creates a design-system project with prompt-file content and JSON output', async () => {
    stub = await startProjectStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-project-cli-'));
    const promptPath = join(tempRoot, 'prompt.md');
    writeFileSync(promptPath, 'Use this workspace as the brand source.\n', 'utf8');

    const result = await runCli([
      'project',
      'create-design-system',
      'source-project',
      '--name',
      'Design Copy',
      '--prompt-file',
      promptPath,
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      project: { id: 'design-copy-1', name: 'Design Copy' },
      designSystemId: 'user:design-copy-1',
      conversationId: 'conversation-design-copy',
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/projects/source-project/design-system-copy',
    });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({
      name: 'Design Copy',
      pendingPrompt: 'Use this workspace as the brand source.\n',
    });
  });

  it('duplicates a project and prints the human-readable result', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'project',
      'duplicate',
      'source-project',
      '--name',
      'Duplicate Copy',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      '[project] duplicated source-project as duplicate-1 (conversation conversation-duplicate)\n',
    );
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/projects/source-project/duplicate',
    });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({ name: 'Duplicate Copy' });
  });

  // `od project download` (#787) — CLI twin of the web hand-off Download
  // action; both consume GET /api/projects/:id/archive.
  it('downloads the project archive to --out and reports it as JSON', async () => {
    stub = await startProjectStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-project-cli-'));
    const outPath = join(tempRoot, 'delivery.zip');

    const result = await runCli([
      'project',
      'download',
      'dl-project',
      '--out',
      outPath,
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      id: 'dl-project',
      out: outPath,
      bytes: ARCHIVE_BYTES.length,
    });
    expect(readFileSync(outPath)).toEqual(ARCHIVE_BYTES);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/projects/dl-project/archive',
    });
  });

  it('derives the output filename from Content-Disposition when --out is omitted', async () => {
    stub = await startProjectStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-project-cli-'));

    const result = await runCli(
      ['project', 'download', 'dl-project', '--daemon-url', stub.baseUrl],
      tempRoot,
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    // RFC 5987 `filename*` wins over the ASCII fallback.
    expect(readFileSync(join(tempRoot, 'Landing päge.zip'))).toEqual(ARCHIVE_BYTES);
  });

  it('relays the archive 404 detail instead of a bare not-found', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'project',
      'download',
      'empty-project',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(4);
    expect(result.stderr).toContain('nothing to download for project empty-project');
    expect(result.stderr).toContain('archive root does not exist');
  });
});
