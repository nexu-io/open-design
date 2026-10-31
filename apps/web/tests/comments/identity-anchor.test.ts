import { describe, expect, it } from 'vitest';
import type { PreviewComment } from '../../src/types';
import { resolveOwnerCommentAnchor } from '../../src/comments/owner-anchor';
import { indexCommentTargets } from '../../src/comments/target-index';
import type { PreviewCommentSnapshot } from '../../src/comments/anchor';
const uuid = '12345678-1234-4234-8234-123456789abc';
const target: PreviewCommentSnapshot = { filePath: 'index.html', elementId: `cmt:${uuid}`, selector: `[data-od-comment-id="${uuid}"]`, label: 'h2', text: 'Changed and moved', htmlHint: '<h2>', position: { x: 30, y: 90, width: 100, height: 40 } };
const comment = { ...target, text: 'Original target', anchoredVersion: 1, id: 'comment', projectId: 'p', conversationId: 'c', note: 'note', status: 'open', createdAt: 1, updatedAt: 1 } as PreviewComment;
describe('strict Owner new namespace', () => {
  it.each(['[data-od-id="data-od-comment-id"]', '[data-screen-label="data-od-comment-id"]', '[data-screen-label="[data-od-comment-id]"]'])('legacy attribute VALUES are not identity namespace claims: %s', selector => {
    const legacy = { ...target, elementId: 'data-od-comment-id', selector };
    expect(resolveOwnerCommentAnchor({ ...comment, ...legacy }, indexCommentTargets([legacy]), 1).state).toBe('anchored');
  });
  it.each(['[data-od-comment-id]', '[data-od-comment-id="bad"]', '[data-od-comment-id'])('actual malformed new selector terminates even with legacy ID: %s', selector => {
    const legacy = { ...target, elementId: 'tool', selector };
    expect(resolveOwnerCommentAnchor({ ...comment, ...legacy }, indexCommentTargets([legacy]), 1).state).toBe('lost');
  });
  it('refuses future publication versions without treating local version IDs as publication sequences', () => {
    expect(resolveOwnerCommentAnchor({ ...comment, anchoredVersion: 3 }, indexCommentTargets([target]), 2).state).toBe('lost');
  });
  it('retained UUID resolves independent of text/style/location at a later publication', () => {
    expect(resolveOwnerCommentAnchor(comment, indexCommentTargets([target]), 2)).toEqual({ state: 'reanchored', snapshot: target });
  });
  it.each(['cmt:bad', `cmt:${uuid}`])('missing or malformed %s never uses text/path/hint fallback', elementId => {
    const replacement = { ...target, elementId: 'new-tool-id', text: comment.text };
    expect(resolveOwnerCommentAnchor({ ...comment, elementId, selector: 'body > h2' }, indexCommentTargets([replacement]), 2).state).toBe('lost');
  });
  it('duplicate target list fails before Map overwrites and history restoration recovers only actual UUID', () => {
    expect(resolveOwnerCommentAnchor(comment, indexCommentTargets([target, { ...target, text: 'Duplicate' }]), 2).state).toBe('lost');
    expect(resolveOwnerCommentAnchor(comment, indexCommentTargets([{ ...target, elementId: 'dom:body > h2', selector: 'body > h2' }]), 2).state).toBe('lost');
    expect(resolveOwnerCommentAnchor(comment, indexCommentTargets([target]), 3).snapshot).toBe(target);
  });
  it.each([{ selector: '[data-od-id="tool"]' }, { filePath: 'other.html' }, { slideIndex: 2 }])('mismatched selector/file/slide refuses %j', override => {
    expect(resolveOwnerCommentAnchor(comment, indexCommentTargets([{ ...target, ...override }]), 2).state).toBe('lost');
  });
});
