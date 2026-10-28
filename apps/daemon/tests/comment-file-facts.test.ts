import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { CollabCloudComment, CommentFileFact, CommentFileState } from '@open-design/contracts';
import { commentFilesAtReceipt, normalizeCurrentFileComment, parseCommentFileState } from '../src/collab/comment-file-facts.js';
import { commitCommentFileFacts } from '../src/collab/comment-file-authority.js';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';

const f1 = '11111111-1111-4111-8111-111111111111';
const f2 = '22222222-2222-4222-8222-222222222222';
const fact: CommentFileFact = { sourceFileId: f1, sourceFilePath: 'pages/a.html', entryPath: 'index.html', resourceId: 'selected', versionId: 'v1', retired: false };
const state = (files = [fact], revision = 1): CommentFileState => ({ schemaVersion: 1, revision, files });
const comment = { id: 'c', sourceFileId: f1, sourceFilePath: fact.sourceFilePath, filePath: 'index.html', createdAt: 12,
  authorKind: 'user', authorAppUserId: 'guest', selector: '#a', publicationSlug: 'original' } as CollabCloudComment;

describe('one synchronous current-file guard for both inbound lanes', () => {
  it.each(['member', 'user'] as const)('normalizes %s without a local publication and preserves attribution/anchors', authorKind => {
    expect(normalizeCurrentFileComment(state(), { ...comment, authorKind })).toEqual({ ...comment, authorKind, filePath: fact.sourceFilePath });
  });
  it('throws unknown proof, excludes proved retirement and never attaches F1 to F2', () => {
    expect(() => normalizeCurrentFileComment(null, comment)).toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    expect(() => normalizeCurrentFileComment(state(), { ...comment, sourceFilePath: 'other.html' })).toThrow();
    expect(normalizeCurrentFileComment(state([{ ...fact, retired: true }, { ...fact, sourceFileId: f2, versionId: 'v2' }]), comment)).toBeNull();
    expect(() => normalizeCurrentFileComment(state([{ ...fact, sourceFileId: f2 }]), comment)).toThrow();
  });
  it('does not expand or retarget compact exact-comment tombstones', () => {
    const tombstone = { id: 'c', deleted: true } as CollabCloudComment;
    expect(normalizeCurrentFileComment(null, tombstone)).toBe(tombstone);
  });
  it('skips only identity-less unsupported wire rows without guessing an identity', () => {
    const { sourceFileId: _id, sourceFilePath: _path, ...legacy } = comment;
    expect(normalizeCurrentFileComment(state(), legacy)).toBeNull();
    expect(normalizeCurrentFileComment(null, legacy)).toBeNull();
    expect(() => normalizeCurrentFileComment(state(), { ...legacy, sourceFileId: f1 })).toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    expect(() => normalizeCurrentFileComment(state(), { ...legacy, sourceFilePath: fact.sourceFilePath })).toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    expect(() => normalizeCurrentFileComment(state(), { ...comment, sourceFileId: f2 })).toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  });
});
describe('receipt-bound reserved adoption', () => {
  it('does not install future facts before local content commits; refreshes selected without root', () => {
    const root = { ...fact, sourceFileId: f2, sourceFilePath: 'private.html', entryPath: 'private.html', resourceId: 'root', versionId: 'root-v' };
    const old = state([root]);
    expect(commentFilesAtReceipt(old, state([fact, root], 2), { resourceId: 'selected', versionId: 'wrong' })).toBe(old);
    expect(commentFilesAtReceipt(old, state([fact, root], 2), fact)).toEqual(state([root, fact], 2));
  });
  it('rejects mutation-as-state and malformed identities', () => {
    expect(parseCommentFileState({ schemaVersion: 1, baseRevision: 0, resourceId: 'root', versionId: 'v', files: [fact] })).toBeNull();
    expect(parseCommentFileState(state([{ ...fact, sourceFilePath: '../a.html' }]))).toBeNull();
    expect(parseCommentFileState(state([fact, { ...fact, sourceFileId: f2 }]))).toBeNull();
  });
});
describe('permanent retirement at an authorized root commit', () => {
  const rootFact = { ...fact, resourceId: 'root', entryPath: fact.sourceFilePath, versionId: 'v1' };
  const receipt = { resourceId: 'root', versionId: 'v2' };
  const proof = { authorizedCatalogRootId: 'root' };
  it('retires the only HTML without matching its historical receipt, withholding future active facts', () => {
    const incoming = state([{ ...rootFact, retired: true }, { ...rootFact, sourceFileId: f2, versionId: 'future-v3' }], 2);
    const adopted = commentFilesAtReceipt(state([{ ...rootFact, versionId: 'older-v0' }]), incoming, receipt, proof);
    expect(adopted).toEqual(state([{ ...rootFact, retired: true }], 2));
    expect(commentFilesAtReceipt(adopted, incoming, receipt, proof)).toEqual(adopted);
    expect(normalizeCurrentFileComment(adopted, comment)).toBeNull();
  });
  it('fresh members learn retired F1 history while binding only current F2 bytes', () => {
    const next = { ...rootFact, sourceFileId: f2, versionId: 'v2' };
    const incoming = state([{ ...rootFact, retired: true }, next], 2);
    const adopted = commentFilesAtReceipt(null, incoming, receipt, proof);
    expect(adopted?.files).toContainEqual({ ...rootFact, retired: true });
    expect(adopted?.files).toContainEqual(next);
    expect(normalizeCurrentFileComment(adopted, { ...comment, sourceFileId: f2 })?.filePath).toBe(fact.sourceFilePath);
  });
  it('rejects stale, foreign-root, renamed identity and altered permanent retirement history', () => {
    const retired = state([{ ...rootFact, retired: true }], 2);
    expect(() => commentFilesAtReceipt(retired, state([{ ...rootFact, retired: true }], 1), receipt, proof)).toThrow('REVISION_REGRESSION');
    expect(() => commentFilesAtReceipt(null, retired, { ...receipt, resourceId: 'foreign' }, proof)).toThrow('AUTHORITY_UNAVAILABLE');
    expect(() => commentFilesAtReceipt(state([rootFact]), state([{ ...rootFact, sourceFilePath: 'forged.html', retired: true }], 2), receipt, proof)).toThrow('LIFETIME_CONFLICT');
    expect(() => commentFilesAtReceipt(retired, state([{ ...rootFact, versionId: 'forged', retired: true }], 3), receipt, proof)).toThrow('LIFETIME_CONFLICT');
  });
});
describe('exact catalog CAS through existing CLI metadata-json', () => {
  it.each([false, true])('recognizes exact state after a %s lost response; selected facts keep catalog root', async lost => {
    let stored = state([], 0);
    const run = vi.fn(async (args: string[]) => {
      if (args[1] === 'get') return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { name: 'preserved', metadata: { kind: 'prototype' }, _commentFiles: stored } });
      expect(args.slice(0, 5)).toEqual(['team-projects', 'upsert', 'p', '--resource-id', 'root']);
      const sent = JSON.parse(args[6] ?? '');
      expect(sent).toMatchObject({ name: 'preserved', metadata: { kind: 'prototype' } });
      const mutation = sent._commentFiles;
      expect(mutation).toEqual({ schemaVersion: 1, baseRevision: 0, resourceId: 'selected', versionId: 'v1', files: [
        { sourceFileId: f1, sourceFilePath: fact.sourceFilePath, entryPath: 'index.html', retired: false },
      ] });
      expect(mutation).not.toHaveProperty('revision');
      stored = state();
      if (lost) throw new Error('lost successful reply');
      return '{}';
    });
    const input = { projectId: 'p', workspaceId: 'w', creatorMemberId: 'creator', resourceId: 'selected', versionId: 'v1',
      files: [{ sourceFileId: f1, sourceFilePath: fact.sourceFilePath, entryPath: 'index.html', retired: false }], run };
    expect(await commitCommentFileFacts(input)).toEqual(state());
    expect(await commitCommentFileFacts(input)).toEqual(state());
    expect(run.mock.calls.filter(([args]) => args[1] === 'upsert')).toHaveLength(1);
  });
  it('does not treat unknown CAS failure as admitted or replay stale baseRevision', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[1] === 'get') return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: state([], 4) } });
      throw new Error('CAS unavailable');
    });
    await expect(commitCommentFileFacts({ projectId: 'p', workspaceId: 'w', creatorMemberId: 'creator', resourceId: 'selected', versionId: 'v1',
      files: [{ sourceFileId: f1, sourceFilePath: fact.sourceFilePath, entryPath: 'index.html', retired: false }], run })).rejects.toThrow('CAS unavailable');
    expect(run.mock.calls.filter(([args]) => args[1] === 'upsert')).toHaveLength(1);
  });
});
it('reserves a fresh alias for same-path F2 while retaining exact F1 key/alias', () => {
  const db = new Database(':memory:');
  try {
    const store = createShareAliasReservations(db);
    const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: '项目', filePath: fact.sourceFilePath, sourceFileId: f1 };
    const first = store.reserve(scope);
    const second = store.reserve({ ...scope, sourceFileId: f2 });
    expect(first.sourceKey).toBe(`comment-file-v1:${Buffer.from('项目').toString('base64url')}:${f1}`);
    expect(first.slug).not.toBe(second.slug);
    expect(store.reserve(scope)).toEqual(first);
    expect(store.reserve({ ...scope, sourceFileId: f2 })).toEqual(second);
  } finally { db.close(); }
});

it('recognizes a lost admission followed by a newer catalog revision, but not catalog deletion', async () => {
  let stored = state([], 0);
  let deleted = false;
  const run = vi.fn(async (args: string[]) => {
    if (deleted) throw new Error('catalog deleted');
    if (args[1] === 'get') return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: stored } });
    stored = state([fact, { ...fact, sourceFileId: f2, sourceFilePath: 'b.html' }], 2);
    throw new Error('lost successful response after another file admission');
  });
  const input = { projectId: 'p', workspaceId: 'w', creatorMemberId: 'creator', resourceId: fact.resourceId, versionId: fact.versionId,
    files: [{ sourceFileId: f1, sourceFilePath: fact.sourceFilePath, entryPath: fact.entryPath, retired: false }], run };
  expect(await commitCommentFileFacts(input)).toEqual(stored);
  expect(run.mock.calls.filter(([args]) => args[1] === 'upsert')).toHaveLength(1);
  deleted = true;
  await expect(commitCommentFileFacts(input)).rejects.toThrow('catalog deleted');
});
