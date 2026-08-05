import { execFile } from 'node:child_process';
import http from 'node:http';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const daemonRoot = pathResolve(currentDir, '..');
const repoRoot = pathResolve(currentDir, '../../..');
const cliSource = pathResolve(currentDir, '../src/cli.ts');
const tsxCli = pathResolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
}

describe('od plugin exact workspace transport', () => {
  const requests: CapturedRequest[] = [];
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
      });
      res.statusCode = 200;
      if (req.url === '/api/plugins') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ plugins: [] }));
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        snapshotId: 'snapshot-a',
        pluginId: 'plugin-a',
        capabilitiesGranted: [],
        issues: [],
        freshDigest: '1234567890123456',
        files: [],
        folder: '/tmp/exported-plugin',
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('stub server has no address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    requests.length = 0;
  });

  async function runCli(args: string[]) {
    try {
      const { stdout, stderr } = await execFileP(
        process.execPath,
        [tsxCli, cliSource, ...args],
        {
          cwd: daemonRoot,
          env: { ...process.env, NODE_OPTIONS: undefined },
          timeout: 15_000,
        },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return {
        code: failed.code ?? 1,
        stdout: failed.stdout ?? '',
        stderr: failed.stderr ?? '',
      };
    }
  }

  it.each([
    ['list', ['list', '--json']],
    ['info', ['info', 'plugin-a', '--json']],
    ['apply', ['apply', 'plugin-a', '--json']],
    ['trust', ['trust', 'plugin-a', '--capabilities', 'fs:read', '--json']],
    ['uninstall', ['uninstall', 'plugin-a']],
    ['snapshot show', ['snapshots', 'show', 'snapshot-a', '--json']],
    ['canon', ['canon', 'snapshot-a', '--json']],
    [
      'export',
      ['export', 'project-a', '--as', 'od', '--out', '/tmp/exported-plugin', '--json'],
    ],
  ])('sends exact workspace headers for %s', async (_label, command) => {
    const result = await runCli([
      'plugin',
      ...command,
      '--workspace',
      'workspace-a',
      '--workspace-member',
      'member-a',
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toMatchObject({
      'x-od-workspace-id': 'workspace-a',
      'x-od-workspace-member-id': 'member-a',
    });
  });

  it('rejects an incomplete plugin scope before making a request', async () => {
    const result = await runCli([
      'plugin',
      'list',
      '--workspace',
      'workspace-a',
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--workspace-member');
    expect(requests).toHaveLength(0);
  });

  it('keeps headerless local CLI compatibility when both flags are absent', async () => {
    const result = await runCli([
      'plugin',
      'list',
      '--json',
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers['x-od-workspace-id']).toBeUndefined();
    expect(requests[0]?.headers['x-od-workspace-member-id']).toBeUndefined();
  });
});
