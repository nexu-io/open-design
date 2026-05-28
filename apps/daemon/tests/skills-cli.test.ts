import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

async function withSkillsServer<T>(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('test server did not bind to a TCP port');
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('od skills CLI', () => {
  it('prints the skills tree for the plain command', async () => {
    await withSkillsServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          skills: [
            {
              id: 'dashboard',
              name: 'Dashboard',
              mode: 'prototype',
              scenario: 'operation',
              platform: 'desktop',
              previewType: 'html',
              designSystemRequired: true,
            },
          ],
        }));
      },
      async (baseUrl) => {
        const result = await execFileAsync(
          process.execPath,
          [
            '--import',
            'tsx',
            cliEntry,
            'skills',
            'tree',
            '--daemon-url',
            baseUrl,
          ],
          {
            cwd: daemonRoot,
            env: process.env,
          },
        );

        expect(result.stdout).toContain('Skills tree (1)');
        expect(result.stdout).toContain('Prototype (1)');
        expect(result.stdout).toContain('Operation (1)');
        expect(result.stdout).toContain('- dashboard [desktop · html · design system]');
        expect(result.stderr).toBe('');
      },
    );
  });

  it('prints skills tree help without contacting the daemon', async () => {
    const result = await execFileAsync(
      process.execPath,
      [
        '--import',
        'tsx',
        cliEntry,
        'skills',
        'tree',
        '--help',
        '--daemon-url',
        'http://127.0.0.1:1',
      ],
      {
        cwd: daemonRoot,
        env: process.env,
      },
    );

    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('od skills tree [--json]');
    expect(result.stderr).toBe('');
  });

  it('rejects malformed skills tree responses', async () => {
    await withSkillsServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      },
      async (baseUrl) => {
        try {
          await execFileAsync(
            process.execPath,
            [
              '--import',
              'tsx',
              cliEntry,
              'skills',
              'tree',
              '--json',
              '--daemon-url',
              baseUrl,
            ],
            {
              cwd: daemonRoot,
              env: process.env,
            },
          );
          throw new Error('skills tree command unexpectedly succeeded');
        } catch (error: unknown) {
          const failed = error as { code?: number; stderr?: string; stdout?: string };
          expect(failed.code).toBe(74);
          expect(failed.stdout ?? '').toBe('');
          const envelope = JSON.parse(failed.stderr ?? '{}') as {
            error?: { code?: string; message?: string; data?: { endpoint?: string } };
          };
          expect(envelope.error?.code).toBe('daemon-protocol-error');
          expect(envelope.error?.message).toContain('Malformed /api/skills response');
          expect(envelope.error?.data?.endpoint).toBe('/api/skills');
        }
      },
    );
  });
});
