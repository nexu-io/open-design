import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishReservedVelaShareVersion, publishVelaShareVersion } from '../src/collab/vela-share-publish.js';
import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';

it.skipIf(!process.env.OD_TEST_VELA_BIN)('keeps one reserved alias through failed publish, SQLite restart, update and partial binding', async () => {
  const binary = process.env.OD_TEST_VELA_BIN!;
  const root = await mkdtemp(path.join(tmpdir(), 'od-reserved-publish-'));
  const cliRoot = path.join(root, 'cli');
  const calls: Array<{ url: string | undefined; method: string | undefined; workspace: string | string[] | undefined; body: Record<string, unknown> }> = [];
  const publishes: Array<Record<string, unknown>> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    calls.push({ url: req.url, method: req.method, workspace: req.headers['x-vela-workspace-id'], body });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/resources/resource/shares') {
      publishes.push(body);
      if (publishes.length === 1) { res.statusCode = 503; res.end('{}'); return; }
      res.end(JSON.stringify({ slug: body.slug, version: publishes.length, publishedAt: 1234 + publishes.length,
        entryPath: body.entryPath, snapshot: { slug: 'immutable-snapshot', versionId: body.versionId } }));
    } else if (req.url === '/api/v1/collab/shares') {
      res.statusCode = publishes.length === 3 ? 403 : 200;
      res.end(JSON.stringify({ projectId: 'project', slug: body.slug, status: 'active' }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  try {
    await mkdir(cliRoot);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing listener');
    const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic-key', user: null, configMtimeMs: null };
    let slug: string | undefined;
    for (const attempt of [1, 2, 3]) {
      const db = new Database(path.join(root, 'state.sqlite'));
      try {
        const pending = publishReservedVelaShareVersion({ scope: { resourceTeamId: 'workspace', ownerMemberId: 'owner', projectId: 'project', filePath: 'pages/local.html' },
          resourceId: 'resource', entryPath: 'index.html', name: 'Design', versionId: `immutable-${attempt}` }, createShareAliasReservations(db),
        args => runPinnedVelaCommand({ args, session, dataRoot: cliRoot, workspaceId: 'workspace', configuredEnv: { VELA_BIN: binary } }));
        if (attempt === 1) await expect(pending).rejects.toThrow('PUBLIC_SHARE_PUBLISH_FAILED');
        else {
          const result = await pending;
          slug ??= result.receipt.slug;
          expect(result.receipt).toEqual({ filePath: 'pages/local.html', slug, version: attempt,
            versionId: `immutable-${attempt}`, publishedAt: 1234 + attempt, entryPath: 'index.html' });
          expect(result.status).toBe(attempt === 2 ? 'published' : 'binding_pending');
          if (result.status === 'binding_pending') expect(result.binding).toEqual({ retrying: false, code: 'FORBIDDEN' });
        }
      } finally { db.close(); }
      expect(await readdir(cliRoot)).toEqual([]);
    }
    expect(calls).toHaveLength(5); expect(publishes).toHaveLength(3);
    expect(publishes.map(body => body.slug)).toEqual([slug, slug, slug]);
    expect(new Set(publishes.map(body => body.sourceKey)).size).toBe(1);
    expect(publishes.map(body => body.versionId)).toEqual(['immutable-1', 'immutable-2', 'immutable-3']);
    let registeredVersion = 2;
    for (const call of calls) {
      expect(call.method).toBe('POST'); expect(call.workspace).toBe('workspace');
      if (call.url === '/api/v1/collab/shares') {
        expect(call.body).toEqual({ projectId: 'project', slug, sourceFilePath: 'pages/local.html',
          expectedResourceId: 'resource', expectedVersion: registeredVersion,
          expectedVersionId: `immutable-${registeredVersion}` });
        registeredVersion += 1;
      }
    }
  } finally {
    server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

// Explicit source-built executable only; never use a developer's login/CLI.
it.skipIf(!process.env.OD_TEST_VELA_BIN).each([200, 403])('publishes a stable alias with real Go CLI, binding HTTP=%s', async (bindingStatus) => {
  const binary = process.env.OD_TEST_VELA_BIN;
  if (!binary) throw new Error('explicit test CLI required');
  const root = await mkdtemp(path.join(tmpdir(), 'od-go-publish-'));
  const requests: Array<{ url: string | undefined; method: string | undefined; bearer: string | undefined; workspace: string | string[] | undefined; body: unknown }> = [];
  const input = { filePath: 'pages/local.html', workspaceId: 'workspace', projectId: 'project', resourceId: 'resource', slug: 'stable', sourceKey: 'index.html', entryPath: 'index.html', name: 'Design', versionId: 'immutable-upload' };
  const receipt = { slug: input.slug, version: 2, publishedAt: 1234, entryPath: 'index.html', snapshot: { slug: 'snapshot-not-alias', versionId: input.versionId, name: 'Design', kind: 'project' } };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ url: req.url, method: req.method, bearer: req.headers.authorization, workspace: req.headers['x-vela-workspace-id'], body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/resources/resource/shares') res.end(JSON.stringify(receipt));
    else if (req.url === '/api/v1/collab/shares') {
      res.statusCode = bindingStatus;
      res.end(JSON.stringify(bindingStatus === 200 ? { projectId: 'project', slug: 'stable', status: 'active' } : { error: 'forbidden', message: 'synthetic private diagnostic' }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing listener');
    const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic-key', user: null, configMtimeMs: null };
    const pending = publishVelaShareVersion(input, args => runPinnedVelaCommand({ args, session, dataRoot: root, workspaceId: input.workspaceId, configuredEnv: { VELA_BIN: binary } }));
    expect(await pending).toEqual({
      status: bindingStatus === 200 ? 'published' : 'binding_pending',
      receipt: { filePath: input.filePath, slug: 'stable', version: 2, versionId: input.versionId, publishedAt: 1234, entryPath: 'index.html' },
      ...(bindingStatus === 200 ? {} : { binding: { retrying: false, code: 'FORBIDDEN' } }),
    });
    // Confirmed content survives binding failure, without repeating either mutation.
    expect(requests).toEqual([
      { url: '/api/v1/resources/resource/shares', method: 'POST', bearer: 'Bearer synthetic-key', workspace: 'workspace', body: { slug: 'stable', sourceKey: 'index.html', entryPath: 'index.html', name: 'Design', versionId: 'immutable-upload' } },
      { url: '/api/v1/collab/shares', method: 'POST', bearer: 'Bearer synthetic-key', workspace: 'workspace', body: { projectId: 'project', slug: 'stable', sourceFilePath: 'pages/local.html', expectedResourceId: 'resource', expectedVersion: 2, expectedVersionId: 'immutable-upload' } },
    ]);
    expect(await readdir(root)).toEqual([]);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
