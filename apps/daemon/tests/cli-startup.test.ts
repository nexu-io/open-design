import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('CLI startup boundaries', () => {
  it.each([
    ['doctor', ['doctor', '--help']],
    ['config', ['config', 'get', 'apiProtocol', '--daemon-url', 'http://127.0.0.1:9']],
    ['diagnostics', ['diagnostics', 'export', '--daemon-url', 'http://127.0.0.1:9']],
    ['amr', ['amr', 'status', '--daemon-url', 'http://127.0.0.1:9']],
  ])('initializes flag constants before dispatching od %s', async (_name, args) => {
    let output = '';
    try {
      const result = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', cliEntry, ...args],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );
      output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    } catch (error: unknown) {
      const failed = error as { stdout?: string; stderr?: string };
      output = `${failed.stdout ?? ''}${failed.stderr ?? ''}`;
    }

    expect(output).not.toContain('ReferenceError');
    expect(output).not.toContain('before initialization');
    expect(output).not.toContain('CONFIG_STRING_FLAGS');
    expect(output).not.toContain('DIAGNOSTICS_STRING_FLAGS');
    expect(output).not.toContain('AMR_STRING_FLAGS');
  });

  it('keeps od daemon start alive until SIGTERM and reports the actual listening port', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-daemon-start-'));
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        cliEntry,
        'daemon',
        'start',
        '--headless',
        '--port',
        '0',
      ],
      {
        cwd: daemonRoot,
        env: {
          ...process.env,
          OD_BIND_HOST: '127.0.0.1',
          OD_DATA_DIR: dataDir,
        },
      },
    );

    try {
      const line = await waitForStdoutLine(child, /\[od\] listening on (http:\/\/[^\s]+) \(headless\)/u);
      const match = line.match(/(http:\/\/[^\s]+)/u);
      const daemonUrl = match?.[1];
      expect(daemonUrl).toBeTruthy();
      const parsed = new URL(daemonUrl!);
      expect(Number(parsed.port)).toBeGreaterThan(0);

      const healthResp = await fetch(`${daemonUrl}/api/health`);
      expect(healthResp.status).toBe(200);

      const statusResp = await fetch(`${daemonUrl}/api/daemon/status`);
      expect(statusResp.status).toBe(200);
      const status = await statusResp.json() as { bindHost: string; port: number };
      expect(status.bindHost).toBe('127.0.0.1');
      expect(status.port).toBe(Number(parsed.port));
      expect(child.exitCode).toBeNull();
    } finally {
      await terminateChild(child);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not import daemon startup code for media client commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-media-'));
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    await chmod(dataDir, 0o500);

    try {
      await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'media',
          'generate',
          '--project',
          'repro',
          '--surface',
          'image',
          '--model',
          'gpt-image-2',
          '--prompt',
          'test',
          '--daemon-url',
          'http://127.0.0.1:59999',
        ],
        {
          cwd: daemonRoot,
          env: {
            ...process.env,
            OD_DATA_DIR: dataDir,
          },
        },
      );
      throw new Error('media command unexpectedly succeeded');
    } catch (error: unknown) {
      const failed = error as { code?: number; stderr?: string };
      const stderr = failed.stderr ?? '';
      expect(failed.code).toBe(3);
      expect(stderr).toContain('failed to reach daemon');
      expect(stderr).not.toContain('OD_DATA_DIR');
    } finally {
      await chmod(dataDir, 0o700).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the token-gated media endpoint without falling back when policy denies generation', async () => {
    const seen: Array<{ url: string | undefined; authorization: string | undefined }> = [];
    const server = http.createServer((req, res) => {
      seen.push({
        url: req.url,
        authorization: req.headers.authorization,
      });
      req.resume();
      if (req.url === '/api/tools/media/generate') {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            code: 'MEDIA_EXECUTION_DISABLED',
            message: 'media generation is disabled for this run',
          },
        }));
        return;
      }
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unexpected fallback' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const daemonUrl = `http://127.0.0.1:${port}`;

    try {
      await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'media',
          'generate',
          '--project',
          'project-1',
          '--surface',
          'image',
          '--model',
          'gpt-image-2',
          '--prompt',
          'test',
          '--daemon-url',
          daemonUrl,
        ],
        {
          cwd: daemonRoot,
          env: {
            ...process.env,
            OD_TOOL_TOKEN: 'run-token',
          },
        },
      );
      throw new Error('media command unexpectedly succeeded');
    } catch (error: unknown) {
      const failed = error as { code?: number; stderr?: string };
      expect(failed.code).toBe(4);
      expect(failed.stderr ?? '').toContain('MEDIA_EXECUTION_DISABLED');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(seen).toEqual([
      {
        url: '/api/tools/media/generate',
        authorization: 'Bearer run-token',
      },
    ]);
  });

  it('prints AMR wallet status JSON through the daemon wallet endpoint', async () => {
    const seen: Array<{ method: string | undefined; url: string | undefined }> = [];
    const server = http.createServer((req, res) => {
      seen.push({ method: req.method, url: req.url });
      req.resume();
      if (req.method === 'GET' && req.url === '/api/integrations/vela/wallet?refresh=1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          status: 'available',
          profile: 'local',
          user: { email: 'amr@example.com' },
          balanceUsd: '0.1000',
          updatedAt: '2026-06-23T06:05:18.782Z',
          fetchedAt: '2026-06-23T06:05:19.000Z',
          stale: false,
          source: 'vela_api',
        }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unexpected' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const daemonUrl = `http://127.0.0.1:${port}`;

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'amr',
          'status',
          '--daemon-url',
          daemonUrl,
          '--refresh',
          '--json',
        ],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'available',
        user: { email: 'amr@example.com' },
        balanceUsd: '0.1000',
        source: 'vela_api',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(seen).toEqual([
      { method: 'GET', url: '/api/integrations/vela/wallet?refresh=1' },
    ]);
  });
});

function waitForStdoutLine(
  child: ChildProcessWithoutNullStreams,
  pattern: RegExp,
  timeoutMs = 15_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for stdout ${pattern}; output:\n${output}`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const line = output.split(/\r?\n/u).find((candidate) => pattern.test(candidate));
      if (line) {
        cleanup();
        resolve(line);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`child exited before stdout matched ${pattern}: code=${code} signal=${signal}; output:\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  child.kill('SIGTERM');
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    timer.unref?.();
  });
  await Promise.race([exited, timeout]);
}
