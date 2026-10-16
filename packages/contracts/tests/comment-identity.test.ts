import { describe, expect, it } from 'vitest';
import { COMMENT_ID_ATTRIBUTE, commentElementId, commentIdentitySelector, commentUuidFromElementId, isCommentUuid, uniqueCommentIdentity } from '../src/runtime/comment-identity.js';
const uuid = '12345678-1234-4234-8234-123456789abc';
describe('comment-only exact identity contract', () => {
  it('represents UUID in existing elementId/selector fields without tool identity', () => {
    expect(COMMENT_ID_ATTRIBUTE).toBe('data-od-comment-id');
    expect(commentElementId(uuid)).toBe(`cmt:${uuid}`);
    expect(commentIdentitySelector(uuid)).toBe(`[data-od-comment-id="${uuid}"]`);
    expect(commentUuidFromElementId(`cmt:${uuid}`)).toBe(uuid);
  });
  it('fails closed on malformed, absent, positional and duplicate identity', () => {
    for (const value of [undefined, '', 'dom:0.1', 'cmt:', 'cmt:bad', `cmt:${uuid}"]`, `other:${uuid}`]) expect(commentUuidFromElementId(value)).toBeNull();
    expect(isCommentUuid(uuid)).toBe(true);
    expect(() => commentIdentitySelector('bad')).toThrow();
    expect(uniqueCommentIdentity([], uuid)).toBe(false);
    expect(uniqueCommentIdentity([uuid, uuid], uuid)).toBe(false);
    expect(uniqueCommentIdentity([uuid], uuid)).toBe(true);
  });
});
