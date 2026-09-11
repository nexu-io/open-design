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

import { execFile, type ChildProcess } from 'node:child_process';
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

/** A route answer, or `hold` to park the response until the test releases it. */
type FakeAnswer = { status: number; json: unknown } | 'hold';

async function startFakeDaemon(
  respond: (req: SeenRequest) => FakeAnswer,
): Promise<{
  baseUrl: string;
  seen: SeenRequest[];
  /** Answer every parked request at once — used to keep a watch loop waiting. */
  release: (json: unknown, status?: number) => void;
  close: () => Promise<void>;
}> {
  const seen: SeenRequest[] = [];
  const parked: http.ServerResponse[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const request: SeenRequest = { method: req.method ?? '', url: req.url ?? '', body };
      seen.push(request);
      const result = respond(request);
      // A held response leaves the request open on purpose: the CLI is meant to
      // be waiting on it, and the test asserts on what it emitted meanwhile.
      if (result === 'hold') {
        parked.push(res);
        return;
      }
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
    release: (json: unknown, status = 200) => {
      while (parked.length) {
        const held = parked.shift()!;
        held.writeHead(status, { 'content-type': 'application/json' });
        held.end(JSON.stringify(json));
      }
    },
    close: () => new Promise<void>((resolve, reject) => {
      // Parked responses keep their sockets open; closing the listener alone
      // would wait on them forever.
      server.closeAllConnections();
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

/**
 * The first stdout line a still-running child emits.
 *
 * Used against a command that is expected to keep waiting: resolving on the
 * first newline is what proves the output arrived before the wait, which a
 * buffer-the-whole-process run cannot show.
 */
function firstStdoutLine(child: ChildProcess, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(
      () => reject(new Error('no stdout was emitted before the command started waiting')),
      timeoutMs,
    );
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf('\n');
      if (newline !== -1) settle(() => resolve(buffer.slice(0, newline)));
    });
    child.on('error', (err) => settle(() => reject(err)));
    child.on('close', () => settle(() => reject(new Error('the command exited without emitting one line'))));
  });
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

  it('emits the authorization details before a JSON watch starts waiting', async () => {
    // `connect --json --watch` has to hand the caller the URL it needs to
    // authorize BEFORE it starts waiting, otherwise the command sits silent for
    // the whole login window and a first-time caller can never complete the
    // flow it was just told about. The status route is parked so the assertion
    // is about what was emitted while the command is still waiting.
    let statusCalls = 0;
    const daemon = await startFakeDaemon((req) => {
      if (req.url === '/api/orcarouter/oauth/start') {
        return {
          status: 200,
          json: {
            authorizeUrl: 'https://www.orcarouter.ai/auth?state=abc',
            state: 'abc',
            callback: { host: '127.0.0.1', port: 43111 },
          },
        };
      }
      if (req.url === '/api/orcarouter/auth/status') {
        statusCalls += 1;
        // The baseline read, before Start: nothing connected yet.
        if (statusCalls === 1) return { status: 200, json: { connected: false, generation: null } };
        return 'hold';
      }
      return { status: 404, json: { error: 'not found' } };
    });
    servers.push(daemon.close);

    const child = execFile(
      process.execPath,
      ['--import', 'tsx', cliEntry, 'orcarouter', 'connect', '--json', '--watch',
        '--daemon-url', daemon.baseUrl],
      { cwd: daemonRoot, env: { ...process.env } },
    );
    try {
      const started = JSON.parse(await firstStdoutLine(child));
      expect(started).toMatchObject({
        event: 'started',
        state: 'abc',
        authorizeUrl: 'https://www.orcarouter.ai/auth?state=abc',
      });
      // Still waiting on the parked poll — the details arrived first, not after.
      expect(child.exitCode).toBeNull();
    } finally {
      daemon.release({ connected: true, generation: 1 });
      child.kill();
      await new Promise<void>((resolve) => child.on('close', () => resolve()));
    }
  });

  it('waits for a replacement credential when watching a reconnect', async () => {
    // A reconnect leaves the previous credential usable, so the daemon reports
    // `connected` with an unchanged generation from the first poll. Completing
    // there would tell a script the replacement landed while the authorization
    // is still pending and the old key is what would actually be used.
    let statusCalls = 0;
    const daemon = await startFakeDaemon((req) => {
      if (req.url === '/api/orcarouter/oauth/start') {
        return {
          status: 200,
          json: {
            authorizeUrl: 'https://www.orcarouter.ai/auth?state=re',
            state: 're',
            callback: { host: '127.0.0.1', port: 43112 },
          },
        };
      }
      if (req.url === '/api/orcarouter/auth/status') {
        statusCalls += 1;
        // Call 1 is the baseline; calls 2-4 keep reporting the OLD credential,
        // which is exactly the state the first poll used to mistake for success.
        if (statusCalls >= 5) {
          return { status: 200, json: { connected: true, generation: 3, accountId: 'acct-new' } };
        }
        return { status: 200, json: { connected: true, generation: 2, accountId: 'acct-old' } };
      }
      return { status: 404, json: { error: 'not found' } };
    });
    servers.push(daemon.close);

    const { stdout } = await runCli(['connect', '--json', '--watch', '--daemon-url', daemon.baseUrl]);

    const events = stdout.trim().split('\n').map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ event: 'started', state: 're' });
    const done = events[events.length - 1];
    expect(done).toMatchObject({ event: 'connected', generation: 3 });
    expect(done.status.accountId).toBe('acct-new');
    // The baseline read precedes Start, and the old generation was polled more
    // than once before the replacement was accepted.
    expect(daemon.seen[0]?.url).toBe('/api/orcarouter/auth/status');
    expect(daemon.seen[1]?.url).toBe('/api/orcarouter/oauth/start');
    expect(daemon.seen.filter((r) => r.url === '/api/orcarouter/auth/status').length)
      .toBeGreaterThanOrEqual(5);
  });
});
