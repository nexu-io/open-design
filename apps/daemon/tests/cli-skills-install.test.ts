import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
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
  body: string;
  headers: http.IncomingHttpHeaders;
}

describe('od skill install CLI', () => {
  const requests: CapturedRequest[] = [];
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({
          method: req.method ?? '',
          url: req.url ?? '',
          body,
          headers: req.headers,
        });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          skill: {
            id: 'remote-skill',
            name: 'remote-skill',
            source: 'user',
          },
        }));
      });
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

  it('POSTs the plugin-compatible source and prints the response as JSON', async () => {
    const result = await runCli([
      'skill',
      'install',
      'github:owner/skill-repo',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/skills/install',
      body: JSON.stringify({ source: 'github:owner/skill-repo' }),
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      skill: { id: 'remote-skill' },
    });
  });

  it('passes a browser GitHub repository URL to the shared daemon installer', async () => {
    const result = await runCli([
      'skill',
      'install',
      'https://github.com/leonxlnx/taste-skill',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/skills/install',
      body: JSON.stringify({ source: 'https://github.com/leonxlnx/taste-skill' }),
    });
  });

  it.each([
    ['install', ['install', 'github:owner/skill-repo']],
    ['uninstall', ['uninstall', 'remote-skill']],
  ])('sends the exact workspace pair for skill %s', async (_label, command) => {
    const result = await runCli([
      'skill',
      ...command,
      '--workspace',
      'workspace-a',
      '--workspace-member',
      'member-a',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toMatchObject({
      'x-od-workspace-id': 'workspace-a',
      'x-od-workspace-member-id': 'member-a',
    });
  });

  it.each([
    ['install', ['install', 'github:owner/skill-repo']],
    ['uninstall', ['uninstall', 'remote-skill']],
  ])('rejects an incomplete workspace pair before skill %s', async (_label, command) => {
    const result = await runCli([
      'skill',
      ...command,
      '--workspace',
      'workspace-a',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--workspace-member');
    expect(requests).toHaveLength(0);
  });
});
