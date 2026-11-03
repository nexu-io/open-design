import { commentSelectorClaimsIdentity } from '@open-design/contracts';
import type { PreviewComment } from '../types';
import { resolveCommentAnchor, type PreviewCommentSnapshot } from './anchor';

/** DOM bridges emit explicit first-of-type paths; old comments may omit them. */
export function commentSelectorsMatch(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const trimmed = value.trim();
    return /^body(?:\s*>\s*[a-z][a-z0-9-]*(?::nth-of-type\(\d+\))?)+$/i.test(trimmed)
      ? trimmed.replace(/:nth-of-type\(1\)/g, '').replace(/\s*>\s*/g, '>')
      : trimmed;
  };
  return Boolean(left.trim() && right.trim()) && normalize(left) === normalize(right);
}

/** New comment identities require current-DOM resolution even without team collaboration. */
export function commentUsesIdentity(comment: Pick<PreviewComment, 'elementId' | 'selector'>): boolean {
  return comment.elementId.startsWith('cmt:') || commentSelectorClaimsIdentity(comment.selector);
}

export function ownerCommentNeedsLocation(comment: PreviewComment, _collabEnabled: boolean): boolean {
  return !comment.elementId.startsWith('pin-') && comment.selectionKind !== 'pod';
}

function authoredIdFromHint(hint: string): string | null {
  // Hints contain only an opening tag. An incomplete hint cannot establish identity.
  if (typeof DOMParser === 'undefined' || !/\sid\s*=/i.test(hint) || !/^<[a-z][\s\S]*>$/i.test(hint)) return null;
  const doc = new DOMParser().parseFromString('', 'text/html');
  const template = doc.createElement('template');
  template.innerHTML = hint;
  const element = template.content.firstElementChild;
  return element?.getAttribute('id') || null;
}

function idSelector(id: string): string {
  return `[id="${id.replace(/[\x00-\x1f\x7f"\\]/g, char => `\\${char.codePointAt(0)!.toString(16)} `)}"]`;
}

function idFromSelector(selector: string): string | null {
  const match = /^\[id="((?:\\[\s\S]|[^"\\])*)"\]$/.exec(selector);
  if (!match) return null;
  return match[1]!.replace(/\\([0-9a-f]{1,6}\s?|[^0-9a-f])/gi, (_, escape: string) => {
    const hex = /^[0-9a-f]/i.test(escape);
    if (!hex) return escape;
    const code = Number.parseInt(escape.trim(), 16);
    return String.fromCodePoint(code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? code : 0xfffd);
  });
}

/** Recover an authored id saved in older structural comments without changing stored records. */
export function ownerCommentSelector(comment: Pick<PreviewComment, 'elementId' | 'selector' | 'htmlHint'>): string {
  if (!comment.elementId.startsWith('dom:') || !/^body\s*>/.test(comment.selector)) return comment.selector;
  const id = authoredIdFromHint(comment.htmlHint || '');
  return id ? idSelector(id) : comment.selector;
}

/** Owner targets describe the current DOM. A matching structural selector takes priority
 * over an annotation id reused by a different element after publication. */
export function resolveOwnerCommentAnchor(comment: PreviewComment, targets: Map<string, PreviewCommentSnapshot>, version?: number) {
  if (commentUsesIdentity(comment)) return resolveCommentAnchor(comment, targets, version);
  const selector = comment.selector?.trim();
  const effectiveSelector = ownerCommentSelector(comment);
  const stableId = comment.elementId.startsWith('dom:') ? idFromSelector(effectiveSelector) : null;
  if (stableId !== null) {
    const matching = [...targets.values()].filter(target => {
      if (target.filePath !== comment.filePath || (target.slideIndex ?? -1) !== (comment.slideIndex ?? -1)) return false;
      if (target.domIdUnique === false) return false;
      if (target.selector === effectiveSelector || target.domSelector === effectiveSelector) return true;
      const targetId = idFromSelector(target.domSelector ?? '') ?? idFromSelector(target.selector);
      return targetId !== null ? targetId === stableId : authoredIdFromHint(target.htmlHint || '') === stableId;
    });
    return resolveCommentAnchor(matching.length === 1 ? { ...comment, elementId: matching[0]!.elementId } : comment,
      matching.length === 1 ? new Map([[matching[0]!.elementId, matching[0]!]]) : new Map(), version);
  }
  // Attribute anchors keep the portable resolver's identity/drift semantics.
  if (!selector || !/^body\s*>/.test(selector)) return resolveCommentAnchor(comment, targets, version);
  const matching = selector && [...targets.values()].find(target =>
    target.filePath === comment.filePath && (commentSelectorsMatch(target.selector, selector) || commentSelectorsMatch(target.domSelector ?? '', selector))
    && (target.slideIndex ?? -1) === (comment.slideIndex ?? -1));
  if (matching) return resolveCommentAnchor({ ...comment, elementId: matching.elementId }, targets, version);
  const exact = targets.get(comment.elementId);
  if (selector && exact && !commentSelectorsMatch(exact.selector, selector)) {
    const candidates = new Map(targets);
    candidates.delete(comment.elementId);
    return resolveCommentAnchor(comment, candidates, version);
  }
  return resolveCommentAnchor(comment, targets, version);
}
