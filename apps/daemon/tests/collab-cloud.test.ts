import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type CollabCloudComment,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  closeDatabase,
  deleteSyncedPreviewComment,
  insertConversation,
  insertProject,
  listPreviewComments,
  mergeSyncedPreviewComment,
  openDatabase,
  upsertPreviewComment,
} from '../src/db.js';
import { createCollabCloudClient, type CollabCloudClient } from '../src/integrations/collab-cloud.js';
import {
  createCollabCloudService,
  previewCommentToCloud,
} from '../src/collab/collab-cloud-service.js';
import {
  buildVelaCollabEnv,
  createVelaCliCollabClient,
  shouldUseVelaCliCollabTransport,
} from '../src/collab/vela-cli-collab-client.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function cloudComment(id: string, patch: Partial<CollabCloudComment> = {}): CollabCloudComment {
  return {
    id,
    projectId: 'p1',
    conversationId: 'conv-remote',
    memberId: 'm-author',
    seq: 0,
    note: `note ${id}`,
    filePath: 'index.html',
    elementId: 'hero',
    selector: '[data-od-id="hero"]',
    label: 'h1.hero',
    text: 'Hero',
    htmlHint: '<h1>',
    position: { x: 1, y: 2, width: 3, height: 4 },
    status: 'open',
    createdAt: 100,
    updatedAt: 100,
    ...patch,
  };
}

function seededDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-collab-cloud-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: 'p1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conv-local', projectId: 'p1', title: 'Chat', createdAt: 1, updatedAt: 1 });
  return db;
}

function teamContext(patch: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'm-self',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    teamId: 'team-1',
    displayName: '琼羽',
    ...patch,
  };
}

function fixedContextProvider(context: WorkspaceCollabContext | null): WorkspaceContextProvider {
  return { current: async () => context };
}

// —— previewCommentToCloud mapping ————————————————————————————————————————————

describe('previewCommentToCloud', () => {
  it('uses the comment author as memberId and carries the anchor/drift fields', () => {
    const cloud = previewCommentToCloud(
      {
        id: 'c1',
        projectId: 'p1',
        conversationId: 'conv-local',
        filePath: 'index.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'h1.hero',
        text: 'Hero',
        position: { x: 1, y: 2, width: 3, height: 4 },
        htmlHint: '<h1>',
        note: 'looks off',
        status: 'open',
        createdAt: 10,
        updatedAt: 20,
        authorMemberId: 'm-author',
        anchorState: 'reanchored',
        anchoredVersion: 7,
        lastGoodPosition: { x: 5, y: 6, width: 7, height: 8 },
      } as any,
      'm-fallback',
    );
    expect(cloud.memberId).toBe('m-author');
    expect(cloud.anchorState).toBe('reanchored');
    expect(cloud.anchoredVersion).toBe(7);
    expect(cloud.lastGoodPosition).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(cloud.seq).toBe(0);
  });

  it('falls back to the sharing member when the comment has no author', () => {
    const cloud = previewCommentToCloud(
      {
        id: 'c1',
        projectId: 'p1',
        conversationId: 'conv-local',
        filePath: 'index.html',
        elementId: 'hero',
        selector: 's',
        label: 'l',
        text: 't',
        position: { x: 0, y: 0, width: 0, height: 0 },
        htmlHint: '',
        note: 'n',
        status: 'open',
        createdAt: 1,
        updatedAt: 1,
      } as any,
      'm-fallback',
    );
    expect(cloud.memberId).toBe('m-fallback');
  });
});

// —— mergeSyncedPreviewComment idempotency (real db) ——————————————————————————

describe('mergeSyncedPreviewComment', () => {
  it('inserts once and is a no-op on re-merge of the same id', () => {
    const db = seededDb();
    const comment = cloudComment('c1', {
      memberId: 'm-author',
      anchorState: 'anchored',
      anchoredVersion: 3,
    });
    expect(mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment)).toBe(true);
    // Re-pull of the same cloud comment (same id) must not double-insert.
    expect(mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment)).toBe(false);

    const stored = listPreviewComments(db, 'p1', 'conv-local');
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe('c1');
    // The AUTHOR is preserved for cross-member attribution.
    expect(stored[0]!.authorMemberId).toBe('m-author');
    expect(stored[0]!.anchorState).toBe('anchored');
    expect(stored[0]!.anchoredVersion).toBe(3);
  });

  it('lands under the LOCAL conversation, not the cloud comment conversationId', () => {
    const db = seededDb();
    // comment.conversationId is 'conv-remote' (a foreign daemon's id) — merge must
    // re-home it onto the local conversation to satisfy the FK + be queryable.
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1'));
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(1);
    expect(listPreviewComments(db, 'p1', 'conv-remote')).toHaveLength(0);
  });

  // —— multi-author coexistence on the SAME element (the顶掉 root cause) ————————

  it('keeps two members\' comments on the same element as distinct rows', () => {
    const db = seededDb();
    // A member's comment on `hero` is synced in...
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c-member', { memberId: 'm-member' }));
    // ...and the local user (a different author) comments on the SAME element.
    const own = upsertPreviewComment(db, 'p1', 'conv-local', {
      target: {
        filePath: 'index.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'h1.hero',
        text: 'Hero',
        htmlHint: '<h1>',
        position: { x: 0, y: 0, width: 0, height: 0 },
      },
      note: 'owner note',
      authorMemberId: 'm-owner',
    });
    expect(own).not.toBeNull();
    const stored = listPreviewComments(db, 'p1', 'conv-local');
    // Both coexist — the local upsert did NOT clobber the synced member comment.
    expect(stored).toHaveLength(2);
    expect(stored.find((c) => c.authorMemberId === 'm-member')?.note).toBe('note c-member');
    expect(stored.find((c) => c.authorMemberId === 'm-owner')?.note).toBe('owner note');
  });

  it('merges two different-author comments on the same element without a collision', () => {
    const db = seededDb();
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('cA', { memberId: 'm-a' })),
    ).toBe(true);
    // Same element, different author + different id → a new distinct row (not IGNOREd).
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('cB', { memberId: 'm-b' })),
    ).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(2);
  });

  // —— edit sync (UPSERT by updatedAt) ——————————————————————————————————————————

  it('applies a strictly-newer edit in place and ignores a stale one', () => {
    const db = seededDb();
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v1', updatedAt: 100 }));
    // Newer updatedAt → update in place.
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v2', updatedAt: 200 })),
    ).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')[0]!.note).toBe('v2');
    // Stale updatedAt → no-op, the fresher local content wins.
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v0', updatedAt: 150 })),
    ).toBe(false);
    expect(listPreviewComments(db, 'p1', 'conv-local')[0]!.note).toBe('v2');
    // A re-pull at the same updatedAt is also a no-op (still one row).
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { note: 'v2', updatedAt: 200 })),
    ).toBe(false);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(1);
  });

  // —— delete sync (tombstone) ——————————————————————————————————————————————————

  it('deletes the local comment on an inbound tombstone', () => {
    const db = seededDb();
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1'));
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(1);
    // Tombstone removes it (delete wins regardless of updatedAt).
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { deleted: true, updatedAt: 1 })),
    ).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(0);
    // A repeated tombstone is a no-op.
    expect(
      mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1', { deleted: true })),
    ).toBe(false);
  });

  it('deleteSyncedPreviewComment removes by id, scoped to the project', () => {
    const db = seededDb();
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', cloudComment('c1'));
    expect(deleteSyncedPreviewComment(db, 'other-project', 'c1')).toBe(false);
    expect(deleteSyncedPreviewComment(db, 'p1', 'c1')).toBe(true);
    expect(listPreviewComments(db, 'p1', 'conv-local')).toHaveLength(0);
  });
});

// —— createCollabCloudService poll + merge idempotency (fake client) —————————

/** An in-memory fake collab-cloud client honoring sinceSeq, matching the real
 *  client's method shape so the service runs unchanged against it. */
function fakeClient() {
  const comments: CollabCloudComment[] = [];
  const registered: Array<{ teamId: string; memberId: string; displayName: string; role: string }> = [];
  let seq = 0;
  const client = {
    isConfigured: () => true,
    registerMember: async (teamId: string, memberId: string, input: { displayName: string; role: string }) => {
      registered.push({ teamId, memberId, ...input });
      return { memberId, displayName: input.displayName, role: input.role as any };
    },
    listMembers: async () => registered.map((r) => ({ memberId: r.memberId, displayName: r.displayName, role: r.role as any })),
    pushComment: async (_teamId: string, _projectId: string, comment: CollabCloudComment) => {
      seq += 1;
      comments.push({ ...comment, seq });
      return { seq };
    },
    pullComments: async (_teamId: string, _projectId: string, sinceSeq: number) => {
      const next = comments.filter((c) => c.seq > sinceSeq).sort((a, b) => a.seq - b.seq);
      return { comments: next, latestSeq: seq, notModified: false, etag: `W/"seq-${seq}"` };
    },
  };
  return { client: client as unknown as CollabCloudClient, seed: (c: CollabCloudComment) => { seq += 1; comments.push({ ...c, seq }); }, registered };
}

describe('createCollabCloudService', () => {
  it('polls, merges new comments once, and advances the cursor (no re-merge)', async () => {
    const { client, seed } = fakeClient();
    seed(cloudComment('c1'));
    seed(cloudComment('c2'));

    const merged = new Map<string, CollabCloudComment>();
    let mergeCalls = 0;

    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => ['p1'],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: ({ comment }) => {
        mergeCalls += 1;
        if (merged.has(comment.id)) return false;
        merged.set(comment.id, comment);
        return true;
      },
    });

    await service.pollOnce();
    expect([...merged.keys()]).toEqual(['c1', 'c2']);
    expect(mergeCalls).toBe(2);

    // Second poll: sinceSeq is at the head → nothing new pulled → no more merges.
    await service.pollOnce();
    expect(merged.size).toBe(2);
    expect(mergeCalls).toBe(2);
    service.dispose();
  });

  it('registers the member on each poll from the workspace context', async () => {
    const { client, registered } = fakeClient();
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext({ displayName: '琼羽', role: 'owner' })),
      listProjectIds: () => [],
      resolveLocalConversationId: () => null,
      mergeComment: () => false,
    });
    await service.pollOnce();
    expect(registered).toContainEqual({ teamId: 'team-1', memberId: 'm-self', displayName: '琼羽', role: 'owner' });
    service.dispose();
  });

  it('skips a project with no local conversation to attach to', async () => {
    const { client, seed } = fakeClient();
    seed(cloudComment('c1'));
    let mergeCalls = 0;
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => ['p1'],
      resolveLocalConversationId: () => null, // member pulled the project, no chat yet
      mergeComment: () => { mergeCalls += 1; return true; },
    });
    await service.pollOnce();
    expect(mergeCalls).toBe(0);
    service.dispose();
  });

  it('pushes a tombstone (deleted: true) for a comment deletion', async () => {
    const { client } = fakeClient();
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(teamContext()),
      listProjectIds: () => ['p1'],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => false,
    });
    await service.pushCommentDeletion({
      id: 'c1',
      projectId: 'p1',
      conversationId: 'conv-local',
      filePath: 'index.html',
      elementId: 'hero',
      selector: 's',
      label: 'l',
      text: 't',
      position: { x: 0, y: 0, width: 0, height: 0 },
      htmlHint: '',
      note: 'n',
      status: 'open',
      createdAt: 1,
      updatedAt: 1,
      authorMemberId: 'm-self',
    } as any);
    const pulled = await client.pullComments('team-1', 'p1', 0);
    const tomb = pulled.comments.find((c) => c.id === 'c1');
    expect(tomb?.deleted).toBe(true);
    service.dispose();
  });

  it('is a full no-op off-team (no team context)', async () => {
    const { client, registered } = fakeClient();
    let mergeCalls = 0;
    const service = createCollabCloudService({
      client,
      workspaceContext: fixedContextProvider(null),
      listProjectIds: () => ['p1'],
      resolveLocalConversationId: () => 'conv-local',
      mergeComment: () => { mergeCalls += 1; return true; },
    });
    await service.pollOnce();
    expect(registered).toHaveLength(0);
    expect(mergeCalls).toBe(0);
    expect(await service.listMembers()).toEqual([]);
    service.dispose();
  });
});

// —— client wire behavior (injected fetch) ————————————————————————————————————

describe('collab-cloud client', () => {
  function jsonResponse(status: number, body: unknown, etag?: string): Response {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (etag) headers.etag = etag;
    return new Response(JSON.stringify(body), { status, headers });
  }

  it('attaches a bearer token and returns the pushed seq', async () => {
    const calls: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
    const client = createCollabCloudClient({
      config: { baseUrl: 'http://cloud.local', token: 'secret' },
      fetch: (async (input: any, init: any) => {
        const req = new Request(input, init);
        calls.push({
          url: req.url,
          method: req.method,
          auth: req.headers.get('authorization'),
          body: init?.body ? JSON.parse(init.body) : undefined,
        });
        return jsonResponse(200, { ok: true, seq: 5 });
      }) as unknown as typeof fetch,
    });
    const result = await client.pushComment('team-1', 'p1', cloudComment('c1'));
    expect(result.seq).toBe(5);
    expect(calls[0]!.auth).toBe('Bearer secret');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('http://cloud.local/teams/team-1/projects/p1/comments');
    expect((calls[0]!.body as any).comment.id).toBe('c1');
  });

  it('sends If-None-Match and treats a 304 as "not modified"', async () => {
    let seenIfNoneMatch: string | null = null;
    const client = createCollabCloudClient({
      config: { baseUrl: 'http://cloud.local', token: 'secret' },
      fetch: (async (input: any, init: any) => {
        const req = new Request(input, init);
        seenIfNoneMatch = req.headers.get('if-none-match');
        return new Response(null, { status: 304, headers: { etag: 'W/"seq-2"' } });
      }) as unknown as typeof fetch,
    });
    const result = await client.pullComments('team-1', 'p1', 2, 'W/"seq-2"');
    expect(seenIfNoneMatch).toBe('W/"seq-2"');
    expect(result.notModified).toBe(true);
    expect(result.comments).toEqual([]);
    expect(result.latestSeq).toBe(2);
  });
});

describe('VelaCliCollabClient', () => {
  it('uses the CLI transport when team/resource sync is already Vela-backed', () => {
    expect(shouldUseVelaCliCollabTransport({ OD_COLLAB_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_COLLAB_TRANSPORT: 'sdk' })).toBe(false);
    expect(shouldUseVelaCliCollabTransport({ OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_RESOURCE_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliCollabTransport({ OD_COLLAB_CLOUD_URL: 'http://fixture.local' })).toBe(false);
    expect(shouldUseVelaCliCollabTransport({})).toBe(false);
  });

  it('keeps an explicit VELA_PROFILE and AMR_HOME when spawning the CLI', () => {
    const env = buildVelaCollabEnv({
      OPEN_DESIGN_AMR_PROFILE: 'prod',
      VELA_PROFILE: 'local',
      AMR_HOME: '/tmp/od-collab-owner-amr',
      VELA_API_URL: 'http://127.0.0.1:18082',
    });

    expect(env.VELA_PROFILE).toBe('local');
    expect(env.AMR_HOME).toBe('/tmp/od-collab-owner-amr');
    expect(env.VELA_API_URL).toBe('http://127.0.0.1:18082');
  });

  it('uses vela collab commands for comments, directory, and presence', async () => {
    const calls: string[][] = [];
    const client = createVelaCliCollabClient({
      run: async (args) => {
        calls.push(args);
        if (args[0] === 'member' && args[1] === 'register') {
          return JSON.stringify({ member: { memberId: 'm-self', displayName: '麻薯', role: 'owner' } });
        }
        if (args[0] === 'comment' && args[1] === 'push') {
          return JSON.stringify({ seq: 7 });
        }
        if (args[0] === 'comment' && args[1] === 'pull') {
          return JSON.stringify({ latestSeq: 7, comments: [cloudComment('c1', { seq: 7 })] });
        }
        if (args[0] === 'presence' && args[1] === 'heartbeat') {
          return JSON.stringify({
            viewers: [
              {
                memberId: 'm-self',
                displayName: '麻薯',
                role: 'owner',
                filePath: 'Typography',
                activity: { label: '正在评论 Typography' },
                heartbeatAt: '2026-07-10T00:00:00.000Z',
              },
            ],
          });
        }
        return JSON.stringify({});
      },
    });

    await expect(client.registerMember('team-1', 'm-self', {
      displayName: '麻薯',
      role: 'owner',
    })).resolves.toEqual({ memberId: 'm-self', displayName: '麻薯', role: 'owner' });
    await expect(client.pushComment('team-1', 'p1', cloudComment('c1'))).resolves.toEqual({ seq: 7 });
    await expect(client.pullComments('team-1', 'p1', 0)).resolves.toMatchObject({
      latestSeq: 7,
      comments: [{ id: 'c1' }],
    });
    await expect(client.heartbeatPresence('p1', {
      member: { memberId: 'm-self', name: '麻薯', role: 'owner' },
      clientId: 'client-1',
      filePath: 'Typography',
      activity: { label: '正在评论 Typography' },
    })).resolves.toEqual([
      {
        memberId: 'm-self',
        name: '麻薯',
        role: 'owner',
        filePath: 'Typography',
        activity: { label: '正在评论 Typography' },
        heartbeatAt: '2026-07-10T00:00:00.000Z',
      },
    ]);

    expect(calls[0]).toEqual(['member', 'register', '--display-name', '麻薯', '--role', 'owner']);
    expect(calls[1]?.slice(0, 3)).toEqual(['comment', 'push', 'p1']);
    expect(JSON.parse(calls[1]![4]!)).toMatchObject({ id: 'c1' });
    expect(calls[2]).toEqual(['comment', 'pull', 'p1', '--since-seq', '0']);
    expect(calls[3]).toEqual([
      'presence',
      'heartbeat',
      'p1',
      '--client-id',
      'client-1',
      '--display-name',
      '麻薯',
      '--file-path',
      'Typography',
      '--activity-json',
      JSON.stringify({ label: '正在评论 Typography' }),
    ]);
  });
});
