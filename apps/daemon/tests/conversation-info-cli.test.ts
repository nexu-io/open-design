// Regression for `od conversation info` always 404ing (#6116):
// `case 'info'` used to fetch the unscoped route
// `/api/conversations/<id>`, but the daemon only serves
// project-scoped routes (`/api/projects/:id/conversations/…`). The
// 404 then mapped to `daemon-not-running`, sending users on a wild
// goose chase checking daemon sockets.
//
// Fix:
//   1. `od conversation info --project <id> <conversationId>` hits
//      the project-scoped route.
//   2. 404 now exits with `not-found`, not `daemon-not-running`.

import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('od conversation info CLI', () => {
  it('hits the project-scoped conversation route and prints the conversation', async () => {
    const seenRequests: Array<{ method: string; url: string }> = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        seenRequests.push({ method: req.method ?? '', url: req.url ?? '' });
        if (req.method === 'GET' && req.url === '/api/projects/proj-1/conversations/conv-9') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            conversation: { id: 'conv-9', projectId: 'proj-1', title: 'Demo' },
            messages: [],
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
    const port = address.port;

    try {
      let stdout = '';
      try {
        const r = await execFileAsync(
          process.execPath,
          [
            '--import',
            'tsx',
            cliEntry,
            'conversation',
            'info',
            '--project', 'proj-1',
            'conv-9',
            '--daemon-url', `http://127.0.0.1:${port}`,
            '--json',
          ],
        );
        stdout = r.stdout;
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        stdout = e.stdout ?? '';
      }
      const parsed = JSON.parse(stdout);
      expect(parsed.conversation.id).toBe('conv-9');
      // Confirm we hit the project-scoped route, not the broken unscoped one.
      expect(seenRequests).toContainEqual({ method: 'GET', url: '/api/projects/proj-1/conversations/conv-9' });
      expect(seenRequests.some((r) => r.url === '/api/conversations/conv-9')).toBe(false);
    } finally {
      server.close();
    }
  });

  it('exits with `not-found` (not daemon-not-running) when the conversation is missing', async () => {
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');
    const port = address.port;

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import', 'tsx', cliEntry,
          'conversation', 'info',
          '--project', 'proj-1',
          'conv-missing',
          '--daemon-url', `http://127.0.0.1:${port}`,
          '--json',
        ],
      ).catch((err: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => err);

      // 404 should produce a non-zero exit, AND the structured error
      // payload should use `not-found` rather than the misleading
      // `daemon-not-running` code.
      expect(result.code).toBeTruthy();
      const stderr = (result as { stderr?: string }).stderr ?? '';
      expect(stderr).toContain('"code":');
      expect(stderr).toContain('"not-found"');
      expect(stderr).not.toContain('daemon-not-running');
    } finally {
      server.close();
    }
  });

  it('prints usage and exits non-zero when --project is missing', async () => {
    const result = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', cliEntry, 'conversation', 'info', 'conv-9', '--json'],
    ).catch((err: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => err);
    expect(result.code).toBeTruthy();
    const stderr = (result as { stderr?: string }).stderr ?? '';
    expect(stderr).toContain('Usage: od conversation info --project <projectId> <conversationId>');
  });

  it('embedded help block advertises the new --project flag for `info`', async () => {
    // Per #6341 review: the help block (printed by `od conversation help`
    // or any time the subcommand is invoked with --help/-h or no args)
    // must stay in sync with the actual invocation. Before the fix the
    // help block said `od conversation info <conversationId>` while the
    // real invocation required `--project <projectId> <conversationId>`.
    const r = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', cliEntry, 'conversation', 'help', '--json'],
    );
    expect(r.exitCode ?? 0).toBe(0);
    expect(r.stdout).toContain('od conversation info --project <projectId>');
    expect(r.stdout).not.toContain('od conversation info <conversationId>');
  });

  it('published docs/plugins-spec.md and zh-CN keep `conversation info` in sync with the embedded help block', async () => {
    // Per #6341 round-2 review (lefarcen, 2026-08-02): the published
    // command reference under `docs/plugins-spec.md` and
    // `docs/plugins-spec.zh-CN.md` had drifted to advertise the old
    // `od conversation info <conversationId>` form while the CLI required
    // `--project <projectId> <conversationId>`. This guard reads both
    // markdown files and the embedded help block emitted by the CLI and
    // asserts that the `conversation info` line stays aligned across all
    // three surfaces. If you legitimately change the invocation, update
    // every site in the same change.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');
    const enDoc = fs.readFileSync(path.join(repoRoot, 'docs/plugins-spec.md'), 'utf8');
    const zhDoc = fs.readFileSync(path.join(repoRoot, 'docs/plugins-spec.zh-CN.md'), 'utf8');

    // The new required shape must appear in both docs; the legacy bare
    // `<conversationId>` invocation must not.
    expect(enDoc).toContain('od conversation info --project <projectId> <conversationId>');
    expect(enDoc).not.toMatch(/od conversation info <conversationId>/);
    expect(zhDoc).toContain('od conversation info --project <projectId> <conversationId>');
    expect(zhDoc).not.toMatch(/od conversation info <conversationId>/);

    // Reuse the help emitter to anchor the docs against the same source
    // of truth the help block test above uses.
    const r = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', cliEntry, 'conversation', 'help', '--json'],
    );
    const helpBlock = r.stdout;
    expect(helpBlock).toContain('od conversation info --project <projectId>');
    // The docs surface the full required form, the help block emits a
    // shorter hint; both must agree on the `--project` prefix and must
    // never resurrect the bare `<conversationId>` invocation.
    expect(helpBlock).not.toContain('od conversation info <conversationId>');
  });
});
