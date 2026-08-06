import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJsonIpcServer, resolveAppIpcPath, type JsonIpcServerHandle } from '@open-design/sidecar';
import { releaseNamespace } from '@open-design/release';
import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, SIDECAR_ENV, SIDECAR_MESSAGES } from '@open-design/sidecar-proto';
import { currentReleasePlatform } from '../src/daemon-url.js';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

async function runCli(
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  delete env.NODE_OPTIONS;
  // Never let this test's actual invoking environment leak a real daemon
  // endpoint into the child — every scenario here needs to reach
  // resolveMcpLaunchSpec's discovery chain on its own terms.
  delete env.OD_DAEMON_URL;
  delete env.OD_SIDECAR_IPC_PATH;
  // Regression coverage for the #6425 review: an inherited OD_SIDECAR_NAMESPACE
  // (e.g. from a tools-dev or packaged run this Vitest process happens to be
  // spawned under) would make conventionalIpcSocketPaths() probe that ONE
  // namespace instead of sweeping the channel list, so the "stable" fixture
  // socket the end-to-end test below sets up would never be reached and the
  // CLI would silently fall back to the self-reinvocation spec instead.
  delete env[SIDECAR_ENV.NAMESPACE];
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

// End-to-end regression for #6424/#6425: a plain terminal invocation of
// `od mcp install <agent>` (no OD_SIDECAR_IPC_PATH, no OD_DAEMON_URL — the
// exact conditions of the original bug report) must persist the PACKAGED
// daemon's real /api/mcp/install-info launch spec, discovered via the
// conventional per-channel IPC socket, rather than degrading to the
// self-reinvocation fallback in resolveMcpLaunchSpec (cli.ts). Codex's
// architecture review of this PR noted that every other test here proves
// resolveDaemonUrl()'s discovery in isolation, but nothing proved the full
// `od mcp install` CLI closure actually wires a discovered daemon's install
// info through to the printed install plan.
//
// POSIX-only, matching the implementation's own scope (see
// `conventionalIpcSocketPaths` / `isOwnedByCurrentProcess` in
// daemon-url.ts): on win32, `currentReleasePlatform()` resolves to "win",
// `conventionalIpcSocketPaths()` unconditionally returns no candidates, and
// `resolveAppIpcPath()` would return a named-pipe path -- `fs.mkdirSync` on
// its dirname is meaningless there, and the CLI would correctly fall back
// to the self-reinvocation spec instead of reaching the fake socket set up
// below, failing the FAKE_COMMAND assertion for reasons unrelated to a real
// regression. Windows coverage of the CLI closure would need a dedicated
// named-pipe variant of this fixture, not this one running unconditionally.
describe.skipIf(process.platform === 'win32')('od mcp install <agent> end-to-end via conventional IPC discovery (#6424/#6425)', () => {
  let conventionalIpcBaseDir: string;
  let httpServer: http.Server;
  let httpPort: number;
  let ipc: JsonIpcServerHandle | null = null;

  const FAKE_COMMAND = 'open-design-fake-daemon-command';
  const FAKE_ARGS = ['--fake-flag', 'fake-value'];

  beforeAll(async () => {
    conventionalIpcBaseDir = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-install-e2e-'));

    // Stands in for the real daemon's /api/mcp/install-info HTTP endpoint —
    // the launch spec resolveMcpLaunchSpec should end up persisting is
    // whatever THIS returns, never the self-reinvocation fallback.
    httpServer = http.createServer((req, res) => {
      if (req.url === '/api/mcp/install-info') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ command: FAKE_COMMAND, args: FAKE_ARGS, env: {} }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (address == null || typeof address === 'string') throw new Error('expected an AddressInfo');
    httpPort = address.port;

    const socketPath = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
      namespace: releaseNamespace('stable', currentReleasePlatform()),
    });
    fs.mkdirSync(pathResolve(socketPath, '..'), { recursive: true });
    ipc = await createJsonIpcServer({
      socketPath,
      handler: (message) => {
        if (message != null && typeof message === 'object' && (message as { type?: unknown }).type === SIDECAR_MESSAGES.STATUS) {
          return { pid: 1, state: 'running', updatedAt: new Date().toISOString(), url: `http://127.0.0.1:${httpPort}` };
        }
        throw new Error('unexpected message');
      },
    });
  });

  afterAll(async () => {
    await ipc?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    fs.rmSync(conventionalIpcBaseDir, { recursive: true, force: true });
  });

  it('persists the discovered packaged launch spec instead of the self-reinvocation fallback', async () => {
    const result = await runCli(['mcp', 'install', 'claude', '--print', '--json'], {
      [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const parsed = JSON.parse(result.stdout) as { ok: boolean; agent: string; kind: string; command: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.agent).toBe('claude');
    expect(parsed.kind).toBe('cli');
    // The fallback spec's command is always `process.execPath` (an absolute
    // node interpreter path) — it can never contain FAKE_COMMAND. Seeing
    // FAKE_COMMAND here proves the CLI actually reached the fake HTTP
    // server through conventional discovery, not the degraded fallback.
    expect(parsed.command).toContain(FAKE_COMMAND);
    expect(parsed.command).toContain(FAKE_ARGS.join(' '));
  });
});
