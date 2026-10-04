import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SidecarFactory, type SidecarClient } from '@open-design/sidecar';
import { APP_KEYS, SIDECAR_ENV } from '@open-design/sidecar-proto';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

// A listener on the legacy port must receive no request when discovery is ambiguous.
const DEFAULT_DAEMON_PORT = 7456;

async function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

// Do not compete with a real daemon already using the legacy port.
const DEFAULT_PORT_WAS_FREE = process.platform === 'win32' ? false : await isPortFree(DEFAULT_DAEMON_PORT);

async function runCli(
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  // Deletions happen on the base inherited env BEFORE extraEnv is applied
  // (not merged-then-deleted) specifically so a test can still explicitly
  // set one of these vars via extraEnv when it wants that exact scenario —
  // e.g. the Electron-as-Node fallback regression below intentionally sets
  // ELECTRON_RUN_AS_NODE/OD_DATA_DIR, while every other test relies on them
  // being absent unless it says otherwise.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  // Never let this test's actual invoking environment leak a real daemon
  // endpoint into the child — every scenario here needs to reach
  // resolveMcpLaunchSpec's discovery chain on its own terms.
  delete env.OD_DAEMON_URL;
  delete env.OD_SIDECAR_IPC_PATH;
  delete env.OD_SIDECAR_CLIENT_ENDPOINT;
  delete env.OD_SIDECAR_SUPERVISED_CONTEXT;
  delete env[SIDECAR_ENV.NAMESPACE];
  // Regression coverage for the #6425 review (round 9): these two vars must
  // only appear in a test's env because IT put them there via extraEnv, not
  // because this Vitest process happened to inherit them (e.g. if it's
  // itself running under Electron-as-Node tooling).
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OD_DATA_DIR;
  Object.assign(env, extraEnv);
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

describe('od mcp install CLI identity probe', () => {
  it('emits a stable identity token without requiring an agent slug', async () => {
    const result = await runCli(['mcp', 'install', '--open-design-cli-probe']);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('open-design-cli:mcp-install:v1\n');
  });

  it('includes the resolved launch spec in JSON dry-run output', async () => {
    const launchSpec = {
      command: '/opt/open-design/runtime',
      args: ['/opt/open-design/daemon-cli.mjs', 'mcp'],
      env: { OD_DATA_DIR: '/tmp/open-design-data' },
    };
    const server = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(launchSpec));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing test server address');
      const result = await runCli([
        'mcp',
        'install',
        'codex',
        '--print',
        '--json',
        '--daemon-url',
        `http://127.0.0.1:${address.port}`,
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        agent: 'codex',
        kind: 'cli',
        launchSpec,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

// Exercise the public sidecar lifecycle and real subprocess CLI together.
// Unique explicit namespaces isolate these fixtures from installed applications.
describe.skipIf(process.platform === 'win32')('MCP install packaged discovery', () => {
  let root: string;
  let namespace: string;
  let httpServer: http.Server;
  let clients: SidecarClient<unknown>[];
  let requests: number;

  async function startSidecar(channel: string, url: string) {
    const saved = process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
    process.env.OD_SIDECAR_SUPERVISED_CONTEXT = JSON.stringify({
      generationPid: process.pid,
      stamp: { app: APP_KEYS.DAEMON, channel, namespace, source: 'packaged', mode: 'runtime' },
      resources: { dataRoot: root, runtimeRoot: root, ownerPid: null, port: 0 },
    });
    let client: SidecarClient<unknown>;
    try {
      client = SidecarFactory.create({ lifecycle: {
        async start() { return { pid: process.pid, state: 'running', url }; },
        status(runtime) { return runtime; },
        async stop() {},
      } });
    } finally {
      if (saved == null) delete process.env.OD_SIDECAR_SUPERVISED_CONTEXT;
      else process.env.OD_SIDECAR_SUPERVISED_CONTEXT = saved;
    }
    await client.start();
    clients.push(client);
  }

  beforeAll(async () => {
    root = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-discovery-'));
    namespace = `mcp-test-${process.pid}-${Date.now()}`;
    clients = [];
    requests = 0;
    httpServer = http.createServer((req, res) => {
      requests++;
      expect(req.url).toBe('/api/mcp/install-info');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ command: 'open-design-discovered-command', args: ['--discovered'], env: {} }));
    });
    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('no HTTP address');
    await startSidecar('stable', `http://127.0.0.1:${address.port}`);
  });

  afterAll(async () => {
    for (const client of clients.reverse()) await client.stop();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('discovers the authoritative spec, refuses ambiguity, and still permits uninstall', async () => {
    const env = { OD_SIDECAR_NAMESPACE: namespace };
    const found = await runCli(['mcp', 'install', 'claude', '--print', '--json'], env);
    expect(found.code).toBe(0);
    expect(JSON.parse(found.stdout).launchSpec).toEqual({ command: 'open-design-discovered-command', args: ['--discovered'], env: {} });
    expect(requests).toBe(1);

    await startSidecar('beta', 'http://127.0.0.1:57777');
    const ambiguous = await runCli(['mcp', 'install', 'claude', '--print', '--json'], env);
    expect(ambiguous.code).toBe(2);
    expect(JSON.parse(ambiguous.stdout)).toMatchObject({ ok: false, message: expect.stringMatching(/refusing/) });
    expect(ambiguous.stdout).not.toContain('7456');
    expect(JSON.parse(ambiguous.stdout)).not.toHaveProperty('launchSpec');
    expect(requests).toBe(1);

    if (DEFAULT_PORT_WAS_FREE) {
      let unrelatedRequests = 0;
      const unrelated = http.createServer((_req, res) => { unrelatedRequests++; res.end('{}'); });
      await new Promise<void>((resolve, reject) => { unrelated.once('error', reject); unrelated.listen(DEFAULT_DAEMON_PORT, '127.0.0.1', resolve); });
      try {
        const refused = await runCli(['mcp', 'install', 'claude', '--print', '--json'], env);
        expect(refused.code).toBe(2);
        expect(unrelatedRequests).toBe(0);
      } finally {
        await new Promise<void>(resolve => unrelated.close(() => resolve()));
      }
    }

    const uninstall = await runCli(['mcp', 'install', 'claude', '--uninstall', '--print', '--json'], env);
    expect(uninstall.code).toBe(0);
    expect(JSON.parse(uninstall.stdout).command).toContain('mcp remove');
    expect(requests).toBe(1);
  }, 30000);
});

describe('MCP self-reinvocation fallback', () => {
  it.each([false, true])('preserves explicit runtime environment: %s', async (withEnv) => {
    const root = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-fallback-'));
    try {
      const result = await runCli(['mcp', 'install', 'claude', '--print', '--json', '--daemon-url', 'http://127.0.0.1:0'], withEnv ? {
        ELECTRON_RUN_AS_NODE: '1', OD_DATA_DIR: root,
      } : {});
      expect(result.code).toBe(0);
      const spec = JSON.parse(result.stdout).launchSpec;
      expect(spec.command).toBe(process.execPath);
      expect(spec.args).toEqual([CLI_SRC, 'mcp', '--daemon-url', 'http://127.0.0.1:0']);
      expect(spec.env).toEqual(withEnv ? { ELECTRON_RUN_AS_NODE: '1', OD_DATA_DIR: root } : {});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
