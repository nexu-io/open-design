import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('od run reasoning', () => {
  it.each([{ sub: 'start', stdin: false }, { sub: 'redesign', stdin: false }, { sub: 'start', stdin: true }])('$sub forwards reasoning (stdin=$stdin) through HTTP', async ({ sub, stdin }) => {
    const received: unknown[] = [];
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      received.push({ url: req.url, body: body ? JSON.parse(body) : null });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ runId: 'run-1' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const dir = await mkdtemp(join(tmpdir(), 'od-reasoning-cli-'));
    try {
      const file = join(dir, 'prompt.txt');
      await writeFile(file, 'A long prompt\nwith "quotes" and $literal content.');
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(process.execPath, [
        '--import', 'tsx', fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
        'run', sub, '--project', 'p1', '--agent', 'codex', '--model', 'gpt-6-astra',
        '--reasoning', 'deep-v2', '--prompt-file', stdin ? '-' : file, '--json',
        '--daemon-url', `http://127.0.0.1:${port}`,
        ], (error, stdout) => error ? reject(error) : resolve(stdout));
        if (stdin) child.stdin?.end('A long prompt\nwith "quotes" and $literal content.');
      });
      expect(JSON.parse(stdout)).toMatchObject({ runId: 'run-1' });
      expect(received).toMatchObject([{ url: '/api/runs', body: {
        projectId: 'p1', agentId: 'codex', model: 'gpt-6-astra', reasoning: 'deep-v2',
        message: 'A long prompt\nwith "quotes" and $literal content.',
      } }]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
