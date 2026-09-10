// `od orcarouter …` dispatch and request shapes.
//
// The repo's capability-exposure rule requires every user-facing capability to
// be reachable from the CLI through the SAME daemon routes the web UI calls.
// The connect flow is the case that needs it most: an external agent driving
// OpenDesign has no browser, so the PKCE login and the key adoption have to be
// completable from `od`.
//
// Each test stands up a fake daemon that records exactly what it was asked, so
// a drift between the CLI's request and the route contract fails here rather
// than at the daemon.

import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

interface SeenRequest {
  method: string;
  url: string;
  body: string;
}

async function startFakeDaemon(
  respond: (req: SeenRequest) => { status: number; json: unknown },
): Promise<{
  baseUrl: string;
  seen: SeenRequest[];
  close: () => Promise<void>;
}> {
  const seen: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const request: SeenRequest = { method: req.method ?? '', url: req.url ?? '', body };
      seen.push(request);
      const result = respond(request);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    seen,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

const servers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (servers.length) await servers.pop()!();
});

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(
    process.execPath,
    ['--import', 'tsx', cliEntry, 'orcarouter', ...args],
    { cwd: daemonRoot, env: { ...process.env } },
  );
}

describe('od orcarouter CLI', () => {
  it('starts a login through the same route the UI calls', async () => {
    const daemon = await startFakeDaemon(() => ({
      status: 200,
      json: {
        authorizeUrl: 'https://www.orcarouter.ai/auth?state=abc',
        state: 'abc',
        callback: { host: '127.0.0.1', port: 43111 },
      },
    }));
    servers.push(daemon.close);

    const { stdout } = await runCli(['connect', '--daemon-url', daemon.baseUrl, '--json']);

    expect(daemon.seen).toEqual([
      { method: 'POST', url: '/api/orcarouter/oauth/start', body: '{}' },
    ]);
    expect(JSON.parse(stdout)).toMatchObject({ state: 'abc' });
  });

  it('submits the pasted code with the state it was paired with', async () => {
    const daemon = await startFakeDaemon(() => ({ status: 200, json: { ok: true } }));
    servers.push(daemon.close);

    await runCli([
      'complete',
      '--state', 'the-state',
      '--code', 'the-code',
      '--daemon-url', daemon.baseUrl,
      '--json',
    ]);

    const complete = daemon.seen.find((r) => r.url === '/api/orcarouter/oauth/complete');
    expect(complete?.method).toBe('POST');
    expect(JSON.parse(complete!.body)).toEqual({ state: 'the-state', code: 'the-code' });
  });

  it('reads a secret from stdin instead of argv when asked', async () => {
    // A key on the command line is visible in the process table and in shell
    // history; `--api-key-file -` is the safe path an agent should use.
    const daemon = await startFakeDaemon(() => ({ status: 200, json: { ok: true, generation: 1 } }));
    servers.push(daemon.close);

    const child = execFile(
      process.execPath,
      [
        '--import', 'tsx', cliEntry, 'orcarouter', 'set-key',
        '--api-key-file', '-',
        '--daemon-url', daemon.baseUrl,
        '--json',
      ],
      { cwd: daemonRoot, env: { ...process.env } },
    );
    child.stdin!.end('sk-orca-piped-not-in-argv\n');
    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      child.on('error', reject);
    });

    const stored = daemon.seen.find((r) => r.url === '/api/orcarouter/credentials');
    expect(stored?.method).toBe('POST');
    expect(JSON.parse(stored!.body)).toEqual({ apiKey: 'sk-orca-piped-not-in-argv' });
  });

  it('drives disconnect and cancel without a stored-credential side effect', async () => {
    const daemon = await startFakeDaemon(() => ({ status: 200, json: { ok: true } }));
    servers.push(daemon.close);

    await runCli(['cancel', '--daemon-url', daemon.baseUrl, '--json']);
    await runCli(['disconnect', '--daemon-url', daemon.baseUrl, '--json']);

    expect(daemon.seen.map((r) => r.url)).toEqual([
      '/api/orcarouter/oauth/cancel',
      '/api/orcarouter/oauth/disconnect',
    ]);
  });

  it('reports connection state from the auth status route', async () => {
    const daemon = await startFakeDaemon(() => ({
      status: 200,
      json: {
        connected: true,
        source: 'oauth-orcarouter-pkce',
        authState: 'active',
        accountId: 'acct-1',
        generation: 2,
      },
    }));
    servers.push(daemon.close);

    const { stdout } = await runCli(['status', '--daemon-url', daemon.baseUrl, '--json']);

    expect(daemon.seen).toEqual([
      { method: 'GET', url: '/api/orcarouter/auth/status', body: '' },
    ]);
    expect(JSON.parse(stdout)).toMatchObject({ connected: true, generation: 2 });
  });

  it('fetches the catalogue for a named capability', async () => {
    const daemon = await startFakeDaemon(() => ({
      status: 200,
      json: { ok: true, capability: 'image', models: [{ id: 'gpt-image-2', label: 'gpt-image-2' }] },
    }));
    servers.push(daemon.close);

    const { stdout } = await runCli([
      'models',
      '--capability', 'image',
      '--daemon-url', daemon.baseUrl,
      '--json',
    ]);

    const catalog = daemon.seen.find((r) => r.url === '/api/orcarouter/models');
    expect(JSON.parse(catalog!.body)).toEqual({ capability: 'image' });
    expect(JSON.parse(stdout).models[0].id).toBe('gpt-image-2');
  });

  it('refuses an unknown subcommand instead of silently doing nothing', async () => {
    await expect(runCli(['not-a-subcommand'])).rejects.toThrow(/unknown subcommand/i);
  });
});
