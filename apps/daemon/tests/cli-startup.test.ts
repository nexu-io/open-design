import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('CLI startup boundaries', () => {
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
});
