import Database from 'better-sqlite3';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { migratePublicFilePublications, createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
import { reserveFileShareAlias } from '../src/collab/share-alias-recovery.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import type { ProjectShareState } from '../src/collab/vela-project-share-state.js';
import { createPublicSharePublishingFixture, fixtureShareSlug } from './public-share-publishing-fixture.js';

const fileScope = { sourceFileId: '11111111-1111-4111-8111-111111111111', resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'index.html' };
const wrongSlug = '33333333-3333-4333-8333-333333333333';

it.each(['unknown', 'wrong-project', 'legacy', 'ambiguous', 'different-path', 'local-publication', 'pending-binding', 'bound-reservation', 'storage'] as const)(
  'refuses unsafe alias recovery (%s) without generating or replacing an alias', mode => {
    const db = new Database(':memory:');
    try {
      migratePublicFilePublications(db);
      const publications = createSqlitePublicFilePublicationStore(db);
      const outbox = createShareBindingOutbox(db);
      const generateId = vi.fn(() => wrongSlug);
      const reservations = createShareAliasReservations(db, generateId);
      const cloud = { sourceFileId: fileScope.sourceFileId, sourceFilePath: fileScope.filePath, slug: fixtureShareSlug, status: 'active' as const };
      let history: ProjectShareState | null = { projectId: 'p', bindingExists: true, hasEverShared: true, publications: [cloud] };
      if (mode === 'unknown') history = null;
      if (mode === 'wrong-project') history!.projectId = 'other';
      if (mode === 'legacy') history!.publications = [{ sourceFilePath: 'index.html', slug: fixtureShareSlug, status: 'active' }];
      if (mode === 'ambiguous') history!.publications.push({ ...cloud, slug: wrongSlug });
      if (mode === 'different-path') history!.publications = [{ ...cloud, sourceFilePath: 'different.html' }];
      if (mode === 'local-publication') publications.set(fileScope, { slug: wrongSlug, url: null, fileName: 'index.html' });
      if (mode === 'pending-binding') outbox.enqueue({ resourceTeamId: 'w', ownerMemberId: 'owner', resourceId: 'r', projectId: 'p',
        publicationRevision: 'pending', receipt: { filePath: 'index.html', slug: wrongSlug, versionId: 'v', entryPath: 'index.html', version: 1, publishedAt: 1 } });
      if (mode === 'bound-reservation') {
        reservations.reserve(fileScope);
        history!.publications.push({ ...cloud, sourceFileId: '22222222-2222-4222-8222-222222222222', slug: wrongSlug });
      }
      if (mode === 'storage') {
        reservations.reserve(fileScope);
        db.exec(`CREATE TRIGGER fail_recovery BEFORE UPDATE ON share_alias_reservations BEGIN SELECT RAISE(ABORT, 'storage failure'); END`);
      }
      const before = reservations.get(fileScope);
      generateId.mockClear();
      expect(() => reserveFileShareAlias({ scope: fileScope, history, reservations, publications, outbox })).toThrow();
      expect(reservations.get(fileScope)).toEqual(before);
      expect(generateId).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

it('creates a new alias only when cloud history has no share for the current file identity', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const publications = createSqlitePublicFilePublicationStore(db);
    const outbox = createShareBindingOutbox(db);
    const generateId = vi.fn(() => wrongSlug);
    const reservations = createShareAliasReservations(db, generateId);
    const history: ProjectShareState = { projectId: 'p', bindingExists: true, hasEverShared: true,
      publications: [{ sourceFilePath: 'index.html', sourceFileId: '22222222-2222-4222-8222-222222222222', slug: fixtureShareSlug, status: 'stopped' }] };
    expect(reserveFileShareAlias({ scope: fileScope, history, reservations, publications, outbox }).slug).toBe(wrongSlug);
    expect(generateId).toHaveBeenCalledOnce();
    expect(reservations.get(fileScope)?.slug).not.toBe(fixtureShareSlug);
  } finally { db.close(); }
});

it.each([
  ['active', 'missing'], ['active', 'incorrect'], ['stopped', 'missing'], ['stopped', 'incorrect'],
] as const)('recovers the cloud %s alias with a %s local reservation', async (status, localState) => {
  const root = await mkdtemp(join(tmpdir(), 'od-alias-recovery-'));
  const db = new Database(':memory:');
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const scope = { sourceFileId: '11111111-1111-4111-8111-111111111111', resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'index.html' };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  let uploads = 0;
  const uploadedContents: string[] = [];
  const commands: string[][] = [];
  const fixture = createPublicSharePublishingFixture(db, store,
    async args => {
      uploadedContents.push(await readFile(join(args[3]!, 'index.html'), 'utf8'));
      return JSON.stringify({ id: `version-${++uploads}`, version: uploads });
    }, undefined, { commands });
  if (!fixture.sharePublishing) throw new Error('missing publisher');
  const generateId = vi.fn(() => '33333333-3333-4333-8333-333333333333');
  let reservations = fixture.sharePublishing.reservations;
  const app = express(); app.use(express.json());
  registerCollabSyncRoutes(app, {
    collab: runtime, publicFilePublicationStore: store, ...fixture,
    sharePublishing: { ...fixture.sharePublishing, sourceFileId: () => scope.sourceFileId,
      get reservations() { return reservations; } },
    verifyWorkspaceRequest: async () => context,
    resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
    resolveProjectDir: () => root,
  });
  const server = createServer(app);
  try {
    await writeFile(join(root, 'index.html'), '<h1>Original content</h1>');
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const url = `http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`;
    const first = await fetch(url, { method: 'POST' });
    expect(first.status).toBe(200);
    const original = await first.json();
    if (!original || typeof original !== 'object' || !('url' in original) || typeof original.url !== 'string'
      || !('receipt' in original) || !original.receipt || typeof original.receipt !== 'object' || !('slug' in original.receipt)) {
      throw new Error('missing original share receipt');
    }
    expect(original.receipt.slug).toBe(fixtureShareSlug);
    expect(original.url).toEqual(expect.any(String));
    if (status === 'stopped') {
      expect((await fetch(url, { method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: fixtureShareSlug }) })).status).toBe(200);
    }
    // Isolated SQLite models a second installation without user data writes.
    store.delete(scope);
    db.prepare('DELETE FROM share_alias_reservations').run();
    reservations = createShareAliasReservations(db, generateId);
    if (localState === 'incorrect') reservations.reserve(scope);
    generateId.mockClear();
    if (status === 'stopped') {
      const ordinaryPublish = await fetch(url, { method: 'POST' });
      expect(ordinaryPublish.status).toBe(409);
      expect(await ordinaryPublish.json()).toEqual({ error: 'SHARE_STOPPED_RESUME_REQUIRED' });
      expect(reservations.get(scope)?.slug).toBe(fixtureShareSlug);
      expect(uploads).toBe(1);
      expect(generateId).not.toHaveBeenCalled();
    }
    await writeFile(join(root, 'index.html'), '<h1>Latest local content</h1>');
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      ...(status === 'stopped' ? { body: JSON.stringify({ mode: 'resume' }) } : {}) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ receipt: { slug: fixtureShareSlug }, url: original.url });
    expect(generateId).not.toHaveBeenCalled();
    expect(reservations.reserve(scope).slug).toBe(fixtureShareSlug);
    expect(createShareAliasReservations(db, generateId).reserve(scope).slug).toBe(fixtureShareSlug);
    expect(uploads).toBe(status === 'stopped' ? 1 : 2);
    if (status === 'active') expect(uploadedContents[1]).toContain('Latest local content');
    expect(await readFile(join(root, 'index.html'), 'utf8')).toBe('<h1>Latest local content</h1>');
    expect(commands.filter(args => args[0] === 'share').every(args =>
      args[1] === 'publish' ? args[args.indexOf('--slug') + 1] === fixtureShareSlug : args[2] === fixtureShareSlug)).toBe(true);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose(); db.close(); await rm(root, { recursive: true, force: true });
  }
});
