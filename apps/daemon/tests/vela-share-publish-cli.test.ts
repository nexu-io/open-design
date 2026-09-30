import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishReservedVelaShareVersion, publishVelaShareVersion } from '../src/collab/vela-share-publish.js';
import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';

it.skipIf(!process.env.OD_TEST_VELA_BIN)('keeps one reserved alias through atomic failure, SQLite restart, update and rejected binding', async () => {
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
    if (req.url === '/api/v1/resources/resource/shares/bound') {
      publishes.push(body);
      if (publishes.length !== 2) { res.statusCode = publishes.length === 1 ? 503 : 409; res.end('{"error":"share_binding_stopped"}'); return; }
      res.statusCode = 201;
      res.end(JSON.stringify({ slug: body.slug, version: 1, publishedAt: 1235,
        entryPath: body.entryPath, snapshot: { slug: 'immutable-snapshot', versionId: body.versionId } }));
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
        if (attempt !== 2) await expect(pending).rejects.toThrow('PUBLIC_SHARE_PUBLISH_FAILED');
        else {
          const result = await pending;
          slug ??= result.receipt.slug;
          expect(result).toEqual({ status: 'published', receipt: { filePath: 'pages/local.html', slug, version: 1,
            versionId: 'immutable-2', publishedAt: 1235, entryPath: 'index.html' } });
        }
      } finally { db.close(); }
      expect(await readdir(cliRoot)).toEqual([]);
    }
    expect(calls).toHaveLength(3); expect(publishes).toHaveLength(3);
    expect(publishes.map(body => body.slug)).toEqual([slug, slug, slug]);
    expect(new Set(publishes.map(body => body.sourceKey)).size).toBe(1);
    expect(publishes.map(body => body.versionId)).toEqual(['immutable-1', 'immutable-2', 'immutable-3']);
    for (const [index, call] of calls.entries()) {
      expect(call.method).toBe('POST'); expect(call.workspace).toBe('workspace');
      expect(call.url).toBe('/api/v1/resources/resource/shares/bound');
      expect(call.body).toEqual({ projectId: 'project', sourceFilePath: 'pages/local.html', slug,
        sourceKey: publishes[0]?.sourceKey, entryPath: 'index.html', name: 'Design', versionId: `immutable-${index + 1}` });
    }
  } finally {
    server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

// Explicit source-built executable only; never use a developer's login/CLI.
it.skipIf(!process.env.OD_TEST_VELA_BIN).each([201, 403])('publishes a stable alias with real Go CLI, atomic HTTP=%s', async (publishStatus) => {
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
    if (req.url === '/api/v1/resources/resource/shares/bound') {
      res.statusCode = publishStatus;
      res.end(JSON.stringify(publishStatus === 201 ? receipt : { error: 'forbidden', message: 'synthetic private diagnostic' }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing listener');
    const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic-key', user: null, configMtimeMs: null };
    const pending = publishVelaShareVersion(input, args => runPinnedVelaCommand({ args, session, dataRoot: root, workspaceId: input.workspaceId, configuredEnv: { VELA_BIN: binary } }));
    if (publishStatus === 201) expect(await pending).toEqual({ status: 'published',
      receipt: { filePath: input.filePath, slug: 'stable', version: 2, versionId: input.versionId, publishedAt: 1234, entryPath: 'index.html' },
    });
    else await expect(pending).rejects.toThrow(/^PUBLIC_SHARE_PUBLISH_FAILED$/);
    // A failed binding cannot have committed a new alias version: the CLI sends one atomic request.
    expect(requests).toEqual([
      { url: '/api/v1/resources/resource/shares/bound', method: 'POST', bearer: 'Bearer synthetic-key', workspace: 'workspace', body: { projectId: 'project', sourceFilePath: 'pages/local.html', slug: 'stable', sourceKey: 'index.html', entryPath: 'index.html', name: 'Design', versionId: 'immutable-upload' } },
    ]);
    expect(await readdir(root)).toEqual([]);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
