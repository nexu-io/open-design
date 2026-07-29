import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pollStoreScreenshotJob,
  type StoreScreenshotCliFetch,
} from '../src/store-screenshots/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

interface StubResponse {
  status: number;
  body: unknown | Buffer;
  contentType?: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  setResponder(responder: (request: CapturedRequest) => StubResponse): void;
  close(): Promise<void>;
}

let stub: StubServer | null = null;
const tempRoots: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  if (stub) await stub.close();
  stub = null;
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let responder = (_request: CapturedRequest): StubResponse => ({
    status: 500,
    body: { error: { code: 'UNEXPECTED_REQUEST', message: 'No responder configured' } },
  });
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const request: CapturedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(request);
      const response = responder(request);
      res.statusCode = response.status;
      res.setHeader('content-type', response.contentType ?? 'application/json');
      res.end(Buffer.isBuffer(response.body) ? response.body : JSON.stringify(response.body));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub server has no address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    setResponder(nextResponder) {
      responder = nextResponder;
    },
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
}

async function runCli(
  args: string[],
  options: { stdin?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`CLI timed out: ${args.join(' ')}`));
    }, 15_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.stdin.end(options.stdin ?? '');
  });
}

function daemonArgs(baseUrl: string): string[] {
  return ['--daemon-url', baseUrl, '--json'];
}

function documentFixture(version = 1) {
  return {
    schemaVersion: 1,
    id: 'document-1',
    projectId: 'project-1',
    version,
    product: {
      name: 'Focus',
      summary: 'Focus without noise',
      audience: 'Independent developers',
      features: ['Focus', 'Weekly review'],
    },
    designSystemId: 'clay',
    assets: [],
    pages: [{
      id: 'page-1',
      order: 0,
      templateId: 'minimal-center',
      headline: 'Focus on what matters',
      overrides: {},
      lockedFields: [],
    }],
  };
}

function uploadedAssetFixture() {
  return {
    id: 'asset-1',
    mime: 'image/png',
    width: 1290,
    height: 2796,
    contentHash: 'a'.repeat(64),
    relativePath: `store-screenshots/assets/${'a'.repeat(64)}.png`,
  };
}

function exportResultFixture() {
  return {
    downloadPath: 'store-screenshots/exports/job-export/store-screenshots.zip',
    files: [],
    manifest: {
      schemaVersion: 1,
      documentId: 'document-1',
      documentVersion: 1,
      exportedAt: '2026-07-29T08:00:00.000Z',
      platforms: {
        appStore: {
          ruleVersion: 1,
          targetSize: { width: 1290, height: 2796 },
          pageCount: 0,
        },
      },
      files: [],
      errors: [],
      warnings: [],
    },
  };
}

describe('od store-screenshot CLI', () => {
  it('reads a long generate prompt from stdin once and outputs JSON', async () => {
    stub = await startStubServer();
    stub.setResponder(() => ({
      status: 202,
      body: {
        job: {
          id: 'job-generate',
          type: 'generate',
          status: 'queued',
          progress: { completed: 0, total: 1 },
        },
      },
    }));

    const result = await runCli([
      'store-screenshot',
      'generate',
      'project 1',
      '--prompt-file',
      '-',
      ...daemonArgs(stub.baseUrl),
    ], {
      stdin: '面向独立开发者，突出无干扰专注和周报',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      jobId: 'job-generate',
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/projects/project%201/store-screenshots/generate',
    });
    expect(JSON.parse(stub.requests[0]!.body.toString('utf8'))).toEqual({
      prompt: '面向独立开发者，突出无干扰专注和周报',
    });
  });

  it('creates a document from inline JSON without reshaping the API input', async () => {
    stub = await startStubServer();
    const input = {
      product: {
        name: 'Focus',
        summary: 'Focus without noise',
        audience: 'Independent developers',
        features: ['Focus', 'Weekly review'],
      },
      designSystemId: 'clay',
      templateId: 'minimal-center',
      pageCount: 4,
      platforms: ['appStore'],
    };
    const document = documentFixture();
    stub.setResponder(() => ({
      status: 201,
      body: { document },
    }));

    const result = await runCli([
      'store-screenshot',
      'create',
      'project-1',
      '--input',
      JSON.stringify(input),
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      document,
    });
    expect(JSON.parse(stub.requests[0]!.body.toString('utf8'))).toEqual(input);
  });

  it('uploads one image as multipart form data and never embeds its bytes in JSON', async () => {
    stub = await startStubServer();
    const root = await mkdtemp(join(tmpdir(), 'od-store-screenshot-cli-upload-'));
    tempRoots.push(root);
    const filePath = join(root, 'screen.png');
    const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await writeFile(filePath, fileBytes);
    const asset = uploadedAssetFixture();
    stub.setResponder(() => ({
      status: 201,
      body: { asset },
    }));

    const result = await runCli([
      'store-screenshot',
      'upload',
      'project-1',
      filePath,
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      asset,
    });
    expect(stub.requests[0]?.method).toBe('POST');
    expect(stub.requests[0]?.url).toBe('/api/projects/project-1/store-screenshots/assets');
    expect(stub.requests[0]?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(stub.requests[0]?.body.includes(fileBytes)).toBe(true);
    expect(stub.requests[0]?.body.toString('latin1')).toContain('filename="screen.png"');
  });

  it.each([
    ['app-store', ['appStore']],
    ['google-play', ['googlePlay']],
    ['all', ['appStore', 'googlePlay']],
  ])('maps validate platform %s to the API contract', async (platform, platforms) => {
    stub = await startStubServer();
    stub.setResponder(() => ({
      status: 200,
      body: { valid: true, issues: [] },
    }));

    const result = await runCli([
      'store-screenshot',
      'validate',
      'project-1',
      '--platform',
      platform,
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, valid: true, issues: [] });
    expect(JSON.parse(stub.requests[0]!.body.toString('utf8'))).toEqual({ platforms });
  });

  it('routes status, versions, and restore without duplicating domain behavior', async () => {
    stub = await startStubServer();
    stub.setResponder((request) => {
      if (request.url.endsWith('/jobs/job%201')) {
        return {
          status: 200,
          body: {
            job: {
              id: 'job 1',
              type: 'generate',
              status: 'running',
              progress: { completed: 0, total: 1 },
            },
          },
        };
      }
      if (request.url.endsWith('/versions')) {
        return {
          status: 200,
          body: { versions: [{ version: 2, source: 'manual', createdAt: 1 }] },
        };
      }
      return {
        status: 200,
        body: { document: documentFixture(3) },
      };
    });

    const status = await runCli([
      'store-screenshot',
      'status',
      'project-1',
      'job 1',
      ...daemonArgs(stub.baseUrl),
    ]);
    const versions = await runCli([
      'store-screenshot',
      'versions',
      'project-1',
      ...daemonArgs(stub.baseUrl),
    ]);
    const restore = await runCli([
      'store-screenshot',
      'restore',
      'project-1',
      '2',
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(status.exitCode).toBe(0);
    expect(versions.exitCode).toBe(0);
    expect(restore.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ ok: true, job: { id: 'job 1' } });
    expect(JSON.parse(versions.stdout)).toEqual({
      ok: true,
      versions: [{ version: 2, source: 'manual', createdAt: 1 }],
    });
    expect(JSON.parse(restore.stdout)).toEqual({
      ok: true,
      document: documentFixture(3),
    });
    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      {
        method: 'GET',
        url: '/api/projects/project-1/store-screenshots/jobs/job%201',
      },
      {
        method: 'GET',
        url: '/api/projects/project-1/store-screenshots/versions',
      },
      {
        method: 'POST',
        url: '/api/projects/project-1/store-screenshots/versions/2/restore',
      },
    ]);
  });

  it('waits for export completion and safely writes the fixed ZIP name once', async () => {
    stub = await startStubServer();
    const outputRoot = await mkdtemp(join(tmpdir(), 'od-store-screenshot-cli-export-'));
    tempRoots.push(outputRoot);
    let statusReads = 0;
    const zip = Buffer.from('zip bytes');
    stub.setResponder((request) => {
      if (request.method === 'POST') {
        return {
          status: 202,
          body: {
            job: {
              id: 'job-export',
              type: 'export',
              status: 'queued',
              progress: { completed: 0, total: 4 },
            },
          },
        };
      }
      if (request.url.endsWith('/download')) {
        return { status: 200, body: zip, contentType: 'application/zip' };
      }
      statusReads += 1;
      return {
        status: 200,
        body: {
          job: {
            id: 'job-export',
            type: 'export',
            status: statusReads === 1 ? 'running' : 'done',
            progress: { completed: statusReads === 1 ? 2 : 4, total: 4 },
            ...(statusReads === 1 ? {} : {
              result: exportResultFixture(),
            }),
          },
        },
      };
    });

    const result = await runCli([
      'store-screenshot',
      'export',
      'project-1',
      '--platform',
      'app-store',
      '--output',
      outputRoot,
      '--wait',
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      jobId: 'job-export',
      outputPath: join(outputRoot, 'store-screenshots.zip'),
      bytes: zip.byteLength,
      job: { status: 'done' },
    });
    expect(await readFile(join(outputRoot, 'store-screenshots.zip'))).toEqual(zip);
    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      {
        method: 'POST',
        url: '/api/projects/project-1/store-screenshots/export',
      },
      {
        method: 'GET',
        url: '/api/projects/project-1/store-screenshots/jobs/job-export',
      },
      {
        method: 'GET',
        url: '/api/projects/project-1/store-screenshots/jobs/job-export',
      },
      {
        method: 'GET',
        url: '/api/projects/project-1/store-screenshots/jobs/job-export/download',
      },
    ]);
    expect(JSON.parse(stub.requests[0]!.body.toString('utf8'))).toEqual({
      platforms: ['appStore'],
    });
  });

  it('does not overwrite an existing export ZIP', async () => {
    stub = await startStubServer();
    const outputRoot = await mkdtemp(join(tmpdir(), 'od-store-screenshot-cli-existing-'));
    tempRoots.push(outputRoot);
    const outputPath = join(outputRoot, 'store-screenshots.zip');
    await writeFile(outputPath, 'keep me');
    stub.setResponder((request) => {
      if (request.method === 'POST') {
        return {
          status: 202,
          body: {
            job: {
              id: 'job-export',
              type: 'export',
              status: 'queued',
              progress: { completed: 0, total: 1 },
            },
          },
        };
      }
      if (request.url.endsWith('/download')) {
        return { status: 200, body: Buffer.from('replacement'), contentType: 'application/zip' };
      }
      return {
        status: 200,
        body: {
          job: {
            id: 'job-export',
            type: 'export',
            status: 'done',
            progress: { completed: 1, total: 1 },
            result: exportResultFixture(),
          },
        },
      };
    });

    const result = await runCli([
      'store-screenshot',
      'export',
      'project-1',
      '--output',
      outputRoot,
      '--wait',
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: 'FILE_ERROR' },
    });
    expect(await readFile(outputPath, 'utf8')).toBe('keep me');
  });

  it('uses an injectable clock for export polling instead of real sleeps', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const fetchFn: StoreScreenshotCliFetch = vi.fn(async () => {
      reads += 1;
      return new Response(JSON.stringify({
        job: {
          id: 'job-1',
          type: 'export',
          status: reads === 1 ? 'running' : 'done',
          progress: { completed: reads === 1 ? 1 : 2, total: 2 },
          ...(reads === 1 ? {} : { result: exportResultFixture() }),
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const pending = pollStoreScreenshotJob({
      baseUrl: 'http://daemon.test',
      projectId: 'project-1',
      jobId: 'job-1',
      fetchFn,
      intervalMs: 250,
      onHttpFailure: async () => {
        throw new Error('unexpected HTTP failure');
      },
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(reads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ status: 'done' });
    expect(reads).toBe(2);
  });

  it('passes daemon errors through the shared structured HTTP failure envelope', async () => {
    stub = await startStubServer();
    stub.setResponder(() => ({
      status: 404,
      body: {
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found',
          details: { projectId: 'missing' },
        },
      },
    }));

    const result = await runCli([
      'store-screenshot',
      'versions',
      'missing',
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
        data: { details: { projectId: 'missing' } },
      },
    });
  });

  it('registers store-screenshot in root help and rejects unsafe local inputs before HTTP', async () => {
    stub = await startStubServer();

    const help = await runCli(['--help']);
    const commandHelp = await runCli(['store-screenshot', 'create', '-h']);
    const invalidPlatform = await runCli([
      'store-screenshot',
      'validate',
      'project-1',
      '--platform',
      'windows-store',
      ...daemonArgs(stub.baseUrl),
    ]);
    const invalidVersion = await runCli([
      'store-screenshot',
      'restore',
      'project-1',
      '../2',
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('od store-screenshot <create|upload|generate|validate|export|status|versions|restore>');
    expect(commandHelp.exitCode).toBe(0);
    expect(commandHelp.stdout).toContain('od store-screenshot create <project-id>');
    expect(invalidPlatform.exitCode).toBe(2);
    expect(invalidPlatform.stderr).toContain('app-store | google-play | all');
    expect(invalidVersion.exitCode).toBe(2);
    expect(invalidVersion.stderr).toContain('positive integer');
    expect(stub.requests).toHaveLength(0);
  });

  it('requires create --input and emits a JSON argument error when --json precedes the command', async () => {
    stub = await startStubServer();

    const result = await runCli([
      '--json',
      'store-screenshot',
      'create',
      'project-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('--input <json>'),
        details: {},
      },
    });
    expect(stub.requests).toHaveLength(0);
  });

  it('distinguishes explicit help from a missing command under --json', async () => {
    const help = await runCli(['store-screenshot', '--help']);
    const missing = await runCli(['store-screenshot', '--json']);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('od store-screenshot create <project-id> --input <json>');
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe('');
    expect(JSON.parse(missing.stderr)).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('command'),
        details: {},
      },
    });
  });

  it.each([
    ['flag from another command', ['create', 'project-1', '--platform', 'all', '--json']],
    ['unknown flag', ['versions', 'project-1', '--bogus', '--json']],
    ['duplicate boolean flag', ['versions', 'project-1', '--json', '--json']],
    ['duplicate string flag', ['validate', 'project-1', '--platform', 'all', '--platform', 'app-store', '--json']],
  ])('rejects %s before making HTTP requests', async (_label, args) => {
    stub = await startStubServer();

    const result = await runCli([
      'store-screenshot',
      ...args,
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.any(String),
        details: expect.any(Object),
      },
    });
    expect(stub.requests).toHaveLength(0);
  });

  it.each([
    ['invalid create JSON', ['create', 'project-1', '--input', '{', '--json'], 'INVALID_JSON'],
    ['invalid create request', ['create', 'project-1', '--input', '{}', '--json'], 'INVALID_INPUT'],
    ['missing prompt file', ['generate', 'project-1', '--json'], 'INVALID_ARGUMENT'],
    ['invalid platform', ['validate', 'project-1', '--platform', 'windows-store', '--json'], 'INVALID_ARGUMENT'],
    ['invalid version', ['restore', 'project-1', '../2', '--json'], 'INVALID_ARGUMENT'],
    ['missing upload file', ['upload', 'project-1', '/does/not/exist.png', '--json'], 'FILE_ERROR'],
  ])('emits one machine-readable local error for %s', async (_label, args, code) => {
    stub = await startStubServer();

    const result = await runCli([
      'store-screenshot',
      ...args,
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim().split('\n').length).toBeGreaterThan(0);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        code,
        message: expect.any(String),
        details: expect.any(Object),
      },
    });
    expect(stub.requests).toHaveLength(0);
  });

  it('returns a non-zero structured result when validation issues are present', async () => {
    stub = await startStubServer();
    const issues = [{
      severity: 'error',
      code: 'PAGE_COUNT',
      message: 'App Store requires at least one visible screenshot',
      platform: 'appStore',
    }];
    stub.setResponder(() => ({
      status: 200,
      body: { valid: false, issues },
    }));

    const result = await runCli([
      'store-screenshot',
      'validate',
      'project-1',
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Store screenshot validation failed',
        details: { issues },
      },
    });

    const humanResult = await runCli([
      'store-screenshot',
      'validate',
      'project-1',
      '--daemon-url',
      stub.baseUrl,
    ]);
    expect(humanResult.exitCode).toBe(1);
    expect(humanResult.stderr).toContain('Store screenshot validation failed');
    expect(humanResult.stderr).toContain('PAGE_COUNT');
    expect(humanResult.stderr).toContain(issues[0]!.message);
  });

  it.each([
    ['document', ['create', 'project-1', '--input', JSON.stringify({
      product: { name: 'Focus', summary: '', audience: '', features: [] },
      designSystemId: 'clay',
      templateId: 'minimal-center',
      pageCount: 1,
    })]],
    ['asset', ['upload', 'project-1', '__UPLOAD_FILE__']],
    ['job', ['status', 'project-1', 'job-1']],
    ['versions', ['versions', 'project-1']],
    ['validation', ['validate', 'project-1']],
  ])('rejects a malformed successful %s response as a protocol error', async (_kind, rawArgs) => {
    stub = await startStubServer();
    const root = await mkdtemp(join(tmpdir(), 'od-store-screenshot-cli-protocol-'));
    tempRoots.push(root);
    const uploadPath = join(root, 'screen.png');
    await writeFile(uploadPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const args = rawArgs.map((arg) => arg === '__UPLOAD_FILE__' ? uploadPath : arg);
    stub.setResponder(() => ({ status: 200, body: {} }));

    const result = await runCli([
      'store-screenshot',
      ...args,
      ...daemonArgs(stub.baseUrl),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        code: 'PROTOCOL_ERROR',
        message: expect.stringContaining('invalid'),
        details: { issues: expect.any(Array) },
      },
    });
  });
});
