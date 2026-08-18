import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
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

// The legacy default port daemon-url.ts's DEFAULT_DAEMON_URL hardcodes.
// resolveMcpLaunchSpec fetches this exact address when discovery is
// ambiguous, so the regression below needs a real listener bound there --
// there is no env-level way to redirect that hardcoded address.
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

// Decided once, at module load (before any describe/it registers), since
// `it`/`describe.skipIf` conditions must be synchronous by the time
// Vitest collects this file -- a beforeAll can't retroactively skip tests
// already queued for the run.
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
  // Regression coverage for the #6425 review: an inherited OD_SIDECAR_NAMESPACE
  // (e.g. from a tools-dev or packaged run this Vitest process happens to be
  // spawned under) would make conventionalIpcSocketPaths() probe that ONE
  // namespace instead of sweeping the channel list, so the "stable" fixture
  // socket the end-to-end test below sets up would never be reached and the
  // CLI would silently fall back to the self-reinvocation spec instead.
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

// Blocking findings from rounds 8 and 9 (commits 7536bc7, then a further
// finding on top of it): returning DEFAULT_DAEMON_URL for an ambiguous
// discovery result does not make it inert in EITHER of two ways.
//
// Round 8: resolveMcpLaunchSpec unconditionally fetched
// `${base}/api/mcp/install-info` on whatever URL it got back -- if
// something happens to be listening on the hardcoded legacy port
// 127.0.0.1:7456 during that exact INSTALL-TIME window, the CLI would
// fetch and persist THAT server's response. Fixed by skipping the fetch
// entirely when `ambiguous` is true.
//
// Round 9: skipping the install-time fetch only prevented THAT one fetch --
// the self-reinvocation fallback spec still wrote `--daemon-url
// http://127.0.0.1:7456` into the persisted agent config. `ensureMcpDaemonUrl`
// (mcp-bootstrap.ts) treats an explicit --daemon-url as authoritative and
// skips rediscovery on every LATER `od mcp` spawn, so whatever eventually
// ends up owning port 7456 -- at any point after install, not just during
// it -- would silently receive the MCP traffic from then on. The only fix
// that actually holds end-to-end is refusing to persist ANY spec at all
// when ambiguous: resolveMcpLaunchSpec now returns `null`, and
// runMcpInstall fails the whole install rather than falling through to any
// fallback.
//
// Requires exclusive use of the real, unparameterizable port 7456 -- see
// DEFAULT_PORT_WAS_FREE above -- so this describe is skipped rather than
// failing outright if something else already owns that port on the host
// (e.g. a real Open Design daemon, or a source-checkout `od` dev instance,
// which also defaults to 7456) when this suite runs.
describe.skipIf(!DEFAULT_PORT_WAS_FREE)('od mcp install <agent> ambiguity refuses to persist any spec (#6425)', () => {
  let conventionalIpcBaseDir: string;
  let stableIpc: JsonIpcServerHandle | null = null;
  let betaIpc: JsonIpcServerHandle | null = null;

  const UNRELATED_COMMAND = 'open-design-unrelated-default-port-daemon';

  beforeAll(async () => {
    // Short prefix deliberately: AF_UNIX's sun_path has a ~104-byte limit
    // (macOS), and this path is already deep (tmpdir + namespace + filename).
    conventionalIpcBaseDir = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-amb-'));

    const platform = currentReleasePlatform();
    const stableSocketPath = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
      namespace: releaseNamespace('stable', platform),
    });
    const betaSocketPath = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
      namespace: releaseNamespace('beta', platform),
    });
    fs.mkdirSync(pathResolve(stableSocketPath, '..'), { recursive: true });
    fs.mkdirSync(pathResolve(betaSocketPath, '..'), { recursive: true });
    stableIpc = await createJsonIpcServer({
      socketPath: stableSocketPath,
      handler: () => ({ pid: 1, state: 'running', updatedAt: new Date().toISOString(), url: 'http://127.0.0.1:56666' }),
    });
    betaIpc = await createJsonIpcServer({
      socketPath: betaSocketPath,
      handler: () => ({ pid: 2, state: 'running', updatedAt: new Date().toISOString(), url: 'http://127.0.0.1:57777' }),
    });
  });

  afterAll(async () => {
    await stableIpc?.close();
    await betaIpc?.close();
    fs.rmSync(conventionalIpcBaseDir, { recursive: true, force: true });
  });

  it('fails the install outright instead of persisting any spec', async () => {
    const result = await runCli(['mcp', 'install', 'claude', '--print', '--json'], {
      [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
    });

    expect(result.code).not.toBe(0);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; agent: string; message: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.agent).toBe('claude');
    expect(parsed.message).toMatch(/refus/i);
    // Nothing referencing the default port must appear anywhere in the
    // output -- there is no spec left to carry a concrete URL. (The error
    // message's own advisory text legitimately suggests the bare
    // `--daemon-url` FLAG NAME as something the user could pass, so that
    // substring alone isn't the thing to assert against here.)
    expect(result.stdout).not.toContain(String(DEFAULT_DAEMON_PORT));
  });

  // Literal reproduction of the review's requested scenario, adapted to
  // this fix's actual shape: since NOTHING is ever persisted when
  // ambiguous, "starts a listener on the default port after the ambiguous
  // install" can only meaningfully prove the refusal is structural (driven
  // by the live channel sockets) rather than an accident of the default
  // port happening to be empty at attempt time. Retries the exact same
  // install after the listener appears and confirms it is refused again,
  // identically, with the listener's response never surfacing anywhere.
  it('still refuses once the default-port listener appears after the first refusal', async () => {
    const before = await runCli(['mcp', 'install', 'claude', '--print', '--json'], {
      [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
    });
    expect(before.code).not.toBe(0);

    const defaultPortServer = http.createServer((req, res) => {
      if (req.url === '/api/mcp/install-info') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ command: UNRELATED_COMMAND, args: [], env: {} }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve, reject) => {
      defaultPortServer.once('error', reject);
      defaultPortServer.listen(DEFAULT_DAEMON_PORT, '127.0.0.1', resolve);
    });
    try {
      const after = await runCli(['mcp', 'install', 'claude', '--print', '--json'], {
        [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
      });
      expect(after.code).not.toBe(0);
      expect(after.stdout).not.toContain(UNRELATED_COMMAND);
      const parsed = JSON.parse(after.stdout) as { ok: boolean };
      expect(parsed.ok).toBe(false);
    } finally {
      await new Promise<void>((resolve) => defaultPortServer.close(() => resolve()));
    }
  });

  // Blocking finding from the round-11 review, on top of cb3a098: the
  // `spec == null` ambiguity refusal in runMcpInstall fired unconditionally
  // -- including for `--uninstall`, which never needed a live daemon or any
  // launch-spec resolution at all (planAgentInstall's removeArgv /
  // configPath / keyPath / serverKey fields never derive from `spec`; only
  // the add-side fields do). With two conventional channel sockets live,
  // `--uninstall` would hit the same ambiguous-null exit as install and
  // bail with code 2 before ever reaching plan.removeArgv, stranding a
  // stale MCP registration the user was specifically trying to clean up.
  // Fixed by moving the uninstall check ahead of resolveMcpLaunchSpec
  // entirely, so it takes a harmless placeholder spec instead of ever
  // calling into discovery.
  it('--uninstall is not blocked by ambiguous discovery', async () => {
    const result = await runCli(['mcp', 'install', 'claude', '--uninstall', '--print', '--json'], {
      [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const parsed = JSON.parse(result.stdout) as { ok: boolean; agent: string; kind: string; command: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.agent).toBe('claude');
    expect(parsed.kind).toBe('cli');
    // plan.removeArgv for claude, not the ambiguity-refusal message and not
    // any add-side command derived from the placeholder spec.
    expect(parsed.command).toContain('mcp remove');
  });
});

// Blocking finding from the round-9 review (commit d9043a7): the
// self-reinvocation fallback in resolveMcpLaunchSpec (cli.ts) built its
// spec with an empty `env` map. In a packaged Electron build,
// process.execPath there is Electron, not a bundled Node binary --
// ELECTRON_RUN_AS_NODE=1 must be set on the SPAWNED process too, or
// Electron launches the GUI app instead of running daemon-cli.mjs as
// plain Node when the agent later runs this persisted command.
// OD_DATA_DIR must also carry over, or the spawned `od mcp` falls back to
// `<cwd>/.od/...`, which is the read-only macOS app bundle for packaged
// installs and trips EPERM (issue #848). The normal, non-fallback
// /api/mcp/install-info path already preserves both (see
// apps/daemon/src/mcp-install-info.ts); this exercises the path where no
// live daemon is reachable at all, so the fallback spec is what actually
// gets persisted.
//
// Not gated to POSIX: the isolated, empty IPC base directory below means
// conventionalIpcSocketPaths() finds nothing on any platform (on win32 it
// already returns no candidates unconditionally), so this always exercises
// the "no live daemon" fallback regardless of host OS.
describe('od mcp install <agent> self-reinvocation fallback env (#6425)', () => {
  it('propagates ELECTRON_RUN_AS_NODE and OD_DATA_DIR from the current process into the persisted spec', async () => {
    const isolatedIpcBase = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-fb-ipc-'));
    const unreachableBinDir = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-fb-bin-'));
    const fakeDataDir = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-fb-data-'));
    try {
      const result = await runCli(['mcp', 'install', 'claude', '--print', '--json'], {
        // No pnpm on PATH -> tools-dev discovery fails too, so every
        // discovery mechanism comes up empty and resolveMcpLaunchSpec must
        // take the self-reinvocation fallback branch.
        PATH: unreachableBinDir,
        [SIDECAR_ENV.IPC_BASE]: isolatedIpcBase,
        ELECTRON_RUN_AS_NODE: '1',
        OD_DATA_DIR: fakeDataDir,
      });

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      const parsed = JSON.parse(result.stdout) as {
        ok: boolean;
        kind: string;
        launchSpec: { command: string; args: string[]; env: Record<string, string> };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.kind).toBe('cli');
      // Confirms this actually took the fallback branch, not a coincidental
      // live-daemon hit.
      expect(parsed.launchSpec.args.some((arg) => arg.includes('cli.ts'))).toBe(true);
      expect(parsed.launchSpec.env).toMatchObject({
        ELECTRON_RUN_AS_NODE: '1',
        OD_DATA_DIR: fakeDataDir,
      });
    } finally {
      fs.rmSync(isolatedIpcBase, { recursive: true, force: true });
      fs.rmSync(unreachableBinDir, { recursive: true, force: true });
      fs.rmSync(fakeDataDir, { recursive: true, force: true });
    }
  });

  it('omits ELECTRON_RUN_AS_NODE and OD_DATA_DIR from the persisted spec when neither is set (source-checkout Node case)', async () => {
    const isolatedIpcBase = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-fb-ipc-'));
    const unreachableBinDir = fs.mkdtempSync(pathResolve(os.tmpdir(), 'od-mcp-fb-bin-'));
    try {
      const result = await runCli(['mcp', 'install', 'claude', '--print', '--json'], {
        PATH: unreachableBinDir,
        [SIDECAR_ENV.IPC_BASE]: isolatedIpcBase,
      });

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      const parsed = JSON.parse(result.stdout) as {
        ok: boolean;
        launchSpec: { env: Record<string, string> };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.launchSpec.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
      expect(parsed.launchSpec.env).not.toHaveProperty('OD_DATA_DIR');
    } finally {
      fs.rmSync(isolatedIpcBase, { recursive: true, force: true });
      fs.rmSync(unreachableBinDir, { recursive: true, force: true });
    }
  });
});
