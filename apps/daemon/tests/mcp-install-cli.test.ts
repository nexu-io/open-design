import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

async function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  delete env.NODE_OPTIONS;
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
    const server = createServer((_req, res) => {
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


describe('od mcp install octop', () => {
  it('rejects an unresolved canonical launch config before invoking Octop', async () => {
    const server = createServer((_req, res) => { res.writeHead(503); res.end(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing address');
      const result = await runCli(['mcp', 'install', 'octop', '--json', '--daemon-url', `http://127.0.0.1:${address.port}`]);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, agent: 'octop' });
      expect(JSON.parse(result.stdout).message).toContain('Start OpenDesign');
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it.skipIf(process.platform === 'win32')('passes launch credentials through stdin and emits one JSON result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'od-octop-install-'));
    const capture = join(dir, 'capture.json');
    const spec = { command: process.execPath, args: ['daemon-cli.mjs', 'mcp'], env: { TOKEN: 'test-secret' } };
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(spec));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await writeFile(join(dir, 'octop'), `#!${process.execPath}
let data = '';
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', async () => {
  const fs = await import('node:fs/promises');
  await fs.writeFile(process.env.CAPTURE, JSON.stringify({ argv: process.argv.slice(2), input: data }));
  console.log(JSON.stringify({ ok: !process.env.FAIL_INSTALL, instance_id: 'fixture', action: 'created', message: process.env.FAIL_INSTALL ? 'user required' : 'installed' }));
  if (process.env.FAIL_INSTALL) process.exitCode = 3;
});
`, { mode: 0o755 });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing address');
      const env = { PATH: `${dir}:${process.env.PATH}`, CAPTURE: capture };
      const args = ['mcp', 'install', 'octop', '--json', '--name', 'design studio', '--daemon-url', `http://127.0.0.1:${address.port}`];
      const preview = await runCli([...args, '--print'], env);
      expect(preview.code).toBe(0);
      await expect(readFile(capture, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      const installed = await runCli(args, env);
      expect(installed.code).toBe(0);
      expect(JSON.parse(installed.stdout)).toMatchObject({ ok: true, agent: 'octop', connector: { instance_id: 'fixture' } });
      const recorded = JSON.parse(await readFile(capture, 'utf8'));
      expect(JSON.parse(recorded.input)).toEqual(spec);
      expect(recorded.argv).toContain('design studio');
      expect(recorded.argv.join(' ')).not.toContain('test-secret');
      expect(installed.stdout).not.toContain('test-secret');
      const denied = await runCli(args, { ...env, FAIL_INSTALL: '1' });
      expect(denied.code).toBe(3);
      expect(JSON.parse(denied.stdout)).toMatchObject({ ok: false, message: 'user required' });
      expect(denied.stdout).not.toContain('test-secret');
      const removed = await runCli(['mcp', 'install', 'octop', '--uninstall', '--json'], env);
      expect(removed.code).toBe(0);
      const removal = JSON.parse(await readFile(capture, 'utf8'));
      expect(removal.argv).toContain('remove');
      expect(removal.input).toBe('');
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
