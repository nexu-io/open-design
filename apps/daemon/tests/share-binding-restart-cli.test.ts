import Database from 'better-sqlite3';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createShareBindingOutbox, recordPendingShareBinding } from '../src/collab/share-binding-outbox.js';
import { createShareBindingStartup } from '../src/collab/share-binding-startup.js';
import { createVelaShareBindingPrepare } from '../src/collab/vela-share-binding-prepare.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';

it.skipIf(!process.env.OD_TEST_VELA_BIN).each(['success', 'wrong-member', 'missing-proof', 'exhausted', 'stale'] as const)(
  'reopens durable binding intent through real directory HTTP and Go CLI: %s', async mode => {
    const binary = process.env.OD_TEST_VELA_BIN!;
    const root = await mkdtemp(path.join(tmpdir(), 'od-binding-restart-'));
    const cliRoot = path.join(root, 'cli');
    const databasePath = path.join(root, 'state.sqlite');
    const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'pages/local.html' };
    const publication = { slug: 'stable', url: 'https://example.test/artifact/p/stable', fileName: scope.filePath };
    const receipt = { filePath: scope.filePath, slug: 'stable', version: 2, versionId: 'immutable', publishedAt: 1234, entryPath: 'index.html' };
    const requests: Array<{ method: string | undefined; url: string | undefined; authorization: string | undefined; workspace: string | string[] | undefined; body: unknown }> = [];
    let rejectMember = mode === 'wrong-member';
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization,
        workspace: req.headers['x-vela-workspace-id'], body: body ? JSON.parse(body) : null });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/api/v1/workspaces') {
        res.end(JSON.stringify({ items: [{ workspaceId: 'w', workspaceName: 'W', workspaceType: 'personal',
          workspaceMemberId: rejectMember ? 'other' : 'o', role: 'member', memberStatus: 'active', lifecycleState: 'active' }] }));
      } else if (req.method === 'POST' && req.url === '/api/v1/collab/shares/complete') {
        if (mode === 'exhausted') { res.statusCode = 403; res.end(JSON.stringify({ error: 'forbidden' })); }
        else res.end(JSON.stringify({ projectId: 'p', slug: 'stable', status: 'active',
          ...(mode === 'missing-proof' ? {} : { verifiedVersion: 2, verifiedVersionId: 'immutable' }) }));
      } else { res.statusCode = 500; res.end('{}'); }
    });
    try {
      await mkdir(cliRoot);
      const seed = new Database(databasePath);
      let token: string;
      try {
        migratePublicFilePublications(seed);
        const store = createSqlitePublicFilePublicationStore(seed); store.set(scope, publication);
        token = store.getRevision(scope)!.token;
        expect(recordPendingShareBinding(createShareBindingOutbox(seed), { ...scope, resourceId: 'r', receipt, publicationRevision: token }, true))
          .toEqual({ status: 'binding_pending', receipt, binding: { retrying: true } });
        if (mode === 'stale') store.set(scope, publication);
      } finally { seed.close(); }
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
      const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic-restart-key', user: null, configMtimeMs: null };
      const pass = async () => {
        const db = new Database(databasePath);
        try {
          const publications = createSqlitePublicFilePublicationStore(db);
          const outbox = createShareBindingOutbox(db);
          const retry = createShareBindingStartup(outbox, { publications, mutations: createPublicFileMutations(),
            prepare: createVelaShareBindingPrepare({ dataRoot: cliRoot, readSession: () => session, configuredEnv: { VELA_BIN: binary } }) });
          const pending = retry(); expect(retry()).toBe(pending);
          const result = await pending; expect(await retry()).toBe(result);
          expect(result.persistenceFailures).toBe(0);
          const revision = publications.getRevision(scope);
          expect(revision?.slug).toBe('stable');
          if (mode !== 'stale') expect(revision?.token).toBe(token);
          expect(await readdir(cliRoot)).toEqual([]);
          return { result, tasks: outbox.list() };
        } finally { db.close(); }
      };
      const first = await pass();
      if (mode === 'success') {
        expect(first.result.bound).toBe(1); expect(first.tasks).toEqual([]);
        await pass(); expect(requests).toHaveLength(2);
      } else if (mode === 'wrong-member') {
        expect(first.result.deferred).toBe(1); expect(first.tasks[0]?.failureCount).toBe(1);
        expect(requests).toHaveLength(1);
        rejectMember = false;
        expect((await pass()).result.bound).toBe(1); expect(requests).toHaveLength(3);
        expect((await pass()).tasks).toEqual([]); expect(requests).toHaveLength(3);
      } else if (mode === 'stale') {
        expect(first.result.deferred).toBe(1); expect(first.tasks[0]?.failureCount).toBe(1); expect(requests).toEqual([]);
      } else {
        expect(first.result.failed).toBe(1); expect(first.tasks[0]?.failureCount).toBe(2);
        if (mode === 'exhausted') {
          for (const count of [3, 4, 5]) expect((await pass()).tasks[0]?.failureCount).toBe(count);
          expect(requests).toHaveLength(8);
          expect((await pass()).tasks[0]?.failureCount).toBe(5); expect(requests).toHaveLength(8);
        } else expect(requests).toHaveLength(2);
      }
      for (const request of requests) {
        expect(request.authorization).toBe('Bearer synthetic-restart-key');
        if (request.method === 'GET') expect(request.url).toBe('/api/v1/workspaces');
        else expect(request).toEqual({ method: 'POST', url: '/api/v1/collab/shares/complete',
          authorization: 'Bearer synthetic-restart-key', workspace: 'w',
          body: { projectId: 'p', slug: 'stable', sourceFilePath: 'pages/local.html', expectedResourceId: 'r', expectedVersion: 2, expectedVersionId: 'immutable' } });
      }
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
