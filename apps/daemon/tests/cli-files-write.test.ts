// Red-spec for the `od files write` / `od files upload` crash:
// both sub-verbs called the CommonJS `require('node:fs')` inside the ESM
// cli.ts (`"type": "module"`), so the moment the verb past arg-parsing was
// reached, Node threw (`require is not defined` under the tsx test runner;
// `ERR_AMBIGUOUS_MODULE_SYNTAX` from the compiled dist entry) and the file
// never reached the daemon. `files read|list|delete` never touched
// `require`, which is why only the two writing verbs were broken.
//
// The tests pin the behavior contract, not the crash message: each verb
// must exit 0 and emit the documented POST /api/projects/:id/files body
// (`encoding: 'utf8'` for write-from-stdin, base64 for upload). Stub-server
// + exec-the-real-cli pattern follows cli-templates.test.ts.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', body: raw });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ file: { name: 'stub-echo' } }));
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

/** Exec the real cli.ts entry, optionally feeding stdin (which `files write`
 *  reads synchronously via fd 0). */
function runCli(
  args: string[],
  options: { stdin?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolveRun) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    child.on('close', (code) => resolveRun({ stdout, stderr, code }));
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

describe('od files write / upload (ESM require regression)', () => {
  let stub: StubServer;
  let scratchDir: string;

  beforeAll(async () => {
    stub = await startStubServer();
    scratchDir = mkdtempSync(join(tmpdir(), 'od-files-cli-'));
  });

  afterAll(async () => {
    await stub.close();
    rmSync(scratchDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    stub.requests.length = 0;
  });

  it('`files write` streams stdin into POST /api/projects/:id/files as utf8', async () => {
    const result = await runCli(
      ['files', 'write', 'proj-1', 'notes/brief.md', '--daemon-url', stub.baseUrl],
      { stdin: '# brief\nhello from stdin\n' },
    );

    expect(result.stderr).not.toMatch(/require is not defined|ERR_AMBIGUOUS_MODULE_SYNTAX/);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const req = stub.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/projects/proj-1/files');
    expect(JSON.parse(req.body)).toEqual({
      name: 'notes/brief.md',
      content: '# brief\nhello from stdin\n',
      encoding: 'utf8',
    });
    expect(result.stdout).toMatch(/\[files\] wrote/);
  });

  it('`files upload` POSTs the local file as base64, named by basename', async () => {
    const localPath = join(scratchDir, 'hero.bin');
    writeFileSync(localPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await runCli([
      'files',
      'upload',
      'proj-1',
      localPath,
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.stderr).not.toMatch(/require is not defined|ERR_AMBIGUOUS_MODULE_SYNTAX/);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const req = stub.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/projects/proj-1/files');
    expect(JSON.parse(req.body)).toEqual({
      name: 'hero.bin',
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
      encoding: 'base64',
    });
  });

  // Same-pattern site: `safeReadJsonFile` also called `require('node:fs')`,
  // but inside its own try/catch — so instead of crashing, `od project create
  // --metadata-json <file>` SILENTLY dropped the metadata from the POST body.
  it('`project create --metadata-json` actually sends the file content as metadata', async () => {
    const metadataPath = join(scratchDir, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify({ kind: 'template', templateId: 't-1' }));

    const result = await runCli([
      'project',
      'create',
      '--name',
      'From template',
      '--metadata-json',
      metadataPath,
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      name: 'From template',
      metadata: { kind: 'template', templateId: 't-1' },
    });
  });

  it('`files upload --as` overrides the destination name', async () => {
    const localPath = join(scratchDir, 'local-name.txt');
    writeFileSync(localPath, 'asset body');

    const result = await runCli([
      'files',
      'upload',
      'proj-1',
      localPath,
      '--as',
      'assets/renamed.txt',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      name: 'assets/renamed.txt',
      encoding: 'base64',
    });
  });
});
