import { expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, insertConversation, upsertPreviewComment, getWorkspaceProjectByProjectId } from '../src/db.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { enqueuePublishedFileComments } from '../src/collab/published-file-comment-backfill.js';
import { createCommentRelayOutboxStore, commentRelayLocalBindingMatches } from '../src/collab/comment-relay-outbox.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
import { commentRelayScope } from '../src/collab/comment-relay-scope.js';
import { runVelaResourceCommand } from '../src/collab/vela-cli-resource-adapter.js';
import { readVelaControlApiContext } from '../src/integrations/vela.js';
import { createPublicSharePublishingFixture, fixtureShareSlug } from './public-share-publishing-fixture.js';

vi.mock('../src/collab/vela-cli-resource-adapter.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/collab/vela-cli-resource-adapter.js')>(), runVelaResourceCommand: vi.fn(),
}));
vi.mock('../src/integrations/vela.js', () => ({ readVelaControlApiContext: vi.fn() }));

it.each([false, true])('production publish HTTP uses real comment transaction; second enqueue fails=%s', async fail => {
  const root = await mkdtemp(join(tmpdir(), 'od-publish-http-backfill-'));
  const db = openDatabase(root);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const app = express(); app.use(express.json());
  const server = createServer(app);
  try {
    await mkdir(join(root, 'pages'));
    await writeFile(join(root, 'pages', 'local.html'), '<h1 data-od-id="hero">Published</h1>');
    insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 1 });
    for (const id of ['a', 'b']) insertConversation(db, { id, projectId: 'p', title: id, createdAt: 1, updatedAt: 1 });
    db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
      VALUES('p','w','personal','active','owner',1,1)`).run();
    for (const [id, conversationId, filePath] of [['first', 'a', 'pages/local.html'], ['second', 'b', 'pages/local.html'], ['private', 'a', 'private.html']]) {
      upsertPreviewComment(db, 'p', conversationId!, { id: id!, note: id!, authorMemberId: 'original-author',
        target: { filePath: filePath!, elementId: 'hero', selector: 'h1', label: 'Hero', position: { x: 0, y: 0, width: 1, height: 1 } } });
    }
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const queue = createCommentRelayOutboxStore(db);
    if (fail) db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON comment_relay_outbox WHEN NEW.comment_id='second' BEGIN SELECT RAISE(ABORT,'injected queue failure'); END");
    vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://hub.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null });
    vi.mocked(runVelaResourceCommand).mockReset();
    vi.mocked(runVelaResourceCommand).mockImplementation(async args => JSON.stringify(args[0] === 'snapshot'
      ? { slug: 'stable-alias', name: 'local.html', kind: 'project', versionId: 'v1', createdAt: new Date(1).toISOString() }
      : { id: 'v1', version: 1 }));
    const publicationCommands: string[][] = [];
    registerCollabSyncRoutes(app, {
      collab: runtime, publicFilePublicationStore: store,
      ...createPublicSharePublishingFixture(db, store, runVelaResourceCommand, enqueuePublishedFileComments, { commands: publicationCommands }),
      recordPublicFilePublication: createPublicFilePublicationRecorder(db, store, enqueuePublishedFileComments),
      verifyWorkspaceRequest: async req => req.get('x-od-workspace-id') === 'w' && req.get('x-od-workspace-member-id') === 'owner' ? context : null,
      resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }), resolveSharedProjectOwner: async () => 'owner',
      resolveProjectDir: () => root,
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP listener unavailable');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/pages/local.html/publish-public`, {
      method: 'POST', headers: { 'x-od-workspace-id': 'w', 'x-od-workspace-member-id': 'owner' },
    });
    const body = await response.json();
    expect(response.status).toBe(fail ? 502 : 200);
    expect(db.inTransaction).toBe(false);
    const commands = vi.mocked(runVelaResourceCommand).mock.calls;
    expect(commands.map(call => call[0][0])).toEqual(['push']);
    expect(publicationCommands.map(args => args.slice(0, 2))).toEqual(fail
      ? [['resource', 'push'], ['share', 'publish'], ['share', 'stop']]
      : [['resource', 'push'], ['share', 'publish']]);
    expect(commands.every(call => call[1] === 'w')).toBe(true);
    const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'pages/local.html' };
    if (fail) {
      expect(body).toMatchObject({ error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE' });
      expect(store.get(scope)).toBeNull(); expect(queue.count()).toBe(0);
      expect(db.prepare('SELECT * FROM comment_relay_publication_mappings').all()).toEqual([]);
    } else {
      expect(body).toMatchObject({ status: 'published', receipt: { slug: fixtureShareSlug } });
      const rows = queue.listDue(Date.now());
      expect(rows.map(row => row.comment.id)).toEqual(['first', 'second']);
      for (const row of rows) {
        expect(row.comment).toMatchObject({ filePath: scope.filePath, memberId: 'original-author' });
        expect(row.publication).toEqual({ ...store.getRevision(scope), publicFilePath: 'index.html' });
      }
      // Discard publisher objects before creating a fresh delivery service.
      const revision = store.getRevision(scope);
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      runtime.dispose(); closeDatabase();
      const reopened = openDatabase(root);
      const recoveredQueue = createCommentRelayOutboxStore(reopened);
      const recoveredStore = createSqlitePublicFilePublicationStore(reopened);
      expect(recoveredQueue.listDue(Date.now())).toEqual(rows);
      expect(recoveredQueue.listDue(Date.now()).every(row => recoveredQueue.isPublicationCurrent!(row))).toBe(true);
      let offline = true;
      const delivered: unknown[] = [];
      const relay = createCollabCloudService({
        client: createVelaCliCollabClient({ run: async (args, workspaceId, options) => {
          expect(args).toEqual(['comment', 'push', 'p', '--comment-file', '-']);
          expect(workspaceId).toBe('w');
          if (offline) throw new Error('simulated transport offline');
          if (typeof options?.input !== 'string') throw new Error('expected serialized comment on stdin');
          delivered.push(JSON.parse(options.input));
          return JSON.stringify({ seq: delivered.length });
        } }),
        commentOutbox: recoveredQueue, listProjectIds: () => [], retryDelayMs: () => 0,
        resolveCommentRelayWorkspaceContext: async () => context,
        listRemoteProjectRelayBindings: async () => [{ projectId: 'p', ownerMemberId: 'owner' }],
        validateCommentRelayProjectBinding: record => commentRelayLocalBindingMatches(record, getWorkspaceProjectByProjectId(reopened, record.projectId)),
        commentRelayScope: (projectId, filePath, ctx) => commentRelayScope({ projectId, filePath, context: ctx,
          binding: getWorkspaceProjectByProjectId(reopened, projectId), publications: recoveredStore }),
        resolveLocalConversationId: () => 'a', mergeComment: () => 'unchanged',
      });
      try {
        await relay.flushPendingComments();
        expect(delivered).toEqual([]); expect(recoveredQueue.count()).toBe(2);
        expect(recoveredStore.getRevision(scope)).toEqual(revision);
        offline = false;
        await relay.flushPendingComments();
        expect(delivered).toEqual(['first', 'second'].map(id => expect.objectContaining({
          id, note: id, memberId: 'original-author', filePath: 'index.html',
        })));
        expect(recoveredQueue.count()).toBe(0);
        await relay.flushPendingComments(); expect(delivered).toHaveLength(2);
      } finally { relay.dispose(); }
    }
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    runtime.dispose(); closeDatabase(); await rm(root, { recursive: true, force: true }); vi.clearAllMocks();
  }
});
