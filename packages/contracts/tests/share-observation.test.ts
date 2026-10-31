import { describe, expect, it } from 'vitest';
import { publishReceiptObservation, savedCommentIds } from '../src/analytics/share-observation.js';

describe('passive share facts', () => {
  it('reads only the existing receipt version and publish time', () => {
    expect(publishReceiptObservation({ version: 2, publishedAt: 123, url: 'secret', versionId: 'upload' }))
      .toEqual({ share_version: 2, published_at: 123 });
  });
  it.each([null, undefined, [], 'receipt', {}])('does not require observation metadata: %j', receipt => {
    expect(publishReceiptObservation(receipt)).toEqual({});
  });
  it.each([0, -1, 1.5, '2', Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
    ('omits an invalid version without discarding a valid time: %s', version => {
      expect(publishReceiptObservation({ version, publishedAt: 0 })).toEqual({ published_at: 0 });
    });
  it.each([-1, 1.5, '123', Number.NaN, Number.POSITIVE_INFINITY])
    ('omits an invalid time without discarding a valid version: %s', publishedAt => {
      expect(publishReceiptObservation({ version: 1, publishedAt })).toEqual({ share_version: 1 });
    });
  it('contains observation access failures', () => {
    expect(publishReceiptObservation({ get version() { throw new Error('observer'); } })).toEqual({});
  });
  it('reads only explicit saved-comment IDs and deduplicates without changing the input', () => {
    const attachments = [
      { source: 'saved-comment', id: 'comment-A', comment: 'private body' },
      { source: 'saved-comment', id: 'comment-A' },
      { source: 'board-batch', id: 'temporary-B' },
      { id: 'legacy-C' },
      { source: 'saved-comment', id: 'comment-D' },
    ];
    const before = structuredClone(attachments);
    expect(savedCommentIds(attachments)).toEqual(['comment-A', 'comment-D']);
    expect(attachments).toEqual(before);
  });
  it('distinguishes absent attachments from an explicit set with no saved comments', () => {
    expect(savedCommentIds(undefined)).toBeUndefined();
    expect(savedCommentIds(null)).toBeUndefined();
    expect(savedCommentIds([])).toEqual([]);
    expect(savedCommentIds([{ source: 'board-batch', id: 'temporary' }])).toEqual([]);
  });
  it('does not copy content, paths or malformed IDs into analytics', () => {
    expect(savedCommentIds([
      null, 1, { source: 'saved-comment', id: '' },
      { source: 'saved-comment', id: '/private/path' },
      { source: 'saved-comment', id: 'free form text' },
      { source: 'saved-comment', id: 123 },
    ])).toEqual([]);
  });
  it('contains attachment access failures', () => {
    expect(savedCommentIds([{ get source() { throw new Error('observer'); } }])).toBeUndefined();
  });
});
