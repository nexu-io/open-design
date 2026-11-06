// Synced comment merge ordering: the cloud `seq` is the sole sync cursor.
//
// Share P0 integration finding (2026-09-27): a share-page comment resolved at
// cloud seq 10 reverted to `open` after a daemon restart, because the legacy
// pull cursor lives in memory, the restarted daemon re-pulled from seq 0, and
// the merge substituted `Date.now()` for the share-page create's missing
// `updatedAt` — so the replayed create looked newest. Every replay (legacy
// pull after restart, member snapshot rebuild, relay echo) must be idempotent.
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  getProjectPreviewComment,
  insertConversation,
  insertProject,
  mergeSyncedPreviewComment,
  openDatabase,
  updatePreviewCommentStatus,
} from '../src/db.js';
import { parseMemberPage, type CollabCloudClient } from '../src/integrations/collab-cloud.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { createCommentInboundStore } from '../src/collab/comment-inbound-store.js';

type Db = ReturnType<typeof openDatabase>;

let tempDir: string | null = null;

afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function seededDb(): Db {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-sync-seq-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: 'p1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conv-local', projectId: 'p1', title: 'Chat', createdAt: 1, updatedAt: 1 });
  return db;
}

const CREATED_AT = 1_790_491_000_000;
const RESOLVED_AT = 1_790_492_165_565;

/** A share-page (user-authored) event exactly as the cloud replays it. */
function sharePageEvent(seq: number, patch: Partial<CollabCloudComment> = {}): CollabCloudComment {
  const event = {
    id: 'share-comment', projectId: 'p1', conversationId: 'conv-remote', memberId: '', seq,
    note: 'from the share page', filePath: 'index.html', elementId: 'hero', selector: '#hero',
    label: 'h1.hero', text: 'Hero', htmlHint: '<h1>', position: { x: 1, y: 2, width: 3, height: 4 },
    status: 'open', createdAt: CREATED_AT, authorKind: 'user', authorAppUserId: 'web-account',
    ...patch,
  } as CollabCloudComment;
  // Share-page creates carry no updatedAt at all.
  if (!('updatedAt' in patch)) delete (event as Partial<CollabCloudComment>).updatedAt;
  return event;
}

const merge = (db: Db, comment: CollabCloudComment) => mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment);
const stored = (db: Db) => getProjectPreviewComment(db, 'p1', 'share-comment');

/** The daemon clock moves forward between pulls, as it does across a restart. */
function clockAt(ms: number) { vi.spyOn(Date, 'now').mockReturnValue(ms); }

describe('synced comment merge is ordered by cloud seq', () => {
  it('keeps a resolve when the create (no updatedAt) is replayed from seq 0', () => {
    const db = seededDb();
    const create = sharePageEvent(3);
    const resolve = sharePageEvent(10, { status: 'resolved', updatedAt: RESOLVED_AT });
    clockAt(RESOLVED_AT - 60_000);
    expect(merge(db, create)).toBe('changed');
    clockAt(RESOLVED_AT + 1_000);
    expect(merge(db, resolve)).toBe('changed');
    // Daemon restart: the in-memory cursor is gone, the pull replays 0..10.
    clockAt(RESOLVED_AT + 170_000);
    expect(merge(db, create)).toBe('unchanged');
    expect(merge(db, resolve)).toBe('unchanged');
    expect(stored(db)).toMatchObject({ status: 'resolved', updatedAt: RESOLVED_AT });
  });

  it('never stamps the local clock on a record without updatedAt', () => {
    const db = seededDb();
    clockAt(RESOLVED_AT + 999_999);
    merge(db, sharePageEvent(3));
    expect(stored(db)?.updatedAt).toBe(CREATED_AT);
  });

  it('keeps an edit when older revisions are replayed, even without timestamps', () => {
    const db = seededDb();
    clockAt(RESOLVED_AT);
    merge(db, sharePageEvent(3, { text: 'v1' }));
    clockAt(RESOLVED_AT + 1_000);
    expect(merge(db, sharePageEvent(5, { text: 'v2' }))).toBe('changed');
    clockAt(RESOLVED_AT + 170_000);
    expect(merge(db, sharePageEvent(3, { text: 'v1' }))).toBe('unchanged');
    expect(merge(db, sharePageEvent(4, { text: 'v1.5' }))).toBe('unchanged');
    expect(stored(db)?.text).toBe('v2');
  });

  it('ends deleted after a full replay of create then tombstone', () => {
    const db = seededDb();
    merge(db, sharePageEvent(3));
    expect(merge(db, sharePageEvent(7, { deleted: true }))).toBe('changed');
    for (const event of [sharePageEvent(3), sharePageEvent(7, { deleted: true })]) merge(db, event);
    expect(stored(db)).toBeNull();
  });

  it('recovers a legacy row that has no stored seq and a clock-inflated updatedAt', () => {
    const db = seededDb();
    merge(db, sharePageEvent(3));
    // The pre-fix state on disk: reverted to open, stamped with restart time,
    // no revision seq recorded.
    db.prepare(`UPDATE preview_comments SET status = 'open', updated_at = ?, cloud_revision_seq = NULL
      WHERE id = 'share-comment'`).run(RESOLVED_AT + 166_359);
    merge(db, sharePageEvent(3));
    merge(db, sharePageEvent(10, { status: 'resolved', updatedAt: RESOLVED_AT }));
    expect(stored(db)?.status).toBe('resolved');
    // …and the recovered row is replay-safe from then on.
    merge(db, sharePageEvent(3));
    expect(stored(db)?.status).toBe('resolved');
  });

  it('still honours updatedAt last-writer-wins for a newer seq (unrelayed local edit)', () => {
    const db = seededDb();
    merge(db, sharePageEvent(3, { updatedAt: CREATED_AT }));
    clockAt(RESOLVED_AT + 5_000);
    updatePreviewCommentStatus(db, 'p1', 'conv-local', 'share-comment', 'resolved');
    // A teammate edit written before ours, relayed at a higher seq.
    expect(merge(db, sharePageEvent(4, { note: 'older edit', updatedAt: RESOLVED_AT }))).toBe('unchanged');
    expect(stored(db)).toMatchObject({ status: 'resolved', note: 'from the share page' });
  });

  it('treats the relay echo of our own push as the same revision', () => {
    const db = seededDb();
    merge(db, sharePageEvent(3));
    clockAt(RESOLVED_AT);
    updatePreviewCommentStatus(db, 'p1', 'conv-local', 'share-comment', 'resolved');
    // Echo of our push (cloud seq 11) carries our own updatedAt.
    expect(merge(db, sharePageEvent(11, { status: 'resolved', updatedAt: RESOLVED_AT }))).toBe('unchanged');
    // A restart replays the whole stream: the share-page create cannot reopen it.
    expect(merge(db, sharePageEvent(3))).toBe('unchanged');
    expect(stored(db)?.status).toBe('resolved');
  });

  it('without a seq, a record with no updatedAt never overwrites a stored row', () => {
    const db = seededDb();
    merge(db, sharePageEvent(3, { status: 'resolved', updatedAt: RESOLVED_AT }));
    expect(merge(db, sharePageEvent(0))).toBe('unchanged');
    expect(stored(db)?.status).toBe('resolved');
  });

  it('pin_seq stays the create seq; the revision seq does not renumber pins', () => {
    const db = seededDb();
    merge(db, sharePageEvent(3));
    merge(db, sharePageEvent(10, { status: 'resolved', updatedAt: RESOLVED_AT }));
    expect(stored(db)?.pinSeq).toBe(3);
  });
});

describe('member page replay', () => {
  const SCOPE = { workspaceId: 'ws-1', memberId: 'm-self', teamId: 'ws-1', projectId: 'p1' };
  const EPOCH = 'k3J0cV9aQm1zYQ';
  const SCOPE_TOKEN = 'c3ls.QxTeamProjectMember';
  const memberEvent = (seq: number, patch: Partial<CollabCloudComment> = {}): CollabCloudComment => {
    const { authorAppUserId: _shareAccount, ...base } = sharePageEvent(seq);
    return { ...base, id: 'member-comment', memberId: 'm-author', authorKind: 'member', updatedAt: CREATED_AT, ...patch };
  };
  const snapshot = (comments: unknown[], resume: string, epoch = EPOCH) => parseMemberPage({
    mode: 'snapshot', comments, hasMore: false, complete: true, nextPageToken: null,
    resumeToken: resume, scopeToken: SCOPE_TOKEN, watermarkSeq: 10, scanThroughSeq: 10,
    handoff: { sinceSeq: 10, resumeToken: resume, scopeToken: SCOPE_TOKEN }, streamEpoch: epoch,
  }, 'snapshot', 'p1');
  const streamMerge = (db: Db, epoch = EPOCH) => (comment: CollabCloudComment) =>
    mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment, { stream: `member:${SCOPE.teamId}:${epoch}` });

  // Member records always carry updatedAt (the page parser skips any that do
  // not), so this path is guarded by seq and by last-writer-wins alike.
  it('a rebuild snapshot carrying an older revision does not undo a newer one', () => {
    const db = seededDb();
    const store = createCommentInboundStore(db);
    const mergeInto = streamMerge(db);
    clockAt(RESOLVED_AT - 60_000);
    expect(store.apply({
      scope: SCOPE, query: { mode: 'snapshot' },
      page: snapshot([memberEvent(3), memberEvent(10, { status: 'resolved', updatedAt: RESOLVED_AT })], 'c3l1.r1'),
      merge: mergeInto,
    })).toMatchObject({ status: 'committed' });
    store.reset(SCOPE);
    clockAt(RESOLVED_AT + 170_000);
    // Even a replayed older revision with a later clock cannot win: seq decides.
    expect(store.apply({
      scope: SCOPE, query: { mode: 'snapshot' },
      page: snapshot([memberEvent(3, { updatedAt: RESOLVED_AT + 1 })], 'c3l1.r2'), merge: mergeInto,
    })).toMatchObject({ status: 'committed', changed: 0, skipped: 0 });
    expect(getProjectPreviewComment(db, 'p1', 'member-comment')?.status).toBe('resolved');
  });

  it('a renumbered stream (new epoch) is not compared against the old seq', () => {
    const db = seededDb();
    const store = createCommentInboundStore(db);
    store.apply({
      scope: SCOPE, query: { mode: 'snapshot' },
      page: snapshot([memberEvent(10, { status: 'resolved', updatedAt: RESOLVED_AT })], 'c3l1.r1'),
      merge: streamMerge(db),
    });
    store.reset(SCOPE);
    // The rebuilt stream renumbers from 1; a genuinely newer reopen at seq 2
    // must still land (ordered by updatedAt across streams).
    store.apply({
      scope: SCOPE, query: { mode: 'snapshot' },
      page: snapshot([memberEvent(2, { status: 'open', updatedAt: RESOLVED_AT + 5 })], 'c3l1.r2', 'rebuiltStream01'),
      merge: streamMerge(db, 'rebuiltStream01'),
    });
    expect(getProjectPreviewComment(db, 'p1', 'member-comment')?.status).toBe('open');
    // …and from then on the new stream's seq guards replays.
    expect(streamMerge(db, 'rebuiltStream01')(memberEvent(1, { status: 'resolved', updatedAt: RESOLVED_AT + 9 })))
      .toBe('unchanged');
  });
});

describe('legacy pull after a daemon restart', () => {
  function teamContext(): WorkspaceCollabContext {
    return {
      workspaceId: 'ws-1', workspaceType: 'team', workspaceMemberId: 'm-self', role: 'owner',
      memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
      providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
      permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
      teamId: 'team-1', displayName: 'Team',
    } as WorkspaceCollabContext;
  }

  it('replays from seq 0 without reopening a resolved share-page comment', async () => {
    const db = seededDb();
    const events = [sharePageEvent(3), sharePageEvent(10, { status: 'resolved', updatedAt: RESOLVED_AT })];
    const sinceSeqs: number[] = [];
    const client = {
      pullComments: async (_teamId: string, _projectId: string, sinceSeq: number) => {
        sinceSeqs.push(sinceSeq);
        return { comments: events.filter((event) => event.seq > sinceSeq), latestSeq: 10, etag: null, notModified: false };
      },
    } as unknown as CollabCloudClient;
    const boot = () => createCollabCloudService({
      client, listProjectIds: () => [], resolveLocalConversationId: () => 'conv-local',
      mergeComment: ({ projectId, conversationId, comment, stream }) =>
        mergeSyncedPreviewComment(db, projectId, conversationId, comment, { stream }),
    });
    clockAt(RESOLVED_AT + 1_000);
    const first = boot();
    await first.pullProject('p1', teamContext());
    first.dispose();
    expect(stored(db)?.status).toBe('resolved');
    clockAt(RESOLVED_AT + 170_000);
    const restarted = boot();
    await restarted.pullProject('p1', teamContext());
    restarted.dispose();
    // The legacy cursor is in memory, so the restart replays from zero.
    expect(sinceSeqs).toEqual([0, 0]);
    expect(stored(db)).toMatchObject({ status: 'resolved', updatedAt: RESOLVED_AT });
  });
});
