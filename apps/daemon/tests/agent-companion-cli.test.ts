import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const daemonRoot = pathResolve(currentDir, '..');
const repoRoot = pathResolve(currentDir, '../../..');
const cliSource = pathResolve(currentDir, '../src/cli.ts');
const tsxCli = pathResolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');

async function runCli(args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [tsxCli, cliSource, ...args], {
      cwd: daemonRoot,
      env,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; code?: number | null };
    return {
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
      code: failed.code ?? 1,
    };
  }
}

describe('od agent setup', () => {
  it('installs the companion for a selected local profile and preserves JSON output', async () => {
    let requestedUrl = '';
    const server = createServer((req, res) => {
      requestedUrl = req.url ?? '';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ action: 'installed', packageVersion: '1.2.3' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing test server address');
      const result = await runCli([
        'agent',
        'setup',
        'local dsh',
        '--json',
        '--daemon-url',
        `http://127.0.0.1:${address.port}`,
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({ action: 'installed', packageVersion: '1.2.3' });
      expect(requestedUrl).toBe('/api/agents/local%20dsh/companion/install');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
