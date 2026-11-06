import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CollabCloudComment } from '@open-design/contracts';
import {
  closeDatabase, getProjectPreviewComment, insertConversation, insertProject,
  mergeSyncedPreviewComment, openDatabase, reorderPreviewComment, updatePreviewCommentStatus,
} from '../src/db.js';
import { previewCommentToCloud } from '../src/collab/collab-cloud-service.js';

let tempDir: string | undefined;
afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
  vi.useRealTimers();
});

it.each([57 * 60_000, 2 * 3_600_000])(
  '3888: keeps the same remote id/creation epoch through backfill, incremental edit and disk restart (%i ms old)', age => {
    vi.useFakeTimers();
    // The explicit offset is parsed once into epoch milliseconds; no timezone/unit conversion on merge.
    const receivedAt = Date.parse('2026-10-14T12:00:00+08:00');
    vi.setSystemTime(receivedAt);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-age-'));
    let db = openDatabase(tempDir, { dataDir: tempDir });
    insertProject(db, { id: 'p1', name: 'Fixture', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'conv-local', projectId: 'p1', title: 'Fixture', createdAt: 1, updatedAt: 1 });
    const remote: CollabCloudComment = {
      id: 'share-comment', projectId: 'p1', conversationId: 'conv-remote', memberId: '', seq: 3,
      note: 'Share feedback', filePath: 'index.html', elementId: 'hero', selector: '#hero',
      label: 'Hero', text: 'Hero', htmlHint: '<h1>', position: { x: 1, y: 2, width: 3, height: 4 },
      status: 'open', createdAt: receivedAt - age, updatedAt: receivedAt - age, authorKind: 'user',
      authorAppUserId: 'synthetic-account', authorDisplayName: 'Visitor',
    };
    // Share-page creates on the wire can omit updatedAt despite the typed DTO.
    Reflect.deleteProperty(remote, 'updatedAt');
    const read = () => getProjectPreviewComment(db, 'p1', remote.id)!;
    const merge = (event: CollabCloudComment) => mergeSyncedPreviewComment(db, 'p1', 'conv-local', event);
    expect(merge(remote)).toBe('changed');
    expect(read()).toMatchObject({
      id: remote.id, createdAt: remote.createdAt, updatedAt: remote.createdAt,
      conversationId: 'conv-local', filePath: remote.filePath, note: remote.note,
      position: remote.position, authorKind: remote.authorKind,
      authorAppUserId: remote.authorAppUserId, authorDisplayName: remote.authorDisplayName, pinSeq: 3,
    });
    expect(Date.now() - read().createdAt).toBe(age);
    // A legitimate incremental revision changes activity, not creation age or mapping/order.
    const edited = { ...remote, seq: 5, note: 'Edited feedback', updatedAt: receivedAt };
    expect(merge(edited)).toBe('changed');
    expect(read()).toMatchObject({ createdAt: remote.createdAt, updatedAt: receivedAt, pinSeq: 3, sortKey: remote.createdAt });
    updatePreviewCommentStatus(db, 'p1', 'conv-local', remote.id, 'resolved');
    closeDatabase();
    vi.setSystemTime(receivedAt + 3_600_000);
    db = openDatabase(tempDir, { dataDir: tempDir });
    const persisted = read();
    for (let replay = 0; replay < 3; replay += 1) {
      expect(merge(remote)).toBe('unchanged');
      expect(merge(edited)).toBe('unchanged');
      expect(read()).toEqual(persisted);
    }
    expect(Date.now() - read().createdAt).toBe(age + 3_600_000);
    expect(previewCommentToCloud(read(), '').createdAt).toBe(remote.createdAt);
  },
);

const authoritativeCreatedAt = Date.parse('2026-10-14T20:17:46.576+08:00');
const receivedAt = authoritativeCreatedAt + 2 * 3_600_000;
function creationTimeFixture() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-time-repair-'));
  const db = openDatabase(tempDir, { dataDir: tempDir });
  insertProject(db, { id: 'p1', name: 'Fixture', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conv-local', projectId: 'p1', title: 'Fixture', createdAt: 1, updatedAt: 1 });
  const comment: CollabCloudComment = {
    id: 'visitor-comment', projectId: 'p1', conversationId: 'remote', memberId: '', seq: 3,
    note: 'Original note', filePath: 'index.html', elementId: 'hero', selector: '#hero',
    label: 'Hero', text: 'Hero', htmlHint: '<h1>', position: { x: 1, y: 2, width: 3, height: 4 },
    status: 'open', createdAt: authoritativeCreatedAt, updatedAt: authoritativeCreatedAt,
    authorKind: 'user', authorAppUserId: 'synthetic-viewer',
  };
  const merge = (event = comment) => mergeSyncedPreviewComment(db, 'p1', 'conv-local', event);
  const read = () => getProjectPreviewComment(db, 'p1', comment.id)!;
  const seedLegacyRow = () => {
    merge();
    // Simulate the persisted result of the old missing-createdAt clock fallback.
    db.prepare('UPDATE preview_comments SET created_at = ?, sort_key = ?, updated_at = ? WHERE id = ?')
      .run(receivedAt, receivedAt, receivedAt, comment.id);
  };
  return { db, comment, merge, read, seedLegacyRow };
}

it.each([undefined, NaN, Infinity, -1, 0])('3888 preserves a synced comment with unknown creation time %s without inventing an age', createdAt => {
  const { comment, merge, read } = creationTimeFixture();
  const malformed = { ...comment };
  Reflect.set(malformed, 'createdAt', createdAt);
  Reflect.deleteProperty(malformed, 'updatedAt');
  expect(merge(malformed)).toBe('changed');
  expect(read()).toMatchObject({ createdAt: 0, updatedAt: 0, sortKey: 0, note: comment.note });
  expect(merge()).toBe('changed');
  expect(read()).toMatchObject({ createdAt: authoritativeCreatedAt, sortKey: authoritativeCreatedAt });
});

it('3888 preserves an existing creation time when an incremental update omits it', () => {
  const { comment, merge, read } = creationTimeFixture();
  merge();
  const update = { ...comment, seq: 4, note: 'New note', updatedAt: receivedAt };
  Reflect.deleteProperty(update, 'createdAt');
  expect(merge(update)).toBe('changed');
  expect(read()).toMatchObject({ createdAt: authoritativeCreatedAt, note: 'New note', updatedAt: receivedAt });
});

it.each([2, 3, 4])('3888 repairs a clock-inflated creation time from authoritative seq %s without replaying stale content', seq => {
  const { comment, merge, read, seedLegacyRow } = creationTimeFixture();
  seedLegacyRow();
  const before = read();
  expect(merge({ ...comment, seq, note: 'Stale body must not win' })).toBe('changed');
  expect(read()).toMatchObject({
    createdAt: authoritativeCreatedAt, sortKey: authoritativeCreatedAt,
    note: before.note, status: before.status, updatedAt: before.updatedAt,
    conversationId: before.conversationId, pinSeq: before.pinSeq,
  });
  expect(merge({ ...comment, seq })).toBe('unchanged');
});

it('3888 repairs the creation time during a newer content update and preserves manual sidebar ordering', () => {
  const { db, comment, merge, read, seedLegacyRow } = creationTimeFixture();
  seedLegacyRow();
  reorderPreviewComment(db, 'p1', 'conv-local', comment.id, 123.5);
  expect(merge({ ...comment, seq: 4, note: 'New note', updatedAt: receivedAt + 1 })).toBe('changed');
  expect(read()).toMatchObject({ createdAt: authoritativeCreatedAt, sortKey: 123.5, note: 'New note', pinSeq: 3 });
  closeDatabase();
  const reopened = openDatabase(tempDir!, { dataDir: tempDir! });
  expect(getProjectPreviewComment(reopened, 'p1', comment.id)).toMatchObject({
    createdAt: authoritativeCreatedAt, sortKey: 123.5, note: 'New note', pinSeq: 3,
  });
});

it.each(['different-author', 'different-file', 'missing-author'] as const)(
  '3888 does not repair historical timestamps from an uncorrelated %s payload', kind => {
    const { comment, merge, read, seedLegacyRow } = creationTimeFixture();
    seedLegacyRow();
    const untrusted = { ...comment, seq: 3 };
    if (kind === 'different-author') untrusted.authorAppUserId = 'other-viewer';
    if (kind === 'different-file') untrusted.filePath = 'other.html';
    if (kind === 'missing-author') Reflect.deleteProperty(untrusted, 'authorAppUserId');
    expect(merge(untrusted)).toBe('unchanged');
    expect(read()).toMatchObject({ createdAt: receivedAt, sortKey: receivedAt });
  },
);

it('3888 repairs a correlated historical record even when the legacy wire has no sequence', () => {
  const { comment, merge, read, seedLegacyRow } = creationTimeFixture();
  seedLegacyRow();
  expect(merge({ ...comment, seq: 0 })).toBe('changed');
  expect(read()).toMatchObject({ createdAt: authoritativeCreatedAt, sortKey: authoritativeCreatedAt });
});

it('3888 never makes a known creation time younger from a later replay value', () => {
  const { comment, merge, read } = creationTimeFixture();
  merge();
  expect(merge({ ...comment, createdAt: receivedAt })).toBe('unchanged');
  expect(read()).toMatchObject({ createdAt: authoritativeCreatedAt, sortKey: authoritativeCreatedAt });
});
