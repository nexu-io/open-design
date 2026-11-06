import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('od brand CLI', () => {
  it('continues deterministic extraction through the daemon route', async () => {
    const seenRequests: Array<{ method: string; url: string; body: string }> = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        seenRequests.push({ method: req.method ?? '', url: req.url ?? '', body });
        if (req.method === 'POST' && req.url === '/api/brands/acme/continue-extraction') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            id: 'acme',
            projectId: 'brand-acme',
            conversationId: 'conv-acme',
            sourceUrl: 'https://example.com',
            status: 'extracting',
          }));
          return;
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'brand',
          'continue',
          'acme',
          '--daemon-url',
          `http://127.0.0.1:${address.port}`,
          '--json',
        ],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );

      expect(seenRequests).toEqual([
        { method: 'POST', url: '/api/brands/acme/continue-extraction', body: '' },
      ]);
      expect(JSON.parse(stdout)).toMatchObject({
        ok: true,
        id: 'acme',
        projectId: 'brand-acme',
        conversationId: 'conv-acme',
        status: 'extracting',
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
