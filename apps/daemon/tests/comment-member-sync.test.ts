// C3-LITE member comment paging, end to end on the daemon side:
// real HTTP adapter (fetch stub) → drain in collab-cloud-service → atomic
// SQLite page commit in comment-inbound-store → preview_comments.
//
// The fake cloud below reproduces the response shapes and paging rules of
// C3-LITE §3 (snapshot = latest event per comment with seq ≤ W, comment_id
// DESCENDING keyset; incremental = seq ascending, scans every author kind but
// returns member events only; minimal tombstones; stateless `c3l1.` tokens)
// and the §4 error bodies.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  closeDatabase,
  confirmPreviewCommentPinSeq,
  getProjectPreviewComment,
  insertConversation,
  insertProject,
  listPreviewComments,
  mergeSyncedPreviewComment,
  openDatabase,
  upsertPreviewComment,
} from '../src/db.js';
import { createCollabCloudClient, parseMemberPage } from '../src/integrations/collab-cloud.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import {
  createCommentInboundStore,
  readMemberSyncCursor,
  type MemberSyncScope,
} from '../src/collab/comment-inbound-store.js';

type Db = ReturnType<typeof openDatabase>;
type CloudEvent = { seq: number; commentId: string; authorKind: 'member' | 'user'; memberId: string; payload: Record<string, unknown> };

const EPOCH = 'k3J0cV9aQm1zYQ';
const SCOPE_TOKEN = 'c3ls.QxTeamProjectMember';
const token = (body: Record<string, unknown>) => `c3l1.${Buffer.from(JSON.stringify(body)).toString('base64url')}`;
const readToken = (value: string) => JSON.parse(Buffer.from(value.slice(5), 'base64url').toString()) as Record<string, any>;

/** Stored payload as a member daemon pushes it (previewCommentToCloud shape). */
function payload(id: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, projectId: 'p1', conversationId: 'conv-remote', memberId: 'm-author', seq: 0,
    note: `note ${id}`, filePath: 'index.html', elementId: 'hero', selector: '#hero', label: 'h1.hero',
    text: 'Hero', htmlHint: '<h1>', position: { x: 1, y: 2, width: 3, height: 4 }, status: 'open',
    createdAt: 100, updatedAt: 100, ...patch,
  };
}

class FakeCloud {
  events: CloudEvent[] = [];
  epoch = EPOCH;
  requests: URLSearchParams[] = [];
  legacyRequests = 0;
  /** Override one request's response (status + JSON body). */
  failNext: Array<{ status: number; body: unknown }> = [];
  /** Awaited after computing, before returning, a paged response. */
  gate: (() => Promise<void>) | null = null;

  get head() { return this.events.length; }
  write(commentId: string, patch: Record<string, unknown> = {}, authorKind: 'member' | 'user' = 'member') {
    const seq = this.head + 1;
    this.events.push({ seq, commentId, authorKind, memberId: 'm-author', payload: payload(commentId, { updatedAt: 100 + seq, ...patch }) });
    return seq;
  }
  /** The stream row was recreated: new epoch, only `keep` survive (renumbered). */
  rebuildStream(keep: string[], epoch = 'rebuiltStream01') {
    const survivors = this.events.filter(e => keep.includes(e.commentId));
    this.events = survivors.map((e, index) => ({ ...e, seq: index + 1 }));
    this.epoch = epoch;
  }
  remove(commentId: string, authorKind: 'member' | 'user' = 'member') {
    this.events.push({ seq: this.head + 1, commentId, authorKind, memberId: 'm-deleter', payload: { id: commentId, deleted: true } });
  }
  private project(event: CloudEvent) {
    if (event.payload.deleted === true) return { id: event.commentId, projectId: 'p1', seq: event.seq, deleted: true };
    const { authorKind: _k, author: _a, ...body } = event.payload;
    return { ...body, id: event.commentId, projectId: 'p1', seq: event.seq, memberId: event.memberId,
      authorKind: 'member', authorDisplayName: 'Ada', author: { displayName: 'Ada' } };
  }
  pagedResponse(query: URLSearchParams): { status: number; body: unknown } {
    const failure = this.failNext.shift();
    if (failure) return failure;
    const mode = query.get('mode');
    const limit = Number(query.get('limit') ?? 100);
    const pageToken = query.get('pageToken');
    const resumeToken = query.get('resumeToken');
    const cursor = pageToken ?? resumeToken;
    const decoded = cursor ? readToken(cursor) : null;
    // Server rule (assertCursorCurrent): position 0 is valid under any epoch.
    const position = decoded ? (decoded.sinceSeq ?? decoded.snapshotAt) : 0;
    if (decoded && position !== 0 && decoded.streamEpoch !== this.epoch) {
      return { status: 409, body: { error: 'CURSOR_STALE', reason: 'stream epoch changed' } };
    }
    const base = { scopeToken: SCOPE_TOKEN, streamEpoch: this.epoch, latestSeq: this.head };
    if (mode === 'snapshot') {
      const W = decoded?.snapshotAt ?? this.head;
      const latest = new Map<string, CloudEvent>();
      for (const event of this.events) if (event.seq <= W) latest.set(event.commentId, event);
      const ordered = [...latest.values()].sort((a, b) => (a.commentId < b.commentId ? 1 : -1))
        .filter(event => decoded?.afterCommentId === undefined || event.commentId < decoded.afterCommentId);
      const rows = ordered.slice(0, limit);
      const hasMore = ordered.length > limit;
      const resume = hasMore ? null : token({ mode: 'incremental', sinceSeq: W, streamEpoch: this.epoch });
      return { status: 200, body: {
        mode: 'snapshot', comments: rows.filter(e => e.authorKind === 'member').map(e => this.project(e)),
        hasMore, complete: !hasMore,
        nextPageToken: hasMore ? token({ mode: 'snapshot', snapshotAt: W, afterCommentId: rows.at(-1)!.commentId, streamEpoch: this.epoch }) : null,
        resumeToken: resume, ...base, watermarkSeq: W, scanThroughSeq: W,
        handoff: resume ? { sinceSeq: W, resumeToken: resume, scopeToken: SCOPE_TOKEN } : null,
        nextSeq: hasMore ? null : W, snapshotAt: W,
      } };
    }
    const since = decoded!.sinceSeq as number;
    const head = this.head;
    const range = this.events.filter(e => e.seq > since && e.seq <= head);
    const rows = range.slice(0, limit);
    const hasMore = range.length > limit;
    const scanThroughSeq = hasMore ? rows.at(-1)!.seq : head;
    const next = token({ mode: 'incremental', sinceSeq: scanThroughSeq, streamEpoch: this.epoch });
    return { status: 200, body: {
      mode: 'incremental', comments: rows.filter(e => e.authorKind === 'member').map(e => this.project(e)),
      hasMore, complete: !hasMore, nextPageToken: hasMore ? next : null, resumeToken: hasMore ? null : next,
      ...base, watermarkSeq: head, scanThroughSeq, handoff: null, nextSeq: scanThroughSeq, snapshotAt: null,
    } };
  }
  legacyResponse(sinceSeq: number) {
    this.legacyRequests += 1;
    const comments = this.events.filter(e => e.seq > sinceSeq).map(e => (
      e.payload.deleted === true
        ? { id: e.commentId, projectId: 'p1', seq: e.seq, deleted: true }
        : { ...e.payload, seq: e.seq, authorKind: e.authorKind, memberId: e.authorKind === 'user' ? '' : e.memberId }
    ));
    return { comments, latestSeq: this.head };
  }
  fetch = async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith('/api/v1/collab/projects/')) {
      this.requests.push(url.searchParams);
      // The response is computed first: a held request models one whose head
      // was already read when a concurrent write committed.
      const { status, body } = this.pagedResponse(url.searchParams);
      if (this.gate) await this.gate();
      return new Response(JSON.stringify(body), { status });
    }
    return new Response(JSON.stringify(this.legacyResponse(Number(url.searchParams.get('sinceSeq') ?? 0))), { status: 200 });
  };
}

let tempDir: string | null = null;
afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function seededDb(): Db {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-member-sync-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: 'p1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conv-local', projectId: 'p1', title: 'Chat', createdAt: 1, updatedAt: 1 });
  return db;
}

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1', workspaceType: 'team', workspaceMemberId: 'm-self', role: 'member',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
    providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
    teamId: 'team-1', displayName: 'Self',
  };
}
const SCOPE: MemberSyncScope = { workspaceId: 'ws-1', memberId: 'm-self', teamId: 'team-1', projectId: 'p1' };

function harness(db: Db, cloud: FakeCloud, options: {
  merge?: (id: string) => void;
  /** Current bound context for the project (the in-flight scope witness). */
  resolve?: () => WorkspaceCollabContext | null;
  shared?: () => boolean;
  now?: () => number;
} = {}) {
  const onMerged = vi.fn();
  const onError = vi.fn();
  const onMemberSyncRebuildRequired = vi.fn();
  const merged: string[] = [];
  const service = createCollabCloudService({
    client: createCollabCloudClient({ config: { baseUrl: 'https://cloud.test', token: null }, fetch: cloud.fetch as typeof fetch }),
    memberCommentStore: createCommentInboundStore(db),
    listProjectIds: () => [],
    resolveLocalConversationId: () => 'conv-local',
    mergeComment: ({ projectId, conversationId, comment }) => {
      options.merge?.(comment.id);
      merged.push(comment.id);
      return mergeSyncedPreviewComment(db, projectId, conversationId, comment);
    },
    ...(options.resolve ? { resolveProjectWorkspaceContext: async () => options.resolve!() } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.shared ? { isMemberSyncProjectShared: () => options.shared!() } : {}),
    onMerged, onError, onMemberSyncRebuildRequired,
  });
  return { service, onMerged, onError, onMemberSyncRebuildRequired, merged };
}

const ids = (db: Db) => listPreviewComments(db, 'p1', 'conv-local').map(c => c.id).sort();
const pad = (n: number) => `c${String(n).padStart(3, '0')}`;

describe('C3-LITE member page drain', () => {
  it('drains a >100 comment snapshot across pages, then hands off to an incremental round', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 250; i += 1) cloud.write(pad(i));
    const { service, onMerged } = harness(db, cloud);

    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);

    expect(ids(db)).toHaveLength(250);
    const modes = cloud.requests.map(q => q.get('mode'));
    expect(modes).toEqual(['snapshot', 'snapshot', 'snapshot', 'incremental']);
    expect(cloud.requests.every(q => q.get('authorKinds') === 'member' && q.get('limit') === '100')).toBe(true);
    // One notification for the whole drain round, not one per page.
    expect(onMerged.mock.calls.map(([arg]) => arg.inserted)).toEqual([250]);
    const cursor = readMemberSyncCursor(db, SCOPE)!;
    expect(cursor).toMatchObject({ phase: 'incremental', pageToken: null, streamEpoch: EPOCH, scopeToken: SCOPE_TOKEN, watermarkSeq: 250 });
    expect(readToken(cursor.resumeToken!)).toMatchObject({ sinceSeq: 250 });
    // pin_seq is the cloud seq; memberId is the ORIGINAL author.
    expect(getProjectPreviewComment(db, 'p1', 'c007')).toMatchObject({ authorMemberId: 'm-author', pinSeq: 8 });
  });

  it('picks up a write committed during the snapshot through the handoff resume token', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 120; i += 1) cloud.write(pad(i));
    let served = 0;
    cloud.gate = async () => {
      served += 1;
      if (served === 2) { cloud.write('z-late'); cloud.write(pad(5), { note: 'edited during snapshot', updatedAt: 999 }); }
    };
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toContain('z-late');
    expect(getProjectPreviewComment(db, 'p1', pad(5))?.note).toBe('edited during snapshot');
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['snapshot', 'snapshot', 'incremental']);
  });

  it('continues through an empty page with hasMore:true', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext()); // empty snapshot, W=0
    for (let i = 0; i < 150; i += 1) cloud.write(`share-${i}`, {}, 'user');
    cloud.write('member-after-shares');
    cloud.requests = [];

    await service.pullProject('p1', teamContext());

    expect(cloud.requests).toHaveLength(2);
    expect(getProjectPreviewComment(db, 'p1', 'member-after-shares')).toBeTruthy();
    expect(readToken(readMemberSyncCursor(db, SCOPE)!.resumeToken!).sinceSeq).toBe(151);
  });

  it('applies a minimal tombstone and treats a tombstone for an unknown comment as a no-op', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('keep');
    cloud.write('gone');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toEqual(['gone', 'keep']);

    cloud.remove('gone');
    cloud.remove('never-seen');
    await service.pullProject('p1', teamContext());

    expect(ids(db)).toEqual(['keep']);
    expect(readToken(readMemberSyncCursor(db, SCOPE)!.resumeToken!).sinceSeq).toBe(4);
  });

  it('snapshot replays historical tombstones without touching unknown ids', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    cloud.remove('a');
    cloud.write('b');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toEqual(['b']);
  });

  it('deletes rows with a pin_seq on a remote tombstone, even before our push is confirmed (67 #5)', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    const local = (id: string) => upsertPreviewComment(db, 'p1', 'conv-local', {
      id, note: id, target: { filePath: 'index.html', elementId: 'e', selector: '#e', label: 'E', position: { x: 0, y: 0, width: 1, height: 1 } },
    }, { pinPendingCloudConfirm: true });
    local('pushed-confirmed');
    local('pending-push');
    local('no-pin');
    expect(confirmPreviewCommentPinSeq(db, 'p1', 'pushed-confirmed', 41)).toBe(true);
    db.prepare('UPDATE preview_comments SET pin_seq=NULL WHERE id=?').run('no-pin');
    for (const id of ['pushed-confirmed', 'pending-push', 'no-pin']) cloud.remove(id);

    await service.pullProject('p1', teamContext());

    // A teammate may delete our comment before our push's seq is written back.
    expect(ids(db)).toEqual(['no-pin']);
  });

  it('skips one malformed stored comment, applies the rest of the page and advances', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('ok-1');
    cloud.write('broken', { position: undefined, updatedAt: undefined });
    cloud.write('legacy-sparse', { conversationId: undefined, label: undefined, htmlHint: undefined, text: undefined });
    const { service, onError } = harness(db, cloud);

    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);

    expect(ids(db)).toEqual(['legacy-sparse', 'ok-1']);
    const cursor = readMemberSyncCursor(db, SCOPE)!;
    expect(cursor).toMatchObject({ phase: 'incremental', skippedCount: 1 });
    expect(String(onError.mock.calls.at(0)?.[0])).toMatch(/broken/);
    // The next incremental round does not re-request the skipped item.
    cloud.requests = [];
    await service.pullProject('p1', teamContext());
    expect(readMemberSyncCursor(db, SCOPE)!.skippedCount).toBe(1);
  });

  it.each([
    [409, 'CURSOR_STALE'],
    [409, 'SCOPE_CHANGED'],
    [400, 'INVALID_CURSOR'],
  ])('rebuilds on %s %s: fresh snapshot in the same pull, stale cloud rows removed, local-only kept', async (status, code) => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    cloud.write('b');
    const { service, onMemberSyncRebuildRequired } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toEqual(['a', 'b']);
    // A comment written here and never synced (pin_seq assigned locally).
    upsertPreviewComment(db, 'p1', 'conv-local', {
      id: 'local-only', note: 'mine', target: { filePath: 'index.html', elementId: 'e', selector: '#e', label: 'E', position: { x: 0, y: 0, width: 1, height: 1 } },
    });
    expect(getProjectPreviewComment(db, 'p1', 'local-only')?.pinSeq).not.toBeNull();
    // The cloud no longer has 'b' at all (no tombstone): only a rebuild can tell.
    cloud.events = cloud.events.filter(e => e.commentId !== 'b');
    cloud.write('c');
    cloud.failNext.push({ status, body: { error: code, reason: 'test' } });
    let visibleDuringSnapshot: string[] = [];
    cloud.gate = async () => {
      if (cloud.requests.at(-1)?.get('mode') === 'snapshot') visibleDuringSnapshot = ids(db);
    };
    cloud.requests = [];

    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);

    expect(onMemberSyncRebuildRequired).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', code }));
    // Existing rows stay visible while the rebuild snapshot is read.
    expect(visibleDuringSnapshot).toEqual(['a', 'b', 'local-only']);
    expect(ids(db)).toEqual(['a', 'c', 'local-only']);
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['incremental', 'snapshot', 'incremental']);
    expect(cloud.requests[1]!.get('pageToken')).toBeNull();
    expect(readMemberSyncCursor(db, SCOPE)).toMatchObject({ phase: 'incremental', pageToken: null });
    // Not latched: the next pull is an ordinary incremental round.
    cloud.gate = null;
    cloud.write('d');
    cloud.requests = [];
    await service.pullProject('p1', teamContext());
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['incremental']);
    expect(ids(db)).toContain('d');
  });

  it('rebuilds after a stream recreation (epoch change) and prunes rows the new stream lacks', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('kept');
    cloud.write('lost');
    const { service, onMemberSyncRebuildRequired } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    cloud.rebuildStream(['kept']);
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(onMemberSyncRebuildRequired).toHaveBeenCalledWith(expect.objectContaining({ code: 'CURSOR_STALE' }));
    expect(ids(db)).toEqual(['kept']);
    expect(readMemberSyncCursor(db, SCOPE)).toMatchObject({ streamEpoch: 'rebuiltStream01', phase: 'incremental' });
  });

  it('delivers writes and deletes committed during a rebuild snapshot through the handoff, without pruning them', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 150; i += 1) cloud.write(pad(i));
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    cloud.failNext.push({ status: 409, body: { error: 'CURSOR_STALE', reason: 'test' } });
    let snapshotPages = 0;
    cloud.gate = async () => {
      if (cloud.requests.at(-1)?.get('mode') !== 'snapshot') return;
      snapshotPages += 1;
      if (snapshotPages === 1) {
        cloud.write('z-during');           // after W: not in the snapshot
        cloud.remove(pad(3));               // a known row, deleted after W
        cloud.write(pad(140), { note: 'edited during', updatedAt: 9_999 });
      }
    };
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(snapshotPages).toBe(2);
    expect(ids(db)).toContain('z-during');
    expect(ids(db)).not.toContain(pad(3));
    expect(ids(db)).toHaveLength(150);
    expect(getProjectPreviewComment(db, 'p1', pad(140))?.note).toBe('edited during');
  });

  it('never prunes a known row whose snapshot copy was skipped as malformed', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('fine');
    cloud.write('flaky');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    // The stored payload for 'flaky' becomes unreadable; a rebuild snapshot skips it.
    cloud.write('flaky', { position: undefined, updatedAt: undefined });
    cloud.failNext.push({ status: 409, body: { error: 'CURSOR_STALE', reason: 'test' } });
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toEqual(['fine', 'flaky']);
  });

  it('restarts a rebuild snapshot safely after a crash mid-snapshot: no partial deletion, prune on completion', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 150; i += 1) cloud.write(pad(i));
    cloud.write('stale');
    let crash = false;
    const first = harness(db, cloud, { merge: id => { if (crash && id === pad(40)) throw new Error('killed'); } });
    await first.service.pullProject('p1', teamContext());
    cloud.events = cloud.events.filter(e => e.commentId !== 'stale');
    cloud.failNext.push({ status: 409, body: { error: 'CURSOR_STALE', reason: 'test' } });
    crash = true;
    // Descending snapshot: page 1 holds c149..c050 (and no 'stale' - gone), page 2 dies on c040.
    await expect(first.service.pullProject('p1', teamContext())).resolves.toBe(false);
    const mid = readMemberSyncCursor(db, SCOPE)!;
    expect(mid.phase).toBe('snapshot');
    expect(mid.pageToken).not.toBeNull();
    expect(ids(db)).toContain('stale');

    closeDatabase();
    const reopened = openDatabase(tempDir!);
    crash = false;
    const restarted = harness(reopened, cloud);
    cloud.requests = [];
    await expect(restarted.service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(cloud.requests[0]!.get('pageToken')).toBe(mid.pageToken);
    expect(ids(reopened)).not.toContain('stale');
    expect(ids(reopened)).toHaveLength(150);
    expect(readMemberSyncCursor(reopened, SCOPE)).toMatchObject({ phase: 'incremental' });
  });

  it('does not loop when the rebuild snapshot itself is refused; backs off instead', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let clock = 1_000_000;
    const { service, onError } = harness(db, cloud, { now: () => clock });
    await service.pullProject('p1', teamContext());
    cloud.failNext.push(
      { status: 409, body: { error: 'CURSOR_STALE', reason: 'test' } },
      { status: 409, body: { error: 'SCOPE_CHANGED', reason: 'still refused' } },
    );
    cloud.requests = [];
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['incremental', 'snapshot']);
    expect(onError).toHaveBeenCalled();
    // Backed off: the next poll does not hit the paged route at all.
    cloud.requests = [];
    await service.pullProject('p1', teamContext());
    expect(cloud.requests).toHaveLength(0);
    clock += 10 * 60_000;
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['snapshot', 'incremental']);
  });

  it('replays the legacy stream when paging stops covering members after having filtered them', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('first');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext()); // drained: legacy skipped 'first'
    cloud.write('second');
    await service.pullProject('p1', teamContext()); // drained again: legacy cursor now past 'second'
    db.prepare("DELETE FROM preview_comments WHERE id='second'").run();
    cloud.failNext.push({ status: 503, body: { error: 'UNAVAILABLE', reason: 'test' } });
    await service.pullProject('p1', teamContext());
    // Legacy restarted from zero, so the member comment it skipped earlier returns.
    expect(ids(db)).toEqual(['first', 'second']);
  });

  it('keeps delivering member comments through the legacy pull when paged mode is unsupported', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('member-1');
    // An older server ignores `mode` and answers with the legacy body.
    cloud.failNext.push({ status: 200, body: { comments: [], latestSeq: 1 } });
    const { service, onError } = harness(db, cloud);
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Invalid member page response/) }));
    expect(ids(db)).toEqual(['member-1']);
  });

  it('continues after a first snapshot taken before the stream existed (epoch "0")', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.epoch = '0';
    const { service, onMemberSyncRebuildRequired } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(readMemberSyncCursor(db, SCOPE)?.streamEpoch).toBe('0');
    // The first comment creates the stream; position 0 is valid under any epoch.
    cloud.epoch = EPOCH;
    cloud.write('first-ever');
    await service.pullProject('p1', teamContext());
    expect(onMemberSyncRebuildRequired).not.toHaveBeenCalled();
    expect(readMemberSyncCursor(db, SCOPE)).toMatchObject({ streamEpoch: EPOCH });
    expect(ids(db)).toEqual(['first-ever']);
  });

  it('treats 400 INVALID_PAGE_REQUEST as an error, not a rebuild', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.failNext.push({ status: 400, body: { error: 'INVALID_PAGE_REQUEST', reason: 'limit' } });
    const { service, onError, onMemberSyncRebuildRequired } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(onMemberSyncRebuildRequired).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: 'INVALID_PAGE_REQUEST' }));
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
  });

  it('keeps the cursor on the last committed page when a crash interrupts the drain, then resumes there', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 250; i += 1) cloud.write(pad(i));
    let crash = true;
    // Descending snapshot: page 2 holds c149..c050. The fault hits once.
    const { service, onMerged } = harness(db, cloud, { merge: id => { if (crash && id === pad(100)) { crash = false; throw new Error('disk full'); } } });

    // A failed drain is not a redeemed wake: the caller must keep its mark.
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);

    const cursor = readMemberSyncCursor(db, SCOPE)!;
    expect(cursor.phase).toBe('snapshot');
    expect(readToken(cursor.pageToken!)).toMatchObject({ afterCommentId: pad(150) });
    // Page 1 landed whole; page 2's rows were rolled back with its cursor.
    // The legacy pull covered the gap meanwhile, so no comment is missing.
    expect(ids(db)).toHaveLength(250);
    // Page 1's committed rows and the legacy gap fill share one notification.
    expect(onMerged.mock.calls.map(([arg]) => arg.inserted)).toEqual([250]);

    cloud.requests = [];
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(cloud.requests[0]!.get('pageToken')).toBe(cursor.pageToken);
    expect(readMemberSyncCursor(db, SCOPE)).toMatchObject({ phase: 'incremental', pageToken: null });
  });

  it('notifies the web once per drain round, counting member pages and share-page comments together', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 250; i += 1) cloud.write(pad(i));
    cloud.write('share-1', { memberId: '' }, 'user');
    const { service, onMerged } = harness(db, cloud);

    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);

    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['snapshot', 'snapshot', 'snapshot', 'incremental']);
    expect(onMerged.mock.calls).toEqual([[{ projectId: 'p1', inserted: 251 }]]);
    // A round that changes nothing stays silent.
    await service.pullProject('p1', teamContext());
    expect(onMerged).toHaveBeenCalledTimes(1);
  });

  it('reports a failing merge listener without failing the round', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    const { service, onMerged, onError } = harness(db, cloud);
    const listenerError = new Error('sink closed');
    onMerged.mockImplementation(() => { throw listenerError; });

    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(onError).toHaveBeenCalledWith(listenerError);
    expect(ids(db)).toEqual(['a']);
  });

  it('notifies for rows a round committed before its scope was lost', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    for (let i = 0; i < 150; i += 1) cloud.write(pad(i));
    let current: WorkspaceCollabContext | null = teamContext();
    let served = 0;
    // The account switches while page 2 is in flight: page 1 already committed.
    cloud.gate = async () => { served += 1; if (served === 2) current = { ...teamContext(), workspaceMemberId: 'm-other' }; };
    const { service, onMerged } = harness(db, cloud, { resolve: () => current });

    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);

    expect(ids(db)).toHaveLength(100);
    expect(onMerged.mock.calls).toEqual([[{ projectId: 'p1', inserted: 100 }]]);
  });

  it('never advances the cursor on a failed transport call', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    const before = readMemberSyncCursor(db, SCOPE);
    cloud.write('b');
    cloud.failNext.push({ status: 503, body: { error: 'UNAVAILABLE' } });
    await service.pullProject('p1', teamContext());
    expect(readMemberSyncCursor(db, SCOPE)).toEqual(before);
  });

  it('runs one trailing drain when a wake arrives during a pull', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('before');
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let served = 0;
    // Hold the handoff incremental page: its head was read before 'during'.
    cloud.gate = async () => { served += 1; if (served === 2) await held; };
    const { service } = harness(db, cloud);

    const running = service.pullProject('p1', teamContext());
    await vi.waitFor(() => expect(cloud.requests).toHaveLength(2));
    cloud.write('during');
    const wake = service.pullProject('p1', teamContext());
    const extraWake = service.pullProject('p1', teamContext());
    release();

    await expect(Promise.all([running, wake, extraWake])).resolves.toEqual([true, true, true]);
    expect(ids(db)).toEqual(['before', 'during']);
    // Two coalesced wakes buy exactly one extra drain (snapshot+incremental, then one incremental).
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['snapshot', 'incremental', 'incremental']);
  });

  it('replaying an already applied state produces no second merge notification', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    cloud.write('b');
    const { service, onMerged } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(onMerged).toHaveBeenCalledTimes(1);
    // Same events arriving again (e.g. a rebuild snapshot) are LWW no-ops.
    await service.pullProject('p1', teamContext());
    db.prepare('DELETE FROM comment_member_sync_cursor').run();
    await service.pullProject('p1', teamContext());
    expect(onMerged).toHaveBeenCalledTimes(1);
  });

  it('keeps share-page (user) comments on the legacy pull and does not double-apply member comments', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('member-1');
    cloud.write('share-1', { memberId: '' }, 'user');
    const { service, merged } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toEqual(['member-1', 'share-1']);
    expect(cloud.legacyRequests).toBe(1);
    expect(merged.filter(id => id === 'member-1')).toHaveLength(1);
  });
});

describe('member sync scope isolation (account switch / stop share)', () => {
  const otherMember = (): WorkspaceCollabContext => ({ ...teamContext(), workspaceMemberId: 'm-other' });
  const personal = (): WorkspaceCollabContext => ({ ...teamContext(), workspaceType: 'personal' });
  const OTHER: MemberSyncScope = { ...SCOPE, memberId: 'm-other' };
  const countRows = (db: Db, table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id='p1'`).get() as { n: number }).n;

  it('discards an in-flight page of the old account after a switch and drops that scope', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let current = teamContext();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    cloud.gate = () => held;
    const { service } = harness(db, cloud, { resolve: () => current });

    const inFlight = service.pullProject('p1', teamContext());
    await vi.waitFor(() => expect(cloud.requests).toHaveLength(1));
    current = otherMember();
    release();

    await expect(inFlight).resolves.toBe(false);
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
    expect(ids(db)).toEqual([]);
    expect(cloud.legacyRequests).toBe(0);

    cloud.gate = null;
    await expect(service.pullProject('p1', otherMember())).resolves.toBe(true);
    expect(readMemberSyncCursor(db, OTHER)).toMatchObject({ phase: 'incremental' });
    expect(ids(db)).toEqual(['a']);
  });

  it('a newer scope starting on the project invalidates an older scope page still in flight', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    cloud.gate = async () => { if (first) { first = false; await held; } };
    const { service } = harness(db, cloud);

    const stale = service.pullProject('p1', teamContext());
    await vi.waitFor(() => expect(cloud.requests).toHaveLength(1));
    await expect(service.pullProject('p1', otherMember())).resolves.toBe(true);
    release();
    await expect(stale).resolves.toBe(false);

    // The old scope's snapshot page never committed, nor recreated its cursor.
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
    expect(readMemberSyncCursor(db, OTHER)).toMatchObject({ phase: 'incremental' });
  });

  it('drops the previous account cursor and ledger on switch but keeps the local comments', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    cloud.write('b');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(countRows(db, 'comment_member_sync_known')).toBe(2);
    // The new account cannot see 'b' (its stream only has 'a').
    cloud.events = cloud.events.filter(e => e.commentId !== 'b');
    await service.pullProject('p1', otherMember());
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
    // Nothing the old account learned is pruned by the new account's snapshot.
    expect(ids(db)).toEqual(['a', 'b']);
    expect(countRows(db, 'comment_member_sync_known')).toBe(1);
  });

  it('stop sharing: drops the member cursor and ledger, keeps local copies, stops paging', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    cloud.requests = [];
    await expect(service.pullProject('p1', personal())).resolves.toBe(false);
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
    expect(countRows(db, 'comment_member_sync_cursor')).toBe(0);
    expect(countRows(db, 'comment_member_sync_known')).toBe(0);
    expect(ids(db)).toEqual(['a']);
    expect(cloud.requests).toHaveLength(0);
  });

  it('stop sharing while a page is in flight: the page is discarded and the scope dropped', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let current: WorkspaceCollabContext | null = teamContext();
    const { service } = harness(db, cloud, { resolve: () => current });
    await service.pullProject('p1', teamContext());
    cloud.write('b');
    cloud.gate = async () => { current = personal(); };
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(ids(db)).toEqual(['a']);
    expect(countRows(db, 'comment_member_sync_cursor')).toBe(0);
  });

  it('a caller still holding the old account context cannot wipe the current scope', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let current = otherMember();
    const { service } = harness(db, cloud, { resolve: () => current });
    await service.pullProject('p1', otherMember());
    const before = readMemberSyncCursor(db, OTHER);
    expect(before).not.toBeNull();
    cloud.requests = [];
    // e.g. a trailing rerun or a hub wake resolved before the switch.
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(cloud.requests).toHaveLength(0);
    expect(readMemberSyncCursor(db, OTHER)).toEqual(before);
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
    current = otherMember();
    cloud.write('b');
    await service.pullProject('p1', otherMember());
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['incremental']);
  });

  it('stop sharing inside the same team workspace (binding no longer team) drops the scope, before and during a request', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let shared = true;
    const { service } = harness(db, cloud, { shared: () => shared });
    await service.pullProject('p1', teamContext());
    cloud.write('b');
    cloud.gate = async () => { shared = false; };
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(ids(db)).toEqual(['a']);
    expect(countRows(db, 'comment_member_sync_cursor')).toBe(0);
    expect(countRows(db, 'comment_member_sync_known')).toBe(0);
    cloud.requests = [];
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(cloud.requests).toHaveLength(0);
    expect(ids(db)).toEqual(['a']);
  });

  it('an unresolvable context mid-flight discards the page but keeps the cursor', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let current: WorkspaceCollabContext | null = teamContext();
    const { service } = harness(db, cloud, { resolve: () => current });
    await service.pullProject('p1', teamContext());
    const before = readMemberSyncCursor(db, SCOPE);
    cloud.write('b');
    cloud.gate = async () => { current = null; };
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(readMemberSyncCursor(db, SCOPE)).toEqual(before);
    cloud.gate = null;
    current = teamContext();
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(ids(db)).toEqual(['a', 'b']);
  });
});

describe('member page backoff', () => {
  it('backs off INVALID_PAGE_REQUEST exponentially instead of retrying every poll', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('a');
    let clock = 0;
    const { service } = harness(db, cloud, { now: () => clock });
    const pagedCount = () => cloud.requests.length;
    const bad = { status: 400, body: { error: 'INVALID_PAGE_REQUEST', reason: 'limit' } };
    cloud.failNext.push(bad);
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(false);
    expect(pagedCount()).toBe(1);
    // Meanwhile the legacy pull still delivers member comments.
    expect(ids(db)).toEqual(['a']);
    clock += 5_000;
    await service.pullProject('p1', teamContext());
    expect(pagedCount()).toBe(1);
    clock += 5_000; // 10s: first delay elapsed
    cloud.failNext.push(bad);
    await service.pullProject('p1', teamContext());
    expect(pagedCount()).toBe(2);
    clock += 10_000; // second delay is 20s
    await service.pullProject('p1', teamContext());
    expect(pagedCount()).toBe(2);
    clock += 10_000;
    await expect(service.pullProject('p1', teamContext())).resolves.toBe(true);
    expect(pagedCount()).toBe(4); // snapshot + incremental
    // Success resets the backoff.
    cloud.failNext.push({ status: 503, body: { error: 'UNAVAILABLE' } });
    await service.pullProject('p1', teamContext());
    await service.pullProject('p1', teamContext());
    expect(pagedCount()).toBe(6);
  });

  it('retries a single transport failure on the next poll, then backs off repeated ones (bounded)', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    let clock = 0;
    const { service } = harness(db, cloud, { now: () => clock });
    const down = () => cloud.failNext.push({ status: 503, body: { error: 'UNAVAILABLE' } });
    down();
    await service.pullProject('p1', teamContext());
    down();
    await service.pullProject('p1', teamContext());
    expect(cloud.requests).toHaveLength(2);
    await service.pullProject('p1', teamContext());
    expect(cloud.requests).toHaveLength(2);
    // Bounded: however many failures pile up, the delay never exceeds 5 minutes.
    for (let i = 0; i < 12; i += 1) {
      clock += 5 * 60_000;
      down();
      await service.pullProject('p1', teamContext());
    }
    expect(cloud.requests).toHaveLength(14);
  });
});

describe('parseMemberPage (C3-LITE §3 example)', () => {
  const example = {
    mode: 'snapshot',
    comments: [],
    hasMore: false, complete: true,
    nextPageToken: null,
    resumeToken: 'c3l1.eyJr',
    scopeToken: 'c3ls.Qx',
    watermarkSeq: 151,
    scanThroughSeq: 151,
    handoff: { sinceSeq: 151, resumeToken: 'c3l1.eyJr', scopeToken: 'c3ls.Qx' },
    streamEpoch: 'k3J0cV9aQm1zYQ',
    latestSeq: 154,
    nextSeq: 151,
    snapshotAt: 151,
  };

  it('accepts the documented terminal snapshot envelope', () => {
    expect(parseMemberPage(example, 'snapshot', 'p1')).toMatchObject({ resumeToken: 'c3l1.eyJr', streamEpoch: 'k3J0cV9aQm1zYQ', latestSeq: 154, skipped: [] });
  });

  it('keeps a minimal tombstone and fills its projectId from scope', () => {
    const page = parseMemberPage({ ...example, comments: [{ id: 'gone', seq: 9, deleted: true }] }, 'snapshot', 'p1');
    expect(page.comments).toEqual([{ id: 'gone', projectId: 'p1', seq: 9, deleted: true }]);
  });

  it('skips per item instead of rejecting the page', () => {
    const page = parseMemberPage({ ...example, comments: [{}, { id: 'x', seq: 1, deleted: true, projectId: 'other' }] }, 'snapshot', 'p1');
    expect(page.comments).toEqual([]);
    expect(page.skipped.map(s => s.reason)).toEqual(['id missing', 'projectId does not match the requested project']);
  });

  it('rejects an incoherent envelope', () => {
    for (const bad of [
      { ...example, handoff: null },
      { ...example, streamEpoch: undefined },
      { ...example, complete: false },
      { ...example, hasMore: true, complete: false },
      { ...example, mode: 'incremental' },
    ]) expect(() => parseMemberPage(bad, 'snapshot', 'p1')).toThrow(/Invalid member page response/);
  });
});

describe('comment-inbound-store page commit', () => {
  const terminal = (patch: Record<string, unknown> = {}) => parseMemberPage({
    mode: 'snapshot', comments: [], hasMore: false, complete: true, nextPageToken: null,
    resumeToken: 'c3l1.r1', scopeToken: SCOPE_TOKEN, watermarkSeq: 3, scanThroughSeq: 3,
    handoff: { sinceSeq: 3, resumeToken: 'c3l1.r1', scopeToken: SCOPE_TOKEN }, streamEpoch: EPOCH, ...patch,
  }, 'snapshot', 'p1');
  const incremental = (patch: Record<string, unknown> = {}) => parseMemberPage({
    mode: 'incremental', comments: [], hasMore: false, complete: true, nextPageToken: null,
    resumeToken: 'c3l1.r2', scopeToken: SCOPE_TOKEN, watermarkSeq: 4, scanThroughSeq: 4, handoff: null,
    streamEpoch: EPOCH, ...patch,
  }, 'incremental', 'p1');
  const merge = (db: Db) => (comment: any) => mergeSyncedPreviewComment(db, 'p1', 'conv-local', comment);

  it('persists the resume token across a daemon restart', () => {
    const db = seededDb();
    const store = createCommentInboundStore(db);
    expect(store.apply({ scope: SCOPE, query: { mode: 'snapshot' }, page: terminal(), merge: merge(db) })).toMatchObject({ status: 'committed' });
    closeDatabase();
    const reopened = openDatabase(tempDir!);
    expect(readMemberSyncCursor(reopened, SCOPE)).toMatchObject({ phase: 'incremental', resumeToken: 'c3l1.r1', pageToken: null });
  });

  it('rejects a page that does not answer the cursor’s next query (CAS)', () => {
    const db = seededDb();
    const store = createCommentInboundStore(db);
    store.apply({ scope: SCOPE, query: { mode: 'snapshot' }, page: terminal(), merge: merge(db) });
    // A duplicate/late snapshot page after the handoff.
    expect(store.apply({ scope: SCOPE, query: { mode: 'snapshot' }, page: terminal(), merge: merge(db) })).toEqual({ status: 'conflict' });
    expect(store.apply({ scope: SCOPE, query: { mode: 'incremental', resumeToken: 'c3l1.other' }, page: incremental(), merge: merge(db) })).toEqual({ status: 'conflict' });
    // A different member/workspace has no cursor of its own yet.
    expect(readMemberSyncCursor(db, { ...SCOPE, memberId: 'm-other' })).toBeNull();
  });

  it('refuses a page from another scope without touching the cursor, and leaves epoch checks to the server', () => {
    const db = seededDb();
    const store = createCommentInboundStore(db);
    store.apply({ scope: SCOPE, query: { mode: 'snapshot' }, page: terminal(), merge: merge(db) });
    const before = readMemberSyncCursor(db, SCOPE);
    const query = { mode: 'incremental' as const, resumeToken: 'c3l1.r1' };
    const comment = { ...payload('late'), seq: 4, memberId: 'm-author' };
    expect(store.apply({ scope: SCOPE, query, page: incremental({ scopeToken: 'c3ls.other', comments: [comment] }), merge: merge(db) }))
      .toEqual({ status: 'rebuild-required', reason: 'scope-changed' });
    expect(readMemberSyncCursor(db, SCOPE)).toEqual(before);
    expect(getProjectPreviewComment(db, 'p1', 'late')).toBeNull();
    expect(store.apply({ scope: SCOPE, query, page: incremental({ streamEpoch: 'newStream', comments: [comment] }), merge: merge(db) }))
      .toMatchObject({ status: 'committed', cursor: { streamEpoch: 'newStream' } });
  });

  it('rolls back rows and cursor when a merge is not acknowledged', () => {
    const db = seededDb();
    const store = createCommentInboundStore(db);
    const page = terminal({ comments: [{ ...payload('a'), seq: 1 }, { ...payload('b'), seq: 2 }] });
    let calls = 0;
    expect(() => store.apply({ scope: SCOPE, query: { mode: 'snapshot' }, page, merge: (c) => {
      calls += 1;
      return calls === 1 ? mergeSyncedPreviewComment(db, 'p1', 'conv-local', c) : (undefined as never);
    } })).toThrow(/acknowledged/);
    expect(readMemberSyncCursor(db, SCOPE)).toBeNull();
    expect(getProjectPreviewComment(db, 'p1', 'a')).toBeNull();
  });
});

describe('legacy pull alongside member paging', () => {
  it('still applies a share-page comment tombstone from the legacy pull', async () => {
    const db = seededDb();
    const cloud = new FakeCloud();
    cloud.write('share-1', { memberId: '' }, 'user');
    const { service } = harness(db, cloud);
    await service.pullProject('p1', teamContext());
    expect(ids(db)).toEqual(['share-1']);
    cloud.remove('share-1', 'user');
    cloud.requests = [];
    await service.pullProject('p1', teamContext());
    // The member stream skipped the share-page delete; the legacy pull applied it.
    expect(ids(db)).toEqual([]);
    expect(cloud.requests.map(q => q.get('mode'))).toEqual(['incremental']);
  });
});
