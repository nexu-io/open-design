// Contract test for the `od templates` CLI surface. Keeps the
// UI / API / CLI triple wired together (AGENTS.md "Capability exposure"):
// the CLI must drive the same /api/templates endpoints the web UI uses
// (NewProjectPanel / ExamplesTab), with --json support for headless
// agents that pipe through jq / xargs.
//
// We spin up a tiny stub HTTP server to capture requests instead of
// booting the full daemon: `execFile` is enough to prove that
// SUBCOMMAND_MAP routes `templates`, parseFlags accepts the documented
// flags, and the right HTTP call is emitted for each sub-verb.

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

// Reserve a port the OS just told us is free, then close it before
// any test runs so connections to it fail with ECONNREFUSED. The
// previous `port + 1` heuristic only assumed the stub's ephemeral port
// was free — `+1` could already be bound by an unrelated process on a
// shared CI host, which would silently route the "unreachable daemon"
// tests at a real server and let them pass (or fail) for the wrong
// reason (#2428 round-4 reviewer-correctness fix).
async function reserveAndReleasePort(): Promise<{ host: string; port: number }> {
  return new Promise((resolveListen, rejectListen) => {
    const probe = http.createServer();
    probe.unref();
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      if (!addr || typeof addr === 'string') {
        probe.close();
        rejectListen(new Error('probe server has no address'));
        return;
      }
      const { port } = addr;
      probe.close((err) => {
        if (err) rejectListen(err);
        else resolveListen({ host: '127.0.0.1', port });
      });
    });
  });
}

describe('od templates CLI', () => {
  let stub: StubServer;
  let unreachableDaemonUrl: string;

  beforeAll(async () => {
    stub = await startStubServer();
    const reserved = await reserveAndReleasePort();
    unreachableDaemonUrl = `http://${reserved.host}:${reserved.port}`;
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    stub.requests.length = 0;
    stub.setResponder(() => ({ status: 200, body: { ok: true } }));
  });

  afterEach(() => {
    stub.setResponder(() => ({ status: 200, body: { ok: true } }));
  });

  it('prints usage on `od templates help` and exits 0', async () => {
    const result = await runCli(['templates', 'help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/od templates/);
    expect(result.stdout).toMatch(/save/);
    expect(result.stdout).toMatch(/delete/);
    expect(stub.requests).toHaveLength(0);
  });

  it('lists user-saved templates as `id\\tname` lines by default', async () => {
    stub.setResponder((req) => {
      if (req.method === 'GET' && req.url === '/api/templates') {
        return {
          status: 200,
          body: {
            templates: [
              { id: 't-1', name: 'Cards', sourceProjectId: 'proj-1' },
              { id: 't-2', name: 'Pricing', sourceProjectId: 'proj-2' },
            ],
          },
        };
      }
      return { status: 404, body: { error: 'unexpected' } };
    });

    const result = await runCli(['templates', 'list', '--daemon-url', stub.baseUrl]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/templates',
    });
    expect(result.stdout).toContain('t-1\tCards');
    expect(result.stdout).toContain('t-2\tPricing');
  });

  it('emits the raw GET /api/templates body under --json', async () => {
    const payload = {
      templates: [{ id: 't-1', name: 'Cards', sourceProjectId: 'proj-1', files: [] }],
    };
    stub.setResponder(() => ({ status: 200, body: payload }));

    const result = await runCli([
      'templates',
      'list',
      '--daemon-url',
      stub.baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(payload);
  });

  it('POSTs /api/templates with name + sourceProjectId on `templates save`', async () => {
    stub.setResponder((req) => {
      if (req.method === 'POST' && req.url === '/api/templates') {
        return {
          status: 200,
          body: { template: { id: 't-new', name: 'Cards', sourceProjectId: 'proj-1' } },
        };
      }
      return { status: 404, body: { error: 'unexpected' } };
    });

    const result = await runCli([
      'templates',
      'save',
      'proj-1',
      '--name',
      'Cards',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const req = stub.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/templates');
    expect(JSON.parse(req.body)).toEqual({
      name: 'Cards',
      sourceProjectId: 'proj-1',
    });
    expect(result.stdout).toContain('t-new');
  });

  it('forwards an optional --description into the POST body', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { template: { id: 't-2', name: 'Pricing', description: 'About pricing' } },
    }));

    const result = await runCli([
      'templates',
      'save',
      'proj-9',
      '--name',
      'Pricing',
      '--description',
      'About pricing',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    const req = stub.requests[0]!;
    expect(JSON.parse(req.body)).toEqual({
      name: 'Pricing',
      description: 'About pricing',
      sourceProjectId: 'proj-9',
    });
  });

  it('exits 2 and emits no HTTP request when `templates save` lacks --name', async () => {
    const result = await runCli([
      'templates',
      'save',
      'proj-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(2);
    expect(stub.requests).toHaveLength(0);
    expect(result.stderr).toMatch(/--name/);
  });

  it('exits 2 and emits no HTTP request when `templates save` lacks a projectId', async () => {
    const result = await runCli([
      'templates',
      'save',
      '--name',
      'Cards',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(2);
    expect(stub.requests).toHaveLength(0);
    expect(result.stderr).toMatch(/projectId/i);
  });

  it('DELETEs /api/templates/:id on `templates delete <id>`', async () => {
    stub.setResponder((req) => {
      if (req.method === 'DELETE' && req.url === '/api/templates/t-1') {
        return { status: 200, body: { ok: true } };
      }
      return { status: 404, body: { error: 'unexpected' } };
    });

    const result = await runCli([
      'templates',
      'delete',
      't-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'DELETE',
      url: '/api/templates/t-1',
    });
    expect(result.stdout).toContain('t-1');
  });

  it('exits 2 and emits no HTTP request when `templates delete` lacks an id', async () => {
    const result = await runCli([
      'templates',
      'delete',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(2);
    expect(stub.requests).toHaveLength(0);
    expect(result.stderr).toMatch(/<id>/);
  });

  it('prints usage on `od templates` with no sub-verb and exits 2', async () => {
    const result = await runCli(['templates']);
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/od templates/);
  });

  it('exits non-zero on unknown sub-verb', async () => {
    const result = await runCli([
      'templates',
      'frobnicate',
      '--daemon-url',
      stub.baseUrl,
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/unknown subcommand/i);
  });

  // Reviewer-correctness fix from #2428: when the daemon isn't
  // running, every sub-verb must surface the same clean
  // "failed to reach daemon at <url>: <code>" error that the rest of
  // the CLI emits via `surfaceFetchError`, not a raw
  // `TypeError: fetch failed`. The CLI is pointed at a port the OS
  // just told us was free and which we immediately released — see
  // `reserveAndReleasePort` above — so the connection fails with
  // ECONNREFUSED rather than silently routing to whatever happens to
  // be bound nearby.

  it('surfaces a clean fetch error from `templates list` when the daemon is unreachable', async () => {
    const result = await runCli(['templates', 'list', '--daemon-url', unreachableDaemonUrl]);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/failed to reach daemon at http:\/\/127\.0\.0\.1:/);
    expect(result.stderr).not.toMatch(/TypeError: fetch failed/);
  });

  it('surfaces a clean fetch error from `templates save` when the daemon is unreachable', async () => {
    const result = await runCli([
      'templates',
      'save',
      'proj-1',
      '--name',
      'Cards',
      '--daemon-url',
      unreachableDaemonUrl,
    ]);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/failed to reach daemon at http:\/\/127\.0\.0\.1:/);
    expect(result.stderr).not.toMatch(/TypeError: fetch failed/);
  });

  it('surfaces a clean fetch error from `templates delete` when the daemon is unreachable', async () => {
    const result = await runCli([
      'templates',
      'delete',
      't-1',
      '--daemon-url',
      unreachableDaemonUrl,
    ]);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/failed to reach daemon at http:\/\/127\.0\.0\.1:/);
    expect(result.stderr).not.toMatch(/TypeError: fetch failed/);
  });

  // Reviewer-correctness fixes from #2428 round 3.
  // (1) positional id must work even when shared flags come first.
  // (2) `templates save` 404 / 400 must map to project-not-found /
  //     missing-input — not the default `daemon-not-running`, which
  //     would send agents down the wrong recovery branch.
  it('accepts positional projectId after --daemon-url for `templates save` (flag-before-id)', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { template: { id: 't-after-flag', name: 'Cards' } },
    }));
    const result = await runCli([
      'templates',
      'save',
      '--daemon-url',
      stub.baseUrl,
      'proj-1',
      '--name',
      'Cards',
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.method).toBe('POST');
    expect(JSON.parse(stub.requests[0]?.body ?? '{}')).toMatchObject({
      sourceProjectId: 'proj-1',
      name: 'Cards',
    });
  });

  it('accepts positional id after --daemon-url for `templates delete` (flag-before-id)', async () => {
    stub.setResponder(() => ({ status: 200, body: { ok: true } }));
    const result = await runCli([
      'templates',
      'delete',
      '--daemon-url',
      stub.baseUrl,
      't-after-flag',
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.method).toBe('DELETE');
    expect(stub.requests[0]?.url).toBe('/api/templates/t-after-flag');
  });

  it('reports project-not-found (not daemon-not-running) when `templates save` gets 404', async () => {
    // POST /api/templates returns a flat `{ error: '<message>' }` body
    // (project-routes.ts:679), so the stub mirrors that exact shape
    // rather than the nested `{ error: { code, message } }` envelope.
    // structuredHttpFailure normalises the flat string into the
    // structured envelope, mapping the 404 to project-not-found via
    // the fallback code passed at the call site and surfacing the
    // daemon's literal message so headless callers don't lose the
    // only diagnostic the route emitted.
    stub.setResponder(() => ({
      status: 404,
      body: { error: 'source project not found' },
    }));
    const result = await runCli([
      'templates',
      'save',
      'missing-project',
      '--name',
      'Cards',
      '--daemon-url',
      stub.baseUrl,
    ]);
    expect(result.code).toBe(68);
    const envelope = JSON.parse(result.stderr.trim());
    expect(envelope.error.code).toBe('project-not-found');
    expect(envelope.error.message).toBe('source project not found');
  });

  it('reports missing-input (not daemon-not-running) when `templates save` gets 400', async () => {
    // 400 from POST /api/templates is also a flat `{ error: '<msg>' }`
    // body (project-routes.ts:669, :675). Same normalisation contract
    // as the 404 case above.
    stub.setResponder(() => ({
      status: 400,
      body: { error: 'name required' },
    }));
    const result = await runCli([
      'templates',
      'save',
      'proj-1',
      '--name',
      'Cards',
      '--daemon-url',
      stub.baseUrl,
    ]);
    expect(result.code).toBe(67);
    const envelope = JSON.parse(result.stderr.trim());
    expect(envelope.error.code).toBe('missing-input');
    expect(envelope.error.message).toBe('name required');
  });
});
