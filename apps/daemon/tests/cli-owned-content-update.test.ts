import { execFile } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('od collab shares the scoped check, acceptance, dismissal and preference API', async () => {
  const received: Array<{ url: string; workspace: string | undefined; body: unknown }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      received.push({ url: req.url!, workspace: req.headers['x-od-workspace-id'] as string | undefined, body: JSON.parse(raw) });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ update: { state: 'up_to_date', latestVersion: 7, localVersion: 7, promptSuppressedUntil: null, updatedAt: 1 } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const tsx = fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url));
  try {
    for (const args of [['check'], ['accept', '--version', '7'], ['dismiss', '--version', '7', '--dont-prompt-24h'], ['ask-again']]) {
      const { stdout } = await promisify(execFile)(process.execPath, [tsx, cli, 'collab', args[0]!, 'p1', ...args.slice(1), '--daemon-url', `http://127.0.0.1:${address.port}`, '--workspace', 'w1', '--workspace-member', 'owner', '--json'], { timeout: 15_000 });
      expect(JSON.parse(stdout).update.localVersion).toBe(7);
    }
    expect(received).toEqual([
      { url: '/api/projects/p1/collab/update', workspace: 'w1', body: { action: 'check', manual: true } },
      { url: '/api/projects/p1/collab/update', workspace: 'w1', body: { action: 'accept', version: 7, dontPromptFor24h: false } },
      { url: '/api/projects/p1/collab/update', workspace: 'w1', body: { action: 'dismiss', version: 7, dontPromptFor24h: true } },
      { url: '/api/projects/p1/collab/update', workspace: 'w1', body: { action: 'reset-preference' } },
    ]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 60_000);
