import Database from 'better-sqlite3';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { migratePublicFilePublications, createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createPublicSharePublishingFixture, fixtureShareSlug } from './public-share-publishing-fixture.js';

function assertJsonObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected JSON object');
}

const cases: Array<{ name: string; env: NodeJS.ProcessEnv; configuredEnv: Record<string, string>; available: boolean; failUpload?: boolean }> = [
  { name: 'upload fails without origin', env: {}, configuredEnv: {}, available: false, failUpload: true },
  { name: 'unconfigured', env: {}, configuredEnv: {}, available: false },
  { name: 'unmapped feature-test', env: { OPEN_DESIGN_AMR_PROFILE: 'prod', OD_VELA_WEB_URL: 'https://prod.example.test/cloud' }, configuredEnv: { OPEN_DESIGN_AMR_PROFILE: 'feature-test' }, available: false },
  { name: 'invalid', env: { OD_VELA_WEB_URL: 'https://user:password@invalid.example.test' }, configuredEnv: {}, available: false },
  { name: 'configured', env: { OD_VELA_WEB_URL: 'https://viewer.example.test/cloud' }, configuredEnv: {}, available: true },
];
for (const scenario of cases) it.each([false, true])(`${scenario.name}: HTTP publish with pending=%s keeps independent outcomes`, async pending => {
  const root = await mkdtemp(join(tmpdir(), 'od-origin-http-'));
  const dbPath = join(root, 'test.sqlite');
  const db = new Database(dbPath);
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'index.html' };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const app = express(); app.use(express.json());
  let uploads = 0;
  const commands: string[][] = [];
  let recoveredUrl: string | null = null;
  const fixture = createPublicSharePublishingFixture(db, store, async args => {
    expect(args[0]).toBe('push'); uploads++; return JSON.stringify({ id: 'version-1', version: 1 });
  }, undefined, { ...scenario, pending, commands });
  registerCollabSyncRoutes(app, { collab: runtime, publicFilePublicationStore: store, ...fixture,
    verifyWorkspaceRequest: async () => context, resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
    resolveProjectDir: () => root, resolvePublicShareLink: () => recoveredUrl,
    readProjectShareState: async () => ({ projectId: 'p', bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'index.html', slug: fixtureShareSlug, status: 'active' }] }),
  });
  const server = createServer(app);
  try {
    await writeFile(join(root, 'index.html'), '<h1>Published</h1>');
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const url = `http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`;
    const response = await fetch(url, { method: 'POST' }); const body = await response.json(); assertJsonObject(body);
    if (scenario.failUpload) {
      expect(response.status).toBe(502); expect(body).toEqual({ error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE' });
      expect(store.getRevision(scope)).toBeNull(); expect(createShareBindingOutbox(db).list()).toEqual([]); return;
    }
    expect(response.status).toBe(200); expect(uploads).toBe(1);
    expect(body.status).toBe(pending ? 'binding_pending' : 'published');
    expect(body.receipt).toEqual({ filePath: 'index.html', slug: fixtureShareSlug, publishedAt: 1, version: 1, versionId: 'version-1', entryPath: 'index.html' });
    if (!scenario.available) expect(body.link).toEqual({ status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
    else expect(body).not.toHaveProperty('link');
    if (scenario.available) expect(body.url).toBe(`https://viewer.example.test/cloud/artifact/p/${fixtureShareSlug}`);
    else expect(body).not.toHaveProperty('url');
    expect(body).not.toHaveProperty('error');
    expect(createShareBindingOutbox(db).list()).toHaveLength(pending ? 1 : 0);
    if (pending) expect(body.binding).toMatchObject({ retrying: true });
    const revision = store.getRevision(scope); expect(revision?.token).toBeTruthy();
    expect(store.get(scope)?.url).toBe(scenario.available ? `https://viewer.example.test/cloud/artifact/p/${fixtureShareSlug}` : null);
    const read = await fetch(url); const readBody = await read.json(); assertJsonObject(readBody);
    expect(read.status).toBe(200); expect(readBody.status).toBe('active');
    if (!scenario.available) {
      expect(readBody.publication).toBeNull();
      expect(readBody.link).toEqual({ status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
      recoveredUrl = `https://viewer.example.test/cloud/artifact/p/${fixtureShareSlug}`;
      const recovered = await (await fetch(url)).json();
      expect(recovered).toMatchObject({ publication: { url: recoveredUrl, slug: fixtureShareSlug }, status: 'active' });
      expect(recovered).not.toHaveProperty('link');
      expect(store.getRevision(scope)).toEqual(revision); expect(uploads).toBe(1);
    }
    // A separate connection reads the durable no-URL witness, not a mock object.
    const reopened = new Database(dbPath);
    try { const recovered = createSqlitePublicFilePublicationStore(reopened); expect(recovered.getRevision(scope)).toEqual(revision); expect(recovered.get(scope)).toEqual(store.get(scope)); }
    finally { reopened.close(); }
    if (pending) {
      const commandCount = commands.length;
      const resumed = await fetch(url, { method: 'POST' });
      expect(resumed.status).toBe(200);
      expect(await resumed.json()).toMatchObject({ status: 'published', receipt: body.receipt });
      expect(commands.slice(commandCount).map(args => args.slice(0, 2))).toEqual([['share', 'bind']]);
      expect(uploads).toBe(1);
      expect(store.getRevision(scope)).toEqual(revision);
      expect(createShareBindingOutbox(db).list()).toEqual([]);
    }
    const stopped = await fetch(url, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: fixtureShareSlug }) });
    expect(stopped.status).toBe(200); expect(store.getRevision(scope)).toBeNull();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); runtime.dispose(); db.close(); await rm(root, { recursive: true, force: true }); }
});

it('migrates legacy required URL without losing revision, then retains a no-URL publication', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE public_file_publications(resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL, project_id TEXT NOT NULL, file_path TEXT NOT NULL, url TEXT NOT NULL, slug TEXT NOT NULL, file_name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(resource_team_id,owner_member_id,project_id,file_path));
      INSERT INTO public_file_publications VALUES('w','o','p','f','https://viewer.example.test/old','old','f',1,2,'revision');`);
    migratePublicFilePublications(db); migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db); const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'f' };
    expect(store.getRevision(scope)).toEqual({ slug: 'old', token: 'revision' });
    expect(store.get(scope)?.url).toBe('https://viewer.example.test/old');
    store.set(scope, { slug: fixtureShareSlug, fileName: 'f', url: null });
    expect(store.get(scope)?.url).toBeNull(); expect(store.getRevision(scope)?.slug).toBe(fixtureShareSlug);
  } finally { db.close(); }
});
