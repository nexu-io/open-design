import Database from 'better-sqlite3';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext, type TeamProject } from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { migratePublicFilePublications, createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createPublicSharePublishingFixture } from './public-share-publishing-fixture.js';

it.each([null, 'another-member', 'owner', 'placeholder', 'catalog-other-owner', 'catalog-placeholder'])('catalog absent, durable local author=%s: reject unknown author or bootstrap before file publication', async localOwner => {
  const root = await mkdtemp(join(tmpdir(), 'od-catalog-authority-'));
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
  const events: string[] = [];
  let catalog: TeamProject | null = localOwner?.startsWith('catalog-')
    ? { projectId: 'p', ownerMemberId: localOwner === 'catalog-other-owner' ? 'other' : 'owner', sharedAt: new Date(1).toISOString() } : null;
  const fixture = createPublicSharePublishingFixture(db, store, async () => {
    events.push('file-upload'); return JSON.stringify({ id: 'file-version', version: 1 });
  });
  if (!fixture.sharePublishing) throw new Error('fixture missing publisher');
  const publisher = { ...fixture.sharePublishing, ensureProject: async () => {
    events.push('root-and-catalog');
    catalog = { projectId: 'p', ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() };
    return catalog;
  } };
  const app = express(); app.use(express.json());
  const deps = { collab: runtime, ...fixture, sharePublishing: publisher,
    verifyWorkspaceRequest: async () => context, resolveSharedProject: async () => catalog,
    resolveLocalPublicShareOwner: () => localOwner === 'placeholder' ? 'owner' : localOwner, resolveProjectDir: () => root,
    projectStore: { has: () => true, register: () => {}, get: () => ({ metadata: localOwner === 'placeholder' || localOwner === 'catalog-placeholder' ? { sharedProjectPlaceholderAt: 1 } : {} }) },
    publicFilePublicationStore: store,
  };
  registerCollabSyncRoutes(app, deps);
  const server = createServer(app);
  try {
    await writeFile(join(root, 'index.html'), '<h1>Own file</h1>');
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`, { method: 'POST' });
    const body = await response.json();
    if (localOwner !== 'owner') {
      expect(response.status).toBe(403);
      expect(body).toEqual({ error: 'WORKSPACE_PROJECT_PUBLISH_DENIED' });
      expect(events).toEqual([]);
    } else {
      expect(response.status).toBe(200);
      expect(events).toEqual(['root-and-catalog', 'file-upload']);
      expect(catalog).toMatchObject({ projectId: 'p', ownerMemberId: 'owner' });
      expect(body).toMatchObject({ status: 'published', receipt: { version: 1 } });
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose(); db.close(); await rm(root, { recursive: true, force: true });
  }
});
