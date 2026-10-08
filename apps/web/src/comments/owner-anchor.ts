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

/** Owner targets describe the current DOM. A matching structural selector takes priority
 * over an annotation id reused by a different element after publication. */
export function resolveOwnerCommentAnchor(comment: PreviewComment, targets: Map<string, PreviewCommentSnapshot>, version?: number) {
  const selector = comment.selector?.trim();
  // Attribute anchors keep the portable resolver's identity/drift semantics.
  if (!selector || !/^body\s*>/.test(selector)) return resolveCommentAnchor(comment, targets, version);
  const matching = selector && [...targets.values()].find(target =>
    target.filePath === comment.filePath && commentSelectorsMatch(target.selector, selector)
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
