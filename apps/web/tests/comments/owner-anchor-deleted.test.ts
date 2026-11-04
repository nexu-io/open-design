// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ownerCommentNeedsLocation, ownerCommentSelector, resolveOwnerCommentAnchor } from '../../src/comments/owner-anchor';
import type { PreviewCommentSnapshot } from '../../src/comments/anchor';
import type { PreviewComment } from '../../src/types';

const e1: PreviewCommentSnapshot = {
  filePath: 'index.html', elementId: 'dom:body > button:nth-of-type(1)',
  selector: 'body > button:nth-of-type(1)', label: 'button', text: 'First', htmlHint: '<button id="delete-target">',
  position: { x: 10, y: 10, width: 100, height: 20 },
};
const e2: PreviewCommentSnapshot = {
  ...e1, elementId: 'dom:body > button:nth-of-type(1)', selector: 'body > button:nth-of-type(1)',
  text: 'Second', htmlHint: '<button id="neighbor">',
};
const saved = { ...e1, id: 'comment', projectId: 'p', conversationId: 'c', note: 'Keep this',
  status: 'open', createdAt: 1, updatedAt: 1 } as PreviewComment;

describe('owner authored id anchors', () => {
  it('requires live location for a personal ordinary element comment', () => {
    expect(ownerCommentNeedsLocation(saved, false)).toBe(true);
    expect(ownerCommentNeedsLocation({ ...saved, elementId: 'pin-1' }, false)).toBe(false);
    expect(ownerCommentNeedsLocation({ ...saved, selectionKind: 'pod' }, false)).toBe(false);
  });
  it('locates a legacy structural comment by its saved authored id', () => {
    expect(ownerCommentSelector(saved)).toBe('[id="delete-target"]');
    expect(resolveOwnerCommentAnchor(saved, new Map([[e1.elementId, e1]])).snapshot).toBe(e1);
  });
  it('reports lost when a neighbor takes the deleted element structural selector', () => {
    expect(resolveOwnerCommentAnchor(saved, new Map([[e2.elementId, e2]])).state).toBe('lost');
  });
  it('reports lost for ambiguous authored ids', () => {
    const duplicate = { ...e1, elementId: 'other', selector: 'body > button:nth-of-type(2)' };
    expect(resolveOwnerCommentAnchor(saved, new Map([[e1.elementId, e1], [duplicate.elementId, duplicate]])).state).toBe('lost');
    expect(resolveOwnerCommentAnchor(saved, new Map([[e1.elementId, { ...e1, domIdUnique: false }]])).state).toBe('lost');
  });
  it('requires a unique id for new id-selector comments and accepts replacement with that id', () => {
    const current = { ...saved, elementId: 'dom:[id="delete-target"]', selector: '[id="delete-target"]' };
    expect(resolveOwnerCommentAnchor(current, new Map([[e2.elementId, e2]])).state).toBe('lost');
    const replacement = { ...e1, elementId: 'new', selector: '[id="delete-target"]', text: 'Replacement' };
    expect(resolveOwnerCommentAnchor(current, new Map([[replacement.elementId, replacement]])).snapshot).toBe(replacement);
    expect(resolveOwnerCommentAnchor(current, new Map([[e1.elementId, e1], [replacement.elementId, replacement]])).state).toBe('lost');
  });
  it('compares equivalent CSS escapes for authored ids', () => {
    const current = { ...saved, elementId: 'dom:[id="a\\:b"]', selector: '[id="a\\:b"]', htmlHint: '<button id="a:b">' };
    const target = { ...e1, elementId: 'new', selector: '[id="a:b"]', htmlHint: '<button id="a:b">' };
    expect(resolveOwnerCommentAnchor(current, new Map([[target.elementId, target]])).snapshot).toBe(target);
  });
  it('accepts same-selector replacement when no authored id was saved', () => {
    const withoutId = { ...saved, htmlHint: '<button>' };
    expect(resolveOwnerCommentAnchor(withoutId, new Map([[e2.elementId, e2]])).snapshot).toBe(e2);
  });
  it('escapes ids and leaves non-structural identities unchanged', () => {
    expect(ownerCommentSelector({ ...saved, htmlHint: '<button id="a&amp;b">' })).toBe('[id="a&b"]');
    expect(ownerCommentSelector({ ...saved, elementId: 'cmt:abc', selector: '[data-od-comment-id="abc"]' })).toBe('[data-od-comment-id="abc"]');
  });
});
