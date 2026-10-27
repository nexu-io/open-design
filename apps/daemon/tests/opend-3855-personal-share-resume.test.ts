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
import { createVelaProjectShareState } from '../src/collab/vela-project-share-state.js';
import { migratePublicFilePublications, createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createPublicSharePublishingFixture, fixtureShareSlug } from './public-share-publishing-fixture.js';

it('personal publish/stop/resume reads retained root identity and reopens the same file without another upload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-personal-resume-'));
  const db = new Database(':memory:');
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  let uploads = 0;
  const fixture = createPublicSharePublishingFixture(db, store,
    async () => JSON.stringify({ id: `version-${++uploads}`, version: uploads }));
  const commands: string[][] = [];
  const read = createVelaProjectShareState({
    dataRoot: root,
    readSession: () => ({ profile: 'local', apiUrl: 'https://api.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null }),
    fetchDirectory: async () => ({ ok: true, items: [{ ...context, workspaceName: 'Personal' }] }),
    resolveLocalProjectOwner: () => 'owner',
    runCommand: async ({ args }) => {
      commands.push(args);
      if (args.join(' ') === 'team-projects ensure-private p') {
        return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'owner', resourceId: 'retained-before-fix-root', visibility: 'private', createdAt: '2026-10-15T00:00:00Z' });
      }
      if (args.join(' ') !== 'share project-status p --json') throw new Error('Unexpected root replacement/upload command');
      return JSON.stringify(await fixture.readProjectShareState!({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'owner' }));
    },
  });
  const app = express(); app.use(express.json());
  registerCollabSyncRoutes(app, {
    collab: runtime, publicFilePublicationStore: store, ...fixture, readProjectShareState: read,
    verifyWorkspaceRequest: async () => context,
    resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
    resolveProjectDir: () => root,
  });
  const server = createServer(app);
  try {
    await writeFile(join(root, 'index.html'), '<h1>Selected personal file</h1>');
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const url = `http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`;
    expect((await fetch(url)).status).toBe(200); // First-ever history registers no bytes.
    expect(uploads).toBe(0);
    const first = await fetch(url, { method: 'POST' });
    expect(first.status).toBe(200);
    const original = await first.json();
    if (!original || typeof original !== 'object' || !('receipt' in original)
      || !('url' in original) || typeof original.url !== 'string') throw new Error('Expected published receipt and URL');
    expect(uploads).toBe(1);
    expect((await fetch(url, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: fixtureShareSlug }) })).status).toBe(200);
    expect(await (await fetch(url)).json()).toMatchObject({ status: 'stopped', publication: null });
    const resumed = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'resume' }) });
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({ status: 'published', receipt: original.receipt, url: original.url });
    expect(await (await fetch(url)).json()).toMatchObject({ status: 'active', publication: { slug: fixtureShareSlug } });
    expect(uploads).toBe(1);
    expect(commands.every(args => args[0] === 'share' || args.join(' ') === 'team-projects ensure-private p')).toBe(true);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose(); db.close(); await rm(root, { recursive: true, force: true });
  }
});
