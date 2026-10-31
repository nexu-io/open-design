import { ensureWorkspaceArtifactForPath } from '../src/chat-artifacts/store.js';
import { expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { closeDatabase, getWorkspaceProjectByProjectId, insertConversation, insertProject, openDatabase, updateWorkspaceProject, upsertPreviewComment } from '../src/db.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import { ensurePublicShareProject } from '../src/collab/public-share-project-bootstrap.js';
import { publicFileResourceIdFor } from '../src/collab/public-file-resource-id.js';
import { createPublicSharePublishingFixture, fixtureShareSlug } from './public-share-publishing-fixture.js';

const FILE = 'pages/public.html';
const context: WorkspaceCollabContext = {
  workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};

// Real HTTP route, SQLite visibility, file staging, completion and backfill.
// Supported content-free CLI contract is synthetic; real Vela authorization
// and full cross-repo/browser privacy remain separate acceptance gates.
it.each(['personal', 'team', 'personal-failure-retry', 'personal-association-failure-retry'] as const)(
  'OPEND-3855: selected-file publication preserves %s visibility without a root upload', async mode => {
    const visibility = mode === 'team' ? 'team' : 'personal';
    const root = await mkdtemp(join(tmpdir(), 'od-3855-'));
    const db = openDatabase(root);
    const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
    const app = express(); app.use(express.json());
    const server = createServer(app);
    const rootCommands: string[][] = [];
    const fileUploads: string[][] = [];
    const commands: string[][] = [];
    let associated = false;
    const cloud = new Map();
    const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: FILE };
    let failUpload = mode === 'personal-failure-retry';
    let failAssociation = mode === 'personal-association-failure-retry';
    let catalogued = visibility === 'team';
    try {
      await mkdir(join(root, 'pages'));
      await writeFile(join(root, FILE), '<h1>PUBLIC-v1</h1>');
      await writeFile(join(root, 'private.html'), '<h1>PRIVATE-ONLY</h1>');
      insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 1 });
      insertConversation(db, { id: 'a', projectId: 'p', title: 'a', createdAt: 1, updatedAt: 1 });
      db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
        VALUES('p','w',?,'active','owner',1,1)`).run(visibility);
      for (const [id, filePath] of [['public-comment', FILE], ['private-comment', 'private.html']]) {
        upsertPreviewComment(db, 'p', 'a', { id, sourceFileId: ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: filePath ?? FILE, kind: 'html' }).id, note: id, authorMemberId: 'owner',
          target: { filePath, elementId: 'hero', selector: 'h1', label: 'Hero', position: { x: 0, y: 0, width: 1, height: 1 } } });
      }
      migratePublicFilePublications(db);
      const store = createSqlitePublicFilePublicationStore(db);
      const queue = createCommentRelayOutboxStore(db);
      const fixture = createPublicSharePublishingFixture(db, store, async args => {
        expect(associated).toBe(true);
        if (failUpload) throw new Error('injected selected-file upload outage');
        fileUploads.push([...args]);
        // Inspect staged bytes before cleanup, rather than guessing from the CLI id.
        const staged = args[3]!;
        expect(staged).not.toBe(root);
        expect(await readdir(staged)).not.toContain('private.html');
        expect(await readFile(join(staged, 'index.html'), 'utf8')).toContain('PUBLIC-v1');
        return JSON.stringify({ id: 'file-version', version: 1 });
      }, enqueuePublishedFileComments, { cloud, commands, teamProject: async args => {
        rootCommands.push([...args]);
        if (args[1] === 'ensure-private') {
          expect(args).toEqual(['team-projects', 'ensure-private', 'p']);
          return JSON.stringify({ workspaceId: 'w', projectId: 'p', resourceId: 'server-root', ownerMemberId: 'owner',
            visibility: visibility === 'team' ? 'team' : 'private', createdAt: new Date(1).toISOString(), publishedVersionId: null });
        }
        expect(args).toEqual(['team-projects', 'register-resource', 'p', publicFileResourceIdFor(scope)]);
        if (failAssociation) return JSON.stringify({ ok: false });
        associated = true;
        return JSON.stringify({ ok: true });
      } });
      registerCollabSyncRoutes(app, {
        collab: runtime, publicFilePublicationStore: store, ...fixture,
        sharePublishing: { ...fixture.sharePublishing!, ensureProject: async (publicationScope, principal, run) => {
          const result = await ensurePublicShareProject({ projectId: publicationScope.projectId, principal,
            run, describeProject: () => ({ name: 'Project', metadata: {} }),
            retainRoot: registration => {
              updateWorkspaceProject(db, registration.workspaceId, registration.projectId, { resourceHubResourceId: registration.resourceId });
            },
          });
          catalogued = true;
          return result;
        } },
        // Exact fixture session only; no ambient or arbitrary requestor identity.
        verifyWorkspaceRequest: async req => req.get('x-od-workspace-id') === 'w'
          && req.get('x-od-workspace-member-id') === 'owner' ? context : null,
        resolveSharedProject: async () => catalogued
          ? { projectId: 'p', ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() } : null,
        resolveLocalPublicShareOwner: (id, workspace) => id === 'p' && workspace === 'w' ? 'owner' : null,
        resolveProjectDir: () => root,
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('HTTP listener unavailable');
      const url = `http://127.0.0.1:${address.port}/api/projects/p/files/${FILE}/publish-public`;
      const publish = () => fetch(url, { method: 'POST', headers: { 'x-od-workspace-id': 'w', 'x-od-workspace-member-id': 'owner' } });
      if (failAssociation) {
        const failed = await publish();
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ error: 'PUBLIC_SHARE_RESOURCE_REGISTRATION_UNAVAILABLE', failure: { stage: 'push', reason: 'unknown' } });
        expect(commands.some(args => args[0] === 'resource')).toBe(false);
        expect(store.get(scope)).toBeNull();
        expect(queue.count()).toBe(0);
        expect(getWorkspaceProjectByProjectId(db, 'p')?.visibility).toBe('personal');
        failAssociation = false;
      }
      if (failUpload) {
        const failed = await publish();
        const body = await failed.json() as Record<string, unknown>;
        expect(failed.status).toBe(502);
        expect(body.error).toBeTruthy();
        expect(store.get(scope)).toBeNull();
        expect(queue.count()).toBe(0);
        expect.soft(getWorkspaceProjectByProjectId(db, 'p')?.visibility).toBe('personal');
        expect.soft(body.madeTeamVisible).toBeUndefined();
        expect.soft(rootCommands.filter(args => args[0] === 'resource' && args[1] === 'push').map(args => args.slice(0, 5))).toEqual([]);
        failUpload = false;
      }
      const response = await publish();
      const body = await response.json() as Record<string, unknown>;
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ status: 'published', receipt: {
        slug: fixtureShareSlug, versionId: 'file-version', version: 1, publishedAt: 1, entryPath: 'index.html',
      } });
      expect(store.get(scope)?.slug).toBe(fixtureShareSlug);
      if (visibility !== 'team') expect(getWorkspaceProjectByProjectId(db, 'p')?.resourceHubResourceId).toBe('server-root');
      expect(cloud.size).toBe(1);
      expect(fileUploads).toHaveLength(1);
      const associationIndex = commands.findIndex(args => args[1] === 'register-resource');
      const pushIndex = commands.findIndex(args => args[0] === 'resource' && args[1] === 'push');
      expect(associationIndex).toBeGreaterThanOrEqual(0);
      expect(pushIndex).toBeGreaterThan(associationIndex);
      expect(commands.filter(args => args[0] === 'resource' && args[1] === 'push')
        .every(args => args[3] === publicFileResourceIdFor(scope))).toBe(true);
      expect(commands.some(args => args[1] === 'visibility' || args[1] === 'upsert')).toBe(false);
      expect(fileUploads[0]!.slice(0, 3)).toEqual(['push', 'project', publicFileResourceIdFor(scope)]);
      expect.soft(getWorkspaceProjectByProjectId(db, 'p')).toMatchObject({ visibility, createdByWorkspaceMemberId: 'owner' });
      expect.soft(body.madeTeamVisible).toBeUndefined();
      expect.soft(rootCommands.filter(args => args[0] === 'resource' && args[1] === 'push').map(args => args.slice(0, 5))).toEqual([]);
      expect.soft(queue.listDue(Date.now()).map(row => [row.comment.id, row.relayScope])).toEqual([
        ['public-comment', visibility === 'team' ? 'team' : 'personal'],
      ]);
      // Update, stop and saved-generation resume never change project policy.
      expect((await publish()).status).toBe(200);
      const stop = await fetch(url, { method: 'DELETE', headers: {
        'x-od-workspace-id': 'w', 'x-od-workspace-member-id': 'owner', 'content-type': 'application/json',
      }, body: JSON.stringify({ slug: fixtureShareSlug }) });
      expect(stop.status).toBe(200);
      expect(getWorkspaceProjectByProjectId(db, 'p')?.visibility).toBe(visibility);
      const resume = await fetch(url, { method: 'POST', headers: {
        'x-od-workspace-id': 'w', 'x-od-workspace-member-id': 'owner', 'content-type': 'application/json',
      }, body: JSON.stringify({ mode: 'resume' }) });
      expect(resume.status).toBe(200);
      expect((await resume.json() as Record<string, unknown>).madeTeamVisible).toBeUndefined();
      expect(getWorkspaceProjectByProjectId(db, 'p')?.visibility).toBe(visibility);
      expect(commands.some(args => args[1] === 'visibility' || args[1] === 'upsert')).toBe(false);
      expect(commands.filter(args => args[0] === 'resource').every(args => args[3] === publicFileResourceIdFor(scope))).toBe(true);
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      runtime.dispose(); closeDatabase(); await rm(root, { recursive: true, force: true });
    }
  },
);
