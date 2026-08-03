import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const daemonRoot = resolve(currentDir, '..');
const cliEntry = resolve(daemonRoot, 'src/cli.ts');

async function runCli(args: string[]) {
  try {
    const result = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', cliEntry, ...args],
      {
        cwd: daemonRoot,
        env: { ...process.env },
        timeout: 15_000,
      },
    );
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    const failed = error as {
      code?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      code: failed.code ?? 1,
      stderr: failed.stderr ?? '',
      stdout: failed.stdout ?? '',
    };
  }
}

describe('od mcp HTTP CLI', () => {
  it('documents the explicit opt-in configuration and lifecycle', async () => {
    const result = await runCli(['mcp', '--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('--transport <type>');
    expect(result.stdout).toContain('http://127.0.0.1:7457/mcp');
    expect(result.stdout).toContain('Stop it with Ctrl+C or SIGTERM');
    expect(result.stdout).toContain('An explicit URL stays');
  });

  it.each([
    [
      ['mcp', '--host', '127.0.0.1'],
      '--host requires --transport http',
    ],
    [
      ['mcp', '--transport', 'websocket'],
      '--transport must be either stdio or http',
    ],
    [
      ['mcp', '--transport', 'http', '--host', '0.0.0.0'],
      'refusing non-loopback MCP HTTP bind',
    ],
    [
      ['mcp', '--transport', 'http', '--port', 'not-a-number'],
      '--port must be an integer between 1 and 65535',
    ],
    [
      ['mcp', '--transport', 'http', '--session-idle-timeout', '500ms'],
      '--session-idle-timeout must be at least 1 second',
    ],
  ])('fails safely for invalid configuration: %s', async (args, message) => {
    const result = await runCli(args);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stderr).not.toContain('Node.js v');
  });

  it('reports an occupied port without an unhandled stack trace', async () => {
    const occupied = http.createServer((_req, res) => res.end());
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('missing fixture port');

    try {
      const result = await runCli([
        'mcp',
        '--transport',
        'http',
        '--port',
        String(address.port),
        '--daemon-url',
        'http://127.0.0.1:1',
      ]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Open Design MCP HTTP server failed');
      expect(result.stderr).toContain('EADDRINUSE');
      expect(result.stderr).not.toContain('\n    at ');
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it('prints the endpoint, keeps running, hides credentials, and exits on SIGTERM', async () => {
    const port = await unusedLoopbackPort();
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        cliEntry,
        'mcp',
        '--transport',
        'http',
        '--port',
        String(port),
        '--daemon-url',
        'http://127.0.0.1:1',
      ],
      {
        cwd: daemonRoot,
        env: { ...process.env },
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    try {
      await waitForOutput(
        child,
        new RegExp(`Open Design MCP listening on http://127\\.0\\.0\\.1:${port}/mcp`, 'u'),
      );
      expect(child.exitCode).toBeNull();

      const secret = 'Bearer must-not-appear-in-logs';
      const status = await rawRequest(port, {
        authorization: secret,
        host: 'attacker.example',
      });
      expect(status).toBe(403);
      const malformedStatus = await rawRequest(
        port,
        {
          authorization: secret,
          'content-type': 'application/json',
          host: `127.0.0.1:${port}`,
        },
        `{"credential":"${secret}",`,
      );
      expect(malformedStatus).toBe(400);
      expect(stderr).not.toContain(secret);

      const exit = waitForExit(child);
      child.kill('SIGTERM');
      const outcome = await exit;
      expect(outcome).toEqual({ code: 0, signal: null });
      expect(stderr).not.toContain(secret);
      await expect(fetch(`http://127.0.0.1:${port}/mcp`)).rejects.toThrow();
    } finally {
      await terminateChild(child);
    }
  });
});

async function unusedLoopbackPort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing fixture port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function rawRequest(
  port: number,
  headers: Record<string, string>,
  body?: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers,
        hostname: '127.0.0.1',
        method: body === undefined ? 'GET' : 'POST',
        path: '/mcp',
        port,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.once('error', reject);
    request.end(body);
  });
}

function waitForOutput(
  child: ChildProcessWithoutNullStreams,
  pattern: RegExp,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${pattern}; output:\n${output}`));
    }, 15_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (pattern.test(output)) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`child exited early: code=${code} signal=${signal}; output:\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

function waitForExit(
  child: ChildProcessWithoutNullStreams,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = waitForExit(child);
  child.kill('SIGKILL');
  await exited;
}
