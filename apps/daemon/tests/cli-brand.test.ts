// Contract test for the `od brand` CLI write surface. Keeps the
// UI / API / CLI triple wired together (AGENTS.md "Capability exposure"):
// the CLI must drive the same /api/brands* endpoints the web Brands tab
// uses (brand-page subproject B spec §6), with --json support for headless
// agents that pipe through jq / xargs.
//
// Same harness shape as cli-templates.test.ts: a tiny stub HTTP server
// captures requests instead of booting the full daemon — enough to prove
// SUBCOMMAND_MAP routes `brand`, parseFlags accepts the documented flags,
// and the right HTTP call (method, path, body) is emitted per sub-verb.
// The stub-server route contracts themselves are covered by
// brand-write-routes.test.ts.

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

// spawn (not execFile) so `--prompt-file -` / `--presentation-json -`
// stdin conventions are testable — we need to write to the child's stdin.
async function runCli(
  args: string[],
  options: { stdin?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`od ${args.join(' ')} timed out`));
    }, 15_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectRun(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ stdout, stderr, code });
    });
    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

describe('od brand CLI', () => {
  let stub: StubServer;
  let scratchDir: string;

  beforeAll(async () => {
    stub = await startStubServer();
    scratchDir = mkdtempSync(join(tmpdir(), 'od-cli-brand-'));
  });

  afterAll(async () => {
    await stub.close();
    rmSync(scratchDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    stub.requests.length = 0;
    stub.setResponder(() => ({ status: 200, body: { ok: true } }));
  });

  it('prints usage on `od brand help` covering every write sub-verb and exits 0', async () => {
    const result = await runCli(['brand', 'help']);
    expect(result.code).toBe(0);
    for (const verb of ['list', 'show', 'create', 'update', 'doc set', 'deliverable add', 'deliverable remove', 'asset add', 'delete']) {
      expect(result.stdout).toContain(`od brand ${verb}`);
    }
    expect(result.stdout).toContain('--json');
    expect(stub.requests).toHaveLength(0);
  });

  it('exits 2 with usage when invoked bare', async () => {
    const result = await runCli(['brand']);
    expect(result.code).toBe(2);
    expect(stub.requests).toHaveLength(0);
  });

  it('create POSTs /api/brands with title/id/presentation and honors --json', async () => {
    stub.setResponder(() => ({
      status: 201,
      body: { id: 'acme', title: 'Acme', deliverables: [], body: '', projectCount: 0 },
    }));
    const result = await runCli([
      'brand', 'create',
      '--title', 'Acme',
      '--id', 'acme',
      '--subtitle', 'B2B SaaS',
      '--tagline', 'Ship faster',
      '--json',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'POST', url: '/api/brands' });
    expect(JSON.parse(stub.requests[0].body)).toEqual({
      title: 'Acme',
      id: 'acme',
      presentation: { subtitle: 'B2B SaaS', tagline: 'Ship faster' },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 'acme', title: 'Acme' });
  });

  it('create without --title exits 2 and never hits the daemon', async () => {
    const result = await runCli(['brand', 'create', '--daemon-url', stub.baseUrl]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/--title/);
    expect(stub.requests).toHaveLength(0);
  });

  it('update PUTs /api/brands/:id with parsed --presentation-json', async () => {
    stub.setResponder(() => ({ status: 200, body: { brand: { id: 'acme' } } }));
    const result = await runCli([
      'brand', 'update', 'acme',
      '--title', 'Acme Corp',
      '--presentation-json', '{"subtitle":"New sub"}',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'PUT', url: '/api/brands/acme' });
    expect(JSON.parse(stub.requests[0].body)).toEqual({
      title: 'Acme Corp',
      presentation: { subtitle: 'New sub' },
    });
    expect(result.stdout).toContain('Updated acme');
  });

  it('update accepts --presentation-json - from stdin', async () => {
    stub.setResponder(() => ({ status: 200, body: { brand: { id: 'acme' } } }));
    const result = await runCli(
      ['brand', 'update', 'acme', '--presentation-json', '-', '--daemon-url', stub.baseUrl],
      { stdin: '{"tagline":"From stdin"}' },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(stub.requests[0].body)).toEqual({
      presentation: { tagline: 'From stdin' },
    });
  });

  it('update with no patch flags exits 2 without a request', async () => {
    const result = await runCli(['brand', 'update', 'acme', '--daemon-url', stub.baseUrl]);
    expect(result.code).toBe(2);
    expect(stub.requests).toHaveLength(0);
  });

  it('doc set PUTs the --prompt-file body to /docs/:key', async () => {
    const docPath = join(scratchDir, 'core.md');
    writeFileSync(docPath, '# Acme\n\nBrand core body.\n');
    const result = await runCli([
      'brand', 'doc', 'set', 'acme', 'core',
      '--prompt-file', docPath,
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'PUT', url: '/api/brands/acme/docs/core' });
    expect(JSON.parse(stub.requests[0].body)).toEqual({ body: '# Acme\n\nBrand core body.\n' });
    expect(result.stdout).toContain('brand.md');
  });

  it('doc set reads the body from stdin with --prompt-file -', async () => {
    const result = await runCli(
      ['brand', 'doc', 'set', 'acme', 'blog', '--prompt-file', '-', '--daemon-url', stub.baseUrl],
      { stdin: 'Blog channel guidance.' },
    );
    expect(result.code).toBe(0);
    expect(stub.requests[0]).toMatchObject({ method: 'PUT', url: '/api/brands/acme/docs/blog' });
    expect(JSON.parse(stub.requests[0].body)).toEqual({ body: 'Blog channel guidance.' });
  });

  it('doc set without --prompt-file exits 2 without a request', async () => {
    const result = await runCli(['brand', 'doc', 'set', 'acme', 'core', '--daemon-url', stub.baseUrl]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/--prompt-file/);
    expect(stub.requests).toHaveLength(0);
  });

  it('deliverable add POSTs key/label/designSystem to /deliverables', async () => {
    stub.setResponder(() => ({ status: 201, body: { brand: { id: 'acme' } } }));
    const result = await runCli([
      'brand', 'deliverable', 'add', 'acme', 'cardnews',
      '--label', 'Card News',
      '--design-system', 'toss',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests[0]).toMatchObject({ method: 'POST', url: '/api/brands/acme/deliverables' });
    expect(JSON.parse(stub.requests[0].body)).toEqual({
      key: 'cardnews',
      label: 'Card News',
      designSystem: 'toss',
    });
    expect(result.stdout).toContain('Added deliverable cardnews');
  });

  it('deliverable remove DELETEs /deliverables/:key', async () => {
    stub.setResponder(() => ({ status: 200, body: { brand: { id: 'acme' } } }));
    const result = await runCli([
      'brand', 'deliverable', 'remove', 'acme', 'cardnews',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/api/brands/acme/deliverables/cardnews',
    });
    expect(result.stdout).toContain('Removed deliverable cardnews');
  });

  it('asset add uploads multipart with ?role=icon and prints --json result', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { path: 'assets/icon.png', url: '/api/brands/acme/assets/icon.png' },
    }));
    const assetPath = join(scratchDir, 'icon.png');
    writeFileSync(assetPath, Buffer.from('89504e470d0a1a0a', 'hex'));
    const result = await runCli([
      'brand', 'asset', 'add', 'acme', assetPath,
      '--icon', '--json',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/brands/acme/assets?role=icon',
    });
    // multipart body carries the file part under the daemon's expected field name
    expect(stub.requests[0].body).toContain('name="file"');
    expect(stub.requests[0].body).toContain('filename="icon.png"');
    expect(stub.requests[0].body).toContain('Content-Type: image/png');
    expect(JSON.parse(result.stdout)).toEqual({
      path: 'assets/icon.png',
      url: '/api/brands/acme/assets/icon.png',
    });
  });

  it('asset add rejects an unsupported extension locally with exit 2', async () => {
    const badPath = join(scratchDir, 'notes.txt');
    writeFileSync(badPath, 'not an image');
    const result = await runCli([
      'brand', 'asset', 'add', 'acme', badPath,
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/unsupported asset file type/);
    expect(stub.requests).toHaveLength(0);
  });

  it('delete without --yes refuses with exit 2 and never hits the daemon', async () => {
    const result = await runCli(['brand', 'delete', 'acme', '--daemon-url', stub.baseUrl]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/--yes/);
    expect(stub.requests).toHaveLength(0);
  });

  it('delete --yes DELETEs /api/brands/:id and honors --json', async () => {
    stub.setResponder(() => ({ status: 200, body: { ok: true } }));
    const result = await runCli([
      'brand', 'delete', 'acme', '--yes', '--json',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests[0]).toMatchObject({ method: 'DELETE', url: '/api/brands/acme' });
    expect(JSON.parse(result.stdout)).toEqual({ ok: true });
  });
});
