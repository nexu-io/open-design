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
          expect(failed.code).toBe(64);
          expect(failed.stdout ?? '').toBe('');
          const envelope = JSON.parse(failed.stderr ?? '{}') as {
            error?: { code?: string; message?: string; data?: { endpoint?: string } };
          };
          expect(envelope.error?.code).toBe('daemon-not-running');
          expect(envelope.error?.message).toContain('Malformed /api/skills response');
          expect(envelope.error?.data?.endpoint).toBe('/api/skills');
        }
      },
    );
  });
});
