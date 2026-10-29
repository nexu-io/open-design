import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const args = ['--import', 'tsx', cliEntry, 'tools', 'design-systems', 'read', '--path', 'preview/colors.html'];

describe('od tools in a DeepSeek Harness shell', () => {
  it.each([
    { direct: undefined, expected: 'fixture-harness-token' },
    { direct: 'fixture-direct-token', expected: 'fixture-direct-token' },
  ])('authenticates the wrapper with $expected', async ({ direct, expected }) => {
    const requests: Array<{ url: string | undefined; authorization: string | undefined }> = [];
    const server = createServer((req, res) => {
      requests.push({ url: req.url, authorization: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: '<p>Design system preview</p>' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, args, {
        cwd: daemonRoot,
        env: {
          ...process.env,
          OD_DAEMON_URL: `http://127.0.0.1:${address.port}`,
          OD_TOOL_TOKEN: direct,
          DSH_SHELL: '1',
          DSH_OD_TOOL_TOKEN: 'fixture-harness-token',
        },
      });
      expect(requests).toEqual([{ url: '/api/tools/design-systems/read', authorization: `Bearer ${expected}` }]);
      expect(JSON.parse(stdout)).toEqual({ ok: true, content: '<p>Design system preview</p>' });
      expect(stdout + stderr).not.toContain(expected);
      expect(stdout + stderr).not.toContain('fixture-harness-token');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each([
    { shell: undefined, token: 'fixture-harness-token' },
    { shell: '1', token: undefined },
    { shell: '1', token: '' },
  ])('still rejects missing credentials or an unmanaged alias: %j', async ({ shell, token }) => {
    await expect(execFileAsync(process.execPath, args, {
      cwd: daemonRoot,
      env: {
        ...process.env,
        OD_DAEMON_URL: 'http://127.0.0.1:1',
        OD_TOOL_TOKEN: undefined,
        DSH_SHELL: shell,
        DSH_OD_TOOL_TOKEN: token,
      },
    })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('OD_TOOL_TOKEN is required') });
  });
});
